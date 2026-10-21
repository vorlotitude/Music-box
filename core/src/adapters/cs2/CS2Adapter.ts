import {
  UniversalGameEvent,
  GameEventType,
  GameId,
  SessionSnapshot,
} from "../../events/GameEvent";
import { BaseGameAdapter, AdapterState } from "../GameAdapter";
import { legalNotesFor } from "../legalNotes";

/**
 * CS2 Game State Integration (GSI) adapter.
 *
 * CS2 GSI is Valve's official, HTTP-push, non-invasive status interface:
 * the game POSTs a JSON snapshot to a local listener when the user opts in by
 * placing a `gamestate_integration_*.cfg` file. It requires NO injection, NO
 * memory reading and NO anti-cheat bypass — purely a supplementary state push.
 *
 * This adapter is a pure parser/mapper: it turns GSI payloads into canonical
 * UniversalGameEvents. The HTTP server that receives the payloads lives in the
 * platform layer (electron/main) and calls `handlePayload`.
 */

type TeamId = "CT" | "T" | "" | "Spectator";

interface TeamScore {
  score?: number;
  map_score?: number;
}

interface Cs2Payload {
  round?: {
    phase?: string;
    win_team?: string;
    bomb?: string;
    round?: number;
  };
  player?: {
    team?: string;
    activity?: string;
    state?: {
      health?: number;
      round_kills?: number;
      round_totalkills?: number;
      kill?: number;
      death?: number;
    };
    /** Current-held weapons; grenades carry an ammo_reserve that decrements on throw. */
    weapons?: Record<string, { name?: string; ammo_reserve?: number }>;
  };
  /** Every player in the lobby (optic: allplayers_state). Used to detect CLUTCH. */
  allplayers?: Record<string, { team?: string; state?: { health?: number } }>;
  map?: {
    phase?: string;
    round?: number;
    mode?: string;
    team_ct?: TeamScore;
    team_t?: TeamScore;
  };
}

export interface BeginRoundOptions {
  healthThreshold?: number;
  /** Rounds to win a match (match point = roundsToWin - 1). Default competitive = 13. */
  roundsToWin?: number;
  /** Max ms between consecutive kills to consider the streak linked. Default 10s. */
  killStreakWindowMs?: number;
}

export class CS2Adapter extends BaseGameAdapter {
  id: GameId = "cs2";
  name = "CS2";
  state: AdapterState = "disconnected";

  readonly legalNotes = legalNotesFor("cs2");

  private prev: {
    roundPhase?: string;
    winTeam?: string;
    playerKills?: number;
    playerHealth?: number;
    mapRound?: number;
    mapPhase?: string;
    bomb?: string;
    roundLocked?: boolean;
    myScore?: number;
    matchPoint?: boolean;
    killStreak?: number;
    lastKillTime?: number;
    /** Whether the loadout tracker has a persisted snapshot of last-seen weapons. */
    prevWeapons?: Record<string, { name?: string; ammo_reserve?: number }>;
    /** Edge-trigger guard so CLUTCH fires once per round (reset on freezetime). */
    clutchFired?: boolean;
  } = {};
  private session: SessionSnapshot = {
    kills: 0, deaths: 0, assists: 0, wins: 0, losses: 0,
    roundsWon: 0, roundsLost: 0, winStreak: 0, lossStreak: 0,
    health: 100, matchPoint: false, gamePhase: "unknown",
  };
  private opts: BeginRoundOptions = { healthThreshold: 25, roundsToWin: 13, killStreakWindowMs: 10000 };
  private seq = 0;

  shouldRestartOnRound = false;

  async initialize(): Promise<void> {
    this.state = "connected"; // set by server when a push arrives; we optimistically mark connected
  }

  async shutdown(): Promise<void> {
    this.state = "disconnected";
  }

  async checkConnection(): Promise<AdapterState> {
    return this.state;
  }

