/**
 * Audio playback backend contract.
 *
 * The core AudioEngine is transport-agnostic: any platform implementation
 * (HTML5/Howler in the renderer, or a native Windows Rust WASAPI backend later)
 * fulfills this interface. This keeps the decision logic unit-testable.
 */

import type { AudioSink } from "./AudioRouter";

export interface PlayHandle {
  id: string;
  url: string;
}

export interface PlaybackProgress {
  id: string;
  duration: number;
  position: number;
  playing: boolean;
  volume: number;
}

export interface PlayOptions {
  fadeInMs?: number;
  fadeOutMs?: number;
  onEnded?: () => void;
  /** Routing sinks (e.g. speaker vs virtual mic). Defaults to [SPEAKER]. */
  sinks?: AudioSink[];
}

export interface AudioBackend {
  /** Load-and-play a file at url with the given base volume. Resolves handle. */
  play(url: string, volume: number, options?: PlayOptions): Promise<PlayHandle>;

  /** Set volume on an active handle (0..1). */
  setVolume(handleId: string, volume: number): void;

  /** Begin a fade toward targetVolume over fadeMs. */
  fade(handleId: string, targetVolume: number, fadeMs: number): Promise<void>;

  pause(handleId: string): void;
  resume(handleId: string): void;
  stop(handleId: string, fadeMs?: number): Promise<void>;

  /** Is this handle currently playing (not paused/stopped)? */
  isPlaying(handleId: string): boolean;

  /** Fetch the current playback progress of a handle. */
  getProgress(handleId: string): PlaybackProgress | null;

  /** Detect input from the default microphone and return raw level 0..1. */
  getMicLevel(): number;
}

export class NoopAudioBackend implements AudioBackend {
  async play(): Promise<PlayHandle> {
    return { id: "noop", url: "" };
  }
  setVolume() {}
  async fade() {}
  pause() {}
  resume() {}
  async stop() {}
  isPlaying() {
    return false;
  }
  getProgress() {
    return null;
  }
  getMicLevel() {
    return 0;
  }
}