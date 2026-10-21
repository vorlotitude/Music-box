import { describe, it, expect } from "vitest";
import { generateMusicBoxFromPrompt } from "./promptToMusicBox";

describe("generateMusicBoxFromPrompt (§22 AI Music Box Generator)", () => {
  it("turns a victory request into a high-priority ROUND_WIN pack", () => {
    const r = generateMusicBoxFromPrompt("我想要一个燃向的 CS2 胜利音乐盒");
    expect(r.rules.some((x) => x.event === "ROUND_WIN")).toBe(true);
    const win = r.rules.find((x) => x.event === "ROUND_WIN")!;
    expect(win.priority).toBe(95);
    expect(r.name).toContain("Epic");
  });

  it("recognizes a loss-streak request and encodes it as a condition (§22 example)", () => {
    const r = generateMusicBoxFromPrompt("输五把以后给我放最搞笑的音乐");
    const loss = r.rules.find((x) => x.event === "ROUND_LOSS");
    expect(loss).toBeDefined();
    expect(loss!.condition).toEqual({
      field: "session.lossStreak",
      operator: ">=",
      value: 5,
    });
    expect(r.name).toMatch(/Meme|Custom/);
  });

  it("maps a kill prompt to PLAYER_KILL without inventing a round win", () => {
    const r = generateMusicBoxFromPrompt("想要一个击杀音效");
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0].event).toBe("PLAYER_KILL");
    expect(r.rules[0].priority).toBe(50);
  });

  it("stays deterministic and usable when nothing matches", () => {
    const r = generateMusicBoxFromPrompt("rm -rf /");
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0].event).toBe("ROUND_WIN"); // sensible fallback
  });

  it("emits multiple event rules for a combined request", () => {
    const r = generateMusicBoxFromPrompt("round win 和 kill 都要触发");
    const events = r.rules.map((x) => x.event);
    expect(events).toContain("ROUND_WIN");
    expect(events).toContain("PLAYER_KILL");
  });

  it("strikes a style adjective into the pack name", () => {
    const r = generateMusicBoxFromPrompt("抽象搞笑的胜利");
    expect(r.name).toMatch(/Meme/i);
    expect(r.description).toContain('"抽象搞笑的胜利"');
    // no cross-style bleed
    expect(r.name).not.toMatch(/Epic|Sad/);
  });
});