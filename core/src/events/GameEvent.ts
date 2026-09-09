/**
 * Universal Game Event Model
 *
 * The single source of truth emitted by any GameAdapter and consumed by the
 * Event Engine. UI and Audio systems MUST NOT depend on game-specific fields.
 * Any game-specific state inferred by an adapter is normalized into this shape.
 */

/** Canonical, game-agnostic event namespace. */
export type GameEventType =
  // Session
  | "GAME_START"
  | "GAME_END"
  // Round
  | "ROUND_START"
  | "ROUND_WIN"
  | "ROUND_LOSS"
  // Player actions / outcomes
  | "PLAYER_KILL"
  | "PLAYER_DEATH"
  | "PLAYER_ASSIST"
  | "HEADSHOT_KILL"
  | "CLUTCH"
  | "MVP"
  // Ability / utility
  | "GRENADE_THROW"
  | "FLASH_THROW"
  | "SMOKE_THROW"
  // Objective
  | "BOMB_PLANTED"
  | "BOMB_DEFUSED"
  | "MATCH_POINT"
  // State thresholds
  | "LOW_HP"
  | "KILLSTREAK"
  | "MULTIKILL";

/** Stable identifier for a supported game platform. */
export type GameId = "cs2" | "valorant" | "pubg" | "apex" | "lol" | "unknown";

/** Standardized audio routing destinations. */
export type AudioRoute = "SELF_ONLY" | "TEAMMATES" | "BOTH";

/**
 * Optional context attached to an event. Adapters provide what they can;
 * the Rule engine may consume a subset for complex conditions.
 */
export interface GameEventContext {
  /** Kill / death counts already accumulated this session. */
  session?: SessionSnapshot;
  /** Human-readable team info if exposed by the game. */
  team?: string;
  /** Raw normalized domain values adapters want to pass through. */
  [k: string]: unknown;
}

/** Current session snapshot normalized across games. */
export interface SessionSnapshot {
  kills: number;
  deaths: number;
  assists: number;
  wins: number;
  losses: number;
  roundsWon?: number;
  roundsLost?: number;
  winStreak: number;
  lossStreak: number;
  matchPoint?: boolean;
  /** 0..100 normalized health. */
  health?: number;
  gamePhase?: string;
}

export interface UniversalGameEvent {
  readonly id: string;
  /** Which game produced this event. */
  readonly game: GameId;
  readonly type: GameEventType;
  /** Monotonic local timestamp in ms. */
  readonly timestamp: number;
  /** Adapter-provided, normalized context (optional). */
  readonly context?: GameEventContext;
  /** Priority override, mostly informational. */
  readonly priority?: number;
}

export const GAME_EVENT_TYPES: GameEventType[] = [
  "GAME_START",
  "GAME_END",
  "ROUND_START",
  "ROUND_WIN",
  "ROUND_LOSS",
  "PLAYER_KILL",
  "PLAYER_DEATH",
  "PLAYER_ASSIST",
  "HEADSHOT_KILL",
  "CLUTCH",
  "MVP",
  "GRENADE_THROW",
  "FLASH_THROW",
  "SMOKE_THROW",
  "BOMB_PLANTED",
  "BOMB_DEFUSED",
  "MATCH_POINT",
  "LOW_HP",
  "KILLSTREAK",
  "MULTIKILL",
];