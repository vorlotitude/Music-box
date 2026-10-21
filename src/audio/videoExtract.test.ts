import { describe, it, expect } from "vitest";
import { encodeWav } from "./videoExtract";

/** Minimal AudioBuffer-shaped object; encodeWav only reads these fields. */
function fakeBuffer(channels: number[][], sampleRate: number) {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    getChannelData: (i: number) => new Float32Array(channels[i]),
  } as unknown as AudioBuffer;
}

describe("encodeWav", () => {
  it("writes a valid 44-byte RIFF header for stereo 44.1 kHz", () => {
    const buf = fakeBuffer([[0, 0], [0, 0]], 44100);
    const ab = encodeWav(buf);
    const dv = new DataView(ab);
    // Header markers
    expect(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))).toBe(
      "RIFF",
    );
    expect(String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11))).toBe(
      "WAVE",
    );
    expect(String.fromCharCode(dv.getUint8(36), dv.getUint8(37), dv.getUint8(38), dv.getUint8(39))).toBe(
      "data",
    );
    expect(dv.getUint16(22, true)).toBe(2); // channels
    expect(dv.getUint32(24, true)).toBe(44100); // sample rate
    expect(dv.getUint16(34, true)).toBe(16); // bits
    // 44 bytes header + 2 frames * 2ch * 2bytes = 52
    expect(ab.byteLength).toBe(44 + 2 * 2 * 2);
  });

  it("interleaves channel samples and clips to [-1, 1]", () => {
    // L frame0=1.0 -> 32767, frame1=-1.0 -> -32768; R directly interleaved after each L.
    const buf = fakeBuffer([[1.0, -1.0], [0.5, -0.5]], 8000);
    const dv = new DataView(encodeWav(buf));
    const base = 44;
    expect(dv.getInt16(base + 0, true)).toBe(32767); // L0
    expect(dv.getInt16(base + 2, true)).toBe(16383); // R0 (0.5*0x7FFF=16383.5, truncated)
    expect(dv.getInt16(base + 4, true)).toBe(-32768); // L1
    expect(dv.getInt16(base + 6, true)).toBe(-16384); // R1 (-0.5 uses 0x8000 → exact -16384)
  });

  it("handles a single mono channel", () => {
    const buf = fakeBuffer([[0.0, 0.0, 0.0]], 8000);
    const ab = encodeWav(buf);
    expect(new DataView(ab).getUint16(22, true)).toBe(1);
    expect(ab.byteLength).toBe(44 + 3 * 2);
  });
});