import fs from "node:fs";

/**
 * Duration probing for locally-imported audio (§5 "Duration").
 *
 * Plain header/probe reads only — no heavy decoder is loaded. Supported:
 *   - WAV   : exact, from RIFF `fmt ` byteRate + `data` size.
 *   - FLAC  : exact, from STREAMINFO (sampleRate + totalSamples).
 *   - MP3   : exact when an XING/Info header (VBR) is present, otherwise a
 *             constant-bitrate estimate based on the first frame's bitrate.
 *   - OGG   : exact for Vorbis/Opus, from the last page's granule; falls back
 *             to the Vorbis nominal bitrate estimate when no granule is found.
 *   - M4A   : exact, from the MP4 `moov/mvhd` timescale + duration atom.
 *   - other : honestly reported as unknown.
 */

const HEAD_BYTES = 256 * 1024;

// ---- WAV ---------------------------------------------------------------

/** Parse a minimal RIFF/WAVE header and return the duration in seconds. */
export function wavDurationSeconds(buf: Buffer): number | undefined {
  if (buf.length < 12) return undefined;
  if (buf.toString("latin1", 0, 4) !== "RIFF") return undefined;
  if (buf.toString("latin1", 8, 12) !== "WAVE") return undefined;

  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("latin1", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;

    if (id === "fmt ") {
      // byteRate sits at fmt-data offset 8 (sampleRate at 4, channels at 2).
      if (dataStart + 12 <= buf.length) byteRate = buf.readUInt32LE(dataStart + 8);
    } else if (id === "data") {
      // The declared data size may be padded; clamp to what the file actually holds.
      dataBytes = Math.min(size, buf.length - dataStart);
      break;
    }
    // Advance past this chunk, respecting RIFF's even-padding rule.
    offset = dataStart + size + (size % 2);
  }

  if (byteRate <= 0 || dataBytes <= 0) return undefined;
  const sec = dataBytes / byteRate;
  return sec > 0 && Number.isFinite(sec) ? sec : undefined;
}

// ---- FLAC --------------------------------------------------------------

/** FLAC STREAMINFO-metadata carries an exact duration. */
export function flacDurationSeconds(buf: Buffer): number | undefined {
  if (buf.length < 4 || buf.toString("latin1", 0, 4) !== "fLaC") return undefined;
  // First metadata block starts right after the magic. STREAMINFO required it.
  const blockHeader = buf[4];
  if ((blockHeader & 0x7f) !== 0) return undefined; // must be STREAMINFO (type 0)
  if (buf.length < 5 + 18) return undefined;

  // STREAMINFO body begins at offset 5; the 20-bit sampleRate spans bytes 10..12,
  // the 36-bit total sample count spans byte13-low through byte17.
  const sampleRate = ((buf[15] << 12) | (buf[16] << 4) | (buf[17] >> 4)) & 0xfffff;
  const totalSamples =
    ((buf[18] & 0x0f) * 0x100000000) +
    buf[19] * 0x1000000 +
    buf[20] * 0x10000 +
    buf[21] * 0x100 +
    buf[22];

  if (sampleRate <= 0 || totalSamples <= 0) return undefined;
  const sec = totalSamples / sampleRate;
  return Number.isFinite(sec) ? sec : undefined;
}

// ---- MP3 ---------------------------------------------------------------

interface MpegHeader {
  version: 1 | 2 | 25;
  layer: 1 | 2 | 3;
  bitrateKbps: number;
  sampleRate: number;
  mono: boolean;
  frameBytes: number;
}

// bitrate tables (kbps), indexed by the 4-bit bitrate-index in a frame header.
const BR_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR_V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];
const BR_V1_L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448];
const BR_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const BR_V2_L2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const BR_V2_L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256];

const SR_V1 = [44100, 48000, 32000];
const SR_V2 = [22050, 24000, 16000];
const SR_V25 = [11025, 12000, 8000];

function samplesPerFrame(version: MpegHeader["version"], layer: MpegHeader["layer"]): number {
  if (layer === 1) return 384;
  return version === 1 ? 1152 : 576;
}

