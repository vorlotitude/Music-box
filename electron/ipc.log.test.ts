import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatLogLine, appendLogLine } from "./ipc";

/**
 * Persistent runtime-log helpers (§2 "日志" / §16 Event logging).
 * Pure fs/time formatting — tested without a window.
 */
describe("runtime log persistence (ipc)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-log-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("formats a line as ISO time + padded kind + message", () => {
    const line = formatLogLine({ ts: 0, kind: "event", message: "ROUND_WIN" });
    expect(line).toMatch(/^1970-01-01T/);
    expect(line).toContain("event");
    expect(line.endsWith("ROUND_WIN")).toBe(true);
  });

  it("defaults missing kind to info and missing message to empty string", () => {
    const line = formatLogLine({ ts: 0 });
    expect(line).toContain("info");
    expect(line.trimEnd().endsWith("info")).toBe(true);
  });

  it("appends lines to today's dated file under the given logs dir", () => {
    appendLogLine(dir, { ts: 0, kind: "event", message: "round_win" });
    appendLogLine(dir, { ts: 1, kind: "rule", message: "matched" });

    const day = new Date(0).toISOString().slice(0, 10);
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);

    const content = fs.readFileSync(path.join(dir, files[0]), "utf-8");
    expect(content.split("\n").filter(Boolean)).toHaveLength(2);
    expect(content).toContain("round_win");
    expect(content).toContain("matched");
  });
});