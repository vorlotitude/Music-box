import { describe, it, expect } from "vitest";
import { buildBoxExport, deserializeBoxExport, BOX_FORMAT, BOX_VERSION } from "./boxPort";
import type { MusicBox } from "@core/rules/Rule";

function rule(id: string, name: string, event: string) {
  return {
    id, name, game: "cs2", event, conditions: [],
    action: { type: "PLAY_AUDIO", assetId: "asset-1" },
    priority: 100, cooldownMs: 8000, route: "SELF_ONLY", enabled: true,
  } as any;
}

function box(id: string, ruleIds: string[]): MusicBox {
  return {
    id, name: "Chaotic Victory", description: "win box", game: "cs2",
    rules: ruleIds,
    volume: 0.8, enabled: true, createdAt: 1, updatedAt: 1,
  };
}

describe("boxPort (Music Box export/import)", () => {
  it("buildBoxExport produces a versioned, self-contained payload", () => {
    const storeRules = [rule("r1", "Victory", "ROUND_WIN"), rule("r2", "Sad", "ROUND_LOSS")];
    const payload = buildBoxExport(box("b1", ["r1", "r2"]), storeRules);
    expect(payload.format).toBe(BOX_FORMAT);
    expect(payload.version).toBe(BOX_VERSION);
    expect(payload.rules.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(JSON.parse(JSON.stringify(payload)).box.name).toBe("Chaotic Victory");
  });

  it("round-trips an export and re-ids everything on import", () => {
    const storeRules = [rule("r1", "Victory", "ROUND_WIN")];
    const json = JSON.stringify(buildBoxExport(box("b1", ["r1"]), storeRules));

    const parsed = deserializeBoxExport(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.box.name).toBe("Chaotic Victory (imported)");
    expect(parsed!.box.id).not.toBe("b1");
    expect(parsed!.rules).toHaveLength(1);
    expect(parsed!.rules[0].id).not.toBe("r1");
    // box references (ids) and the re-id'd rules stay linked
    expect(parsed!.box.rules).toContain(parsed!.rules[0].id);
  });

  it("rejects non-Music-Box files without throwing", () => {
    expect(deserializeBoxExport('{"foo":1}')).toBeNull();
    expect(deserializeBoxExport("not json")).toBeNull();
    expect(deserializeBoxExport(JSON.stringify({ format: "other", version: 1, box: {}, rules: [] }))).toBeNull();
    expect(deserializeBoxExport("")).toBeNull();
  });
});