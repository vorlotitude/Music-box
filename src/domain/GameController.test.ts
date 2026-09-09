import { describe, it, expect, vi } from "vitest";
import { GameController, type LogEntry } from "./GameController";
import type { GmBridge, MediaFile } from "../bridge";
import type { AudioBackend, PlayHandle, PlaybackProgress } from "@core/audio/AudioBackend";
import type { AudioAsset } from "@core/library/AudioAsset";
import type { Rule } from "@core/rules/Rule";

/**
 * Application-layer integration test.
 *
 * This drives the REAL GameController (the same class the UI instantiates),
 * but with a fake storage bridge and a fake audio backend injected via
 * constructor DI. It proves the full user workflow works end to end:
 *
 *   import music (seed store) → create rule (seed store) → game event (GSI)
 *     → Event → Rule match → AudioEngine → play request
 *
 * No Electron, no window, no real audio device — runs anywhere Vitest runs.
 */

/** In-memory bridge: same shape as the Electron main process bridge. */
class FakeBridge implements GmBridge {
  private cols = new Map<string, Record<string, unknown>>();
  private rawCb: ((payload: Record<string, unknown>) => void) | null = null;
  private runningCb: ((running: boolean) => void) | null = null;

  version = async () => "test";
  dataDir = async () => "mem://data";

  async storeAll(c: string): Promise<unknown[]> {
    return Object.values(this.cols.get(c) ?? {});
  }
  async storeGet(c: string, id: string): Promise<unknown> {
    return (this.cols.get(c) as any)?.[id];
  }
  async storePut(c: string, doc: Record<string, unknown>): Promise<unknown> {
    const col = this.cols.get(c) ?? {};
    col[doc.id as string] = doc;
    this.cols.set(c, col);
    return doc;
  }
  async storeRemove(c: string, id: string): Promise<void> {
    const col = this.cols.get(c) ?? {};
    delete col[id];
  }
  async storeClear(c: string): Promise<void> {
    this.cols.set(c, {});
  }

  settingsGet = async () => ({} as Record<string, unknown>);
  settingsSave = async (s: Record<string, unknown>) => s;
  openAudioFiles = async () => [] as MediaFile[];
  pickDirectory = async () => null;
  scanDirectory = async () => [] as MediaFile[];
  readAudioMeta = async () => ({});
  toMediaUrl = async (p: string) => `media://${p}`;
  exportJson = async () => true;
  importJson = async () => null;
  minimize = async () => void 0;
  close = async () => void 0;

  onRawPayload(cb: (payload: Record<string, unknown>) => void): void {
    this.rawCb = cb;
  }
  onGameRunning(cb: (running: boolean) => void): void {
    this.runningCb = cb;
  }
  onLog(): void {}

  emitPayload(payload: Record<string, unknown>): void {
    this.rawCb?.(payload);
  }
  emitRunning(running: boolean): void {
    this.runningCb?.(running);
  }
  seed(doc: AudioAsset | Rule): void {
    const col = doc.id.startsWith("r_") ? "rules" : "assets";
    this.cols.set(col, { ...(this.cols.get(col) ?? {}), [doc.id]: doc });
  }
}

/** Fake backend — records what the AudioEngine told it to play. */
class FakeBackend implements AudioBackend {
  played: { url: string; volume: number; handleId: string }[] = [];
  micLevel = 0;
  private seq = 0;

  async play(url: string, volume: number, opts?: { onEnded?: () => void }): Promise<PlayHandle> {
    const handleId = `h_${this.seq++}`;
    this.played.push({ url, volume, handleId });
    if (opts?.onEnded) {
      // Let sequential chains advance in tests.
      setTimeout(() => opts?.onEnded?.(), 10);
    }
    return { id: handleId, url };
  }
  setVolume(): void {}
  async fade(): Promise<void> {}
  pause(): void {}
  resume(): void {}
  async stop(): Promise<void> {}
  isPlaying(): boolean {
    return false;
  }
  getProgress(): PlaybackProgress | null {
    return null;
  }
  getMicLevel(): number {
    return this.micLevel;
  }
}

function asset(id: string, filePath: string, category: "music" | "sfx" = "music"): AudioAsset {
  return {
    id,
    filePath,
    title: id,
    tags: [],
    category,
    volume: 1,
    favorite: false,
    addedAt: 0,
    playCount: 0,
  };
}

