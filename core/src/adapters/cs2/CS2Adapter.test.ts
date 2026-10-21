import { describe, it, expect, vi } from "vitest";
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

  it("emits MULTIKILL / KILLSTREAK on consecutive quick kills", () => {
    const adapter = new CS2Adapter();
    adapter.configure({ killStreakWindowMs: 10_000 });
    adapter.handlePayload(payload({})); // seed: GAME_START zeroes playerKills
    const k1 = adapter.handlePayload(payload({}, { state: { round_kills: 1 } }));
    expect(k1.map((e) => e.type)).toContain("PLAYER_KILL");
    expect(k1.map((e) => e.type)).not.toContain("MULTIKILL");

    const k2 = adapter.handlePayload(payload({}, { state: { round_kills: 2 } }));
    expect(k2.map((e) => e.type)).toContain("MULTIKILL"); // 2-kill streak
    expect(k2.map((e) => e.type)).not.toContain("KILLSTREAK");

    const k3 = adapter.handlePayload(payload({}, { state: { round_kills: 3 } }));
    expect(k3.map((e) => e.type)).toContain("KILLSTREAK"); // 3-kill streak
  });

  it("breaks a kill streak when the window between kills expires", () => {
    vi.useFakeTimers();
    const adapter = new CS2Adapter();
    adapter.configure({ killStreakWindowMs: 5_000 });
    try {
      adapter.handlePayload(payload({}));
      const k1 = adapter.handlePayload(payload({}, { state: { round_kills: 1 } })); // streak 1
      expect(k1.map((e) => e.type)).not.toContain("MULTIKILL");
      vi.advanceTimersByTime(6_000);
      // Next kill falls outside the window → streak resets to 1, no MULTIKILL.
      const k2 = adapter.handlePayload(payload({}, { state: { round_kills: 2 } }));
      expect(k2.map((e) => e.type)).toContain("PLAYER_KILL");
      expect(k2.map((e) => e.type)).not.toContain("MULTIKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a death breaks the current kill streak", () => {
    const adapter = new CS2Adapter();
    adapter.configure({ killStreakWindowMs: 10_000 });
    adapter.handlePayload(payload({}));
    adapter.handlePayload(payload({}, { state: { round_kills: 1 } })); // streak 1
    adapter.handlePayload(payload({}, { state: { round_kills: 2 } })); // streak 2 (MULTIKILL)
    // Player dies, ending the streak.
    adapter.handlePayload(payload({}, { state: { round_kills: 2, health: 0 } }));
    const afterDeath = adapter.handlePayload(payload({}, { state: { round_kills: 3, health: 100 } }));
    expect(afterDeath.map((e) => e.type)).toContain("PLAYER_KILL");
    expect(afterDeath.map((e) => e.type)).not.toContain("MULTIKILL");
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

  it("normalizes every Home test-button label to the matching event", () => {
    const adapter = new CS2Adapter();
    const seen: any[] = [];
    adapter.onEvent((e) => seen.push(e));
    adapter.triggerTestEvent("ROUND WIN");
    adapter.triggerTestEvent("ROUND LOSS");
    adapter.triggerTestEvent("ROUND START");
    adapter.triggerTestEvent("KILL");
    adapter.triggerTestEvent("DEATH");
    adapter.triggerTestEvent("MVP");
    adapter.triggerTestEvent("GRENADE");
    adapter.triggerTestEvent("BOMB PLANT");
    expect(seen.map((e) => e.type)).toEqual([
      "ROUND_WIN",
      "ROUND_LOSS",
      "ROUND_START",
      "PLAYER_KILL",
      "PLAYER_DEATH",
      "MVP",
      "GRENADE_THROW",
      "BOMB_PLANTED",
    ]);
  });

  it("fires LOW_HP on the cross into the threshold, not on every echo", () => {
    const adapter = new CS2Adapter();
    adapter.configure({ healthThreshold: 25 });
    adapter.handlePayload(payload({}, { state: { health: 100, round_kills: 0 } }));
    // Crossing into low HP fires once.
    expect(adapter.handlePayload(payload({}, { state: { health: 20, round_kills: 0 } })).map((e) => e.type))
      .toContain("LOW_HP");
    // Staying low must NOT re-fire (repeated GSI echo).
    expect(adapter.handlePayload(payload({}, { state: { health: 15, round_kills: 0 } })).map((e) => e.type))
      .not.toContain("LOW_HP");
    // Heal back up, then drop again → fires a second time.
    adapter.handlePayload(payload({}, { state: { health: 60, round_kills: 0 } }));
    expect(adapter.handlePayload(payload({}, { state: { health: 10, round_kills: 0 } })).map((e) => e.type))
      .toContain("LOW_HP");
  });

  it("emits GAME_START when entering live play and resets the session", () => {
    const adapter = new CS2Adapter();
    const events = adapter.handlePayload(payload({}, {}, { phase: "live" }));
    expect(events.map((e) => e.type)).toContain("GAME_START");
    expect(adapter.getSnapshot().kills).toBe(0);
  });

  it("emits GAME_END on gameover phase", () => {
    const adapter = new CS2Adapter();
    const events = adapter.handlePayload(payload({}, {}, { phase: "gameover" }));
    expect(events.map((e) => e.type)).toContain("GAME_END");
  });

  it("emits MATCH_POINT at roundsToWin-1 once, and again after a reset", () => {
    const adapter = new CS2Adapter();
    adapter.configure({ roundsToWin: 13 });
    const mp = (score: number) => payload({}, {}, { team_ct: { score } });
    // 12/13 = our match point.
    expect(adapter.handlePayload(mp(12)).map((e) => e.type)).toContain("MATCH_POINT");
    // Repeated echo at match point must not re-fire.
    expect(adapter.handlePayload(mp(12)).map((e) => e.type)).not.toContain("MATCH_POINT");
    // Score moves away, then back to match point → fires again.
    adapter.handlePayload(mp(9));
    expect(adapter.handlePayload(mp(12)).map((e) => e.type)).toContain("MATCH_POINT");
  });

  it("detects a FLASH_THROW when a flashbang's ammo reserve drops", () => {
    const adapter = new CS2Adapter();
    adapter.handlePayload(payload({}, { weapons: { "2": { name: "weapon_flashbang", ammo_reserve: 1 } } }));
    const events = adapter.handlePayload(payload({}, { weapons: { "2": { name: "weapon_flashbang", ammo_reserve: 0 } } }));
    expect(events.map((e) => e.type)).toContain("FLASH_THROW");
  });

  it("detects a SMOKE_THROW when a smoke grenade's ammo reserve drops", () => {
    const adapter = new CS2Adapter();
    adapter.handlePayload(payload({}, { weapons: { "3": { name: "weapon_smokegrenade", ammo_reserve: 1 } } }));
    const events = adapter.handlePayload(payload({}, { weapons: { "3": { name: "weapon_smokegrenade", ammo_reserve: 0 } } }));
    expect(events.map((e) => e.type)).toContain("SMOKE_THROW");
  });

  it("detects a GRENADE_THROW for HE/molotov when the ammo reserve drops", () => {
    const adapter = new CS2Adapter();
    adapter.handlePayload(payload({}, { weapons: { "4": { name: "weapon_hegrenade", ammo_reserve: 1 } } }));
    const events = adapter.handlePayload(payload({}, { weapons: { "4": { name: "weapon_hegrenade", ammo_reserve: 0 } } }));
    expect(events.map((e) => e.type)).toContain("GRENADE_THROW");
  });

  it("does not emit a throw when ammo reserves are unchanged", () => {
    const adapter = new CS2Adapter();
    adapter.handlePayload(payload({}, { weapons: { "2": { name: "weapon_flashbang", ammo_reserve: 1 } } }));
    const events = adapter.handlePayload(payload({}, { weapons: { "2": { name: "weapon_flashbang", ammo_reserve: 1 } } }));
    expect(events.map((e) => e.type)).not.toContain("FLASH_THROW");
    expect(events.map((e) => e.type)).not.toContain("SMOKE_THROW");
    expect(events.map((e) => e.type)).not.toContain("GRENADE_THROW");
  });

  it("Developer Mode: triggerTestEvent normalizes every bindable event type (§29)", () => {
    const adapter = new CS2Adapter();
    const seen: string[] = [];
    adapter.onEvent((e) => seen.push(e.type));
    const cases: [string, string][] = [
      ["ROUND WIN", "ROUND_WIN"],
      ["ROUND LOSS", "ROUND_LOSS"],
      ["ROUND START", "ROUND_START"],
      ["KILL", "PLAYER_KILL"],
      ["DEATH", "PLAYER_DEATH"],
      ["HEADSHOT KILL", "HEADSHOT_KILL"],
      ["ASSIST", "PLAYER_ASSIST"],
      ["MVP", "MVP"],
      ["CLUTCH", "CLUTCH"],
      ["GRENADE", "GRENADE_THROW"],
      ["FLASH", "FLASH_THROW"],
      ["SMOKE", "SMOKE_THROW"],
      ["BOMB PLANT", "BOMB_PLANTED"],
      ["BOMB DEFUSE", "BOMB_DEFUSED"],
      ["MATCH POINT", "MATCH_POINT"],
    ];
    for (const [label, expected] of cases) {
      adapter.triggerTestEvent(label);
      expect(seen[seen.length - 1]).toBe(expected);
    }
  });

  it("does not fire a throw on the first payload (no prior snapshot)", () => {
    const adapter = new CS2Adapter();
    const events = adapter.handlePayload(payload({}, { weapons: { "2": { name: "weapon_flashbang", ammo_reserve: 0 } } }));
    expect(events.map((e) => e.type)).not.toContain("FLASH_THROW");
  });

  it("dev trigger normalizes FLASH / SMOKE / GRENADE", () => {
    const adapter = new CS2Adapter();
    const seen: any[] = [];
    adapter.onEvent((e) => seen.push(e));
    adapter.triggerTestEvent("FLASH");
    adapter.triggerTestEvent("SMOKE");
    adapter.triggerTestEvent("GRENADE");
    expect(seen.map((e) => e.type)).toEqual(["FLASH_THROW", "SMOKE_THROW", "GRENADE_THROW"]);
  });

  it("dev trigger normalizes MATCH POINT and GAME START", () => {
    const adapter = new CS2Adapter();
    const seen: any[] = [];
    adapter.onEvent((e) => seen.push(e));
    adapter.triggerTestEvent("MATCH POINT");
    adapter.triggerTestEvent("GAME START");
    expect(seen.map((e) => e.type)).toEqual(["MATCH_POINT", "GAME_START"]);
  });

  // --- CLUTCH (§3/§30) from the opt-in allplayers_state optic -----------------

  const lastManPayload: any = (phase: string, round = 1) => ({
    round: { phase, win_team: "", bomb: "", round },
    player: { team: "CT", state: { health: 100, round_kills: 0 } },
    map: { phase: "live", round },
    allplayers: {
      self: { team: "CT", state: { health: 100 } },
      ally1: { team: "CT", state: { health: 0 } },
      ally2: { team: "CT", state: { health: 0 } },
      e1: { team: "T", state: { health: 100 } },
      e2: { team: "T", state: { health: 100 } },
    },
  });

  it("emits CLUTCH when we are the last surviving player on our team in a live round", () => {
    const adapter = new CS2Adapter();
    const events = adapter.handlePayload(lastManPayload("live"));
    expect(events.map((e) => e.type)).toContain("CLUTCH");
  });

  it("does not emit CLUTCH while multiple teammates are alive (full 5v5)", () => {
    const adapter = new CS2Adapter();
    const full: any = lastManPayload("live");
    full.allplayers = {
      self: { team: "CT", state: { health: 100 } },
      ally1: { team: "CT", state: { health: 100 } },
      ally2: { team: "CT", state: { health: 100 } },
      e1: { team: "T", state: { health: 100 } },
      e2: { team: "T", state: { health: 100 } },
    };
    const events = adapter.handlePayload(full);
    expect(events.map((e) => e.type)).not.toContain("CLUTCH");
  });

  it("fires CLUTCH only once per round and re-arms on the next round", () => {
    const adapter = new CS2Adapter();
    const first = adapter.handlePayload(lastManPayload("live", 1));
    expect(first.map((e) => e.type)).toContain("CLUTCH");

    // Same 1vX echoed → no duplicate this round.
    const echo = adapter.handlePayload(lastManPayload("live", 1));
    expect(echo.map((e) => e.type)).not.toContain("CLUTCH");

    // Round concludes, next round freezetime re-arms the edge-trigger.
    adapter.handlePayload(lastManPayload("over", 1));
    adapter.handlePayload(lastManPayload("freezetime", 2));
    const next = adapter.handlePayload(lastManPayload("live", 2));
    expect(next.map((e) => e.type)).toContain("CLUTCH");
  });
});