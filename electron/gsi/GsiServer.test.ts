import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GsiServer, type GsiServerCallbacks } from "./GsiServer";

/**
 * GSI HTTP listener — the real entry point where CS2 posts its state (§28
 * "CS2 State → Event → Rule → Audio" integration). We boot a real loopback
 * server and drive it over HTTP, proving valid pushes reach the payload
 * callback, malformed or non-POST requests never crash the app, and first
 * contact is reported exactly once.
 */

function randPort(): number {
  return 20000 + Math.floor(Math.random() * 20000);
}

async function postJson(port: number, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/gamestate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GsiServer", () => {
  let port: number;
  let server: GsiServer;
  let payloads: unknown[];
  let firstContacts: number;

  beforeEach(() => {
    port = randPort();
    payloads = [];
    firstContacts = 0;
    const cb: GsiServerCallbacks = {
      onPayload: (b) => payloads.push(b),
      onFirstContact: () => {
        firstContacts += 1;
      },
      onError: () => {},
    };
    server = new GsiServer(port, cb);
  });

  afterEach(async () => {
    if (server.isRunning) await server.stop();
  });

  it("starts on loopback and reports isRunning/stop lifecycle", async () => {
    expect(server.isRunning).toBe(false);
    await server.start();
    expect(server.isRunning).toBe(true);
    await server.stop();
    expect(server.isRunning).toBe(false);
  });

  it("delivers a valid GSI payload and reports first contact", async () => {
    await server.start();
    const res = await postJson(port, { provider: { name: "csgo" }, round: { phase: "over" } });
    expect(res.status).toBe(200);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ provider: { name: "csgo" } });
    expect(firstContacts).toBe(1);
    expect(server.lastContacted).toBe(true);
  });

  it("reports first contact exactly once across many pushes", async () => {
    await server.start();
    for (let i = 0; i < 5; i++) await postJson(port, { i });
    expect(payloads).toHaveLength(5);
    expect(firstContacts).toBe(1); // only the first successful push fires it
  });

  it("ignores malformed JSON without crashing or forwarding a payload", async () => {
    await server.start();
    const res = await postJson(port, "{ not valid json ");
    expect(res.status).toBe(200); // still ack'd so CS2 keeps pushing
    expect(payloads).toHaveLength(0);
    // The server must still be usable for a subsequent well-formed push.
    await postJson(port, { provider: { name: "csgo" } });
    expect(payloads).toHaveLength(1);
  });

  it("rejects non-POST requests with 405 and no payload", async () => {
    await server.start();
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: "GET" });
    expect(res.status).toBe(405);
    expect(payloads).toHaveLength(0);
  });

  it("acknowledges an oversized body without crashing", async () => {
    await server.start();
    // Build a body over the 4MB cap.
    const huge = "x".repeat(5 * 1024 * 1024);
    try {
      // Server destroys the socket; the client may see a network error.
      await postJson(port, huge);
    } catch {
      /* expected — server reasonableness is what we assert below */
    }
    expect(server.isRunning).toBe(true); // app is alive
    // And it keeps accepting valid traffic afterwards.
    await postJson(port, { provider: { name: "csgo" } });
    expect(payloads).toHaveLength(1);
  });
});