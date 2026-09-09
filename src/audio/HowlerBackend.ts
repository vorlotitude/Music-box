import { Howl, Howler } from "howler";
import type {
  AudioBackend,
  PlayHandle,
  PlayOptions,
  PlaybackProgress,
} from "@core/audio/AudioBackend";

/**
 * Turns an absolute local file path into a URL the renderer can play.
 * Under Electron we use the privileged `appmedia://local/<encoded-abs-path>`
 * scheme served by the main process (streaming). Under a plain browser (dev)
 * we fall back to the path as-is, which only works for relative/test assets.
 */
export function toMediaUrl(absPath: string): string {
  if (process.env.VITE === "1" || typeof window === "undefined") return absPath;
  return `appmedia://local/${encodeURIComponent(absPath)}`;
}

export class HowlerBackend implements AudioBackend {
  private handles = new Map<string, Howl>();
  private seq = 0;

  async play(
    url: string,
    volume: number,
    opts?: PlayOptions,
  ): Promise<PlayHandle> {
    const id = `h_${++this.seq}`;
    const howl = new Howl({
      src: [url],
      html5: false,
      volume,
      onend: () => {
        opts?.onEnded?.();
        this.handles.delete(id);
      },
      onloaderror: (_id, err) => {
        opts?.onEnded?.(); // treat load failure as immediate end, never crash
      },
      onplayerror: (_id, err) => {
        // Autoplay policy: retry on next interaction is handled upstream.
      },
    });
    this.handles.set(id, howl);
    howl.play();
    if (opts?.fadeInMs && opts.fadeInMs > 0) howl.fade(0, volume, opts.fadeInMs);
    return { id, url };
  }

  setVolume(handleId: string, volume: number): void {
    const h = this.handles.get(handleId);
    if (h) h.volume(volume);
  }

  async fade(handleId: string, targetVolume: number, fadeMs: number): Promise<void> {
    const h = this.handles.get(handleId);
    if (!h) return;
    return new Promise((resolve) => {
      const cur = h.volume();
      h.volume(cur); // normalize; Howler.fade(float) is available
      h.fade(cur, targetVolume, fadeMs);
      setTimeout(resolve, fadeMs);
    });
  }

  pause(handleId: string): void {
    this.handles.get(handleId)?.pause();
  }

  resume(handleId: string): void {
    this.handles.get(handleId)?.play();
  }

  async stop(handleId: string, fadeMs?: number): Promise<void> {
    const h = this.handles.get(handleId);
    if (!h) return;
    if (fadeMs && fadeMs > 0) {
      await new Promise<void>((resolve) => {
        const cur = h.volume();
        h.fade(cur, 0, fadeMs);
        setTimeout(() => {
          h.stop();
          this.handles.delete(handleId);
          resolve();
        }, fadeMs);
      });
    } else {
      h.stop();
      this.handles.delete(handleId);
    }
  }

  isPlaying(handleId: string): boolean {
    return this.handles.get(handleId)?.playing() ?? false;
  }

  getProgress(handleId: string): PlaybackProgress | null {
    const h = this.handles.get(handleId);
    if (!h) return null;
    return {
      id: handleId,
      duration: h.duration() || 0,
      position: h.seek() || 0,
      playing: h.playing(),
      volume: h.volume(),
    };
  }

  /** Approximate mic level: we can't access the mic without a device; stub at 0. */
  getMicLevel(): number {
    return 0;
  }

  /** Global master, for debug. */
  get globalVolume(): number {
    return Howler.volume();
  }
}