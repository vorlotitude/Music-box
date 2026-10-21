import type { GameId } from "../events/GameEvent";

/**
 * Per-game LEGAL / COMPATIBILITY NOTES (§20).
 *
 * Every game adapter must record how it reads game state and its posture toward
 * the game's EULA / ToS / anti-cheat. The app surfaces these notes in the UI so
 * the trade-offs are visible. Keeping them here (not just on the adapter) lets
 * the renderer show the same authoritative data the adapter carries.
 *
 * Positions encoded here are informational honesty, not legal advice.
 */
export interface AdapterLegalNotes {
  interfaceUsed: string;
  injectionFree: boolean;
  memoryReading: boolean;
  termsChecked: boolean;
  antiCheatConsiderations: string;
  knownLimitations: string;
}

const UNKNOWN: AdapterLegalNotes = {
  interfaceUsed: "No supported public status interface identified yet",
  injectionFree: true,
  memoryReading: false,
  termsChecked: false,
  antiCheatConsiderations:
    "No adapter implemented. A future adapter must use a public/exposed interface only — no injection, no memory reads, no client modification.",
  knownLimitations:
    "Event detection not yet implemented for this game.",
};

export const GAME_LEGAL_NOTES: Record<string, AdapterLegalNotes> = {
  cs2: {
    interfaceUsed: "Valve Game State Integration (official HTTP status push)",
    injectionFree: true,
    memoryReading: false,
    termsChecked: false,
    antiCheatConsiderations:
      "Uses only the public GSI endpoint; no memory/injection. Per Valve, GSI is a supported developer interface.",
    knownLimitations:
      "Requires user to add gamestate_integration_*.cfg to their CS2 cfg folder. Some events (e.g. exact kill victim) are not exposed by GSI.",
  },
  valorant: {
    ...UNKNOWN,
    interfaceUsed: "No public GSI; community-mirrored in-game HUD is out of scope — TBD",
    knownLimitations:
      "Riot does not expose an official game-state API akin to CS2 GSI. Any future VALORANT adapter needs a verified, compliant data source.",
  },
  pubg: {
    ...UNKNOWN,
    interfaceUsed: "Pubg APIs are server/post-match oriented — in-match triggers TBD",
    knownLimitations: "No official in-match state stream; detection likely limited or unavailable.",
  },
  apex: {
    ...UNKNOWN,
    interfaceUsed: "Respawn/EA expose no public in-match state stream — TBD",
    knownLimitations: "No official in-match state interface; adapter likely unavailable for real-time triggers.",
  },
  lol: {
    ...UNKNOWN,
    interfaceUsed: "League Client local API (LCU) is an unofficial client interface — community documented",
    knownLimitations:
      "LCU is not an official support contract and can change without notice; any use must respect Riot's policies and be non-intrusive.",
  },
};

export function legalNotesFor(gameId: GameId | string): AdapterLegalNotes {
  return GAME_LEGAL_NOTES[gameId] ?? UNKNOWN;
}