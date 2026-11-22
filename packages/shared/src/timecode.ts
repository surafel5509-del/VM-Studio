/** Timecode formatting and parsing helpers. */

export interface TimecodeParts {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  totalSeconds: number;
}

/**
 * Format seconds as HH:MM:SS:FF (frame-accurate).
 * Frames are floored, never rounded.
 */
export function formatTimecode(seconds: number, fps = 30): string {
  const total = Math.max(0, seconds);
  const totalFrames = Math.round(total * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}:${p(frames)}`;
}

export function parseTimecode(input: string, fps = 30): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // HH:MM:SS:FF or MM:SS:FF or SS:FF
  const parts = trimmed.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  while (parts.length < 4) parts.unshift(0);
  const [h, m, s, f] = parts as [number, number, number, number];
  if (f < 0 || f >= fps) return null;
  if (m < 0 || m >= 60 || s < 0 || s >= 60) return null;
  return h * 3600 + m * 60 + s + f / fps;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const ms = Math.floor((total * 1000) % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatSeconds(seconds: number): string {
  return seconds.toFixed(2) + 's';
}

export function clampTime(time: number, duration: number): number {
  if (Number.isNaN(time)) return 0;
  return Math.min(Math.max(0, time), Math.max(0, duration));
}
