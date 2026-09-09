import { describe, it, expect } from "vitest";
import { EventEngine } from "./EventEngine";
import { makeEvent } from "../testing/testUtils";

describe("EventEngine session bookkeeping", () => {
  it("tracks wins and running win streak", () => {
    const engine = new EventEngine();
    engine.dispatch(makeEvent("ROUND_WIN"));
    engine.dispatch(makeEvent("ROUND_WIN"));
    const snap = engine.getSnapshot();
    expect(snap.wins).toBe(2);
    expect(snap.winStreak).toBe(2);
  });

  it("resets win streak on a loss and tracks loss streak", () => {
    const engine = new EventEngine();
    engine.dispatch(makeEvent("ROUND_WIN"));
    engine.dispatch(makeEvent("ROUND_WIN"));
    engine.dispatch(makeEvent("ROUND_LOSS"));
    const snap = engine.getSnapshot();
    expect(snap.winStreak).toBe(0);
    expect(snap.lossStreak).toBe(1);
    expect(snap.losses).toBe(1);
  });

  it("counts kills and deaths", () => {
    const engine = new EventEngine();
    engine.dispatch(makeEvent("PLAYER_KILL"));
    engine.dispatch(makeEvent("PLAYER_KILL"));
    engine.dispatch(makeEvent("PLAYER_DEATH"));
    const snap = engine.getSnapshot();
    expect(snap.kills).toBe(2);
    expect(snap.deaths).toBe(1);
  });

  it("resets on GAME_END", () => {
    const engine = new EventEngine();
    engine.dispatch(makeEvent("PLAYER_KILL"));
    engine.dispatch(makeEvent("ROUND_WIN"));
    engine.dispatch(makeEvent("GAME_END"));
    const snap = engine.getSnapshot();
    expect(snap.kills).toBe(0);
    expect(snap.wins).toBe(0);
  });

  it("injects session snapshot into downstream events", () => {
    const seen: any[] = [];
    const engine = new EventEngine({ onEvent: (e) => seen.push(e) });
    engine.dispatch(makeEvent("PLAYER_KILL"));
    expect((seen[0].context.session as any).kills).toBe(1);
  });
});