function winRule(id: string, assetId: string, opts?: Partial<Rule>): Rule {
  return {
    id,
    name: id,
    game: "cs2",
    event: "ROUND_WIN",
    conditions: [],
    action: { type: "PLAY_AUDIO", assetId, volume: 0.8 },
    priority: 100,
    cooldownMs: 0,
    route: "SELF_ONLY",
    enabled: true,
    ...opts,
  };
}

function logging(): { logs: LogEntry[]; onLog: (e: LogEntry) => void } {
  const logs: LogEntry[] = [];
  return { logs, onLog: (e) => logs.push(e) };
}

describe("GameController application layer: import → rule → event → play", () => {
  function boot(options?: { assetId?: string; rule?: Rule }) {
    const bridge = new FakeBridge();
    const backend = new FakeBackend();
    const { logs, onLog } = logging();
    const onPlaying = vi.fn();
    const onConnection = vi.fn();
    const onSession = vi.fn();

    // "User imports a track" and "user creates a rule" = writing to the store.
    bridge.seed(asset("victory.mp3", "C:\\Music\\Victory.mp3", "music"));
    if (options?.rule) bridge.seed(options.rule);

    const controller = new GameController({
      onLog,
      onSession,
      onConnection,
      onPlaying,
      bridge,
      backend,
    });

    return {
      bridge,
      backend,
      controller,
      onPlaying,
      onConnection,
      onSession,
      logs,
    };
  }

  /** A GSI payload that yields ROUND_WIN for a fresh round. */
  function winPayload(): Record<string, unknown> {
    return {
      round: { phase: "over", win_team: "CT", bomb: "", round: 1 },
      player: { team: "CT", state: { health: 100, round_kills: 0 } },
      map: { phase: "live", round: 1 },
    };
  }

  it("plays the bound asset when a real GSI ROUND_WIN reaches the controller", async () => {
    const { controller, bridge, backend, onPlaying } = boot({
      rule: winRule("r_win", "victory.mp3"),
    });
    await controller.init();

    bridge.emitPayload(winPayload());
    await Promise.resolve();
    await Promise.resolve();

    expect(backend.played.length).toBe(1);
    expect(backend.played[0].url).toBe("media://C:\\Music\\Victory.mp3");
    expect(onPlaying).toHaveBeenCalled();
    const info = onPlaying.mock.calls[onPlaying.mock.calls.length - 1][0];
    expect(info.title).toBe("victory.mp3");
  });

  it("testEvent() routes a manually-triggered event through the same pipeline", async () => {
    const { controller, backend, onPlaying } = boot({
      rule: winRule("r_win_test", "victory.mp3"),
    });
    await controller.init();

    controller.testEvent("ROUND_WIN");
    await Promise.resolve();
    await Promise.resolve();

    expect(onPlaying).toHaveBeenCalled();
    expect(onPlaying.mock.calls.at(-1)![0].title).toBe("victory.mp3");
  });

  it("dev-mode TEST BOMB PLANT fires a rule bound to BOMB_PLANTED", async () => {
    const { controller, backend, onPlaying } = boot({
      rule: winRule("r_bomb", "victory.mp3", { event: "BOMB_PLANTED" }),
    });
    await controller.init();

    controller.testEvent("BOMB PLANT");
    await Promise.resolve();
    await Promise.resolve();

    expect(onPlaying).toHaveBeenCalled();
    expect(backend.played.length).toBe(1);
    expect(onPlaying.mock.calls.at(-1)![0].title).toBe("victory.mp3");
  });

  it("setDucking() starts and cleanly stops the duck audio loop", async () => {
    const { controller } = boot({ rule: winRule("r_win", "victory.mp3") });
    await controller.init();

    expect(() => controller.setDucking(true, 0.2)).not.toThrow();
    expect(() => controller.setDucking(false)).not.toThrow();
    expect(() => controller.setDucking(true, 1)).not.toThrow();
    controller.setDucking(false); // clear the interval so the loop never hangs
  });

  it("a PLAY_RANDOM rule picks exactly one track from its pool", async () => {
    const bridge = new FakeBridge();
    const backend = new FakeBackend();
    const onLog = vi.fn();
    bridge.seed(asset("victory.mp3", "C:\\Music\\Victory.mp3", "music"));
    bridge.seed(asset("sad.mp3", "C:\\Music\\Sad.mp3", "music"));
    bridge.seed({
      id: "r_rand",
      name: "random",
      game: "cs2",
      event: "ROUND_WIN",
      conditions: [],
      action: { type: "PLAY_RANDOM", assetIds: ["victory.mp3", "sad.mp3"] },
      priority: 100,
      cooldownMs: 0,
      route: "SELF_ONLY",
      enabled: true,
    } as Rule);

    const controller = new GameController({
      onLog, onSession: vi.fn(), onConnection: vi.fn(), onPlaying: vi.fn(),
      bridge, backend,
    });
    await controller.init();
    controller.testEvent("ROUND_WIN");
    await Promise.resolve();
    await Promise.resolve();

    expect(backend.played.length).toBe(1);
    const picked = backend.played[0].url;
    expect(["media://C:\\Music\\Victory.mp3", "media://C:\\Music\\Sad.mp3"]).toContain(picked);
  });

  it("passes the full pool to the engine for a PLAY_SEQUENTIAL rule", async () => {
    const bridge = new FakeBridge();
    const backend = new FakeBackend();
    bridge.seed(asset("victory.mp3", "C:\\Music\\Victory.mp3", "music"));
    bridge.seed(asset("sad.mp3", "C:\\Music\\Sad.mp3", "music"));
    bridge.seed({
      id: "r_seq",
      name: "seq",
      game: "cs2",
      event: "ROUND_WIN",
      conditions: [],
      action: { type: "PLAY_SEQUENTIAL", assetIds: ["victory.mp3", "sad.mp3"] },
      priority: 100,
      cooldownMs: 0,
      route: "SELF_ONLY",
      enabled: true,
    } as Rule);

    const controller = new GameController({
      onLog: vi.fn(), onSession: vi.fn(), onConnection: vi.fn(), onPlaying: vi.fn(),
      bridge, backend,
    });
    await controller.init();
    controller.testEvent("ROUND_WIN");
    await delay(80);

    const urls = backend.played.map((p) => p.url);
    expect(backend.played.length).toBe(2);
    expect(urls).toContain("media://C:\\Music\\Victory.mp3");
    expect(urls).toContain("media://C:\\Music\\Sad.mp3");
  });

  it("stays silent when no rule is bound to the arriving event", async () => {
    const { controller, bridge, backend, onPlaying } = boot();
    await controller.init();
    bridge.emitPayload(winPayload());
    await Promise.resolve();
    await Promise.resolve();

    expect(backend.played.length).toBe(0);
    expect(onPlaying).not.toHaveBeenCalled();
  });

  it("a match boundary (GAME_END) clears rule cooldowns so rules can fire again", async () => {
    const { controller, bridge, backend } = boot({
      rule: winRule("r_cd", "victory.mp3", { cooldownMs: 60000 }),
    });
    await controller.init();

    // First win fires the rule.
    controller.testEvent("ROUND_WIN");
    await Promise.resolve();
    expect(backend.played.length).toBe(1);

    // Immediate re-fire is swallowed by the cooldown.
    controller.testEvent("ROUND_WIN");
    await Promise.resolve();
    expect(backend.played.length).toBe(1);

    // The match ends: GAME_END resets cooldowns.
    bridge.emitPayload({
      round: { phase: "over", win_team: "", bomb: "", round: 1 },
      player: { team: "CT", state: { health: 100, round_kills: 0 } },
      map: { phase: "gameover", round: 1 },
    });
    await Promise.resolve();

    // Next win in a new match fires again.
    controller.testEvent("ROUND_WIN");
    await delay(30);
    expect(backend.played.length).toBe(2);
  });

  it("a missing audio file produces a log entry, not a crash", async () => {
    const { controller, bridge, backend, logs } = boot({
      rule: winRule("r_missing", "gone.wav"),
    });
    await controller.init();

    // reloadAssets won't find "gone.wav" in the store → no cached URL → rule
    // matches but resolves no asset → logs "no playable audio".
    bridge.emitPayload(winPayload());
    await Promise.resolve();
    await Promise.resolve();

    expect(backend.played.length).toBe(0);
    expect(logs.some((l) => l.kind === "audio")).toBe(true);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}