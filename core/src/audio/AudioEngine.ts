import type { AudioBackend, PlayHandle } from "./AudioBackend";
import type { RuleAction } from "../rules/Rule";

export interface AudioEngineCallbacks {
  onPlaybackStarted?: (info: { assetUrl: string; handleId: string; action: RuleAction }) => void;
  onPlaybackEnded?: (info: { handleId: string; url: string }) => void;
  onVolumeChanged?: (volumes: { master: number; music: number; sfx: number; voice: number }) => void;
}

export interface BusVolumes {
  master: number;
  music: number;
  sfx: number;
  voice: number;
}

export interface AudioEngineOptions {
  backend: AudioBackend;
  callbacks?: AudioEngineCallbacks;
}

interface ActiveTrack {
  handleId: string;
  url: string;
  bus: "music" | "sfx" | "voice";
  baseVolume: number;
  priority: number;
  createdAt: number;
  mutedByDucking?: boolean;
}

/**
 * AudioEngine: authorized orchestration layer.
 *
 * Owns priority, queue (a lightweight crossfade-on-interrupt rule), volume
 * buses, ducking and crossfade. Actual decoding/rendering is delegated to the
 * injected `backend`. It never talks to the game or the UI directly.
 */
export class AudioEngine {
  private readonly backend: AudioBackend;
  private callbacks: AudioEngineCallbacks;
  private volumes: BusVolumes = { master: 1, music: 1, sfx: 1, voice: 1 };
  private active = new Map<string, ActiveTrack>();
  private nextId = 1;
  private duckingActive = false;
  /** When ducking, everyone drops by this factor; restored on mic silence. */
  private duckFactor = 0.2;
  private duckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: AudioEngineOptions) {
    this.backend = opts.backend;
    this.callbacks = opts.callbacks ?? {};
  }

  setVolumes(v: Partial<BusVolumes>): void {
    this.volumes = { ...this.volumes, ...v };
    // Re-apply effective volume to all running tracks.
    for (const [id, track] of this.active) {
      this.backend.setVolume(id, this.effectiveVolume(track));
    }
    this.callbacks.onVolumeChanged?.(this.volumes);
  }

  getVolumes(): BusVolumes {
    return { ...this.volumes };
  }

  setDuckTarget(factor: number): void {
    this.duckFactor = factor;
    for (const [id, track] of this.active) {
      this.backend.setVolume(id, this.effectiveVolume(track));
    }
  }

  /**
   * Play a resolved action against the queue. High-priority or everything can
   * interrupt depending on strictness; for MVP, a new high-priority request
   * fades out the current track and starts (simple crossfade).
   */
  async play(rules: { action: RuleAction; priority: number; volumeOverride?: number }[]): Promise<void> {
    // For MVP, play the highest-priority resolved action.
    if (rules.length === 0) return;
    const top = rules.reduce((a, b) => (b.priority > a.priority ? b : a));
    const urls = this.resolveUrls(top.action);
    if (urls.length === 0) return;
    const url = urls[0];

    // Fade out + stop current on interrupt when new priority >= current.
    await this.interrupt(top.priority);

    const bus = this.actionBus(top.action);
    const volume = clamp01(top.volumeOverride ?? 1) * this.volumes[bus];
    const fadeInMs = fadeFor(top.action);
    try {
      const handle: PlayHandle = await this.backend.play(url, this.effectiveVolumeFrom(top.volumeOverride ?? 1, bus), {
        fadeInMs,
        fadeOutMs: fadeFor(top.action),
        onEnded: () => this.onTrackEnded(handle.id, url),
      });
      const track: ActiveTrack = {
        handleId: handle.id,
        url,
        bus,
        baseVolume: clamp01(top.volumeOverride ?? 1),
        priority: top.priority,
        createdAt: Date.now(),
      };
      // Recompute volume in case of duck active.
      this.backend.setVolume(handle.id, this.effectiveVolumeFrom(clamp01(top.volumeOverride ?? 1), bus));
      this.active.set(handle.id, track);
      this.callbacks.onPlaybackStarted?.({ assetUrl: url, handleId: handle.id, action: top.action });
      void volume;
    } catch (e) {
      // A missing/unplayable file must NEVER crash the app.
      console.warn("AudioEngine: failed to play", url, e);
    }
  }

  /** Interrupt (fade-out & stop) all currently playing tracks. */
  private async interrupt(newPriority: number): Promise<void> {
    if (this.active.size === 0) return;
    const ids = [...this.active.keys()];
    await Promise.all(ids.map((id) => this.stop(id, 150)));
    void newPriority;
  }

  private actionBus(action: RuleAction): "music" | "sfx" | "voice" {
    return action.type === "PLAY_AUDIO" || action.type === "PLAY_SEQUENTIAL" ? "music" : "sfx";
  }

  private resolveUrls(action: RuleAction): string[] {
    if (action.type === "PLAY_AUDIO") return [action.assetId];
    return action.assetIds ?? [];
  }

  async stop(handleId: string, fadeMs = 120): Promise<void> {
    const track = this.active.get(handleId);
    if (!track) return;
    this.active.delete(handleId);
    await this.backend.stop(handleId, fadeMs);
  }

  async stopAll(fadeMs = 120): Promise<void> {
    for (const id of [...this.active.keys()]) await this.stop(id, fadeMs);
  }

  pauseAll(): void {
    for (const id of this.active.keys()) this.backend.pause(id);
  }

  resumeAll(): void {
    for (const id of this.active.keys()) this.backend.resume(id);
  }

  isActive(url: string): boolean {
    for (const t of this.active.values()) if (t.url === url) return true;
    return false;
  }

  /** Ducking: lower music/sfx while user talks, restored on silence. */
  startDucking(pollMs = 200, levelThreshold = 0.05, duckFactor = 0.2): void {
    this.setDuckTarget(duckFactor);
    this.duckingActive = true;
    this.duckTimer = setInterval(() => {
      const level = this.backend.getMicLevel();
      const talking = level > levelThreshold;
      for (const [id, track] of this.active) {
        this.backend.setVolume(id, this.effectiveVolume(track, talking));
      }
    }, pollMs);
  }

  stopDucking(): void {
    this.duckingActive = false;
    if (this.duckTimer) clearInterval(this.duckTimer);
    this.duckTimer = null;
    for (const [id, track] of this.active) {
      this.backend.setVolume(id, this.effectiveVolume(track));
    }
  }

  private onTrackEnded(handleId: string, url: string): void {
    this.active.delete(handleId);
    this.callbacks.onPlaybackEnded?.({ handleId, url });
  }

  private effectiveVolume(
    track: ActiveTrack,
    isTalking?: boolean,
  ): number {
    return this.effectiveVolumeFrom(track.baseVolume, track.bus, isTalking);
  }

  private effectiveVolumeFrom(
    base: number,
    bus: "music" | "sfx" | "voice",
    isTalking?: boolean,
  ): number {
    const busVol = this.volumes[bus];
    const master = this.volumes.master;
    let v = base * busVol * master;
    // Ducking only affects music & sfx, never the user's own mic bus.
    const talking =
      isTalking ??
      (this.duckingActive ? this.backend.getMicLevel() > 0.05 : false);
    if (talking && bus !== "voice") v *= this.duckFactor;
    return clamp01(v);
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function fadeFor(action: RuleAction): number {
  if (action.type === "PLAY_SEQUENTIAL" && action.fadeMs) return action.fadeMs;
  return 0;
}