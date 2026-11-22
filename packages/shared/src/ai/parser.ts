/**
 * Deterministic natural-language planner.
 *
 * This is NOT a free-form LLM. It maps a constrained set of editing commands
 * to validated, typed edit plans that a human can confirm before execution.
 * Commands that need a generative LLM (or other provider) are reported as
 * unsupported-by-local-parser and should be routed to a provider — we never
 * fabricate a successful result for them.
 */
import type { ProjectTimeline } from '../types';

export type PlannedAction =
  | { kind: 'splitAtPlayhead' }
  | { kind: 'addMarker'; label?: string }
  | { kind: 'deleteSelectedClip'; ripple: boolean }
  | { kind: 'rippleDeleteSelected' }
  | { kind: 'duplicateSelectedClip' }
  | { kind: 'setSpeed'; speed: number }
  | { kind: 'setVolume'; volume: number }
  | { kind: 'setOpacity'; opacity: number }
  | { kind: 'addTextLayer'; text: string; duration?: number }
  | { kind: 'addSolidLayer'; color?: string; duration?: number }
  | { kind: 'zoomTimelineIn' }
  | { kind: 'zoomTimelineOut' }
  | { kind: 'trimToShort'; targetSeconds: number }
  | { kind: 'silenceRemoval'; minSilence: number }
  | { kind: 'unknown'; raw: string; reason: string };

export interface EditPlan {
  summary: string;
  actions: PlannedAction[];
  /** true when any action removes or moves data — requires confirmation */
  needsConfirmation: boolean;
  /** plain-language notes for the user */
  notes: string[];
}

export interface ParserContext {
  playheadTime: number;
  selectedClipId: string | null;
  timeline: ProjectTimeline;
  hasAudioTracks: boolean;
}

/**
 * Parse a natural-language command into a validated edit plan.
 * Pure and deterministic. Never mutates input.
 */
