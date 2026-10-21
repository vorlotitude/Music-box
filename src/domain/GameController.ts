import { CS2Adapter } from "@core/adapters/cs2/CS2Adapter";
import { LolAdapter, LcuSnapshot } from "@core/adapters/lol/LolAdapter";
import { EventEngine } from "@core/engine/EventEngine";
import { RuleEngine } from "@core/engine/RuleEngine";
import { AudioEngine } from "@core/audio/AudioEngine";
import type { PlayRequest } from "@core/audio/AudioEngine";
import type { AudioSink } from "@core/audio/AudioRouter";
import type { AudioBackend } from "@core/audio/AudioBackend";
import type {
  UniversalGameEvent,
  GameEventType,
  SessionSnapshot,
  AudioRoute,
} from "@core/events/GameEvent";
import { Rule } from "@core/rules/Rule";
import { AudioAsset } from "@core/library/AudioAsset";
import { PlaybackHistoryEntry } from "@core/library/AudioAsset";
import { bridge as defaultBridge, GmBridge } from "../bridge";
import { HowlerBackend } from "../audio/HowlerBackend";

export interface LogEntry {
  ts: number;
  kind: "event" | "rule" | "audio" | "system";
  message: string;
}

/** User-facing status/error toast, mirrored from §26 UI states. */
export interface Notice {
  kind: "info" | "warn" | "error";
  text: string;
}

/** Fired whenever a rule-driven play actually starts for an asset. */
export interface AssetPlayInfo {
  assetId: string;
  lastPlayedAt: number;
  playCount: number;
}

export interface GameControllerOptions {
  onLog: (entry: LogEntry) => void;
  onSession: (session: SessionSnapshot) => void;
  onConnection: (connected: boolean) => void;
  onPlaying: (info: { url: string; title: string } | null) => void;
  /** Optional user-facing notices (surfaced as toasts in the UI). */
  onNotice?: (notice: Notice) => void;
  /** Optional when the League client process presence changes (§15). */
  onLcuRunning?: (running: boolean) => void;
  /** Optional callback so the UI can reflect "recently played" stats live. */
  onAssetPlayed?: (info: AssetPlayInfo) => void;
  /** Injectable IPC/store seam (defaults to the Electron bridge). Undoable in tests. */
  bridge?: GmBridge;
  /** Injectable playback backend (defaults to HowlerBackend). */
  backend?: AudioBackend;
}

let seq = 0;

export class GameController {
  readonly adapter = new CS2Adapter();
  /** League adapter — second concrete game proving the additive cross-game design (§3/§24). */
  readonly lolAdapter = new LolAdapter();
  readonly eventEngine = new EventEngine();
  readonly ruleEngine = new RuleEngine();
  audio: AudioEngine;

  private bridgeImpl: GmBridge;
  private assets: AudioAsset[] = [];
  private assetUrlCache = new Map<string, string>();
  private opts: GameControllerOptions;
  private playingUrl: string | null = null;
  private wasConnected = false;
  private lcuConnected = false;
  private wasLcuConnected = false;
  private paused = false;
  /**
   * The user's chosen mix destination in Settings/Audio, surfaced as concrete
   * sinks. Acts as the master override: with "both" every audible reaction is
   * also routed to the virtual mic so teammates hear it (§ phase-2 / virtual mic).
   * Kept independent of per-rule route; the Audio page is the single knob.
   */
  private renderSinks: AudioSink[] = ["SPEAKER"];

  constructor(opts: GameControllerOptions) {
    this.opts = opts;
    this.bridgeImpl = opts.bridge ?? defaultBridge;
    this.audio = new AudioEngine({ backend: opts.backend ?? new HowlerBackend() });

    this.adapter.onEvent((e) => this.onAdapterEvent(e));
    this.lolAdapter.onEvent((e) => this.onAdapterEvent(e));
    this.eventEngine.on((e) => this.onNormalized(e));
  }

  async init(): Promise<void> {
    await this.reloadAssets();
    await this.reloadRules();

    // Forward raw CS2 GSI payloads from the main process.
    this.bridgeImpl.onRawPayload((payload) => {
      let events: UniversalGameEvent[];
      try {
        events = this.adapter.handlePayload(payload as never);
      } catch (e) {
        this.log("system", `GSI parse error: ${(e as Error).message}`);
        return;
      }
      for (const ev of events) this.eventEngine.dispatch(ev);
    });

    // League LCU transport → LolAdapter → same event pipeline (§3).
    this.bridgeImpl.onLcuPayload((snap) => {
      let events: UniversalGameEvent[];
      try {
        events = this.lolAdapter.handleSnapshot(snap as unknown as LcuSnapshot);
      } catch (e) {
        this.log("system", `LCU parse error: ${(e as Error).message}`);
        return;
      }
      for (const ev of events) this.eventEngine.dispatch(ev);
    });
    this.bridgeImpl.onLcuRunning((running) => this.setLcuConnection(running));

    this.bridgeImpl.onGameRunning((running) => this.setConnection(running));
  }

