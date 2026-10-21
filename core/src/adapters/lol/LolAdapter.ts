import {
  UniversalGameEvent,
  GameEventType,
  GameId,
  SessionSnapshot,
} from "../../events/GameEvent";
import { BaseGameAdapter, AdapterState } from "../GameAdapter";
import { legalNotesFor } from "../legalNotes";

/**
 * League of Legends Live Client Data API (LCU) adapter.
 *
 * Riot ships a local remote-control API (`127.0.0.1`) that the client uses to
 * talk to itself. Community companion apps read it as a documented-but-unofficial
 * state source — the same posture as CS2 GSI: an opt-in local HTTPS interface,
 * no injection, no memory reads, no client modification. Auth is a per-run admin
 * token the client writes to a plaintext `lockfile` (dynamically regenerated each
 * launch), so we re-read it every poll.
 *
 * This adapter is a pure Mapper, mirroring CS2Adapter: it turns LCU payloads into
 * canonical UniversalGameEvents. The transport (lockfile discovery → HTTPS poll
 * → assemble `LcuSnapshot`) belongs to the platform layer (`electron/game/LcuClient`),
 * exactly like the GSI HTTP listener lives in `electron/main`, not in the adapter.
 *
 * Live-event window in the LCU. The reliable, long-lived signals are:
 *  - `lol-gameflow/v1/gameflow-phase`  → "InProgress" = match started
 *  - `lol-end-of-game/v1/game-stats`   → flat teams[] + localPlayer.gameId,
 *    with kills/deaths/assists and the WIN/LOSE flag per player
 * Real-time mid-match kill events are only exposed via the deprecated KARA live
 * replay stream which is limited — so kill-level triggers are recorded as a known
 * limitation, not faked.
 */

/** The gameflow-phase value that a live match is actually mid-play under. */
const START_PHASE = "InProgress";

/** Transport-assembled LCU snapshot (one per poll tick, platform layer builds it). */
export interface LcuSnapshot {
  /** `gameflow-phase` string, e.g. "Lobby", "ChampSelect", "InProgress". */
  phase?: string;
  /** Payload of `/lol-end-of-game/v1/game-stats` when available. */
  stats?: LcuGameStats;
}

/**
 * The flat /lol-end-of-game/v1/game-stats response shape (no data wrapper).
 * `localPlayer` only carries identity; the per-player detail lives in `teams[]`.
 */
export interface LcuGameStats {
  gameId?: number;
  summonerId?: number;
  teams?: LcuTeam[];
}

export interface LcuTeam {
  teamId?: number;
  isPlayerTeam?: boolean;
  isWinningTeam?: boolean;
  players?: LcuPlayer[];
}

export interface LcuPlayer {
  summonerId?: number;
  championId?: number;
  stats?: {
    CHAMPIONS_KILLED?: number;
    NUM_DEATHS?: number;
    ASSISTS?: number;
    WIN?: boolean;
  };
}

export class LolAdapter extends BaseGameAdapter {
  id: GameId = "lol";
  name = "League of Legends";
  state: AdapterState = "disconnected";

  readonly legalNotes = legalNotesFor("lol");

  private prevPhase?: string;
  /** Edge guard so a match's GAME_END fires at most once (re-armed on GAME_START). */
  private gameEnded = false;
  private lastStatsGameId?: number;
  private session: SessionSnapshot = {
    kills: 0, deaths: 0, assists: 0, wins: 0, losses: 0,
    winStreak: 0, lossStreak: 0, gamePhase: "unknown",
  };
  private seq = 0;

  async initialize(): Promise<void> {
    this.state = "connected";
  }

  async shutdown(): Promise<void> {
    this.state = "disconnected";
  }

  async checkConnection(): Promise<AdapterState> {
    return this.state;
  }

  getSnapshot(): SessionSnapshot {
    return { ...this.session };
  }

  configure(): void {
    // No adapter-specific tunables yet.
  }

  /** Manual test injection (dev mode). */
  triggerTestEvent(type: string): void {
    const normalized = normalizeLolTestType(type);
    if (normalized === "GAME_START") {
      this.gameEnded = false;
    }
    this.emit(this.make(normalized));
  }

  /**
   * Consume a transport-assembled snapshot. The transport calls this once per
   * poll tick with the fresh `gameflow-phase` and (when visible) end-of-game
   * stats; we edge-trigger GAME_START / GAME_END so repeated ticks stay quiet.
   */
  handleSnapshot(snap: LcuSnapshot): UniversalGameEvent[] {
    const events: UniversalGameEvent[] = [];
    for (const e of this.handleGameflow({ phase: snap.phase })) events.push(e);
    for (const e of this.handleEndOfGameStats(snap.stats)) events.push(e);
    return events;
  }

