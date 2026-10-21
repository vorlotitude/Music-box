import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  wavDurationSeconds,
  flacDurationSeconds,
  mp3DurationSeconds,
  oggDurationSeconds,
  m4aDurationSeconds,
  probeDuration,
} from "./meta";

/** Build a minimal RIFF/WAVE buffer with the given byteRate and data bytes. */
function makeWav(byteRate: number, dataSize: number): Buffer {
  const fmtSize = 16;
  const buf = Buffer.alloc(12 + 8 + fmtSize + 8 + dataSize);
  let o = 0;
  buf.write("RIFF", o, "latin1");
  o += 4;
  buf.writeUInt32LE(buf.length - 8, o);
  o += 4;
  buf.write("WAVE", o, "latin1");
  o += 4;
  // fmt chunk
  buf.write("fmt ", o, "latin1");
  o += 4;
  buf.writeUInt32LE(fmtSize, o);
  o += 4;
  buf.writeUInt16LE(1, o); // PCM
  o += 2;
  buf.writeUInt16LE(1, o); // mono
  o += 2;
  const sampleRate = byteRate / 2; // 1 channel x 16-bit => bytes/sec = sampleRate * 2
  buf.writeUInt32LE(sampleRate, o);
  o += 4;
  buf.writeUInt32LE(byteRate, o);
  o += 4;
  buf.writeUInt16LE(2, o); // blockAlign = channels * bytesPerSample
  o += 2;
  buf.writeUInt16LE(16, o); // bits per sample
  o += 2;
  // data chunk
  buf.write("data", o, "latin1");
  o += 4;
  buf.writeUInt32LE(dataSize, o);
  o += 4;
  return buf;
}

describe("wavDurationSeconds", () => {
  it("returns exact duration from byteRate and data size", () => {
    const wav = makeWav(1000, 1000); // 1000 bytes @ 1000 B/s = 1s
    expect(wavDurationSeconds(wav)).toBe(1.0);
  });

  it("computes a fractional duration", () => {
    const wav = makeWav(2000, 500); // 0.25 s
    expect(wavDurationSeconds(wav)).toBeCloseTo(0.25, 6);
  });

  it("returns undefined for a non-RIFF file", () => {
    expect(wavDurationSeconds(Buffer.from("not a wav file at all......"))).toBeUndefined();
  });

  it("returns undefined for a truncated header", () => {
    expect(wavDurationSeconds(Buffer.from("RIFF"))).toBeUndefined();
  });

  it("clamps the data size to what the buffer actually holds", () => {
    // Header declares 2000 data bytes but the buffer holds only 800 -> 0.8 s.
    const wav = makeWav(1000, 2000);
    wav.writeUInt32LE(800, 40); // data-chunk size field lives at offset 40
    const real = wavDurationSeconds(wav)!;
    expect(real).toBeCloseTo(0.8, 6);
  });
});

