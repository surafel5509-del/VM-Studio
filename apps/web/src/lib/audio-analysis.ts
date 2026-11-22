'use client';

/**
 * WebAudio-based audio analysis for the AI assistant.
 * All math is deterministic; results are advisory only and are applied via
 * normal undoable timeline operations on confirmation.
 */
import { computePeaks, detectSilence, windowRMS, type SilenceInterval } from '@frameforge/shared';

export interface KeepSegment {
  start: number; // source seconds
  end: number; // source seconds
}

/**
 * Compute non-silent source-time segments for a media source over the
 * source window [inPoint, inPoint + sourceDuration).
 * Returns segments in source-time coordinates.
 */
export async function computeKeepSegments(
  url: string,
  inPoint: number,
  sourceDuration: number,
  options?: { threshold?: number; minSilence?: number },
): Promise<KeepSegment[]> {
  const threshold = options?.threshold ?? 0.02;
  const minSilence = options?.minSilence ?? 0.5;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load audio (${res.status})`);
  const data = await res.arrayBuffer();

  const ctx = getAudioContext();
  const buffer = await ctx.decodeAudioData(data);
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;

  // Mono mix
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) sum += buffer.getChannelData(c)[i]!;
    mono[i] = sum / numChannels;
  }

  const startSec = Math.max(0, Math.min(inPoint, buffer.duration - 0.001));
  const endSec = Math.min(startSec + sourceDuration, buffer.duration);
  if (endSec - startSec < 0.05) {
    return [{ start: startSec, end: endSec }];
  }
  const windowCount = Math.max(16, Math.min(400, Math.floor((endSec - startSec) * 8)));
  const startIdx = Math.floor(startSec * sampleRate);
  const endIdx = Math.ceil(endSec * sampleRate);
  const slice = mono.subarray(startIdx, endIdx);
  const peaks = computePeaks(slice, sampleRate, windowCount);
  const silence: SilenceInterval[] = detectSilence(peaks, sampleRate, windowCount, endSec - startSec, threshold, minSilence);

  // Convert silence intervals (local to window) into keep segments (local → source)
  const keep: KeepSegment[] = [];
  let cursor = 0;
  const sortedSilence = silence.sort((a, b) => a.start - b.start);
  for (const s of sortedSilence) {
    if (s.start > cursor) {
      keep.push({ start: startSec + cursor, end: startSec + s.start });
    }
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < endSec - startSec) {
    keep.push({ start: startSec + cursor, end: endSec });
  }
  return keep.filter((k) => k.end - k.start > 0.2).map((k) => ({
    start: Math.max(0, k.start),
    end: Math.min(buffer.duration, k.end),
  }));
}

let sharedCtx: AudioContext | null = null;
export function getAudioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}
