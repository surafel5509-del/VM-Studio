import type { MotionLayer } from '@frameforge/shared';

export function keyframeCount(layer: MotionLayer): number {
  return Object.values(layer.keyframes).reduce((sum, keys) => sum + keys.length, 0);
}
