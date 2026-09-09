import {
  GAME_EVENT_TYPES,
  UniversalGameEvent,
  GameEventType,
  SessionSnapshot,
} from "../events/GameEvent";

export interface EventEngineOptions {
  onEvent?: (e: UniversalGameEvent) => void;
}

/**
 * EventEngine sits between adapters and the Rule engine.
 *
 * Responsibilities:
 *  1. Emit every normalized UniversalGameEvent downstream.
 *  2. Maintain a running SessionSnapshot so complex conditions
 *     (win streak, kill count, low HP, multikill, ...) have data.
 *
 * It is game-agnostic: it never inspects CS2-specific fields.
 */
export class EventEngine {
  private session: SessionSnapshot = this.emptySnapshot();
  private listeners: ((e: UniversalGameEvent) => void)[] = [];
  private lastEventTimes: Record<GameEventType, number> = {} as Record<
    GameEventType,
    number
  >;
  private streak = { win: 0, loss: 0 };
  private consecutiveKills = 0;

  constructor(private opts: EventEngineOptions = {}) {
    if (opts.onEvent) this.listeners.push(opts.onEvent);
  }

  on(listener: (e: UniversalGameEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** Feed an event into the engine. Applies session bookkeeping and emits downstream. */
  dispatch(event: UniversalGameEvent): void {
    this.applySessionState(event);
    const enriched: UniversalGameEvent = {
      ...event,
      context: { ...(event.context ?? {}) },
    };
    // Inject normalized session snapshot into context.
    enriched.context!.session = this.cloneSnapshot();
    this.lastEventTimes[event.type] = Date.now();
    for (const l of this.listeners) l(enriched);
  }

  resetSession(): void {
    this.session = this.emptySnapshot();
    this.streak = { win: 0, loss: 0 };
    this.consecutiveKills = 0;
  }

  getSnapshot(): SessionSnapshot {
    return this.cloneSnapshot();
  }

  lastFire(type: GameEventType): number {
    return this.lastEventTimes[type] ?? 0;
  }

  private emptySnapshot(): SessionSnapshot {
    return {
      kills: 0,
      deaths: 0,
      assists: 0,
      wins: 0,
      losses: 0,
      roundsWon: 0,
      roundsLost: 0,
      winStreak: 0,
      lossStreak: 0,
      matchPoint: false,
      health: 100,
      gamePhase: "unknown",
    };
  }

  private cloneSnapshot(): SessionSnapshot {
    return { ...this.session };
  }

  private applySessionState(e: UniversalGameEvent): void {
    switch (e.type) {
      case "GAME_START":
      case "GAME_END":
        this.resetSession();
        break;
      case "ROUND_WIN":
        this.session.wins += 1;
        this.session.roundsWon = (this.session.roundsWon ?? 0) + 1;
        this.streak.win += 1;
        this.streak.loss = 0;
        this.session.winStreak = this.streak.win;
        this.session.lossStreak = 0;
        break;
      case "ROUND_LOSS":
        this.session.losses += 1;
        this.session.roundsLost = (this.session.roundsLost ?? 0) + 1;
        this.streak.loss += 1;
        this.streak.win = 0;
        this.session.lossStreak = this.streak.loss;
        this.session.winStreak = 0;
        break;
      case "PLAYER_KILL":
        this.session.kills += 1;
        this.consecutiveKills += 1;
        if (this.consecutiveKills >= 2) {
          // Optionally downgrade to a multikill event handled by rule engine.
        }
        break;
      case "PLAYER_DEATH":
        this.session.deaths += 1;
        this.consecutiveKills = 0;
        break;
      case "MULTIKILL":
      case "KILLSTREAK": {
        // Achievements are informational: the underlying kills were already
        // tallied by their PLAYER_KILL events. Re-sync the consecutive counter
        // to the reported streak (missing context → keep as-is).
        const streak = typeof e.context?.streak === "number" ? e.context.streak
          : typeof e.context?.tier === "number" ? e.context.tier : this.consecutiveKills;
        this.consecutiveKills = streak;
        break;
      }
      case "LOW_HP": {
        const raw = e.context?.health ?? 40;
        const hp = typeof raw === "number" ? raw : 40;
        this.session.health = Math.max(0, Math.min(100, hp));
        break;
      }
      default:
        break;
    }
  }
}

export { GAME_EVENT_TYPES, type UniversalGameEvent, type GameEventType };