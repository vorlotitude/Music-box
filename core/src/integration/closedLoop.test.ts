import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CS2Adapter } from "../adapters/cs2/CS2Adapter";
import { EventEngine } from "../engine/EventEngine";
import { RuleEngine } from "../engine/RuleEngine";
import { AudioEngine } from "../audio/AudioEngine";
import type { AudioBackend, PlayHandle, PlaybackProgress } from "../audio/AudioBackend";
import type { Rule } from "../rules/Rule";
import type { UniversalGameEvent } from "../events/GameEvent";

/**
 * FakeAudioBackend — records every play/setVolume/stop so the integration test
 * can assert *what* the AudioEngine told the platform layer to do, without
 * touching any real audio device.
 */
class FakeAudioBackend implements AudioBackend {
  played: { url: string; volume: number; handleId: string }[] = [];
  volumes = new Map<string, number>();
  micLevel = 0;
  private seq = 0;

  async play(url: string, volume: number): Promise<PlayHandle> {
    const handleId = `h_${this.seq++}`;
    this.played.push({ url, volume, handleId });
    this.volumes.set(handleId, volume);
    return { id: handleId, url };
  }
  setVolume(handleId: string, volume: number): void {
    this.volumes.set(handleId, volume);
  }
  async fade(): Promise<void> {}
  pause(): void {}
  resume(): void {}
  async stop(): Promise<void> {}
  isPlaying(): boolean {
    return false;
  }
  getProgress(_id: string): PlaybackProgress | null {
    return null;
  }
  getMicLevel(): number {
    return this.micLevel;
  }
}

/**
 * Wire the four layers together EXACTLY as the runtime does:
 *
 *   CS2Adapter (GSI payload) → EventEngine → RuleEngine → AudioEngine
 *
 * This mirrors the closed loop the desktop app runs on every game push.
 */
function buildRuntime() {
  const adapter = new CS2Adapter();
  const engine = new EventEngine();
  const ruleEngine = new RuleEngine();
  const backend = new FakeAudioBackend();
  const audioEngine = new AudioEngine({ backend });
  audioEngine.setVolumes({ master: 1, music: 1, sfx: 1, voice: 1 });

  // EventEngine is the hub: it enriches each event with the current session
  // snapshot, then hands the *enriched* event to the rule engine (matches prod).
  engine.on((e) => {
    const result = ruleEngine.evaluate(e);
    if (result && result.matchedConditions && !result.blockedByCooldown) {
      const action = result.rule.action;
      void audioEngine.play([{
        action,
        priority: result.rule.priority,
        volumeOverride: "volume" in action ? action.volume : undefined,
      }]);
    }
  });

  async function publish(events: UniversalGameEvent[]): Promise<void> {
    for (const e of events) {
      engine.dispatch(e);
    }
    // Let the async play() promises land before callers assert.
    await Promise.resolve();
    await Promise.resolve();
  }

  return { adapter, engine, ruleEngine, audioEngine, backend, publish };
}

function payload(round: Record<string, unknown>, player?: Record<string, unknown>) {
  return {
    round: { phase: "live", win_team: "", bomb: "", round: 1, ...(round ?? {}) },
    player: { team: "CT", state: { health: 100, round_kills: 0 }, ...(player ?? {}) },
    map: { phase: "live", round: 1 },
  };
}

function rule(opts: Partial<Rule> & Pick<Rule, "id" | "event" | "action">): Rule {
  return {
    name: opts.id,
    game: "cs2",
    conditions: [],
    priority: 50,
    cooldownMs: 0,
    route: "SELF_ONLY",
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...opts,
  };
}

/** Drive a fresh round so the adapter emits a NEW ROUND_WIN each time. */
function makeWin(adapter: CS2Adapter) {
  adapter.handlePayload(payload({ phase: "freezetime" }));
  adapter.handlePayload(payload({ phase: "live" }));
  return adapter.handlePayload(payload({ phase: "over", win_team: "CT" }));
}

