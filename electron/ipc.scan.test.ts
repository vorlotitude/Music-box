import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanAudioDir } from "./ipc";

/**
 * Main-process directory scan for folder import. Pure fs logic, tested without
 * a window: recursive traversal, audio-extension filter, hidden-file skip.
 */
describe("scanAudioDir (main-process folder import)", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-scan-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, size = 16): string {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.alloc(size, 0));
    return full;
  }

  it("finds audio files recursively across subfolders", () => {
    write("a.mp3");
    write("sub/b.wav");
    write("sub/nested/c.flac");
    const found = scanAudioDir(root, 0);
    expect(found.map((f) => f.name).sort()).toEqual(["a.mp3", "b.wav", "c.flac"]);
  });

  it("ignores non-audio extensions, hidden files and folders", () => {
    write("a.mp3");
    write("readme.txt");
    write("chart.png");
    write(".hidden.mp3");
    write(".git/a.mp3");
    const found = scanAudioDir(root, 0);
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("a.mp3");
  });

  it("survives a missing directory without throwing", () => {
    expect(() => scanAudioDir(path.join(root, "does-not-exist"), 0)).not.toThrow();
    expect(scanAudioDir(path.join(root, "does-not-exist"), 0)).toEqual([]);
  });
});