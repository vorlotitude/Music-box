import { describe, it, expect, vi, afterEach } from "vitest";
import { ProcessMonitor } from "./processMonitor";

/**
 * Game-process detection (§2 "游戏启动/退出检测", which drives the Home
 * Connected/Disconnected panel). The probe is injected so we never shell out
 * to PowerShell; we assert edge-triggered onChange, no spurious repeats,
 * error surfacing, and stop().
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ProcessMonitor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires onChange once when a watched process starts, and on the way down", async () => {
    let running = new Set<string>();
    const probe = vi.fn(async () => running);
    const changes: [boolean, string | undefined][] = [];
    const m = new ProcessMonitor(["cs2.exe"], (r, n) => changes.push([r, n]), () => {}, probe);

    m.start(15);
    await sleep(40); // a couple of polls while nothing is running
    expect(probe).toHaveBeenCalled();
    // May see the initial "not running" notification, but never a running one.
    expect(changes.some(([r]) => r)).toBe(false);

    running = new Set(["cs2.exe"]);
    await sleep(60); // next poll detects the transition
    expect(changes).toContainEqual([true, "cs2.exe"]);

    // Steady state: repeated polls while it stays up must NOT re-fire.
    const countWhileUp = changes.length;
    await sleep(70);
    expect(changes.length).toBe(countWhileUp);

    running = new Set();
    await sleep(60); // goes away
    expect(changes).toContainEqual([false, undefined]);

    m.stop();
  });

  it("detects only the names it was told about", async () => {
    const probe = vi.fn(async () => new Set(["cs2.exe"]));
    const changes: [boolean, string | undefined][] = [];
    const m = new ProcessMonitor(["cs2.exe", "valorant.exe"], (r, n) => changes.push([r, n]), () => {}, probe);
    m.start(15);
    await sleep(60);
    // cs2 running -> event with cs2.exe; valorant not running -> no event for it.
    expect(changes).toContainEqual([true, "cs2.exe"]);
    expect(changes).not.toContainEqual([true, "valorant.exe"]);
    m.stop();
  });

  it("surfaces probe failures via onError without throwing", async () => {
    const probe = vi.fn(async () => {
      throw new Error("probe blew up");
    });
    const errors: Error[] = [];
    const m = new ProcessMonitor(["cs2.exe"], () => {}, (e) => errors.push(e), probe);
    m.start(15);
    await sleep(60);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toBe("probe blew up");
    m.stop();
  });

  it("stop() clears the timer and stops polling", async () => {
    const probe = vi.fn(async () => new Set<string>());
    const m = new ProcessMonitor(["cs2.exe"], () => {}, () => {}, probe);
    m.start(15);
    await sleep(40);
    const calls = probe.mock.calls.length;
    m.stop();
    const after = probe.mock.calls.length;
    await sleep(40);
    expect(probe.mock.calls.length).toBe(after); // no more polls after stop
    expect(after).toBeGreaterThanOrEqual(calls);
  });
});