  configure(config: Record<string, unknown> & BeginRoundOptions): void {
    if (typeof config.healthThreshold === "number") {
      this.opts.healthThreshold = config.healthThreshold;
    }
    if (typeof config.roundsToWin === "number" && config.roundsToWin > 1) {
      this.opts.roundsToWin = config.roundsToWin;
    }
    if (typeof config.killStreakWindowMs === "number" && config.killStreakWindowMs > 0) {
      this.opts.killStreakWindowMs = config.killStreakWindowMs;
    }
  }

  getSnapshot(): SessionSnapshot {
    return { ...this.session };
  }

  /** Manual test injection (dev mode). Events are emitted immediately. */
  triggerTestEvent(type: string): void {
    const normalized = normalizeTestType(type);
    this.emit(this.make(normalized));
  }

  getRawState(): unknown {
    return this.prev;
  }

  /**
   * Consume a GSI payload and emit any normalized events resulting from the
   * transition. Payloads that carry no new information produce no events
   * (avoids spurious triggering & keeps cooldowns sane).
   */
  handlePayload(payload: Cs2Payload): UniversalGameEvent[] {
    const events: UniversalGameEvent[] = [];
    const round = payload.round ?? {};
    const player = payload.player ?? {};
    const state = player.state ?? {};
    const p = this.prev;

    // CLUTCH detection: when we are the only surviving player on our team in a
    // live round (a "1vX" situation). Edge-triggered once per round via
    // `clutchFired`, which freezetime armed the next round. Uses only the
    // opt-in `allplayers_state` GSI optic — no memory reads, no injection.
    const allPlayers = payload.allplayers;
    if (allPlayers && (round.phase === "live" || round.phase === "bomb")) {
      const ourTeam = (player.team || "CT") as TeamId;
      let aliveOnTeam = 0;
      for (const ap of Object.values(allPlayers)) {
        if (!ap || ap.team !== ourTeam) continue;
        if (typeof ap.state?.health === "number" && ap.state.health > 0) aliveOnTeam += 1;
      }
      const selfAlive = typeof state.health === "number" ? state.health > 0 : true;
      // ≤1 accounts for GSI including the watched player in `allplayers`.
      if (selfAlive && aliveOnTeam <= 1 && !p.clutchFired) {
        p.clutchFired = true;
        events.push(this.make("CLUTCH", { teammatesActive: aliveOnTeam - (selfAlive && aliveOnTeam > 0 ? 1 : 0) }));
      }
    }

    // Map / match transitions
    const mapPhase = payload.map?.phase;
    if (mapPhase && mapPhase !== p.mapPhase) {
      if (
        (mapPhase === "live" || mapPhase === "matchlive") &&
        p.mapPhase !== "live" &&
        p.mapPhase !== "matchlive" &&
        p.mapPhase !== "gameover"
      ) {
        // Entering live play from a non-live phase = a new match started.
        this.resetSession();
        events.push(this.make("GAME_START"));
      }
      if (mapPhase === "gameover") {
        events.push(this.make("GAME_END"));
        this.session = { ...this.session, gamePhase: "gameover" };
      }
      p.mapPhase = mapPhase;
    }

    // Round transitions
    const newPhase = round.phase ?? p.roundPhase;
    if (newPhase && newPhase !== p.roundPhase) {
      if (newPhase === "freezetime" && p.roundPhase !== "live" && p.roundPhase !== "bomb") {
        // New round beginning (brand new phase entering freezetime).
        events.push(this.make("ROUND_START"));
        this.session = { ...this.session, gamePhase: "freezetime" };
        // Re-arm round-outcome detection for the upcoming round.
        p.roundLocked = false;
        p.winTeam = "";
        // A fresh round resets the current kill streak.
        p.killStreak = 0;
        p.lastKillTime = undefined;
        // Re-arm CLUTCH edge-trigger for the upcoming round.
        p.clutchFired = false;
      }
      if (newPhase === "live" && (p.roundPhase === "freezetime")) {
        this.session.gamePhase = "live";
      }
      if (newPhase === "over") {
        this.session.gamePhase = "over";
      }
      p.roundPhase = newPhase;
    }

    // Round outcome via win_team
    const winTeam = round.win_team;
    if (winTeam && winTeam !== "" && winTeam !== p.winTeam && !p.roundLocked) {
      const ourTeam = player.team ?? ("CT" as TeamId);
      if (ourTeam && ourTeam !== "" && ourTeam !== "Spectator") {
        const won = winTeam === ourTeam;
        this.applyOutcome(won);
        events.push(this.make(won ? "ROUND_WIN" : "ROUND_LOSS"));
      }
      p.winTeam = winTeam;
      p.roundLocked = true;
    }

    // Kill detection: round_kills increased
    const kills = state.round_kills ?? 0;
    if (typeof p.playerKills === "number" && kills > p.playerKills) {
      events.push(this.make("PLAYER_KILL"));
      this.session = {
        ...this.session,
        kills: this.session.kills + (kills - p.playerKills),
      };
      // Streak: consecutive kills within a short window (reset on death/round).
      const now = Date.now();
      if (typeof p.lastKillTime === "number" && now - p.lastKillTime <= (this.opts.killStreakWindowMs ?? 10_000)) {
        p.killStreak = (p.killStreak ?? 1) + 1;
      } else {
        p.killStreak = 1;
      }
      p.lastKillTime = now;
      if (p.killStreak >= 2) {
        events.push(this.make("MULTIKILL", { streak: p.killStreak }));
      }
      if (p.killStreak >= 3) {
        events.push(this.make("KILLSTREAK", { tier: p.killStreak }));
      }
    }
    p.playerKills = kills;

    // Death detection: health dropped to 0 from >0
    const health = typeof state.health === "number" ? state.health : p.playerHealth;
    if (typeof health === "number") {
      if (typeof p.playerHealth === "number") {
        if (p.playerHealth > 0 && health <= 0) {
          events.push(this.make("PLAYER_DEATH"));
          this.session = {
            ...this.session,
            deaths: this.session.deaths + 1,
          };
          // A death ends any current kill streak.
          p.killStreak = 0;
          p.lastKillTime = undefined;
        }
      }
      // Low HP: emit only when we cross INTO the threshold (edge-triggered),
      // so repeated GSI echoes while staying low don't re-fire the rule.
      const threshold = this.opts.healthThreshold!;
      const crossedIntoLow =
        health > 0 &&
        health <= threshold &&
        (typeof p.playerHealth !== "number" || p.playerHealth > threshold);
      if (crossedIntoLow) {
        events.push(this.make("LOW_HP", { health }));
      }
      this.session.health = health;
    }
    p.playerHealth = health;

    // Bomb objective
    const bomb = round.bomb;
    if (bomb && bomb !== "" && bomb !== p.bomb) {
      if (bomb === "planted") events.push(this.make("BOMB_PLANTED"));
      if (bomb === "defused") events.push(this.make("BOMB_DEFUSED"));
      p.bomb = bomb;
    }

    // Detect grenade throws by ammo reserve decreasing (0 after throw).
    // This is the only public signal in GSI when you actually throw a grenade.
    const weapons = payload.player?.weapons;
    if (weapons && typeof p.prevWeapons === "object" && p.prevWeapons != null) {
      for (const [slot, wp] of Object.entries(weapons)) {
        const prev = p.prevWeapons[slot];
        if (!prev || !wp || typeof prev.ammo_reserve !== "number" || typeof wp.ammo_reserve !== "number") continue;
        if (wp.ammo_reserve < prev.ammo_reserve) {
          // throw confirmed; classify by name if possible
          const name = (wp.name ?? "").toLowerCase();
          if (name.includes("flash") || name.includes("bang")) {
            events.push(this.make("FLASH_THROW"));
          } else if (name.includes("smoke")) {
            events.push(this.make("SMOKE_THROW"));
          } else {
            // molotov/he/greande still counts as a GRENADE_THROW
            events.push(this.make("GRENADE_THROW"));
          }
        }
      }
    }
    if (weapons) {
      // snapshot weapons for next comparison
      p.prevWeapons = { ...weapons };
    }

    // Match point: our team is one round win away from winning the match.
    this.trackMatchPoint(events, (player.team ?? "") as TeamId, payload.map);

    this.state = "connected";
    // Avoid spamming connected on every echo; keep lastEventTimes meaningful.
    return events;
  }

