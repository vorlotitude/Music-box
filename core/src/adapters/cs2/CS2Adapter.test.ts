import { describe, it, expect } from "vitest";
import { CS2Adapter } from "./CS2Adapter";

function payload(round: Record<string, unknown>, player?: Record<string, unknown>, map?: Record<string, unknown>) {
  return {
    round: { phase: "freezetime", win_team: "", bomb: "", round: 1, ...(round ?? {}) },
    player: { team: "CT", state: { health: 100, round_kills: 0 }, ...(player ?? {}) },
    map: { phase: "live", round: 1, ...(map ?? {}) },
  };
}

describe("CS2Adapter GSI parsing", () => {
  it("emits ROUND_WIN when our team wins", () => {
    const adapter = new CS2Adapter();
    const events = adapter.handlePayload(payload({ phase: "over", win_team: "CT" }));
    expect(events.map((e) => e.type)).toContain("ROUND_WIN");
  });

  it("emits ROUND_LOSS when the opposing team wins", () => {
    const adapter = new CS2Adapter();
    const events = adapter.handlePayload(payload({ phase: "over", win_team: "T" }));
    expect(events.map((e) => e.type)).toContain("ROUND_LOSS");
  });

  it("detects kills via rising round_kills", () => {
    const adapter = new CS2Adapter();
    adapter.handlePayload(payload({}, { state: { health: 100, round_kills: 0 } }));
    const events = adapter.handlePayload(payload({}, { state: { health: 100, round_kills: 2 } }));
    expect(events.map((e) => e.type)).toContain("PLAYER_KILL");
  });

  it("detects death when health drops to zero", () => {
    const adapter = new CS2Adapter();
    adapter.handlePayload(payload({}, { state: { health: 100, round_kills: 0 } }));
    const events = adapter.handlePayload(payload({}, { state: { health: 0, round_kills: 0 } }));
    expect(events.map((e) => e.type)).toContain("PLAYER_DEATH");
  });

  it("emits LOW_HP when health falls at/below threshold", () => {
    const adapter = new CS2Adapter();
    adapter.configure({ healthThreshold: 25 });
    adapter.handlePayload(payload({}, { state: { health: 100, round_kills: 0 } }));
    const events = adapter.handlePayload(payload({}, { state: { health: 20, round_kills: 0 } }));
    expect(events.map((e) => e.type)).toContain("LOW_HP");
  });

  it("emits BOMB_PLANTED / BOMB_DEFUSED", () => {
    const adapter = new CS2Adapter();
    const planted = adapter.handlePayload(payload({ bomb: "planted" }));
    // No event on an unchanged payload.
    expect(adapter.handlePayload(payload({ bomb: "planted" })).length).toBe(0);
    const defused = adapter.handlePayload(payload({ bomb: "defused" }));
    expect(planted.map((e) => e.type)).toContain("BOMB_PLANTED");
    expect(defused.map((e) => e.type)).toContain("BOMB_DEFUSED");
  });

  it("emits nothing on unchanged payloads", () => {
    const adapter = new CS2Adapter();
    adapter.handlePayload(payload({ bomb: "planted", win_team: "CT", phase: "over" }));
    const events = adapter.handlePayload(payload({ bomb: "planted", win_team: "CT", phase: "over" }));
    expect(events.length).toBe(0);
  });

  it("supports manual test event trigger for dev mode", () => {
    const adapter = new CS2Adapter();
    const seen: any[] = [];
    adapter.onEvent((e) => seen.push(e));
    adapter.triggerTestEvent("ROUND WIN");
    adapter.triggerTestEvent("KILL");
    adapter.triggerTestEvent("DEATH");
    expect(seen.map((e) => e.type)).toEqual([
      "ROUND_WIN",
      "PLAYER_KILL",
      "PLAYER_DEATH",
    ]);
  });
});