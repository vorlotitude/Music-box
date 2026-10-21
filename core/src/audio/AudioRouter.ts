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

/**
 * The player's chosen mix destination in Settings/Audio.
 * - `speaker`    → the player's own headphones / speakers.
 * - `virtualMic` → only the voice-chat input (virtual mic) for teammates.
 * - `both`       → the player's own output AND the virtual mic.
 */
export type OutputTarget = "speaker" | "virtualMic" | "both";

/** Whether choosing this output target requires the (opt-in) virtual driver. */
export function outputNeedsVirtualMic(target: OutputTarget): boolean {
  return target === "virtualMic" || target === "both";
}

/**
 * The concrete physical sink(s) a mix lands on for a chosen output target.
 *
 * The virtual microphone is a separate, opt-in Windows loopback driver. Until
 * it is installed and confirmed, any virtual-mic selection must never silently
 * drop audio or fail — it falls back to the player's own speakers, and the UI
 * surfaces the pending setup (§8 install/consent step).
 */
export function effectiveOutputSinks(
  target: OutputTarget,
  virtualMicInstalled: boolean,
): AudioSink[] {
  if (target === "speaker") return ["SPEAKER"];
  if (!virtualMicInstalled) return ["SPEAKER"]; // honest fallback, never a silent drop
  return target === "virtualMic" ? ["VOICE_CHAT"] : ["SPEAKER", "VOICE_CHAT"];
}