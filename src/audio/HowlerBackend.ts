import { Howl, Howler } from "howler";
import type {
  AudioBackend,
  PlayHandle,
  PlayOptions,
  PlaybackProgress,
} from "@core/audio/AudioBackend";
import type { AudioSink } from "@core/audio/AudioRouter";
import { bridge } from "../bridge";

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

/**
 * Pure picker: returns the VB-Audio CABLE virtual output device (the audible
 * endpoint that feeds the CABLE loopback → in-game voice "mic"). Extracted for
 * unit testing; howler internals stay isolated in the backend.
 *
 * Chromium/GUI enumerate the Windows "current default" and "communications"
 * endpoints as synthetic output devices whose deviceId is exactly "default" /
 * "communications". Those are aliases (not real CABLE endpoints) and would
 * silently redirect audio to the OS default/comm device, so we must skip them
 * and only return a genuine CABLE output device with a real id.
 */
export function pickCableAudioOutput(
  list: Pick<MediaDeviceInfo, "kind" | "label" | "deviceId">[],
): Pick<MediaDeviceInfo, "kind" | "label" | "deviceId"> | null {
  const ALIASES = new Set(["default", "communications"]);
  const real = list.filter(
    (d) => d.kind === "audiooutput" && !!d.deviceId && !ALIASES.has(d.deviceId),
  );
  return (
    real.find((d) => /CABLE\s+Input/i.test(d.label || "")) ??
    real.find((d) => /VB-Audio Virtual Cable/i.test(d.label || "")) ??
    null
  );
}

/** One concrete output target behind a logical play() call (speaker and/or CABLE). */
interface Target {
  howl: Howl;
  /** The primary target owns onEnded and is the source of isPlaying/progress. */
  primary: boolean;
}

export class HowlerBackend implements AudioBackend {
  private handles = new Map<string, Target[]>();
  private seq = 0;
  private cableSinkResolved = false;
  private cableSink: string | null = null;

  async play(
    url: string,
    volume: number,
    opts?: PlayOptions,
  ): Promise<PlayHandle> {
    const id = `h_${++this.seq}`;
    const sinks: AudioSink[] = opts?.sinks ?? ["SPEAKER"];
    const targets: Target[] = [];

    let firedEnded = false;
    const onEndedOnce = () => {
      if (firedEnded) return;
      firedEnded = true;
      opts?.onEnded?.();
      this.handles.delete(id);
    };

    // Resolve the CABLE device once per logical track (cached afterwards) so a
    // "both / virtual mic" reaction also reaches the in-game voice input.
    let cableSinkId: string | null = null;
    if (sinks.includes("VOICE_CHAT")) {
      cableSinkId = await this.resolveCableSinkId();
      console.log(`[gmb-routing] VOICE_CHAT sink resolved = ${cableSinkId === null ? "NULL" : cableSinkId.slice(0, 18) + "…"}`);
    }

    if (sinks.includes("SPEAKER")) {
      const h = this.makeHowl(url, volume, false, null, onEndedOnce);
      if (h) targets.push({ howl: h, primary: true });
    }
    if (sinks.includes("VOICE_CHAT") && cableSinkId) {
      // Selecting a non-default output device requires a transient user
      // gesture; synthesize one via the main process so setSinkId truly applies
      // instead of silently resolving to the default speaker.
      try {
        await bridge.grantUserActivation();
      } catch {
        /* best-effort */
      }
      const h = this.makeHowl(url, volume, true, cableSinkId, onEndedOnce);
      if (h) {
        targets.push({ howl: h, primary: false });
      } else {
        console.log("[gmb-routing] VOICE_CHAT howl construction FAILED");
      }
    }

    if (targets.length === 0) {
      // Nothing could start (driver missing, file unreadable, load failed).
      // Report an immediate end so the engine never holds a dead track.
      this.handles.set(id, []);
      queueMicrotask(onEndedOnce);
      return { id, url };
    }

    this.handles.set(id, targets);
    return { id, url };
  }

  setVolume(handleId: string, volume: number): void {
    for (const t of this.handles.get(handleId) ?? []) t.howl.volume(volume);
  }

  async fade(handleId: string, targetVolume: number, fadeMs: number): Promise<void> {
    const targets = this.handles.get(handleId);
    if (!targets || targets.length === 0) return;
    return new Promise((resolve) => {
      const primary = targets.find((t) => t.primary) ?? targets[0];
      const cur = primary.howl.volume();
      for (const t of targets) {
        t.howl.volume(cur);
        t.howl.fade(cur, targetVolume, fadeMs);
      }
      setTimeout(resolve, fadeMs);
    });
  }

  pause(handleId: string): void {
    for (const t of this.handles.get(handleId) ?? []) t.howl.pause();
  }