describe("probeDuration", () => {
  it("reads a temp WAV file and reports its duration", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-meta-"));
    const file = path.join(dir, "clip.wav");
    fs.writeFileSync(file, makeWav(1000, 1000));
    try {
      expect(probeDuration(file)).toBe(1.0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined for a non-WAV file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-meta-"));
    const file = path.join(dir, "song.mp3");
    fs.writeFileSync(file, "ID3........");
    try {
      expect(probeDuration(file)).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined without throwing when the file is missing", () => {
    expect(probeDuration("Z:/definitely/not/here.wav")).toBeUndefined();
  });

  it("reports an exact duration for a FLAC file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmb-meta-"));
    const file = path.join(dir, "clip.flac");
    fs.writeFileSync(file, makeFlac(44100, 44100));
    try {
      expect(probeDuration(file)).toBe(1.0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Build a minimal FLAC buffer (fLaC magic + STREAMINFO block) of given length. */
function makeFlac(sampleRate: number, totalSamples: number): Buffer {
  const body = Buffer.alloc(34);
  // 20-bit sampleRate at body bytes 10..12
  body[10] = (sampleRate >> 12) & 0xff;
  body[11] = (sampleRate >> 4) & 0xff;
  body[12] = (sampleRate & 0x0f) << 4;
  // 36-bit totalSamples at body bytes 13..17 (byte13 low nibble is the high part)
  body[13] = Math.floor(totalSamples / 0x100000000) & 0x0f;
  body[14] = (totalSamples >> 24) & 0xff;
  body[15] = (totalSamples >> 16) & 0xff;
  body[16] = (totalSamples >> 8) & 0xff;
  body[17] = totalSamples & 0xff;
  return Buffer.concat([Buffer.from("fLaC", "latin1"), Buffer.from([0x00]), body]);
}

describe("flacDurationSeconds", () => {
  it("computes an exact duration from STREAMINFO", () => {
    expect(flacDurationSeconds(makeFlac(44100, 44100))).toBe(1.0);
    expect(flacDurationSeconds(makeFlac(48000, 24000))).toBeCloseTo(0.5, 6);
  });

  it("returns undefined when sampleRate or totalSamples is zero", () => {
    expect(flacDurationSeconds(makeFlac(0, 44100))).toBeUndefined();
    expect(flacDurationSeconds(makeFlac(44100, 0))).toBeUndefined();
  });

  it("returns undefined for a non-FLAC file", () => {
    expect(flacDurationSeconds(Buffer.from("nope"))).toBeUndefined();
  });
});

/** Build a header for MPEG1 Layer III (mono by default) with a given bitrate.
 *  Bytes are assembled directly (no >2³¹ constants) to stay bit-exact. */
function makeMp3Header(h: { bitrateIndex?: number; sampleRateIndex?: number; mono?: boolean } = {}): Buffer {
  const bitrateIndex = h.bitrateIndex ?? 9; // 128 kbps for L3 MPEG1
  const sampleRateIndex = h.sampleRateIndex ?? 0; // 44100 Hz for MPEG1
  const mono = h.mono ?? true;
  const layer = 1; // 01 = Layer III for L3
  const b1 = 0xe0 | (3 << 3) | (layer << 1) | 1; // sync | version=MPEG1 | layer | no-CRC
  const b2 = (bitrateIndex << 4) | (sampleRateIndex << 2); // bitrate | sampleRate | no padding
  const b3 = mono ? 0xc0 : 0x00; // channel-mode 11 (mono)
  return Buffer.from([0xff, b1, b2, b3]);
}

describe("mp3DurationSeconds", () => {
  it("estimates a constant-bitrate duration from the first frame header", () => {
    // 128 kbps over a 128000-byte file ≈ 8 s.
    const head = makeMp3Header();
    expect(mp3DurationSeconds(head, 128000)).toBeCloseTo(8, 3);
  });

  it("favors an exact XING frame count when present (VBR-friendly)", () => {
    const sideInfo = 17; // MPEG1 mono
    const head = Buffer.alloc(4 + sideInfo + 12);
    makeMp3Header().copy(head, 0);
    head.write("Xing", 4 + sideInfo, "latin1");
    head.writeUInt32BE(0x1, 4 + sideInfo + 4); // "frames present" flag
    head.writeUInt32BE(100, 4 + sideInfo + 8); // 100 frames
    const sec = mp3DurationSeconds(head, head.length);
    expect(sec).toBeCloseTo((100 * 1152) / 44100, 3);
  });

  it("returns undefined when no valid frame header is found", () => {
    expect(mp3DurationSeconds(Buffer.from("ID3garbage..."), 13)).toBeUndefined();
    expect(mp3DurationSeconds(Buffer.alloc(0), 0)).toBeUndefined();
  });
});

// ---- OGG ---------------------------------------------------------------

/** First Ogg page carrying a Vorbis identification header. */
function makeOggVorbisId(serial: number, sampleRate: number, nominalBps: number): Buffer {
  const buf = Buffer.alloc(28 + 30); // page header + vorbis id packet
  buf.write("OggS", 0, "latin1");
  buf.writeUInt32LE(serial, 14);
  const m = 28; // id packet starts right after the page header
  buf.write("\x01vorbis", m, "latin1");
  buf.writeUInt32LE(sampleRate, m + 12);
  buf.writeUInt32LE(nominalBps, m + 20);
  return buf;
}

/** Ogg page with the given serial stream and granule position. */
function makeOggTail(serial: number, granule: number): Buffer {
  const page = Buffer.alloc(28);
  page.write("OggS", 0, "latin1");
  page.writeBigUInt64LE(BigInt(granule), 6);
  page.writeUInt32LE(serial, 14);
  return page;
}

describe("oggDurationSeconds", () => {
  it("computes an exact Vorbis duration from the last page granule", () => {
    const serial = 0x12345678;
    const head = makeOggVorbisId(serial, 44100, 128000);
    const tail = makeOggTail(serial, 44100);
    expect(oggDurationSeconds(head, tail, head.length + tail.length)).toBe(1.0);
    expect(oggDurationSeconds(head, makeOggTail(serial, 22050), 10_000)).toBeCloseTo(0.5, 6);
  });

  it("falls back to the nominal bitrate when the tail page belongs to another stream", () => {
    const head = makeOggVorbisId(1, 44100, 128000);
    const tail = makeOggTail(999, 0); // mismatched serial -> granule ignored
    expect(oggDurationSeconds(head, tail, 128000)).toBeCloseTo(8, 3);
  });

  it("reads Opus at a fixed 48 kHz", () => {
    // Short buffer (< 18 bytes) => serial unknown, granule accepted for any stream.
    const head = Buffer.from("OggSOpusHead");
    expect(oggDurationSeconds(head, makeOggTail(7, 48000), 1000)).toBe(1.0);
  });

  it("returns undefined when the header declares zero or unknown format", () => {
    expect(oggDurationSeconds(Buffer.from("nope"), Buffer.from("tail"), 0)).toBeUndefined();
    const id = makeOggVorbisId(1, 0, 128000); // zero sample rate
    expect(oggDurationSeconds(id, makeOggTail(1, 5), 100)).toBeUndefined();
  });
});

// ---- M4A / MP4 ---------------------------------------------------------

function makeBox(type: string, content: Buffer): Buffer {
  const b = Buffer.alloc(8 + content.length);
  b.writeUInt32BE(b.length, 0);
  b.write(type, 4, "latin1");
  content.copy(b, 8);
  return b;
}

/** Build a fast-start MP4: `ftyp` then `moov` wrapping a version-0 `mvhd`. */
function makeMp4(timescale: number, duration: number): Buffer {
  const ftyp = makeBox("ftyp", Buffer.from("M4A ", "latin1"));
  const mvhdContent = Buffer.alloc(100);
  mvhdContent[0] = 0; // version 0
  mvhdContent.writeUInt32BE(timescale, 12);
  mvhdContent.writeUInt32BE(duration, 16);
  return Buffer.concat([ftyp, makeBox("moov", makeBox("mvhd", mvhdContent))]);
}

describe("m4aDurationSeconds", () => {
  it("computes an exact duration from moov/mvhd (version 0)", () => {
    expect(m4aDurationSeconds(makeMp4(1000, 12_345))).toBeCloseTo(12.345, 6);
  });

  it("supports version 1 mvhd (64-bit duration)", () => {
    const ftyp = makeBox("ftyp", Buffer.from("M4A ", "latin1"));
    const mvhdContent = Buffer.alloc(100);
    mvhdContent[0] = 1; // version 1
    mvhdContent.writeUInt32BE(1000, 20); // timescale
    mvhdContent.writeBigUInt64BE(9_999_999n, 24); // duration (bigger than 32-bit)
    const buf = Buffer.concat([ftyp, makeBox("moov", makeBox("mvhd", mvhdContent))]);
    expect(m4aDurationSeconds(buf)).toBeCloseTo(9999.999, 3);
  });

  it("returns undefined for a non-MP4 buffer or a moov-less file", () => {
    expect(m4aDurationSeconds(Buffer.from("not an mp4 at all"))).toBeUndefined();
    const onlyFtyp = makeBox("ftyp", Buffer.from("M4A ", "latin1"));
    expect(m4aDurationSeconds(onlyFtyp)).toBeUndefined();
  });
});