import type { GameEventType } from "../events/GameEvent";
import type { AudioRoute, GameId } from "../events/GameEvent";

/** What the rule should do when its event+conditions match. */
export type ActionType = "PLAY_AUDIO" | "PLAY_RANDOM" | "PLAY_SEQUENTIAL";

export interface PlayAudioAction {
  type: "PLAY_AUDIO";
  assetId: string;
  /** Volume 0..1 override. */
  volume?: number;
}

export interface PlayRandomAction {
  type: "PLAY_RANDOM";
  assetIds: string[];
  volume?: number;
}

export interface PlaySequentialAction {
  type: "PLAY_SEQUENTIAL";
  assetIds: string[];
  /** 0..1 volume override. */
  volume?: number;
  /** Fade in ms for each track in the sequence. */
  fadeMs?: number;
}

export type RuleAction =
  | PlayAudioAction
  | PlayRandomAction
  | PlaySequentialAction;

/** Right-hand value of a numeric condition for human-friendly UI maps. */
export type ConditionOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

/**
 * A single declarative condition. Operates on normalized context values.
 * Fields kept JSON-serializable so advanced/JSON mode can round-trip them.
 */
export interface Condition {
  /** Which context field this applies to, e.g. session.killCount or winStreak. */
  field: string;
  operator: ConditionOperator;
  value: number | string | boolean;
}

export interface Rule {
  id: string;
  name: string;
  game: string;
  /** The canonical event that fires this rule. */
  event: GameEventType;
  conditions: Condition[];
  action: RuleAction;
  /** 1..100, higher wins under conflict. */
  priority: number;
  /** Cooldown in ms. 0 = none. */
  cooldownMs: number;
  /** Audio routing (SELF_ONLY / TEAMMATES / BOTH). */
  route: AudioRoute;
  /** Whether the rule should only fire while a game is running. */
  requireActiveGame?: boolean;
  enabled: boolean;
  /** Optional creation/update timestamps. */
  createdAt?: number;
  updatedAt?: number;
}

/** A named collection of rules — the product's primary user-facing unit. */
export interface MusicBox {
  id: string;
  name: string;
  description?: string;
  game: GameId;
  rules: Rule[];
  /** 0..1 default volume for the box. */
  volume?: number;
  /** Optional visual accent for identification. */
  color?: string;
  createdAt: number;
  updatedAt: number;
  enabled: boolean;
}