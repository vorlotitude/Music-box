import type { AudioBackend, PlayHandle } from "./AudioBackend";
import type { RuleAction } from "../rules/Rule";
import type { AudioRoute } from "../events/GameEvent";
import { routeToSinks, type AudioSink } from "./AudioRouter";

/** A play request resolved by the rule engine. Route defaults to SELF_ONLY. */
export interface PlayRequest {
  action: RuleAction;
  priority: number;
  volumeOverride?: number;
  route?: AudioRoute;
}

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
  /** Random source for PLAY_RANDOM. Defaults to Math.random; injectable for tests. */
  rng?: () => number;
}

interface ActiveTrack {
  handleId: string;
  url: string;
  bus: "music" | "sfx" | "voice";
  baseVolume: number;
  priority: number;
  createdAt: number;
  mutedByDucking?: boolean;
  /** Where this track is delivered (speaker vs virtual mic). */
  sinks: AudioSink[];
  route: AudioRoute;
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
  private readonly rng: () => number;
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
    this.rng = opts.rng ?? Math.random;
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
   * Play a resolved action against the queue. High-priority requests can
   * interrupt the current track (fade-out then start — a simple crossfade).
   * Sequential actions play their asset list in order, advancing to the next
   * track on natural end; an interrupt/stop also halts the remaining sequence.
   */
  async play(rules: PlayRequest[]): Promise<void> {
    // For MVP, play the highest-priority resolved action.
    if (rules.length === 0) return;
    const top = rules.reduce((a, b) => (b.priority > a.priority ? b : a));
    const route = top.route ?? "SELF_ONLY";
    const sinks = routeToSinks(route);

    // Fade out + stop current on interrupt when new priority >= current.
    await this.interrupt(top.priority);

    if (top.action.type === "PLAY_SEQUENTIAL") {
      await this.startSequence(top.action, top.priority, top.volumeOverride, route, sinks);
      return;
    }

    const urls = this.resolveUrls(top.action);
    if (urls.length === 0) return;
    // PLAY_RANDOM must actually pick one of the candidates at random (§6/§7),
    // never deterministically the first entry.
    const url =
      top.action.type === "PLAY_RANDOM"
        ? urls[Math.floor(this.rng() * urls.length)]
        : urls[0];
    let record = "";
    const handleId = await this.playTrack(url, top.action, top.priority, top.volumeOverride, route, sinks, () =>
      this.onTrackEnded(record, url),
    );
    record = handleId ?? "";
  }

  /**
   * Start a single track against the backend and register it in `active`.
   * Returns the handle id (or null on failure). `onEnded` is only ever called
   * on NATURAL end; stopping/interrupting the track skips it, which is what
   * lets an interrupted sequence halt cleanly.
   */
  private async playTrack(
    url: string,
    action: RuleAction,
    priority: number,
    volumeOverride: number | undefined,
    route: AudioRoute,
    sinks: AudioSink[],
    onEnded: () => void,
  ): Promise<string | null> {
    const bus = this.actionBus(action);
    const fadeInMs = fadeFor(action);
    try {
      const handle: PlayHandle = await this.backend.play(
        url,
        this.effectiveVolumeFrom(volumeOverride ?? 1, bus),
        { fadeInMs, fadeOutMs: fadeFor(action), sinks, onEnded },
      );
      const track: ActiveTrack = {
        handleId: handle.id,
        url,
        bus,
        baseVolume: clamp01(volumeOverride ?? 1),
        priority,
        createdAt: Date.now(),
        sinks,
        route,
      };
      // Recompute volume in case of duck active.
      this.backend.setVolume(handle.id, this.effectiveVolumeFrom(clamp01(volumeOverride ?? 1), bus));
      this.active.set(handle.id, track);
      this.callbacks.onPlaybackStarted?.({ assetUrl: url, handleId: handle.id, action });
      return handle.id;
    } catch (e) {
      // A missing/unplayable file must NEVER crash the app.
      console.warn("AudioEngine: failed to play", url, e);
      return null;
    }
  }

  /** Kick off a sequential playback series from its first track. */
  private startSequence(
    action: Extract<RuleAction, { type: "PLAY_SEQUENTIAL" }>,
    priority: number,
    volumeOverride: number | undefined,
    route: AudioRoute,
    sinks: AudioSink[],
  ): Promise<void> {
    const urls = action.assetIds ?? [];
    return this.playSequenceFrom(urls, 0, action, priority, volumeOverride, route, sinks);
  }

  /** Play one track of a sequence; on natural end, advance to the next. */
  private async playSequenceFrom(
    urls: string[],
    index: number,
    action: Extract<RuleAction, { type: "PLAY_SEQUENTIAL" }>,
    priority: number,
    volumeOverride: number | undefined,
    route: AudioRoute,
    sinks: AudioSink[],
  ): Promise<void> {
    if (index >= urls.length) return;
    const url = urls[index];
    let record = "";
    const handleId = await this.playTrack(url, action, priority, volumeOverride, route, sinks, () => {
      this.onTrackEnded(record, url);
      void this.playSequenceFrom(urls, index + 1, action, priority, volumeOverride, route, sinks);
    });
    record = handleId ?? "";
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