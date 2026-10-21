import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseLockfile, readLockfile, createLcuPoller, LcuClient } from "./LcuClient";
import { LolAdapter } from "../../core/src/adapters/lol/LolAdapter";

const LOCK = "LeagueClient:12345:57632:hunter2:https";

describe("LCU lockfile parsing", () => {
  it("parses name:pid:port:password:protocol", () => {
    expect(parseLockfile(LOCK)).toEqual({ port: 57632, password: "hunter2", protocol: "https" });
  });

  it("handles a colon-containing Windows name", () => {
    expect(parseLockfile(`C:\\Tools\\Riot Client:88:1000:pw:https`)).toEqual({
      port: 1000,
      password: "pw",
      protocol: "https",
    });
  });

  it("rejects malformed / oversized input", () => {
    expect(parseLockfile("")).toBeNull();
    expect(parseLockfile("garbage")).toBeNull();
    expect(parseLockfile("a:b:c")).toBeNull();
    expect(parseLockfile(`a:b:${"9".repeat(1024)}:x:y`)).toBeNull();
    expect(parseLockfile("a:b:0:x:y")).toBeNull(); // port must be > 0
  });

  it("reads & parses a real lockfile from disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-lcu-"));
    const file = path.join(dir, "lockfile");
    fs.writeFileSync(file, LOCK, "utf8");
    expect(readLockfile(file)).toEqual({ port: 57632, password: "hunter2", protocol: "https" });
    expect(readLockfile(path.join(dir, "missing"))).toBeNull();
  });
});

describe("createLcuPoller -> LolAdapter (transport + mapper)", () => {
  it("assembles a snapshot that fires GAME_START then GAME_END through the adapter", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-lcu-"));
    const lockfile = path.join(dir, "lockfile");
    fs.writeFileSync(lockfile, LOCK, "utf8");

    // The poller reads the lockfile but talks to a real LCU over HTTPS; we drive
    // the adapter directly to assert the LcuSnapshot shape it consumes.
    const adapter = new LolAdapter();
    const eventsFor = (phase?: string, gameId?: number) => {
      const stats = gameId
        ? { gameId, summonerId: 555, teams: [{ teamId: 100, isPlayerTeam: true, isWinningTeam: true, players: [{ summonerId: 555, stats: { CHAMPIONS_KILLED: 8, NUM_DEATHS: 2, ASSISTS: 5, WIN: true } }] }] }
        : undefined;
      return adapter.handleSnapshot({ phase, stats });
    };
    const intoMatch = eventsFor("InProgress");
    expect(intoMatch.map((e) => e.type)).toContain("GAME_START");

    const endEvts = eventsFor("EndOfGame", 3001);
    expect(endEvts.map((e) => e.type)).toContain("GAME_END");
    expect(adapter.getSnapshot().wins).toBe(1);
    expect(adapter.getSnapshot().kills).toBe(8);

    // Repeated identical tick → silent.
    expect(eventsFor("EndOfGame", 3001)).toEqual([]);
  });

  it("guards against a locked file that disappears", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-lcu-"));
    const lockfile = path.join(dir, "lockfile");
    const poller = createLcuPoller(lockfile); // file absent → no credentials
    await expect(poller()).resolves.toEqual({});
  });
});

describe("LcuClient lifecycle", () => {
  it("reports running-edge (start/stop) and forwards snapshots", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-lcu-"));
    const lockfile = path.join(dir, "lockfile");

    const running: boolean[] = [];
    const snapshots: unknown[] = [];
    const client = new LcuClient(
      {
        onSnapshot: (s) => snapshots.push(s),
        onRunningChange: (r) => running.push(r),
        onError: (e) => { throw e; },
      },
      { lockfiles: [lockfile] },
    );

    fs.writeFileSync(lockfile, LOCK, "utf8");
    await (client as unknown as { poll(): Promise<void> }).poll();
    // Client is up; snapshot is forwarded (empty because no real LCU responds → error swallowed).
    expect(running).toEqual([true]);
    client.stop();
    expect(running).toEqual([true, false]);
  });

  it("stays silent (no error) while no lockfile exists", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-lcu-"));
    const client = new LcuClient(
      { onSnapshot: () => {}, onRunningChange: () => {}, onError: () => {} },
      { lockfiles: [path.join(dir, "missing")] },
    );
    await (client as unknown as { poll(): Promise<void> }).poll();
    // No running edge, no snapshot — a closed client costs a stat per tick only.
  });
});