  /** Track LoL connection transitions independently so a client close surfaces a notice. */
  private setLcuConnection(connected: boolean): void {
    this.lcuConnected = connected;
    if (this.wasLcuConnected === connected) return;
    this.wasLcuConnected = connected;
    this.log("system", connected ? "League client connected" : "League client disconnected");
    this.opts.onLcuRunning?.(connected);
  }

  /** Whether the League client is currently up (drives Games page / Home panel). */
  isLcuConnected(): boolean {
    return this.lcuConnected;
  }

  /** Track connection transitions so a disconnect surfaces a user notice. */
  private setConnection(connected: boolean): void {
    if (!connected && this.wasConnected) {
      this.log("system", "Game disconnected");
      this.notice("info", "Game disconnected — game events are paused.");
    }
    this.wasConnected = connected;
    this.opts.onConnection(connected);
  }

  private onAdapterEvent(e: UniversalGameEvent): void {
    this.setConnection(true);
    this.eventEngine.dispatch(e);
  }

  private onNormalized(e: UniversalGameEvent): void {
    this.log("event", `[${e.game.toUpperCase()}] ${e.type}`);
    // A new/ended match resets rule cooldowns so no stale rule stays silent.
    if (e.type === "GAME_START" || e.type === "GAME_END") {
      this.ruleEngine.resetCooldowns();
    }
    // Keep the live session snapshot current even while reactions are paused,
    // but suppress firing any rule so nothing plays until the user resumes.
    this.opts.onSession(this.eventEngine.getSnapshot());
    if (this.paused) return;
    const result = this.ruleEngine.evaluate(e);
    if (!result) return;
    if (result.blockedByCooldown) {
      this.log("rule", `Rule "${result.rule.name}" on cooldown (${Math.round(result.cooldownRemaining)}ms left)`);
      return;
    }
    this.fire(result.rule, e);
  }

  /**
   * Pause/resume reactions from the tray, a global shortcut, or the player
   * button. Pausing immediately silences anything playing and blocks new fires;
   * the session snapshot keeps updating so Home stays live.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.stopAll();
      this.log("system", "Reactions paused");
    } else {
      this.log("system", "Reactions resumed");
    }
  }

  /**
   * Reflect the Settings/Audio mix destination (speaker / both / virtual mic)
   * into the play pipeline so VOICE_CHAT sinks actually flow to the virtual mic.
   */
  setRenderSinks(sinks: AudioSink[]): void {
    this.renderSinks = sinks;
  }

  /** Surface the effective sink set as a route the AudioEngine can resolve. */
  private routeForSinks(sinks: AudioSink[]): AudioRoute {
    const has = (k: AudioSink) => sinks.includes(k);
    if (has("SPEAKER") && has("VOICE_CHAT")) return "BOTH";
    if (has("VOICE_CHAT")) return "TEAMMATES";
    return "SELF_ONLY";
  }

  /** Manual test trigger (dev mode) — a fabricated event enters the same pipeline. */
  testEvent(rawType: string): void {
    this.adapter.triggerTestEvent(rawType);
  }

  async reloadRules(): Promise<void> {
    const rules = (await this.bridgeImpl.storeAll("rules")) as unknown as Rule[];
    this.ruleEngine.setRules(rules);
  }

  async reloadAssets(): Promise<void> {
    this.assets = (await this.bridgeImpl.storeAll("assets")) as unknown as AudioAsset[];
    this.assetUrlCache.clear();
    for (const a of this.assets) {
      try {
        this.assetUrlCache.set(a.id, await this.bridgeImpl.toMediaUrl(a.filePath));
      } catch {
        /* file may be missing; skip */
      }
    }
  }

  resolveAsset(id: string): { mediaUrl: string; title: string } | null {
    const url = this.assetUrlCache.get(id);
    const asset = this.assets.find((a) => a.id === id);
    const title = asset?.title ?? asset?.filePath ?? id;
    if (url) return { mediaUrl: url, title };
    // Fallback: asset path not cached, try direct.
    return asset ? { mediaUrl: asset.filePath, title } : null;
  }

  setVolumes(v: Partial<{ master: number; music: number; sfx: number; voice: number }>): void {
    this.audio.setVolumes(v);
  }