  /** Emit MATCH_POINT (edge-triggered) when our team reaches roundsToWin - 1. */
  private trackMatchPoint(
    events: UniversalGameEvent[],
    team: TeamId,
    map?: Cs2Payload["map"],
  ): void {
    if (!map) return;
    const myScore =
      team === "T" ? map.team_t?.score ?? map.team_t?.map_score
      : team === "CT" ? map.team_ct?.score ?? map.team_ct?.map_score
      : undefined;
    if (typeof myScore !== "number") return;

    const target = this.opts.roundsToWin!;
    const isMatchPoint = myScore === target - 1;
    if (isMatchPoint && !this.prev.matchPoint) {
      events.push(this.make("MATCH_POINT"));
    }
    this.prev.matchPoint = isMatchPoint;
    this.session = { ...this.session, matchPoint: isMatchPoint };
  }

  /** Reset per-match state when a new GAME_START is detected. */
  private resetSession(): void {
    this.session = {
      kills: 0, deaths: 0, assists: 0, wins: 0, losses: 0,
      roundsWon: 0, roundsLost: 0, winStreak: 0, lossStreak: 0,
      health: 100, matchPoint: false, gamePhase: "live",
    };
    // Mutate in place, not reassign: handlePayload captures a local `p`
    // reference to this.prev, so swapping the object would orphan it and make
    // GAME_START re-fire on every subsequent echo.
    Object.assign(this.prev, {
      winTeam: "", roundLocked: false, playerKills: 0, myScore: 0, matchPoint: false,
      killStreak: 0, lastKillTime: undefined,
    });
  }