  resume(handleId: string): void {
    for (const t of this.handles.get(handleId) ?? []) t.howl.play();
  }

  async stop(handleId: string, fadeMs?: number): Promise<void> {
    const targets = this.handles.get(handleId);
    if (!targets) return;
    if (fadeMs && fadeMs > 0) {
      await new Promise<void>((resolve) => {
        const primary = targets.find((t) => t.primary) ?? targets[0];
        const cur = primary.howl.volume();
        for (const t of targets) t.howl.fade(cur, 0, fadeMs);
        setTimeout(() => {
          for (const t of targets) t.howl.stop();
          this.handles.delete(handleId);
          resolve();
        }, fadeMs);
      });
    } else {
      for (const t of targets) t.howl.stop();
      this.handles.delete(handleId);
    }
  }

  isPlaying(handleId: string): boolean {
    const primary = (this.handles.get(handleId) ?? []).find((t) => t.primary);
    return primary?.howl.playing() ?? false;
  }

  getProgress(handleId: string): PlaybackProgress | null {
    const primary = (this.handles.get(handleId) ?? []).find((t) => t.primary);
    if (!primary) return null;
    const h = primary.howl;
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

  private makeHowl(
    url: string,
    volume: number,
    html5: boolean,
    sinkId: string | null,
    onEnd: () => void,
  ): Howl | null {
    try {
      const howl = new Howl({
        src: [url],
        html5,
        volume,
        onload: () =>
          console.log(`[gmb-routing] howl LOAD OK url=${url.slice(0, 54)} html5=${html5}`),
        onloaderror: (_id: number, err: unknown) =>
          console.log(`[gmb-routing] howl LOADERROR html5=${html5} err=${String(err)}`),
        onplay: () => console.log(`[gmb-routing] howl PLAY html5=${html5}`),
        onend: onEnd,
      });
      if (html5 && sinkId) this.applySink(howl, sinkId);
      howl.play();
      // The <audio> node for html5 mode can materialize after play(); retry the
      // sink wiring so the CABLE redirect reliably applies.
      if (html5 && sinkId) {
        window.setTimeout(() => this.applySink(howl, sinkId), 0);
      }
      return howl;
    } catch {
      return null;
    }
  }

  /** Route an html5 Howl's underlying audio element to a specific output device. */
  private applySink(howl: Howl, sinkId: string): void {
    const node = (howl as unknown as { _sounds?: Array<{ _node?: HTMLMediaElement }> })
      ._sounds?.[0]?._node;
    console.log(`[gmb-routing] applySink: node=${node ? "FOUND" : "null"} sinkId=${(sinkId || "").slice(0, 18)}`);
    if (node && typeof node.setSinkId === "function") {
      try {
        const p = node.setSinkId(sinkId) as unknown as Promise<void>;
        void p.then(
          () => console.log("[gmb-routing] setSinkId RESOLVED (ok)"),
          (err: Error) =>
            console.log(`[gmb-routing] setSinkId REJECTED: ${err?.name || err?.message || err}`),
        );
      } catch (err) {
        console.log(`[gmb-routing] setSinkId THREW: ${(err as Error)?.message}`);
      }
    } else {
      console.log(`[gmb-routing] setSinkId SKIPPED: node=${!!node} fn=${typeof (node as any)?.setSinkId}`);
    }
  }

  private async resolveCableSinkId(): Promise<string | null> {
    if (this.cableSinkResolved) return this.cableSink;
    this.cableSinkResolved = true;
    try {
      let list = await navigator.mediaDevices.enumerateDevices();
      const dump = (list: MediaDeviceInfo[]) =>
        list
          .filter((d) => d.kind === "audiooutput")
          .map((d) => `${d.label || "(blank)"} :: ${d.deviceId.slice(0, 24)}`)
          .join(" | ");
      console.log(`[gmb-routing] audiooutput list#1: ${dump(list)}`);
      let hit = pickCableAudioOutput(list);
      if (!hit) {
        // Output-device labels stay blank until the page holds a capture grant.
        // Do a throwaway mic grab to reveal them, then release immediately.
        await this.transientMic();
        list = await navigator.mediaDevices.enumerateDevices();
        console.log(`[gmb-routing] audiooutput list#2: ${dump(list)}`);
        hit = pickCableAudioOutput(list);
      }
      this.cableSink = hit?.deviceId ?? null;
    } catch {
      this.cableSink = null;
    }
    return this.cableSink;
  }

  private async transientMic(timeoutMs = 2500): Promise<void> {
    try {
      await Promise.race([
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => stream.getTracks().forEach((t) => t.stop())),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      /* if the request is denied we simply can't see labels */
    }
  }
}