  /** Start/stop ducking (music/SFX duck while talking) from a settings change. */
  setDucking(enabled: boolean, level?: number, threshold?: number): void {
    if (enabled) {
      const factor = typeof level === "number" ? Math.max(0, Math.min(1, level)) : 0.2;
      const thresh = typeof threshold === "number" ? Math.max(0, Math.min(1, threshold)) : 0.05;
      this.audio.startDucking(200, thresh, factor);
    } else {
      this.audio.stopDucking();
    }
  }

  stopAll(): void {
    void this.audio.stopAll();
    this.playingUrl = null;
    this.opts.onPlaying(null);
  }

  private fire(rule: Rule, _event: UniversalGameEvent): void {
    const action = rule.action;
    // Resolve each referenced asset while keeping its id so playback history can
    // be recorded against the right library entry.
    const urls: { mediaUrl: string; title: string }[] = [];
    const playedIds: string[] = [];
    const resolve = (id: string) => this.resolveAsset(id);
    if (action.type === "PLAY_AUDIO") {
      const r = resolve(action.assetId);
      if (r) {
        urls.push(r);
        playedIds.push(action.assetId);
      }
    } else if (action.type === "PLAY_RANDOM") {
      const pool = (action.assetIds ?? [])
        .map((id) => ({ id, hit: resolve(id) }))
        .filter((x): x is { id: string; hit: { mediaUrl: string; title: string } } => !!x.hit);
      if (pool.length) {
        const picked = pool[Math.floor(Math.random() * pool.length)];
        urls.push(picked.hit);
        playedIds.push(picked.id);
      }
    } else if (action.type === "PLAY_SEQUENTIAL") {
      const seq = (action.assetIds ?? [])
        .map((id) => ({ id, hit: resolve(id) }))
        .filter((x): x is { id: string; hit: { mediaUrl: string; title: string } } => !!x.hit);
      urls.push(...seq.map((x) => x.hit));
      playedIds.push(...seq.map((x) => x.id));
    }
    if (urls.length === 0) {
      this.log("audio", `Rule "${rule.name}" matched but no playable audio`);
      this.notice("error", `Audio unavailable for "${rule.name}": the referenced file is missing or unreadable.`);
      return;
    }
    const target = urls[0];
    this.log("rule", `Rule matched: ${rule.name}`);
    this.log("audio", `Audio started: ${target.title}`);
    this.playingUrl = target.mediaUrl;
    this.opts.onPlaying({ url: target.mediaUrl, title: target.title });
    // Master mix destination (Settings/Audio) decides where this lands — with
    // "both" it reaches the speaker AND the virtual mic for teammates.
    const route = this.routeForSinks(this.renderSinks);
    if (this.renderSinks.includes("VOICE_CHAT")) {
      this.log("audio", "Routing to speaker + virtual mic (CABLE)");
    }

    const op: PlayRequest =
      action.type === "PLAY_SEQUENTIAL"
        ? {
            action: { type: "PLAY_SEQUENTIAL", assetIds: urls.map((u) => u.mediaUrl), fadeMs: 200 },
            priority: rule.priority,
            volumeOverride: action.volume,
            route,
          }
        : {
            action: { type: "PLAY_AUDIO", assetId: target.mediaUrl, volume: action.volume },
            priority: rule.priority,
            volumeOverride: action.volume,
            route,
          };
    void this.audio.play([op]);
    for (const id of playedIds) this.markPlayed(id, rule, action.volume ?? 1);
  }

  /** Record a recent-play entry and bump the asset's play stats (§14/§23). */
  private markPlayed(assetId: string, rule: Rule, volume: number): void {
    const asset = this.assets.find((a) => a.id === assetId);
    const lastPlayedAt = Date.now();
    const playCount = (asset?.playCount ?? 0) + 1;
    // Keep the controller cache authoritative so repeated fires increment, not just
    // re-report the seed value. The UI's updateAsset receives this same count and
    // mirrors it; reloadAssets() re-syncs from the store on the next library load.
    if (asset) {
      this.assets = this.assets.map((a) =>
        a.id === assetId ? { ...a, playCount, lastPlayedAt } : a,
      );
    }
    const entry: PlaybackHistoryEntry = {
      id: `${assetId}-${lastPlayedAt}`,
      assetId,
      ruleId: rule.id,
      event: rule.event,
      game: rule.game,
      startedAt: lastPlayedAt,
      volume,
    };
    void this.bridgeImpl.storePut("history", entry as never);
    this.opts.onAssetPlayed?.({ assetId, lastPlayedAt, playCount });
  }

  private log(kind: LogEntry["kind"], message: string): void {
    this.opts.onLog({ ts: Date.now(), kind, message });
  }

  private notice(kind: Notice["kind"], text: string): void {
    this.opts.onNotice?.({ kind, text });
  }
}

export function makeLogId(): number {
  return ++seq;
}