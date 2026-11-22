import { describe, it, expect } from 'vitest';
import { easingFunction, sampleTrack, EASE_NAMES } from '@frameforge/shared';

describe('easing functions', () => {
  it('declares all documented easings', () => {
    expect(EASE_NAMES).toContain('linear');
    expect(EASE_NAMES).toContain('easeIn');
    expect(EASE_NAMES).toContain('easeOut');
    expect(EASE_NAMES).toContain('easeInOut');
    expect(EASE_NAMES).toContain('cubicBezier');
  });

  it.each(['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInOutBack', 'easeInOutElastic', 'cubicBezier'] as const)(
    '%s maps 0→0 and 1→1',
    (name) => {
      const f = easingFunction(name);
      expect(f(0)).toBeCloseTo(0, 5);
      expect(f(1)).toBeCloseTo(1, 2);
    },
  );

  it('linear is the identity', () => {
    const f = easingFunction('linear');
    expect(f(0.3)).toBeCloseTo(0.3);
  });

  it('easeIn is slower at the start than at the end', () => {
    const f = easingFunction('easeIn');
    // derivative grows with t
    const d1 = f(0.25);
    const d2 = f(0.75);
    expect(d2).toBeGreaterThan(d1);
    // but both remain within [0,1]
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
  });

  it('easeInOut is symmetric around 0.5', () => {
    const f = easingFunction('easeInOut');
    expect(f(0.5)).toBeCloseTo(0.5, 5);
    expect(f(0.25)).toBeCloseTo(1 - f(0.75), 5);
  });
});

describe('sampleTrack', () => {
  it('returns the clamped value outside the key range', () => {
    expect(sampleTrack([{ time: 1, value: 5, easing: 'linear' }], 0)).toBe(5);
    expect(sampleTrack([{ time: 1, value: 5, easing: 'linear' }], 10)).toBe(5);
  });

  it('interpolates between two keyframes', () => {
    const track = [
      { time: 0, value: 0, easing: 'linear' as const },
      { time: 2, value: 100, easing: 'linear' as const },
    ];
    expect(sampleTrack(track, 1)).toBeCloseTo(50);
  });

  it('easing between keys distorts the midpoint', () => {
    const track = [
      { time: 0, value: 0, easing: 'easeIn' as const },
      { time: 2, value: 100, easing: 'easeIn' as const },
    ];
    // easeIn: slow start — midpoint is below linear
    expect(sampleTrack(track, 1)).toBeLessThan(50);
  });
});
