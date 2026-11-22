/**
 * Easing curves used by the motion engine.
 * All functions map t in [0,1] -> t in [0,1].
 */
import type { EasingType, BezierEasing } from './types';

export const EASE_NAMES: EasingType[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeInOutBack',
  'easeInOutElastic',
  'cubicBezier',
];

export function easingFunction(type: EasingType, params?: BezierEasing | null): (t: number) => number {
  switch (type) {
    case 'linear':
      return (t) => t;
    case 'easeIn':
      return (t) => t * t * t;
    case 'easeOut':
      return (t) => 1 - Math.pow(1 - t, 3);
    case 'easeInOut':
      return (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    case 'easeInOutBack': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return (t) =>
        t < 0.5
          ? (Math.pow(2 * t, 2) * ((c3 + 1) * 2 * t - c1)) / 2
          : (Math.pow(2 * t - 2, 2) * ((c3 + 1) * (t - 1) + c1) + 2) / 2;
    }
    case 'easeInOutElastic': {
      const c4 = (2 * Math.PI) / 3;
      return (t) => {
        if (t === 0 || t === 1) return t;
        if (t < 0.5) return -(Math.pow(2, 10 * t - 10) * Math.sin(((10 * t - 10.75) * Math.PI) / 3)) / 2;
        return (Math.pow(2, -10 * t + 10) * Math.sin(((10 * t - 10.75) * Math.PI) / 3)) / 2 + 1;
      };
    }
    case 'cubicBezier': {
      const p = params ?? { type: 'cubicBezier', x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
      return (t) => cubicBezierEase(t, p);
    }
  }
}

function cubicBezierEase(t: number, p: { x1: number; y1: number; x2: number; y2: number }): number {
  const x1 = p.x1;
  const y1 = p.y1;
  const x2 = p.x2;
  const y2 = p.y2;
  const sample = (xGuess: number) => {
    const mt = 1 - xGuess;
    const mt3 = mt * mt * mt;
    const mt2 = mt * mt;
    const t2 = xGuess * xGuess;
    return 3 * mt2 * xGuess * y1 + 3 * mt * t2 * y2 + xGuess * xGuess * xGuess;
  };
  const sampleX = (tGuess: number) => {
    const mt = 1 - tGuess;
    const mt3 = mt * mt * mt;
    const mt2 = mt * mt;
    const t2 = tGuess * tGuess;
    return 3 * mt2 * tGuess * x1 + 3 * mt * t2 * x2 + tGuess * tGuess * tGuess;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (sampleX(mid) < t) lo = mid;
    else hi = mid;
  }
  return sample((lo + hi) / 2);
}

/**
 * Interpolate a keyframe track at time `t`.
 * Keys are returned sorted by time. Before first key => first key value;
 * after last key => last key value.
 */
export function sampleTrack(
  keyframes: Array<{ time: number; value: number; easing: EasingType }>,
  t: number,
  cubicBeziers?: Record<string, BezierEasing | null>,
  layerId?: string,
): number {
  if (keyframes.length === 0) return 0;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (t <= sorted[0]!.time) return sorted[0]!.value;
  if (t >= sorted[sorted.length - 1]!.time) return sorted[sorted.length - 1]!.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t >= a.time && t < b.time) {
      const span = Math.max(1e-6, b.time - a.time);
      const local = (t - a.time) / span;
      const easing = easingFunction(a.easing, cubicBeziers?.[`${layerId}:${i}`] ?? null);
      return a.value + (b.value - a.value) * easing(local);
    }
  }
  return sorted[sorted.length - 1]!.value;
}
