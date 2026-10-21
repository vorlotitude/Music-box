import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import type { LcuSnapshot, LcuGameStats } from "../../core/src/adapters/lol/LolAdapter";

/**
 * Poll the League Client Update (LCU) local API and assemble `LcuSnapshot` ticks
 * for the LolAdapter. This is a platform-layer transport, mirroring how the CS2
 * GSI listener lives in `electron/main` (not in the adapter).
 *
 * Riot's running client hoists a localhost HTTPS API whose session credentials
 * (port + admin token + protocol) are written to a plaintext `lockfile` that is
 * regenerated on every launch. We re-read the lockfile each poll so a client
 * restart reconnects on its own.
 *
 * Posture vs Riot's policies: this reads only the same localhost API the client
 * exposes for itself and that companion tools use — no injection, no memory
 * reads, no client modification. `legalNotesFor("lol")` records the caveat that
 * the LCU is community-documented (not an official support contract) and can
 * change without notice.
 */

export interface LcuClientCallbacks {
  /** A fresh transport snapshot each poll tick (edge-triggering lives in the adapter). */
  onSnapshot: (snap: LcuSnapshot) => void;
  /** Raised with the League client process state (drives UI connection indicator). */
  onRunningChange: (running: boolean) => void;
  onError?: (err: Error) => void;
}

export function lockfileCandidates(): string[] {
  const local = process.env.LOCALAPPDATA ?? "";
  return [
    path.join(local, "Riot Games", "Riot Client", "Config", "lockfile"),
    path.join(local, "Riot Games", "League of Legends", "Config", "lockfile"),
  ];
}

/** Parse `name:pid:port:password:protocol` (last 5 segments are authoritative). */
export function parseLockfile(raw: string): { port: number; password: string; protocol: string } | null {
  if (!raw || raw.length > 1024) return null;
  const parts = raw.trim().split(":");
  if (parts.length < 5) return null;
  const [name, pid, portStr, password, protocol] = parts.slice(-5);
  const port = Number(portStr);
  if (!name || !pid || !Number.isFinite(port) || port <= 0 || port > 65535 || !password || !protocol) {
    return null;
  }
  return { port, password, protocol };
}

export function readLockfile(lockfilePath: string | null): { port: number; password: string; protocol: string } | null {
  try {
    if (!lockfilePath) return null;
    return parseLockfile(fs.readFileSync(lockfilePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Transport for the League client. Polls one-or-more lockfile candidates and
 * (when a client is up) the LCU HTTPS API, forwarding edge-relevant snapshots to
 * the LolAdapter. Abstains from any request while no lockfile is found, so a
 * closed client costs nothing beyond a file stat per tick.
 */
export class LcuClient {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lockfiles: string[];
  private callbacks: LcuClientCallbacks;

  constructor(
    callbacks: LcuClientCallbacks,
    opts: { lockfiles?: string[] } = {},
  ) {
    this.callbacks = callbacks;
    this.lockfiles = opts.lockfiles ?? lockfileCandidates();
  }

  start(intervalMs = 3000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), intervalMs);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.running) {
      this.running = false;
      this.callbacks.onRunningChange(false);
    }
  }

  /** Find the first readable lockfile among candidates. */
  private discover(): string | null {
    for (const lf of this.lockfiles) {
      if (readLockfile(lf)) return lf;
    }
    return null;
  }

  private poll(): Promise<void> {
    const lockfilePath = this.discover();
    const runningNow = lockfilePath != null;
    if (runningNow !== this.running) {
      this.running = runningNow;
      this.callbacks.onRunningChange(runningNow);
    }
    if (!lockfilePath) return Promise.resolve();
    return createLcuPoller(lockfilePath)()
      .then((snap) => this.callbacks.onSnapshot(snap))
      .catch((err: Error) => this.callbacks.onError?.(err));
  }
}

/**
 * Build a poller bound to a lockfile path, re-read each call (credentials rotate
 * per launch). Fetches gameflow-phase and, when a match has resolved, the
 * flattened end-of-game stats; a 404 for stats is expected and swallowed.
 */
export function createLcuPoller(lockfilePath: string): () => Promise<LcuSnapshot> {
  return () => {
    const creds = readLockfile(lockfilePath);
    if (!creds) return Promise.resolve({});
    return Promise.all([
      getJson<string>(creds, "/lol-gameflow/v1/gameflow-phase").catch(() => undefined),
      getJson<LcuGameStats>(creds, "/lol-end-of-game/v1/game-stats").catch(() => undefined),
    ]).then(([phase, statsRes]) => {
      const snap: LcuSnapshot = { phase };
      if (statsRes && typeof statsRes.gameId === "number") {
        snap.stats = statsRes;
      }
      return snap;
    });
  };
}

/** Authenticated GET to the LCU localhost API (self-signed cert → skip verify). */
export function getJson<T>(creds: { port: number; password: string }, urlPath: string): Promise<T> {
  const base = Buffer.from(`riot:${creds.password}`).toString("base64");
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port: creds.port,
        path: urlPath,
        method: "GET",
        headers: { Authorization: `Basic ${base}` },
        rejectUnauthorized: false,
        timeout: 3000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return reject(new Error(`LCU ${urlPath} -> ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("LCU request timed out")));
    req.end();
  });
}