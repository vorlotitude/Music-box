// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { pickCableAudioOutput } from "./HowlerBackend";

describe("pickCableAudioOutput", () => {
  it("matches the VB-Audio CABLE output device by label", () => {
    const list = [
      { kind: "audiooutput" as const, label: "扬声器 (Realtek(R) Audio)", deviceId: "a" },
      { kind: "audiooutput" as const, label: "扬声器 (VB-Audio Virtual Cable)", deviceId: "cable" },
      { kind: "audiooutput" as const, label: "CABLE Output (VB-Audio Virtual Cable)", deviceId: "cable-out" },
    ];
    expect(pickCableAudioOutput(list)?.deviceId).toBe("cable");
  });

  it("returns null when no CABLE device is present", () => {
    const list = [
      { kind: "audiooutput" as const, label: "扬声器 (Realtek(R) Audio)", deviceId: "a" },
      { kind: "audiooutput" as const, label: "Headphones", deviceId: "b" },
    ];
    expect(pickCableAudioOutput(list)).toBeNull();
  });

  it("skips the 'default'/'communications' pseudo aliases and picks the real CABLE Input", () => {
    const list = [
      { kind: "audiooutput" as const, label: "Default - 扬声器 (Realtek(R) Audio)", deviceId: "default" },
      { kind: "audiooutput" as const, label: "Communications - CABLE Input (VB-Audio Virtual Cable)", deviceId: "communications" },
      { kind: "audiooutput" as const, label: "CABLE Input (VB-Audio Virtual Cable)", deviceId: "448de1d07c7da408" },
      { kind: "audiooutput" as const, label: "扬声器 (Realtek(R) Audio)", deviceId: "cf7f5fee8cc0" },
    ];
    expect(pickCableAudioOutput(list)).not.toBeNull();
    expect(pickCableAudioOutput(list)?.deviceId).toBe("448de1d07c7da408");
  });

  it("ignores non-output devices", () => {
    const list = [{ kind: "audioinput" as const, label: "CABLE Output (VB-Audio Virtual Cable)", deviceId: "c" }];
    expect(pickCableAudioOutput(list)).toBeNull();
  });
});