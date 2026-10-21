/**
 * Extract the audio track of a video (mp4 / webm / mov / mkv / …) and return
 * it as a 16-bit PCM WAV, using Chromium's built-in media demuxer + decoder.
 *
 * No external binaries: `AudioContext.decodeAudioData` decodes the *audio*
 * stream of the container into an AudioBuffer (codecs like AAC/OPUS/Vorbis/MP3
 * are supported by the platform), then we render it to a WAV in-memory.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor!();
  }
  return ctx;
}

/** Encode a decoded AudioBuffer into a standard 44-byte-header 16-bit PCM WAV. */
export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = numFrames * blockAlign;

  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  dv.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  dv.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      dv.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return ab;
}

/**
 * Decode any audio-bearing container into a WAV. Throws (with a readable
 * message) if the platform cannot decode the container / audio codec.
 */
export async function extractAudioFromFile(
  fileBytes: ArrayBuffer,
): Promise<{ wav: ArrayBuffer; duration: number }> {
  const c = getCtx();
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* non-fatal: decodeAudioData may still work */
    }
  }
  const buffer = await c.decodeAudioData(fileBytes);
  return { wav: encodeWav(buffer), duration: buffer.duration };
}