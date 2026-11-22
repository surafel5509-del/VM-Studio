import { describe, it, expect } from 'vitest';
import { parseCommand, PROVIDER_ONLY_COMMANDS } from '@frameforge/shared';
import { createDefaultTimeline } from '@frameforge/shared';

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    playheadTime: 5,
    selectedClipId: null,
    timeline: createDefaultTimeline(),
    hasAudioTracks: true,
    ...overrides,
  };
}

describe('parseCommand', () => {
  it('parses "split at playhead"', () => {
    const plan = parseCommand('Split at playhead', ctx());
    expect(plan.actions.some((a) => a.kind === 'splitAtPlayhead')).toBe(true);
    expect(plan.summary).toContain('1 action');
  });

  it('parses "add a marker"', () => {
    const plan = parseCommand('Add a marker', ctx());
    expect(plan.actions.some((a) => a.kind === 'addMarker')).toBe(true);
  });

  it('parses "duplicate the selected clip"', () => {
    const plan = parseCommand('Duplicate the selected clip', ctx());
    expect(plan.actions.some((a) => a.kind === 'duplicateSelectedClip')).toBe(true);
  });

  it('parses "make a 30 second short"', () => {
    const plan = parseCommand('Make a 30 second short', ctx());
    const trim = plan.actions.find((a) => a.kind === 'trimToShort');
    expect(trim).toBeDefined();
    expect((trim as any).targetSeconds).toBe(30);
    // trimming the timeline is destructive → needs confirmation
    expect(plan.needsConfirmation).toBe(true);
  });

  it('parses "remove silent sections" — destructive and needs confirmation', () => {
    const plan = parseCommand('Remove silent sections', ctx());
    expect(plan.actions.some((a) => a.kind === 'silenceRemoval')).toBe(true);
    expect(plan.needsConfirmation).toBe(true);
  });

  it('parses text layer commands', () => {
    const plan = parseCommand('Add a text layer saying "Hello World"', ctx());
    const layer = plan.actions.find((a) => a.kind === 'addTextLayer');
    expect(layer).toBeDefined();
    expect((layer as any).text).toContain('Hello World');
  });

  it('parses speed/volume/opacity', () => {
    const plan = parseCommand('Set speed to 2x', ctx());
    expect(plan.actions.some((a) => a.kind === 'setSpeed' && Math.abs((a as any).speed - 2) < 0.01)).toBe(true);

    const vol = parseCommand('Volume to 50%', ctx());
    expect(vol.actions.some((a) => a.kind === 'setVolume' && Math.abs((a as any).volume - 0.5) < 0.01)).toBe(true);
  });

  it('marks unparseable commands as unknown with an honest note', () => {
    const plan = parseCommand('Make it cinematic', ctx());
    expect(plan.actions.some((a) => a.kind === 'unknown')).toBe(true);
    expect(plan.needsConfirmation).toBe(false);
    expect(plan.summary).toMatch(/not|No local/i);
  });

  it('exposes the provider-only command list', () => {
    expect(PROVIDER_ONLY_COMMANDS).toContain('cinematic');
    expect(PROVIDER_ONLY_COMMANDS).toContain('voiceover');
  });

  it('sets needsConfirmation for deletes', () => {
    const plan = parseCommand('Remove the selected clip', ctx());
    expect(plan.needsConfirmation).toBe(true);
  });
});