describe("Closed loop: CS2 State → Event → Rule → Audio", () => {
  it("plays the bound asset when a GSI ROUND_WIN arrives (full loop)", async () => {
    const { adapter, ruleEngine, backend, publish } = buildRuntime();
    ruleEngine.setRules([
      rule({ id: "r_win", event: "ROUND_WIN", action: { type: "PLAY_AUDIO", assetId: "victory.mp3", volume: 0.8 } }),
    ]);

    const events = adapter.handlePayload(payload({ phase: "over", win_team: "CT" }));
    await publish(events);

    expect(events.map((e) => e.type)).toContain("ROUND_WIN");
    expect(backend.played.map((p) => p.url)).toContain("victory.mp3");
    expect(backend.volumes.get("h_0")).toBeCloseTo(0.8, 5);
  });

  it("does NOT play when no rule is bound to the event", async () => {
    const { adapter, ruleEngine, backend, publish } = buildRuntime();
    ruleEngine.setRules([
      rule({ id: "r_other", event: "PLAYER_KILL", action: { type: "PLAY_AUDIO", assetId: "boom.wav" } }),
    ]);
    const events = adapter.handlePayload(payload({ phase: "over", win_team: "CT" }));
    await publish(events);
    expect(backend.played.length).toBe(0);
  });

  it("high-priority rule wins when two rules fire on the same event", async () => {
    const { adapter, ruleEngine, backend, publish } = buildRuntime();
    ruleEngine.setRules([
      rule({ id: "r_low", event: "ROUND_WIN", action: { type: "PLAY_AUDIO", assetId: "quiet.wav" }, priority: 10 }),
      rule({ id: "r_high", event: "ROUND_WIN", action: { type: "PLAY_AUDIO", assetId: "epic.wav" }, priority: 100 }),
    ]);
    await publish(adapter.handlePayload(payload({ phase: "over", win_team: "CT" })));
    // RuleEngine picks the highest-priority binding; AudioEngine plays that one.
    expect(backend.played.length).toBeGreaterThan(0);
    expect(backend.played[0].url).toBe("epic.wav");
  });

  it("cooldown blocks a second fire of the same rule within its window", () => {
    let now = 1000;
    const engine = new EventEngine();
    const ruleEngine = new RuleEngine({ now: () => now });
    ruleEngine.setRules([
      rule({ id: "r_win", event: "ROUND_WIN", action: { type: "PLAY_AUDIO", assetId: "victory.mp3" }, cooldownMs: 8000 }),
    ]);
    const adapter = new CS2Adapter();

    const first = adapter.handlePayload(payload({ phase: "over", win_team: "CT" }));
    // The payload also emits GAME_START/ROUND_START; target the win event itself.
    const winEvt = first.find((e) => e.type === "ROUND_WIN")!;
    engine.dispatch(winEvt);
    const r1 = ruleEngine.evaluate(winEvt);
    expect(r1?.blockedByCooldown).toBe(false);

    const dup: UniversalGameEvent = { ...winEvt, id: "evt_dup" };
    const r2 = ruleEngine.evaluate(dup);
    expect(r2?.blockedByCooldown).toBe(true);
    expect(r2?.cooldownRemaining).toBeGreaterThan(0);

    now += 8000;
    const r3 = ruleEngine.evaluate(dup);
    expect(r3?.blockedByCooldown).toBe(false);
  });

  it("complex condition: only fires when session win streak >= 3", async () => {
    const { adapter, ruleEngine, backend, publish } = buildRuntime();
    ruleEngine.setRules([
      rule({
        id: "r_streak",
        event: "ROUND_WIN",
        conditions: [{ field: "session.winStreak", operator: ">=", value: 3 }],
        action: { type: "PLAY_AUDIO", assetId: "streak.mp3" },
      }),
    ]);

    // Two consecutive wins → rule must stay silent (streak = 2).
    await publish(makeWin(adapter));
    await publish(makeWin(adapter));
    expect(backend.played.filter((p) => p.url === "streak.mp3").length).toBe(0);

    // Third consecutive win → streak = 3 → the emotional reaction plays.
    await publish(makeWin(adapter));
    expect(backend.played.filter((p) => p.url === "streak.mp3").length).toBe(1);
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ducking lowers music/sfx volume to the duck factor while talking, then restores", async () => {
    const { audioEngine, backend } = buildRuntime();
    await audioEngine.play([{ action: { type: "PLAY_AUDIO", assetId: "victory.mp3" }, priority: 50 }]);
    const musicId = "h_0";
    expect(backend.volumes.get(musicId)).toBe(1);

    // No one is talking → stays full volume.
    audioEngine.startDucking(10, 0.05, 0.2);
    backend.micLevel = 0;
    vi.advanceTimersByTime(20);
    expect(backend.volumes.get(musicId)).toBe(1);

    // User starts talking → music ducks to 20%.
    backend.micLevel = 0.9;
    vi.advanceTimersByTime(20);
    expect(backend.volumes.get(musicId)).toBeCloseTo(0.2, 5);

    // Mic goes silent → volume restored.
    backend.micLevel = 0;
    vi.advanceTimersByTime(20);
    expect(backend.volumes.get(musicId)).toBe(1);

    audioEngine.stopDucking();
  });

  it("plays the bound asset when a GSI 1vX CLUTCH is detected (full loop)", async () => {
    const { adapter, ruleEngine, backend, publish } = buildRuntime();
    ruleEngine.setRules([
      rule({ id: "r_clutch", event: "CLUTCH", action: { type: "PLAY_AUDIO", assetId: "clutch.mp3" } }),
    ]);

    // A live round where the watched player is the only survivor on their team.
    const clutch = {
      round: { phase: "live", win_team: "", bomb: "", round: 1 },
      player: { team: "CT", state: { health: 100, round_kills: 0 } },
      map: { phase: "live", round: 1 },
      allplayers: {
        self: { team: "CT", state: { health: 100 } },
        ally1: { team: "CT", state: { health: 0 } },
        e1: { team: "T", state: { health: 100 } },
        e2: { team: "T", state: { health: 100 } },
      },
    };
    const events = adapter.handlePayload(clutch as never);
    await publish(events);

    expect(events.map((e) => e.type)).toContain("CLUTCH");
    expect(backend.played.map((p) => p.url)).toContain("clutch.mp3");
  });

  it("plays the bound asset when a LoL LCU match ends in a win (full loop, §3)", async () => {
    // Second concrete game through the SAME pipeline — proves adapters are additive.
    const lolAdapter = new (await import("../adapters/lol/LolAdapter")).LolAdapter();
    const engine = new EventEngine();
    const ruleEngine2 = new RuleEngine();
    const backend2 = new FakeAudioBackend();
    const audioEngine2 = new AudioEngine({ backend: backend2 });
    audioEngine2.setVolumes({ master: 1, music: 1, sfx: 1, voice: 1 });
    engine.on((e) => {
      const result = ruleEngine2.evaluate(e);
      if (result && result.matchedConditions && !result.blockedByCooldown) {
        const action = result.rule.action;
        void audioEngine2.play([{
          action,
          priority: result.rule.priority,
          volumeOverride: "volume" in action ? action.volume : undefined,
        }]);
      }
    });
    ruleEngine2.setRules([
      rule({ id: "r_lol_win", event: "GAME_END", action: { type: "PLAY_AUDIO", assetId: "victory.mp3" } }),
    ]);

    // Gameflow reaches InProgress → GAME_START (fresh session).
    for (const e of lolAdapter.handleSnapshot({ phase: "InProgress" })) engine.dispatch(e);
    // Match resolves → flat game-stats → GAME_END (win).
    const stats = {
      gameId: 9001,
      summonerId: 555,
      teams: [{ teamId: 100, isPlayerTeam: true, isWinningTeam: true, players: [{ summonerId: 555, stats: { CHAMPIONS_KILLED: 15, NUM_DEATHS: 2, ASSISTS: 9, WIN: true } }] }],
    };
    const ended = lolAdapter.handleSnapshot({ phase: "EndOfGame", stats });
    expect(ended.map((e) => e.type)).toContain("GAME_END");
    for (const e of ended) engine.dispatch(e);

    await Promise.resolve();
    await Promise.resolve();
    expect(backend2.played.map((p) => p.url)).toContain("victory.mp3");
  });
});