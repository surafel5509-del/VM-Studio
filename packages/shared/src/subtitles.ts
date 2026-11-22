/**
 * Subtitle parsing and serialization (SRT / WebVTT).
 * Real round-trip support: parse -> edit -> serialize.
 */
import type { SubtitleCue } from './types';

export function parseSrt(input: string): SubtitleCue[] {
  const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let idx = 1;
    let body = lines;
    if (/^\d+$/.test(lines[0]!)) {
      idx = parseInt(lines[0]!, 10);
      body = lines.slice(1);
    }
    const timeLine = body.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const parts = timeLine.split('-->').map((p) => p.trim());
    if (parts.length !== 2) continue;
    const start = parseTimestamp(parts[0]!);
    const end = parseTimestamp(parts[1]!.split(' ')[0] ?? '');
    if (start === null || end === null) continue;
    const textLines = body.filter((l) => l !== timeLine);
    if (!textLines.length) continue;
    cues.push({ index: idx, start, end, text: textLines.join('\n'), style: 'default' });
  }
  return cues.sort((a, b) => a.start - b.start).map((c, i) => ({ ...c, index: i + 1 }));
}

export function parseVtt(input: string): SubtitleCue[] {
  const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const body = lines.filter((l) => !l.startsWith('WEBVTT') && !l.startsWith('NOTE'));
    if (!body.length) continue;
    const timeLine = body.find((l) => l.includes('-->'));
    if (!timeLine) {
      // maybe NOTE / STI block; skip
      continue;
    }
    const parts = timeLine.split('-->').map((p) => p.trim());
    if (parts.length !== 2) continue;
    const start = parseTimestamp(parts[0]!);
    const end = parseTimestamp(parts[1]!.split(' ')[0] ?? '');
    if (start === null || end === null) continue;
    const textLines = body.filter((l) => l !== timeLine);
    if (!textLines.length) continue;
    cues.push({ index: cues.length + 1, start, end, text: textLines.join('\n'), style: 'default' });
  }
  return cues.sort((a, b) => a.start - b.start).map((c, i) => ({ ...c, index: i + 1 }));
}

export function serializeSrt(cues: SubtitleCue[]): string {
  return cues
    .map((c, i) => {
      const start = formatTimestamp(c.start);
      const end = formatTimestamp(c.end);
      return `${i + 1}\n${start} --> ${end}\n${c.text}`;
    })
    .join('\n\n') + '\n';
}

export function serializeVtt(cues: SubtitleCue[]): string {
  const lines = ['WEBVTT', ''];
  for (const c of cues) {
    lines.push(`${formatTimestampVtt(c.start)} --> ${formatTimestampVtt(c.end)}`);
    lines.push(c.text);
    lines.push('');
  }
  return lines.join('\n');
}

/** Parse "HH:MM:SS,mmm" (SRT) or "HH:MM:SS.mmm" (VTT) timestamps. */
function parseTimestamp(input: string): number | null {
  const m = /^(\d{2,}):(\d{2}):(\d{2})[:,.](\d{1,3})$/.exec(input.trim());
  if (!m) return null;
  const hh = parseInt(m[1]!, 10);
  const mm = parseInt(m[2]!, 10);
  const ss = parseInt(m[3]!, 10);
  const ms = parseInt(m[4]!.padEnd(3, '0'), 10);
  if (mm >= 60 || ss >= 60 || ms > 999) return null;
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.floor((total % 1) * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)},${String(ms).padStart(3, '0')}`;
}

function formatTimestampVtt(seconds: number): string {
  return formatTimestamp(seconds).replace(',', '.');
}

/** Parse either format by sniffing the header. */
export function parseSubtitles(input: string): SubtitleCue[] {
  if (/^\s*WEBVTT/i.test(input)) return parseVtt(input);
  return parseSrt(input);
}