export function parseCommand(raw: string, ctx: ParserContext): EditPlan {
  const text = raw.trim();
  const notes: string[] = [];
  const actions: PlannedAction[] = [];
  const t = text.toLowerCase();

  const hasPlayhead = /\b(at|now|current|play\s*head|cursor)\b/.test(t) || /\bsplit\b/.test(t);

  // ---- Speed ----
  const speedMatch = t.match(/\b(?:speed|play\s*back|playback|tempo)\s*(?:to|=|of|back\s*to)?\s*(\d+(?:\.\d+)?)x?\b/);
  if (speedMatch && !/\bvolume\b/.test(t)) {
    const speed = Math.min(10, Math.max(0.1, parseFloat(speedMatch[1]!)));
    actions.push({ kind: 'setSpeed', speed });
    notes.push(`Clip speed will be set to ${speed}x.`);
  }

  // ---- Volume ----
  const volMatch = t.match(/\bvolume\s*(?:to|=|of)?\s*(\d+(?:\.\d+)?)\s*%?\b/);
  if (volMatch) {
    const v = Math.min(100, Math.max(0, parseFloat(volMatch[1]!)));
    actions.push({ kind: 'setVolume', volume: v / 100 });
    notes.push(`Clip volume will be set to ${v}%.`);
  }

  // ---- Opacity ----
  const opMatch = t.match(/\b(?:opacity|transparen|alpha)\s*(?:to|=|of)?\s*(\d+(?:\.\d+)?)\s*%?\b/);
  if (opMatch) {
    const o = Math.min(100, Math.max(0, parseFloat(opMatch[1]!)));
    actions.push({ kind: 'setOpacity', opacity: o / 100 });
    notes.push(`Clip opacity will be set to ${o}%.`);
  }

  // ---- Split ----
  if (/\b(split|cut|blade|divide)\b/.test(t) && hasPlayhead) {
    actions.push({ kind: 'splitAtPlayhead' });
    notes.push('Clip at the playhead will be split.');
  }

  // ---- Marker ----
  if (/\b(add|place|drop)\s+(?:a\s+)?marker\b/.test(t) || /\bmark\b/.test(t)) {
    const labelMatch = t.match(/(?:called|labeled|label)\s+["']?([^"'\n]{2,30})["']?\s*$/);
    actions.push({ kind: 'addMarker', label: labelMatch ? labelMatch[1]!.trim() : undefined });
    notes.push('A marker will be placed at the playhead.');
  }

  // ---- Duplicate ----
  if (/\b(duplicate|copy|clone)\b/.test(t) && /\bclip\b|\bselected\b/.test(t)) {
    actions.push({ kind: 'duplicateSelectedClip' });
    notes.push('The selected clip will be duplicated.');
  }

  // ---- Delete ----
  if (/\b(delete|remove|rip out)\b/.test(t) && /\bclip\b|\bselected\b/.test(t)) {
    const ripple = /\bripple\b|\bshift\b|\bclose gap\b/.test(t);
    actions.push({ kind: 'deleteSelectedClip', ripple });
    notes.push(ripple ? 'The selected clip will be removed and the timeline will ripple to close the gap.' : 'The selected clip will be removed.');
  }

  // ---- Text layer (match on the original text so quoted content keeps its case) ----
  const textMatch = raw.match(/\b(?:add|create|make)\s+(?:a\s+)?(?:text|title|caption)\s+(?:layer|clip|overlay)?\s+(?:saying|with|called|that says)?\s*["']?([^"'\n]{2,80})["']?/i);
  if (textMatch && !/\bmarker\b/.test(t)) {
    actions.push({ kind: 'addTextLayer', text: textMatch[1]!.trim() });
    notes.push(`A text layer with "${textMatch[1]!.trim()}" will be added.`);
  }

  // ---- Solid layer ----
  if (/\b(add|create|make)\s+(?:a\s+)?(?:solid|color|colour|fill|background)\s*(?:layer|clip)?\b/.test(t)) {
    const colorMatch = t.match(/(#[0-9a-f]{3,8})|(black|white|red|green|blue|orange|purple|pink|yellow|gray|grey)/);
    const named: Record<string, string> = {
      black: '#000000', white: '#ffffff', red: '#ef4444', green: '#22c55e', blue: '#3b82f6',
      orange: '#f97316', purple: '#a855f7', pink: '#ec4899', yellow: '#eab308', gray: '#6b7280', grey: '#6b7280',
    };
    const color = colorMatch && colorMatch[1] ? colorMatch[1] : (colorMatch ? (named[colorMatch[2]!] ?? '#111827') : '#18181b');
    actions.push({ kind: 'addSolidLayer', color });
    notes.push(`A ${color} solid layer will be added.`);
  }

  // ---- Zoom ----
  if (/\bzoom\s*(?:in|closer|up)\b|\bin\b\s*(?:zoom|timeline)/.test(t)) {
    actions.push({ kind: 'zoomTimelineIn' });
    notes.push('Timeline zoom will increase.');
  }
  if (/\bzoom\s*(?:out|farther|further|down)\b/.test(t)) {
    actions.push({ kind: 'zoomTimelineOut' });
    notes.push('Timeline zoom will decrease.');
  }

  // ---- Shorts / social trim ----
  const shortMatch = t.match(/\b(?:make|create|cut)\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*(?:second|sec|s|minute|min)\w*\s*(?:short|reel|video|clip|cut)?\b/);
  if (shortMatch) {
    const target = parseFloat(shortMatch[1]!);
    if (target > 0) {
      actions.push({ kind: 'trimToShort', targetSeconds: target });
      notes.push(`A ${target}s short will be planned from the start of the timeline.`);
    }
  }

  // ---- Silence removal ----
  if (/\b(remove|delete|cut)\s+(?:all\s+)?(?:silence|silent|quiet)\s*(?:sections?|segments?|parts?)?\b/.test(t)) {
    const minSilence = 0.5;
    actions.push({ kind: 'silenceRemoval', minSilence });
    notes.push('Silent regions will be detected (requires an audio clip on the timeline) and removed.');
  }

  if (actions.length === 0) {
    notes.push('No local deterministic command matched. For generative edits (style, music, narration, LLM-driven reasoning) a provider integration is required — see Settings → AI providers.');
    actions.push({ kind: 'unknown', raw: text, reason: 'not_supported_by_local_parser' });
    return { summary: 'No local action understood', actions, needsConfirmation: false, notes };
  }

  const destructive = actions.some(
    (a) =>
      a.kind === 'deleteSelectedClip' ||
      a.kind === 'silenceRemoval' ||
      a.kind === 'trimToShort' ||
      a.kind === 'rippleDeleteSelected',
  );

  return {
    summary: `${actions.length} action${actions.length > 1 ? 's' : ''} planned`,
    actions,
    needsConfirmation: destructive,
    notes,
  };
}

/** List of the explicit, provider-dependent commands the local parser cannot do. */
export const PROVIDER_ONLY_COMMANDS = [
  'cinematic',
  'storyboard',
  'script',
  'voiceover',
  'narration',
  'subtitles',
  'caption',
  'translation',
  'translate',
  'music',
  'thumbnail',
  'ai generate',
  'generate video',
  'generate image',
  'avatar',
  'scene detection',
  'color match',
  'transcript',
  'audio cleanup',
  'make the video more',
];