/** Parse a single MPEG audio frame header at `off`. Returns null if invalid. */
function parseMpegFrame(buf: Buffer, off: number): MpegHeader | null {
  if (off + 4 > buf.length) return null;
  const h = buf.readUInt32BE(off);
  // 11-bit sync marker: check via shift so the 0xFFE00000 constant (>2³¹) never
  // gets mangled by JS bitwise ToInt32 coercion.
  if ((h >>> 21) !== 0x7ff) return null;
  if ((h & 0x00060000) === 0x00060000) return null; // reserved version
  if ((h & 0x00060000) === 0) return null; // reserved layer

  const versionBits = (h >>> 19) & 0x3;
  const version: MpegHeader["version"] = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 25;
  const layer = (4 - ((h >>> 17) & 0x3)) as MpegHeader["layer"]; // 01→III, 10→II, 11→I
  const bitrateIndex = (h >>> 12) & 0xf;
  const sampleRateIndex = (h >>> 10) & 0x3;
  const mono = ((h >>> 6) & 0x3) === 3; // channel-mode 11 == mono

  if (bitrateIndex === 0 || bitrateIndex === 15) return null; // free / bad / reserved
  if (sampleRateIndex === 3) return null; // reserved

  const tr = layer === 3 ? BR_V1_L3 : layer === 2 ? BR_V1_L2 : BR_V1_L1;
  const tr2 = layer === 3 ? BR_V2_L3 : layer === 2 ? BR_V2_L2 : BR_V2_L1;
  const tables = version === 1 ? tr : tr2;
  const bitrateKbps = tables[bitrateIndex];
  const srs = version === 1 ? SR_V1 : version === 2 ? SR_V2 : SR_V25;
  const sampleRate = srs[sampleRateIndex];

  // Padding bit + frame size in bytes (for Layer I the formula divides by 12).
  const padding = (h >>> 9) & 0x1;
  const divisor = layer === 1 ? 12 : 8;
  const frameBytes = Math.floor(((samplesPerFrame(version, layer) / divisor) * bitrateKbps * 1000) / sampleRate) + padding;

  return { version, layer, bitrateKbps, sampleRate, mono, frameBytes };
}

/**
 * MP3 duration. Prefers an XING/Info (VBR-ish) frame inside the first audio
 * frame, which carries an exact frame count; otherwise estimates using the
 * first frame's constant bitrate over the surviving file size.
 */
export function mp3DurationSeconds(buf: Buffer, fileSize: number): number | undefined {
  // Skip any ID3v2 tag so the first audio frame is located.
  let off = 0;
  if (buf.length >= 10 && buf.toString("latin1", 0, 3) === "ID3") {
    const tagSize =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    off = 10 + tagSize;
  }
  // A trailing 128-byte ID3v1 tag is footer metadata, not audio. Drop it from
  // the byte count only if the whole file fit in the head buffer so the tail is
  // observable; otherwise id3v1 stays 0 to keep the CBR estimate conservative.
  const id3v1 = buf.length >= fileSize && fileSize >= 128 ? 128 : 0;

  // Find the first frame sync.
  let frame: MpegHeader | null = null;
  let frameOff = -1;
  for (let i = off; i + 4 <= Math.min(buf.length, off + 64 * 1024); i++) {
    if ((buf[i] & 0xff) === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const cand = parseMpegFrame(buf, i);
      if (cand && cand.sampleRate > 0 && cand.bitrateKbps > 0) {
        frame = cand;
        frameOff = i;
        break;
      }
    }
  }
  if (!frame) return undefined;

  // Look for an XING / Info block at the head of the first frame.
  const sideInfo = frame.mono ? (frame.version === 1 ? 17 : 9) : frame.version === 1 ? 32 : 17;
  const xingOff = frameOff + 4 + sideInfo;
  if (xingOff + 12 <= buf.length) {
    const tag = buf.toString("latin1", xingOff, xingOff + 4);
    if (tag === "Xing" || tag === "Info") {
      const flags = buf.readUInt32BE(xingOff + 4);
      if (flags & 0x1) {
        // Frame count is 4 bytes after the "Xing"/"Info" marker (offset +8).
        const frames = buf.readUInt32BE(xingOff + 8);
        if (frames > 0) {
          const sec = (frames * samplesPerFrame(frame.version, frame.layer)) / frame.sampleRate;
          return Number.isFinite(sec) ? sec : undefined;
        }
      }
    }
  }

  // Constant-bitrate estimate across the audio bytes that remain in the file.
  const audioBytes = Math.max(1, fileSize - frameOff - id3v1);
  const sec = (audioBytes * 8) / (frame.bitrateKbps * 1000);
  return sec > 0 && Number.isFinite(sec) ? sec : undefined;
}

// ---- OGG (Vorbis / Opus) -----------------------------------------------

interface OggInfo {
  sampleRate: number;
  bitrateBps?: number;
  serial?: number;
}

