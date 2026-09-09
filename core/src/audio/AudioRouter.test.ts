import { describe, it, expect } from "vitest";
import { routeToSinks, includesSelf, feedsVoiceChat } from "./AudioRouter";

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
});