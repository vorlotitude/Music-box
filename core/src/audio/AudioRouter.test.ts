import { describe, it, expect } from "vitest";
import {
  routeToSinks,
  includesSelf,
  feedsVoiceChat,
  outputNeedsVirtualMic,
  effectiveOutputSinks,
} from "./AudioRouter";

describe("AudioRouter", () => {
  it("routes SELF_ONLY to the player's own output only", () => {
    expect(routeToSinks("SELF_ONLY")).toEqual(["SPEAKER"]);
    expect(includesSelf("SELF_ONLY")).toBe(true);
    expect(feedsVoiceChat("SELF_ONLY")).toBe(false);
  });

  it("routes TEAMMATES to the voice-chat input only", () => {
    expect(routeToSinks("TEAMMATES")).toEqual(["VOICE_CHAT"]);
    expect(includesSelf("TEAMMATES")).toBe(false);
    expect(feedsVoiceChat("TEAMMATES")).toBe(true);
  });

  it("routes BOTH to speaker and voice-chat", () => {
    expect(routeToSinks("BOTH")).toEqual(["SPEAKER", "VOICE_CHAT"]);
    expect(includesSelf("BOTH")).toBe(true);
    expect(feedsVoiceChat("BOTH")).toBe(true);
  });

  it("only virtual-mic output targets need the opt-in driver", () => {
    expect(outputNeedsVirtualMic("speaker")).toBe(false);
    expect(outputNeedsVirtualMic("virtualMic")).toBe(true);
    expect(outputNeedsVirtualMic("both")).toBe(true);
  });

  it("falls back to speakers until the virtual microphone driver is installed", () => {
    // Not installed: any virtual-mic choice is an honest speaker fallback.
    expect(effectiveOutputSinks("speaker", false)).toEqual(["SPEAKER"]);
    expect(effectiveOutputSinks("virtualMic", false)).toEqual(["SPEAKER"]);
    expect(effectiveOutputSinks("both", false)).toEqual(["SPEAKER"]);
  });

  it("routes to the virtual mic only once installed and confirmed", () => {
    expect(effectiveOutputSinks("virtualMic", true)).toEqual(["VOICE_CHAT"]);
    expect(effectiveOutputSinks("both", true)).toEqual(["SPEAKER", "VOICE_CHAT"]);
    expect(effectiveOutputSinks("speaker", true)).toEqual(["SPEAKER"]);
  });
});