function oggInfo(head: Buffer): OggInfo | null {
  if (head.length < 4 || head.toString("latin1", 0, 4) !== "OggS") return null;
  // First-page BOS serial (bytes 14..17) — used to match the tail's last page.
  const serial = head.length >= 18 ? head.readUInt32LE(14) : undefined;

  // Vorbis identification header: packet type byte 0x01 + "vorbis".
  const v = head.indexOf("\x01vorbis", 0, "latin1");
  if (v >= 0 && v + 24 <= head.length) {
    const sampleRate = head.readUInt32LE(v + 12);
    const bitrateBps = head.readUInt32LE(v + 20); // nominal bitrate
    if (sampleRate > 0) return { sampleRate, bitrateBps: bitrateBps || undefined, serial };
    return null;
  }

  // Opus identification header: "OpusHead" always decodes at 48 kHz.
  const o = head.indexOf("OpusHead", 0, "latin1");
  if (o >= 0) return { sampleRate: 48000, serial };
  return null;
}

/** Granule (total sample count) + serial of the last Ogg page found in `tail`. */
function oggLastPage(tail: Buffer): { granule: number; serial: number } | null {
  if (tail.length < 27) return null;
  const i = tail.lastIndexOf("OggS");
  if (i < 0 || i + 27 > tail.length) return null;
  return { granule: Number(tail.readBigUInt64LE(i + 6)), serial: tail.readUInt32LE(i + 14) };
}

export function oggDurationSeconds(head: Buffer, tail: Buffer, fileSize: number): number | undefined {
  const info = oggInfo(head);
  if (!info) return undefined;

  // Prefer the exact last-page granule for our stream (any stream if serial unknown).
  const last = oggLastPage(tail);
  if (last && last.granule >= 0 && (info.serial === undefined || last.serial === info.serial)) {
    const sec = last.granule / info.sampleRate;
    if (sec > 0 && Number.isFinite(sec)) return sec;
  }

  // Fallback: constant-bitrate estimate, only when the header declares a nominal rate.
  if (info.bitrateBps) {
    const sec = (fileSize * 8) / info.bitrateBps;
    if (sec > 0 && Number.isFinite(sec)) return sec;
  }
  return undefined;
}

// ---- MP4 / M4A ---------------------------------------------------------

interface BoxRef {
  buf: Buffer;
  typeAt: number;
}

/** Locate the first ISO-BMFF box of `type` (size >= 8) within a buffer. */
function findBox(buf: Buffer, type: string): BoxRef | null {
  for (let i = 0; i + 8 <= buf.length; i++) {
    if (buf.readUInt32BE(i) >= 8 && buf.toString("latin1", i + 4, i + 8) === type) {
      return { buf, typeAt: i };
    }
  }
  return null;
}

/** Parse a minimal MP4 `moov/mvhd` timescale + duration. */
export function m4aDurationSeconds(head: Buffer, tail?: Buffer): number | undefined {
  const moov = findBox(head, "moov") ?? (tail ? findBox(tail, "moov") : null);
  if (!moov) return undefined;

  const mvhd = findBox(moov.buf, "mvhd");
  if (!mvhd) return undefined;
  const content = moov.buf.subarray(mvhd.typeAt + 8); // skip size + type of mvhd
  if (content.length < 20) return undefined;

  const version = content[0] & 0xff;
  let timescale: number;
  let durationMv: number;
  if (version === 1) {
    if (content.length < 32) return undefined;
    timescale = content.readUInt32BE(20);
    durationMv = Number(content.readBigUInt64BE(24));
  } else {
    timescale = content.readUInt32BE(12);
    durationMv = content.readUInt32BE(16);
  }
  if (timescale <= 0) return undefined;
  const sec = durationMv / timescale;
  return sec > 0 && Number.isFinite(sec) ? sec : undefined;
}

// ---- dispatch ----------------------------------------------------------

/** Read just enough of a file to probe its duration. Other types → undefined. */
export function probeDuration(filePath: string): number | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const { size } = fs.fstatSync(fd);
    const readLen = Math.min(size, HEAD_BYTES);
    const head = Buffer.alloc(readLen);
    fs.readSync(fd, head, 0, readLen, 0);

    // The data we care about may live at either the head (fast-start MP4) or the
    // tail (last Ogg page, trailing `moov`). Read the last bytes too.
    let tail: Buffer;
    if (size > HEAD_BYTES) {
      tail = Buffer.alloc(HEAD_BYTES);
      fs.readSync(fd, tail, 0, HEAD_BYTES, size - HEAD_BYTES);
    } else {
      tail = head;
    }

    if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WAVE") {
      return wavDurationSeconds(head);
    }
    if (head.toString("latin1", 0, 4) === "fLaC") {
      return flacDurationSeconds(head);
    }
    if (head.toString("latin1", 0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
      return mp3DurationSeconds(head, size);
    }
    if (head.toString("latin1", 0, 4) === "OggS") {
      return oggDurationSeconds(head, tail, size);
    }
    if (head.toString("latin1", 4, 8) === "ftyp") {
      return m4aDurationSeconds(head, tail);
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore close errors */
      }
    }
  }
}