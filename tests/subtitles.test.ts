import { describe, it, expect } from 'vitest';
import { parseSrt, parseVtt, parseSubtitles, serializeSrt, serializeVtt } from '@frameforge/shared';

const SRT = `1
00:00:01,000 --> 00:00:02,000
Hello world

2
00:00:02,500 --> 00:00:04,000
Second line
`;

const VTT = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello world

00:00:02.500 --> 00:00:04.000
Second line
`;

describe('parseSrt', () => {
  it('parses cues with timestamps and text', () => {
    const cues = parseSrt(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.start).toBeCloseTo(1);
    expect(cues[0]!.end).toBeCloseTo(2);
    expect(cues[0]!.text).toBe('Hello world');
    expect(cues[1]!.text).toBe('Second line');
  });

  it('returns empty array for empty input', () => {
    expect(parseSrt('')).toEqual([]);
  });
});

describe('parseVtt', () => {
  it('parses VTT cues', () => {
    const cues = parseVtt(VTT);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.start).toBeCloseTo(1);
    expect(cues[0]!.end).toBeCloseTo(2);
  });
});

describe('parseSubtitles', () => {
  it('sniffs the format from the header', () => {
    expect(parseSubtitles(SRT)).toHaveLength(2);
    expect(parseSubtitles(VTT)).toHaveLength(2);
  });
});

describe('serialize', () => {
  const cues = [
    { index: 1, start: 1, end: 2, text: 'Hello world' },
    { index: 2, start: 2.5, end: 4, text: 'Second line' },
  ];

  it('serializeSrt round-trips through parseSrt', () => {
    const srt = serializeSrt(cues);
    const parsed = parseSrt(srt);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.text).toBe('Hello world');
    expect(parsed[1]!.text).toBe('Second line');
  });

  it('serializeVtt round-trips through parseVtt', () => {
    const vtt = serializeVtt(cues);
    const parsed = parseVtt(vtt);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.start).toBeCloseTo(1);
    expect(parsed[1]!.end).toBeCloseTo(4);
  });
});
