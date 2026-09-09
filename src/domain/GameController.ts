import { CS2Adapter } from "@core/adapters/cs2/CS2Adapter";
import { EventEngine } from "@core/engine/EventEngine";
import { RuleEngine } from "@core/engine/RuleEngine";
import { AudioEngine } from "@core/audio/AudioEngine";
import type { AudioBackend } from "@core/audio/AudioBackend";
import type {
  UniversalGameEvent,
  GameEventType,
  SessionSnapshot,
} from "@core/events/GameEvent";
import { Rule } from "@core/rules/Rule";
import { AudioAsset } from "@core/library/AudioAsset";
import { bridge as defaultBridge, GmBridge } from "../bridge";
import { HowlerBackend } from "../audio/HowlerBackend";

export interface LogEntry {
  ts: number;
  kind: "event" | "rule" | "audio" | "system";
  message: string;
}

export interface GameControllerOptions {
  onLog: (entry: LogEntry) => void;
  onSession: (session: SessionSnapshot) => void;
  onConnection: (connected: boolean) => void;
  onPlaying: (info: { url: string; title: string } | null) => void;
  /** Injectable IPC/store seam (defaults to the Electron bridge). Undoable in tests. */
  bridge?: GmBridge;
  /** Injectable playback backend (defaults to HowlerBackend). */
  backend?: AudioBackend;
}

let seq = 0;

export class GameController {
  readonly adapter = new CS2Adapter();
  readonly eventEngine = new EventEngine();
  readonly ruleEngine = new RuleEngine();
  audio: AudioEngine;

  private bridgeImpl: GmBridge;
  private assets: AudioAsset[] = [];
  private assetUrlCache = new Map<string, string>();
  private opts: GameControllerOptions;
  private playingUrl: string | null = null;

  constructor(opts: GameControllerOptions) {
    this.opts = opts;
    this.bridgeImpl = opts.bridge ?? defaultBridge;
    this.audio = new AudioEngine({ backend: opts.backend ?? new HowlerBackend() });

    this.adapter.onEvent((e) => this.onAdapterEvent(e));
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

    this.bridgeImpl.onGameRunning((running) => this.opts.onConnection(running));
  }

  private onAdapterEvent(e: UniversalGameEvent): void {
    this.opts.onConnection(true);
    this.eventEngine.dispatch(e);
  }

  private onNormalized(e: UniversalGameEvent): void {
    this.log("event", `[${e.game.toUpperCase()}] ${e.type}`);
    const result = this.ruleEngine.evaluate(e);
    if (!result) return;
    if (result.blockedByCooldown) {
      this.log("rule", `Rule "${result.rule.name}" on cooldown (${Math.round(result.cooldownRemaining)}ms left)`);
      return;
    }
    this.fire(result.rule, e);
    this.opts.onSession(this.eventEngine.getSnapshot());
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
  setDucking(enabled: boolean, level?: number): void {
    if (enabled) {
      const factor = typeof level === "number" ? Math.max(0, Math.min(1, level)) : 0.2;
      this.audio.startDucking(200, 0.05, factor);
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
    const urls: { mediaUrl: string; title: string }[] = [];
    if (action.type === "PLAY_AUDIO") {
      const r = this.resolveAsset(action.assetId);
      if (r) urls.push(r);
    } else if (action.type === "PLAY_RANDOM" || action.type === "PLAY_SEQUENTIAL") {
      // Random pick for MVP at the app layer.
      const pool = (action.assetIds ?? [])
        .map((id) => this.resolveAsset(id))
        .filter((x): x is { mediaUrl: string; title: string } => !!x);
      if (pool.length) urls.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    if (urls.length === 0) {
      this.log("audio", `Rule "${rule.name}" matched but no playable audio`);
      return;
    }
    const target = urls[0];
    this.log("rule", `Rule matched: ${rule.name}`);
    this.log("audio", `Audio started: ${target.title}`);
    this.playingUrl = target.mediaUrl;
    this.opts.onPlaying({ url: target.mediaUrl, title: target.title });

    void this.audio.play([
      {
        action: { type: "PLAY_AUDIO", assetId: target.mediaUrl, volume: action.volume },
        priority: rule.priority,
        volumeOverride: action.volume,
        route: rule.route,
      },
    ]);
  }

  private log(kind: LogEntry["kind"], message: string): void {
    this.opts.onLog({ ts: Date.now(), kind, message });
  }
}

export function makeLogId(): number {
  return ++seq;
}