  /**
   * Consume LCU `gameflow-phase` changes. Match start is signalled by entering
   * the in-progress phase (edge-triggered, once per match).
   */
  handleGameflow(payload: { phase?: string }): UniversalGameEvent[] {
    const phase = payload.phase;
    if (!phase || phase === this.prevPhase) return [];
    const events: UniversalGameEvent[] = [];

    if (phase === START_PHASE) {
      // Entering a live match — fresh session, re-arm the EOG trigger.
      this.resetSession();
      this.gameEnded = false;
      events.push(this.make("GAME_START"));
    }

    this.prevPhase = phase;
    return events;
  }

  /**
   * Consume the flat `/lol-end-of-game/v1/game-stats` shape. This is the
   * authoritative result — fold in win/loss + KDA, then emit a single GAME_END
   * per match (guard on `gameEnded` and the stats `gameId`, re-armed at the next
   * GAME_START).
   */
  handleEndOfGameStats(stats?: LcuGameStats): UniversalGameEvent[] {
    if (!stats?.gameId || this.gameEnded || stats.gameId === this.lastStatsGameId) return [];
    const { kills, deaths, assists, win } = findLocalPlayerStats(stats);
    this.lastStatsGameId = stats.gameId;
    this.session = { ...this.session, kills, deaths, assists, gamePhase: "endOfGame" };

    if (win == null) {
      // No WIN flag visible (e.g. remade match) — emit GAME_END without a result.
      this.gameEnded = true;
      return [this.make("GAME_END")];
    }
    if (win) {
      this.session = {
        ...this.session,
        wins: this.session.wins + 1,
        winStreak: this.session.winStreak + 1,
        lossStreak: 0,
      };
    } else {
      this.session = {
        ...this.session,
        losses: this.session.losses + 1,
        lossStreak: this.session.lossStreak + 1,
        winStreak: 0,
      };
    }
    this.gameEnded = true;
    return [this.make("GAME_END", { result: win ? "Win" : "Lose" })];
  }

  private resetSession(): void {
    this.session = {
      kills: 0, deaths: 0, assists: 0, wins: this.session.wins, losses: this.session.losses,
      winStreak: this.session.winStreak, lossStreak: this.session.lossStreak,
      gamePhase: "inProgress",
    };
  }

  private make(type: GameEventType, extra: Record<string, unknown> = {}): UniversalGameEvent {
    return {
      id: `${type}_${this.seq++}_${Date.now()}`,
      game: "lol",
      type,
      timestamp: Date.now(),
      context: { ...extra, session: { ...this.session } },
    };
  }
}

/** Resolve the local player's KDA + win flag from the flat teams[] shape. */
function findLocalPlayerStats(stats: LcuGameStats): { kills: number; deaths: number; assists: number; win?: boolean } {
  const selfId = stats.summonerId;
  for (const team of stats.teams ?? []) {
    const player = (team.players ?? []).find((p) => p.summonerId === selfId);
    if (player?.stats) {
      const s = player.stats;
      return {
        kills: toCount(s.CHAMPIONS_KILLED),
        deaths: toCount(s.NUM_DEATHS),
        assists: toCount(s.ASSISTS),
        win: s.WIN == null ? undefined : s.WIN,
      };
    }
  }
  const fallback = stats.teams?.[0]?.players?.[0]?.stats;
  return {
    kills: fallback ? toCount(fallback.CHAMPIONS_KILLED) : 0,
    deaths: fallback ? toCount(fallback.NUM_DEATHS) : 0,
    assists: fallback ? toCount(fallback.ASSISTS) : 0,
    win: fallback?.WIN,
  };
}

function toCount(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function normalizeLolTestType(type: string): GameEventType {
  const upper = type.toUpperCase().replace(/[- ]/g, "_");
  if (upper.includes("GAME") && upper.includes("END")) return "GAME_END";
  if (upper.includes("GAME")) return "GAME_START";
  if (upper.includes("KILL")) return "PLAYER_KILL";
  if (upper.includes("DEATH")) return "PLAYER_DEATH";
  if (upper.includes("WIN") || upper.includes("LOSE") || upper.includes("LOSS")) return "GAME_END";
  return "GAME_START";
}