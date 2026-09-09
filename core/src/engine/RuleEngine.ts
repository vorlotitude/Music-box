import type { UniversalGameEvent, GameEventType } from "../events/GameEvent";
import type { Rule, Condition, ConditionOperator } from "../rules/Rule";

export interface RuleMatchContext {
  session?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface RuleMatchResult {
  rule: Rule;
  /** Score = priority, used to disambiguate when cooldowns collide. */
  score: number;
  matchedConditions: boolean;
  cooldownRemaining: number;
  blockedByCooldown: boolean;
}

export interface RuleEngineOptions {
  now?: () => number;
}

/**
 * RuleEngine matches incoming events against user rules.
 * It is pure & deterministic (no I/O), which makes it trivially unit-testable.
 */
export class RuleEngine {
  private rules: Rule[] = [];
  private cooldownUntil: Record<string, number> = {};
  private nowFn: () => number;

  constructor(opts: RuleEngineOptions = {}) {
    this.nowFn = opts.now ?? (() => Date.now());
  }

  /** Replace the full rule set (source of truth lives in the store). */
  setRules(rules: Rule[]): void {
    this.rules = rules.filter((r) => r.enabled);
  }

  getRules(): Rule[] {
    return this.rules;
  }

  /** Reset cooldown tracking (used on GAME_START or manual reset). */
  resetCooldowns(): void {
    this.cooldownUntil = {};
  }

  /**
   * Evaluate the incoming event, returning the best actionable match (or null).
   * Rules are filtered by event type + condition, then by cooldown,
   * and finally sorted by priority so the loudest wins.
   */
  evaluate(event: UniversalGameEvent): RuleMatchResult | null {
    const candidates: Rule[] = this.rules.filter(
      (r) => r.event === event.type && this.conditionsPass(r, event),
    );
    if (candidates.length === 0) return null;

    const now = this.nowFn();
    // Highest-priority rule wins; if tied, earliest-registered wins for determinism.
    const ranked = [...candidates].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
    const best = ranked[0];
    if (!best) return null;

    const remaining = Math.max(0, this.cooldownUntil[best.id] - now);
    if (remaining > 0) {
      return {
        rule: best,
        score: best.priority,
        matchedConditions: true,
        cooldownRemaining: remaining,
        blockedByCooldown: true,
      };
    }
    // Mark fired: next allowed time = now + cooldown.
    this.cooldownUntil[best.id] = now + best.cooldownMs;
    return {
      rule: best,
      score: best.priority,
      matchedConditions: true,
      cooldownRemaining: 0,
      blockedByCooldown: false,
    };
  }

  /** Whether a single rule would fire for this event (cooldown ignored). For UI previews. */
  wouldFire(rule: Rule, event: UniversalGameEvent): boolean {
    return rule.event === event.type && this.conditionsPass(rule, event);
  }

  private conditionsPass(rule: Rule, event: UniversalGameEvent): boolean {
    if (rule.conditions.length === 0) return true;
    const ctx: RuleMatchContext = {
      ...(event.context ?? {}),
      session: (event.context?.session as unknown as Record<string, unknown>) ?? {},
    };
    for (const cond of rule.conditions) {
      if (!this.conditionPasses(cond, ctx)) return false;
    }
    return true;
  }

  private conditionPasses(cond: Condition, ctx: RuleMatchContext): boolean {
    const actual = this.lookup(ctx, cond.field);
    if (actual === undefined) return false; // field not available -> rule won't silently fire
    return compare(actual, cond.operator, cond.value);
  }

  /** Resolve a dotted path like "session.winStreak" against the context. */
  private lookup(ctx: RuleMatchContext, field: string): unknown {
    const parts = field.split(".");
    let cur: unknown = ctx;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }
}

export function compare(
  actual: unknown,
  op: ConditionOperator,
  expected: number | string | boolean,
): boolean {
  if (typeof actual === "number" && typeof expected === "number") {
    switch (op) {
      case ">":
        return actual > expected;
      case ">=":
        return actual >= expected;
      case "<":
        return actual < expected;
      case "<=":
        return actual <= expected;
      case "==":
        return actual === expected;
      case "!=":
        return actual !== expected;
    }
  }
  // Non-numeric equality.
  switch (op) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    default:
      return false;
  }
}