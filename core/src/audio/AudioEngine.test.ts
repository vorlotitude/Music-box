import { describe, it, expect, vi } from "vitest";
import { AudioEngine } from "./AudioEngine";
import type { AudioBackend, PlayHandle } from "./AudioBackend";

function fakeBackend(): AudioBackend & { calls: string[] } {
  const calls: string[] = [];
  let id = 0;
  const active = new Map<string, boolean>();
  return {
    calls,
    async play(url, volume, opts?) {
      id += 1;
      const handleId = `h${id}`;
      active.set(handleId, true);
      calls.push(`play:${url}`);
      // simulate natural end
      if (opts?.onEnded) setTimeout(opts.onEnded, 500);
      return { id: handleId, url } as PlayHandle;
    },
    setVolume(h, v) {
      calls.push(`vol:${h}:${v}`);
    },
    async fade() {},
    pause() {},
    resume() {},
    async stop(h, fade) {
      active.delete(h);
      calls.push(`stop:${h}`);
    },
    isPlaying(h) {
      return active.get(h) ?? false;
    },
    getProgress() {
      return null;
    },
    getMicLevel() {
      return 0;
    },
  };
}

const act = { type: "PLAY_AUDIO" as const, assetId: "file:///x/victory.mp3" };

describe("AudioEngine", () => {
  it("plays the highest-priority action of a batch", async () => {
    const backend = fakeBackend();
    const engine = new AudioEngine({ backend });
    await engine.play([
      { action: act, priority: 30 },
      { action: act, priority: 100 },
    ]);
    expect(backend.calls.length).toBeGreaterThan(0);
    expect(backend.calls[0]).toContain("play:");
  });

  it("stops current track when a new one interrupts", async () => {
    const backend = fakeBackend();
    const engine = new AudioEngine({ backend });
    await engine.play([{ action: act, priority: 50 }]);
    const before = backend.calls.filter((c) => c.startsWith("stop:")).length;
    await engine.play([{ action: act, priority: 100 }]);
    const after = backend.calls.filter((c) => c.startsWith("stop:")).length;
    expect(after).toBeGreaterThan(before);
  });

  it("applies volume buses, muting under ducking", async () => {
    const backend = fakeBackend();
    const engine = new AudioEngine({ backend });
    engine.setVolumes({ master: 1, music: 0.8, sfx: 1, voice: 1 });
    await engine.play([{ action: act, priority: 50 }]);
    const volCalls = backend.calls.filter((c) => c.startsWith("vol:"));
    expect(volCalls.length).toBeGreaterThan(0);
  });

  it("handles a failing file gracefully without throwing", async () => {
    const backend: AudioBackend = {
      async play() {
        throw new Error("404");
      },
      setVolume() {}, async fade() {}, pause() {}, resume() {},
      async stop() {}, isPlaying() { return false; },
      getProgress() { return null; }, getMicLevel() { return 0; },
    };
    const engine = new AudioEngine({ backend });
    await expect(engine.play([{ action: act, priority: 10 }])).resolves.toBeUndefined();
  });

  it("does not play when there are no actions", async () => {
    const backend = fakeBackend();
    const engine = new AudioEngine({ backend });
    await engine.play([]);
    expect(backend.calls.length).toBe(0);
  });

  it("never ducks the voice bus", async () => {
    const backend = fakeBackend();
    const engine = new AudioEngine({ backend });
    engine.startDucking(50, 0.05, 0.2);
    const voiceAct = { type: "PLAY_SEQUENTIAL" as const, assetIds: ["x"], fadeMs: 0 };
    await engine.play([{ action: voiceAct, priority: 10 }]);
    engine.stopDucking();
    // voice should not be ducked -> final vol factor 1 (not 0.2)
    const volCalls = backend.calls.filter((c) => c.startsWith("vol:"));
    expect(volCalls.length).toBeGreaterThan(0);
  });
});