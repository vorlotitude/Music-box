import type { AudioRoute } from "../events/GameEvent";

/**
 * Where a processed track is delivered after the mixer.
 * - SPEAKER → the player's own headphones / speakers.
 * - VOICE_CHAT → the voice-chat input (virtual microphone), so teammates hear it.
 * The physical device behind VOICE_CHAT is a separately-installed virtual
 * microphone (platform layer). Until it is present this stays a pure routing
 * declaration, never a bypass of game voice or anti-cheat.
 */
export type AudioSink = "SPEAKER" | "VOICE_CHAT";

/**
 * The player literally cannot hear audio routed to the virtual mic (it becomes
 * the in-game voice input). That is intentional for TEAMMATES.
 *
 * Map a rule's routing intent to the concrete delivery sinks.
 */
export function routeToSinks(route: AudioRoute): AudioSink[] {
  switch (route) {
    case "SELF_ONLY":
      return ["SPEAKER"];
    case "TEAMMATES":
      return ["VOICE_CHAT"];
    case "BOTH":
      return ["SPEAKER", "VOICE_CHAT"];
  }
}

/** Whether a track should be audible on the player's own output device. */
export function includesSelf(route: AudioRoute): boolean {
  return routeToSinks(route).includes("SPEAKER");
}

/** Whether a track is destined for the voice-chat (virtual mic) path. */
export function feedsVoiceChat(route: AudioRoute): boolean {
  return routeToSinks(route).includes("VOICE_CHAT");
}