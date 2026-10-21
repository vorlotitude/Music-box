import { describe, it, expect } from "vitest";
import { LolAdapter, LcuGameStats } from "./LolAdapter";

function gameflow(phase?: string) {
  return { phase };
}

/** Build a flat /lol-end-of-game/v1/game-stats shape (real LCU, no wrapper). */
function eogStats(overrides: {
  gameId?: number;
  summonerId?: number;
  kill?: number;
  death?: number;
  assist?: number;
  win?: boolean;
} = {}) {
  const stats: LcuGameStats = {
    gameId: overrides.gameId ?? 1001,
    summonerId: overrides.summonerId ?? 555,
    teams: [
      {
        teamId: 100,
        isPlayerTeam: true,
        isWinningTeam: overrides.win ?? true,
        players: [
          {
            summonerId: overrides.summonerId ?? 555,
            championId: 1,
            stats: {
              CHAMPIONS_KILLED: overrides.kill ?? 12,
              NUM_DEATHS: overrides.death ?? 3,
              ASSISTS: overrides.assist ?? 7,
              WIN: overrides.win ?? true,
            },
          },
          { summonerId: 666, championId: 2 },
        ],
      },
      { teamId: 200, players: [{ summonerId: 777, championId: 3 }] },
    ],
  };
  return stats;
}

describe("LolAdapter LCU parsing (flat game-stats shape)", () => {
  it("emits GAME_START with a fresh session when entering the in-progress phase", () => {
    const adapter = new LolAdapter();
    const events = adapter.handleGameflow(gameflow("InProgress"));
    expect(events.map((e) => e.type)).toContain("GAME_START");
    expect(events[0].context?.session?.gamePhase).toBe("inProgress");
  });

  it("does not emit GAME_START for non-match phases", () => {
    const adapter = new LolAdapter();
    expect(adapter.handleGameflow(gameflow("Lobby"))).toEqual([]);
    expect(adapter.handleGameflow(gameflow("ChampSelect"))).toEqual([]);
  });

  it("ignores repeated phase pushes (edge-triggered)", () => {
    const adapter = new LolAdapter();
    adapter.handleGameflow(gameflow("InProgress"));
    expect(adapter.handleGameflow(gameflow("InProgress"))).toEqual([]);
  });

  it("emits GAME_END win from the flat teams[] and folds session stats", () => {
    const adapter = new LolAdapter();
    adapter.handleGameflow(gameflow("InProgress"));
    const events = adapter.handleEndOfGameStats(eogStats({ gameId: 1001, win: true }));
    expect(events.map((e) => e.type)).toContain("GAME_END");
    expect(events[0].context?.result).toBe("Win");
    const snap = adapter.getSnapshot();
    expect(snap.wins).toBe(1);
    expect(snap.winStreak).toBe(1);
    expect(snap.losses).toBe(0);
    expect(snap.kills).toBe(12);
    expect(snap.deaths).toBe(3);
    expect(snap.assists).toBe(7);
  });

  it("tracks losses and a loss streak", () => {
    const adapter = new LolAdapter();
    adapter.handleGameflow(gameflow("InProgress"));
    adapter.handleEndOfGameStats(
      eogStats({ gameId: 2001, win: false, kill: 4, death: 9, assist: 2 })
    );
    const snap = adapter.getSnapshot();
    expect(snap.losses).toBe(1);
    expect(snap.lossStreak).toBe(1);
    expect(snap.winStreak).toBe(0);
  });

  it("emits GAME_END at most once per gameId", () => {
    const adapter = new LolAdapter();
    adapter.handleGameflow(gameflow("InProgress"));
    adapter.handleEndOfGameStats(eogStats({ gameId: 1001 }));
    // Same gameId re-pushed by the poller → no duplicate.
    expect(adapter.handleEndOfGameStats(eogStats({ gameId: 1001 }))).toEqual([]);
  });

  it("re-arms the GAME_END trigger and resets session kills for a new match", () => {
    const adapter = new LolAdapter();
    adapter.handleGameflow(gameflow("InProgress"));
    adapter.handleEndOfGameStats(eogStats({ gameId: 1001 }));

    adapter.handleGameflow(gameflow("EndOfGame"));
    adapter.handleGameflow(gameflow("InProgress")); // next match
    expect(adapter.getSnapshot().kills).toBe(0);

    const end = adapter.handleEndOfGameStats(eogStats({ gameId: 2002, kill: 5, death: 2, assist: 3 }));
    expect(end.map((e) => e.type)).toContain("GAME_END");
  });

  it("keeps cumulative wins/losses across matches, clears the loss streak on a win", () => {
    const adapter = new LolAdapter();
    adapter.handleGameflow(gameflow("InProgress"));
    adapter.handleEndOfGameStats(eogStats({ gameId: 1001, win: false }));
    adapter.handleGameflow(gameflow("EndOfGame"));
    adapter.handleGameflow(gameflow("InProgress"));
    adapter.handleEndOfGameStats(eogStats({ gameId: 2002, win: true }));
    const snap = adapter.getSnapshot();
    expect(snap.wins).toBe(1);
    expect(snap.losses).toBe(1);
    expect(snap.winStreak).toBe(1);
    expect(snap.lossStreak).toBe(0);
  });

  it("emits a resultless GAME_END when no WIN flag is visible (e.g. remade match)", () => {
    const adapter = new LolAdapter();
    adapter.handleGameflow(gameflow("InProgress"));
    // Player entry present but carries no WIN flag.
    const stats: LcuGameStats = {
      gameId: 3001,
      summonerId: 555,
      teams: [
        {
          teamId: 100,
          isPlayerTeam: true,
          players: [{ summonerId: 555, championId: 1, stats: { CHAMPIONS_KILLED: 2, NUM_DEATHS: 5, ASSISTS: 1 } }],
        },
      ],
    };
    const events = adapter.handleEndOfGameStats(stats);
    expect(events.map((e) => e.type)).toContain("GAME_END");
    expect(events[0].context?.result).toBeUndefined();
    // Neither a win nor a loss was recorded.
    expect(adapter.getSnapshot().wins).toBe(0);
    expect(adapter.getSnapshot().losses).toBe(0);
  });

  it("handleSnapshot processes a transport-assembled poll tick end to end", () => {
    const adapter = new LolAdapter();
    const start = adapter.handleSnapshot({ phase: "InProgress" });
    expect(start.map((e) => e.type)).toContain("GAME_START");
    const end = adapter.handleSnapshot({ phase: "EndOfGame", stats: eogStats({ gameId: 1001, win: true }) });
    expect(end.map((e) => e.type)).toContain("GAME_END");
    // Repeated tick with the same stats → silent.
    expect(adapter.handleSnapshot({ phase: "EndOfGame", stats: eogStats({ gameId: 1001 }) })).toEqual([]);
  });

  it("emits normalized events via triggerTestEvent for dev mode", () => {
    const adapter = new LolAdapter();
    const seen: string[] = [];
    adapter.onEvent((e) => seen.push(e.type));
    adapter.triggerTestEvent("ROUND LOSS");
    expect(seen).toContain("GAME_END");
    adapter.triggerTestEvent("GAME START");
    expect(seen).toContain("GAME_START");
  });
});