  private applyOutcome(won: boolean): void {
    if (won) {
      this.session = {
        ...this.session,
        wins: this.session.wins + 1,
        roundsWon: (this.session.roundsWon ?? 0) + 1,
        winStreak: this.session.winStreak + 1,
        lossStreak: 0,
      };
    } else {
      this.session = {
        ...this.session,
        losses: this.session.losses + 1,
        roundsLost: (this.session.roundsLost ?? 0) + 1,
        lossStreak: this.session.lossStreak + 1,
        winStreak: 0,
      };
    }
  }

  private make(type: GameEventType, extra: Record<string, unknown> = {}): UniversalGameEvent {
    return {
      id: `${type}_${this.seq++}_${Date.now()}`,
      game: "cs2",
      type,
      timestamp: Date.now(),
      context: { ...extra, session: { ...this.session } },
    };
  }
}

function normalizeTestType(type: string): GameEventType {
  const upper = type.toUpperCase().replace(/[- ]/g, "_");
  if (upper.includes("MATCH") && upper.includes("POINT")) return "MATCH_POINT";
  if (upper.includes("GAME") && upper.includes("END")) return "GAME_END";
  if (upper.includes("GAME")) return "GAME_START";
  if (upper.includes("ROUND") && upper.includes("WIN")) return "ROUND_WIN";
  if (upper.includes("ROUND") && upper.includes("LOSS")) return "ROUND_LOSS";
  if (upper.includes("ROUND")) return "ROUND_START";
  // ASSIST and HEADSHOT must be matched before the generic KILL branch, since
  // "PLAYER_ASSIST" / "HEADSHOT_KILL" do not normalize to a plain kill.
  if (upper.includes("ASSIST")) return "PLAYER_ASSIST";
  if (upper.includes("HEADSHOT")) return "HEADSHOT_KILL";
  if (upper.includes("KILL")) return "PLAYER_KILL";
  if (upper.includes("DEATH")) return "PLAYER_DEATH";
  if (upper.includes("MVP")) return "MVP" as GameEventType;
  if (upper.includes("GRENADE")) return "GRENADE_THROW";
  if (upper.includes("FLASH")) return "FLASH_THROW";
  if (upper.includes("SMOKE")) return "SMOKE_THROW";
  if (upper.includes("BOMB") && upper.includes("DEFUSE")) return "BOMB_DEFUSED";
  if (upper.includes("BOMB")) return "BOMB_PLANTED";
  if (upper.includes("CLUTCH")) return "CLUTCH";
  return "ROUND_WIN";
}