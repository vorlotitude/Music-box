import { describe, it, expect } from "vitest";
import { GAME_LEGAL_NOTES, legalNotesFor } from "./legalNotes";

describe("GAME_LEGAL_NOTES (§20)", () => {
  it("defines legal notes for every planned game", () => {
    for (const id of ["cs2", "valorant", "pubg", "apex", "lol"]) {
      expect(GAME_LEGAL_NOTES[id]).toBeDefined();
    }
  });

  it("CS2 is injection-free and uses no memory reads", () => {
    const cs2 = legalNotesFor("cs2");
    expect(cs2.injectionFree).toBe(true);
    expect(cs2.memoryReading).toBe(false);
    expect(cs2.interfaceUsed).toContain("Game State Integration");
  });

  it("returns a safe fallback for an unknown game", () => {
    const n = legalNotesFor("unknown-game");
    expect(n.injectionFree).toBe(true);
    expect(n.memoryReading).toBe(false);
  });

  it("every note records the four required §20 fields + posture", () => {
    for (const id of Object.keys(GAME_LEGAL_NOTES)) {
      const n = GAME_LEGAL_NOTES[id];
      expect(typeof n.interfaceUsed).toBe("string");
      expect(typeof n.injectionFree).toBe("boolean");
      expect(typeof n.memoryReading).toBe("boolean");
      expect(typeof n.termsChecked).toBe("boolean");
      expect(typeof n.antiCheatConsiderations).toBe("string");
      expect(typeof n.knownLimitations).toBe("string");
    }
  });
});