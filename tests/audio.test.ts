import { describe, it, expect } from 'vitest';
import { computePeaks, detectSilence, windowRMS } from '@frameforge/shared';

function sine(seconds: number, sampleRate: number, freq: number): Float32Array {
  const data = new Float32Array(Math.floor(seconds * sampleRate));
  for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return data;
}

describe('computePeaks', () => {
  it('reports windows with min and max', () => {
    const data = sine(1, 1000, 10);
    const peaks = computePeaks(data, 1000, 4);
    expect(peaks).toHaveLength(4);
    for (const p of peaks) {
      expect(p.max).toBeLessThanOrEqual(1);
      expect(p.min).toBeGreaterThanOrEqual(-1);
      expect(p.max).toBeGreaterThan(p.min);
    }
  });

  it('returns near-zero peaks for silence', () => {
    const data = new Float32Array(1000).fill(0);
    const peaks = computePeaks(data, 1000, 4);
    expect(peaks.every((p) => windowRMS(p) < 0.01)).toBe(true);
  });
});

describe('detectSilence', () => {
  it('detects silent regions between loud ones and keeps the loud part', () => {
    // 3-second clip: 1s silence, 1s loud, 1s silence — use a peak envelope with RMS threshold at 0.05
    const peaks = [
      { min: 0, max: 0 },
      { min: 0, max: 0 },
      { min: -0.9, max: 0.9 },
      { min: -0.9, max: 0.9 },
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ];
    const intervals = detectSilence(peaks, 1000, 6, 3, 0.05, 0.5);
    expect(intervals.length).toBe(2);
    expect(intervals[0]!.start).toBe(0);
    expect(intervals[0]!.end).toBe(1);
    expect(intervals[1]!.start).toBe(2);
    expect(intervals[1]!.end).toBe(3);
  });

  it('returns no intervals when everything is loud', () => {
    const peaks = [{ min: -0.9, max: 0.9 }, { min: -0.9, max: 0.9 }];
    expect(detectSilence(peaks, 1000, 2, 2, 0.05, 0.5)).toEqual([]);
  });
});
