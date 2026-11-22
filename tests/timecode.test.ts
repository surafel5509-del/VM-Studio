import { describe, it, expect } from 'vitest';
import { formatTimecode, parseTimecode, formatDuration } from '@frameforge/shared';

describe('formatTimecode', () => {
  it('formats 90 seconds with 30fps', () => {
    expect(formatTimecode(90, 30)).toBe('00:01:30:00');
  });

  it('formats hours, minutes, seconds and frames', () => {
    expect(formatTimecode(3661.5, 30)).toBe('01:01:01:15');
  });

  it('clamps negative time to zero', () => {
    expect(formatTimecode(-5, 30)).toBe('00:00:00:00');
  });
});

describe('parseTimecode', () => {
  it('parses HH:MM:SS:FF', () => {
    expect(parseTimecode('01:01:01:15', 30)).toBeCloseTo(3661.5);
  });

  it('parses MM:SS:FF', () => {
    expect(parseTimecode('01:30:00', 30)).toBeCloseTo(90);
  });

  it('parses SS:FF', () => {
    expect(parseTimecode('00:15', 30)).toBeCloseTo(0.5);
  });

  it('rejects invalid input', () => {
    expect(parseTimecode('not-a-time', 30)).toBeNull();
    expect(parseTimecode('', 30)).toBeNull();
  });

  it('rejects frames out of range', () => {
    expect(parseTimecode('00:00:00:30', 30)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats 90 seconds as MM:SS.mmm', () => {
    expect(formatDuration(90)).toBe('01:30.000');
  });
});
