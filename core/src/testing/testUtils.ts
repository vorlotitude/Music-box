import type { GameEventType, SessionSnapshot, UniversalGameEvent } from "../events/GameEvent";

let seq = 0;

export function makeEvent(
  type: GameEventType,
  overrides?: Partial<UniversalGameEvent> & { session?: Partial<SessionSnapshot> },
): UniversalGameEvent {
  const base: UniversalGameEvent = {
    id: `evt_${seq++}_${Date.now()}`,
    game: "cs2",
    type,
    timestamp: Date.now(),
    context: { session: defaultSession() },
  };
  const merged = { ...base, ...overrides };
  if (overrides?.session) {
    merged.context = {
      ...merged.context,
      session: { ...defaultSession(), ...overrides.session },
    };
  }
  return merged;
}

function defaultSession(): SessionSnapshot {
  return {
    kills: 0, deaths: 0, assists: 0, wins: 0, losses: 0,
    roundsWon: 0, roundsLost: 0, winStreak: 0, lossStreak: 0,
    health: 100, matchPoint: false, gamePhase: "live",
  };
}