/**
 * Audio analysis helpers.
 * Pure numeric functions for silence detection and peaks.
 * WebAudio decoding lives in the app layer; this is the math.
 */

export interface SilenceInterval {
  start: number; // seconds
  end: number; // seconds
}

export interface Peak {
  min: number;
  max: number;
}

/**
 * Compute stereo-mixed RMS per `windowCount` windows.
 * @param data mono float32 PCM
 * @param sampleRate Hz
 * @param windowCount number of windows
 */
export function computePeaks(data: Float32Array, sampleRate: number, windowCount: number): Peak[] {
  const duration = data.length / sampleRate;
  const windowSize = Math.max(1, Math.floor(data.length / windowCount));
  const peaks: Peak[] = [];
  for (let i = 0; i < windowCount; i++) {
    const start = i * windowSize;
    const end = Math.min(data.length, start + windowSize);
    let min = 0;
    let max = 0;
    let sum = 0;
    for (let j = start; j < end; j++) {
      const v = data[j]!;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v * v;
    }
    const rms = end > start ? Math.sqrt(sum / (end - start)) : 0;
    // clamp reported envelope so UI doesn't divide by zero
    peaks.push({ min: Math.max(-1, min), max: Math.min(1, max) });
    // attach RMS as max for display simplicity
    peaks[peaks.length - 1] = { min: peaks[peaks.length - 1]!.min, max: Math.max(peaks[peaks.length - 1]!.max, rms) };
  }
  return peaks;
}

/** Detect silent regions given a peak envelope. Returns intervals in seconds. */
export function detectSilence(
  peaks: Peak[],
  sampleRate: number,
  windowCount: number,
  durationSeconds: number,
  threshold = 0.015,
  minSilence = 0.5,
): SilenceInterval[] {
  if (durationSeconds <= 0) return [];
  const windowSize = durationSeconds / windowCount;
  const intervals: SilenceInterval[] = [];
  let start: number | null = null;
  for (let i = 0; i < windowCount; i++) {
    const p = peaks[i]!;
    const t = i * windowSize;
    const rms = Math.max(Math.abs(p.min), Math.abs(p.max));
    if (rms < threshold) {
      if (start === null) start = t;
    } else {
      if (start !== null) {
        if (t - start >= minSilence) intervals.push({ start, end: t });
        start = null;
      }
    }
  }
  if (start !== null && durationSeconds - start >= minSilence) {
    intervals.push({ start, end: durationSeconds });
  }
  return intervals;
}

/** RMS of a peak window, safe for UI. */
export function windowRMS(p: Peak): number {
  return Math.max(Math.abs(p.min), Math.abs(p.max));
}
