import { describe, it, expect } from "vitest";
import { RuleEngine } from "./RuleEngine";
import type { Rule } from "../rules/Rule";
import { makeEvent } from "../testing/testUtils";

function makeRule(partial: Partial<Rule>): Rule {
  return {
    id: partial.id ?? "r1",
    name: partial.name ?? "Test",
    game: "cs2",
    event: partial.event ?? "ROUND_WIN",
    conditions: partial.conditions ?? [],
    action: partial.action ?? { type: "PLAY_AUDIO", assetId: "asset-1" },
    priority: partial.priority ?? 50,
    cooldownMs: partial.cooldownMs ?? 0,
    route: partial.route ?? "SELF_ONLY",
    enabled: partial.enabled ?? true,
    createdAt: partial.createdAt ?? 1,
    ...partial,
  };
}

describe("RuleEngine", () => {
  it("returns null when no rule matches the event", () => {
    const engine = new RuleEngine();
    engine.setRules([makeRule({ event: "ROUND_WIN" })]);
    expect(engine.evaluate(makeEvent("ROUND_LOSS"))).toBeNull();
  });

  it("matches the highest-priority rule when multiple match", () => {
    const engine = new RuleEngine();
    engine.setRules([
      makeRule({ id: "low", priority: 30 }),
      makeRule({ id: "high", priority: 100 }),
    ]);
    const result = engine.evaluate(makeEvent("ROUND_WIN"));
    expect(result?.rule.id).toBe("high");
  });

  it("enforces cooldown, blocking re-fires within the window", () => {
    let now = 1000;
    const engine = new RuleEngine({ now: () => now });
    engine.setRules([makeRule({ id: "cool", cooldownMs: 8000 })]);
    expect(engine.evaluate(makeEvent("ROUND_WIN"))?.blockedByCooldown).toBe(false);
    // immediately after
    const second = engine.evaluate(makeEvent("ROUND_WIN"));
    expect(second?.blockedByCooldown).toBe(true);
    expect(second?.cooldownRemaining).toBeGreaterThan(0);
    // after cooldown expires
    now = 1000 + 8001;
    expect(engine.evaluate(makeEvent("ROUND_WIN"))?.blockedByCooldown).toBe(false);
  });

  it("applies numeric conditions on session context", () => {
    const engine = new RuleEngine();
    engine.setRules([
      makeRule({
        id: "streak3",
        conditions: [{ field: "session.winStreak", operator: ">=", value: 3 }],
      }),
    ]);
    // winStreak present via injected context
    const ok = engine.evaluate(
      makeEvent("ROUND_WIN", { session: { winStreak: 3 } }),
    );
    expect(ok?.rule.id).toBe("streak3");
    const blocked = engine.evaluate(
      makeEvent("ROUND_WIN", { session: { winStreak: 1 } }),
    );
    expect(blocked).toBeNull();
  });

  it("won't fire a conditioned rule when the field is missing", () => {
    const engine = new RuleEngine();
    engine.setRules([
      makeRule({
        id: "needs",
        conditions: [{ field: "session.health", operator: "<=", value: 20 }],
      }),
    ]);
    expect(engine.evaluate(makeEvent("ROUND_WIN", { session: {} }))).toBeNull();
  });

  it("ignores disabled rules", () => {
    const engine = new RuleEngine();
    engine.setRules([makeRule({ id: "off", enabled: false })]);
    expect(engine.evaluate(makeEvent("ROUND_WIN"))).toBeNull();
  });

  it("resets cooldowns", () => {
    let now = 1000;
    const engine = new RuleEngine({ now: () => now });
    engine.setRules([makeRule({ id: "cool", cooldownMs: 8000 })]);
    engine.evaluate(makeEvent("ROUND_WIN"));
    engine.resetCooldowns();
    expect(engine.evaluate(makeEvent("ROUND_WIN"))?.blockedByCooldown).toBe(false);
  });
});