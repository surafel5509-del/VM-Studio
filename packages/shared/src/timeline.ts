/**
 * Pure, deterministic timeline engine.
 *
 * A Timeline is a plain data structure. Every operation is a pure function:
 * (timeline, ...args) => Timeline. No I/O, no DOM access, fully testable.
 * The web app wraps this with a Zustand store and an undo/redo stack.
 */
import type { ProjectTimeline, TimelineClip, TimelineTrack, TimelineMarker, TrackKind } from './types';

export function createDefaultTrack(kind: TrackKind, name?: string): TimelineTrack {
  return {
    id: crypto.randomUUID(),
    name: name ?? (kind === 'video' ? 'Video' : 'Audio'),
    kind,
    locked: false,
    visible: true,
    muted: false,
    solo: false,
  };
}

export function createDefaultTimeline(): ProjectTimeline {
  const v = createDefaultTrack('video', 'Video 1');
  const a = createDefaultTrack('audio', 'Audio 1');
  return { tracks: [v, a], clips: [], markers: [] };
}

export function cloneTimeline(t: ProjectTimeline): ProjectTimeline {
  return JSON.parse(JSON.stringify(t)) as ProjectTimeline;
}

/** Effective duration across all clips, or 0. */
export function timelineDuration(t: ProjectTimeline): number {
  return t.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
}

export function addTrack(t: ProjectTimeline, kind: TrackKind, index?: number): ProjectTimeline {
  const track = createDefaultTrack(kind, kind === 'video' ? `Video ${countKind(t, 'video') + 1}` : `Audio ${countKind(t, 'audio') + 1}`);
  const tracks = [...t.tracks];
  if (index === undefined || index < 0 || index > tracks.length) tracks.push(track);
  else tracks.splice(index, 0, track);
  return { ...t, tracks };
}

function countKind(t: ProjectTimeline, kind: TrackKind): number {
  return t.tracks.filter((track) => track.kind === kind).length;
}

export function deleteTrack(t: ProjectTimeline, trackId: string): ProjectTimeline {
  const track = t.tracks.find((tr) => tr.id === trackId);
  if (!track) return t;
  if (track.locked) return t; // never delete locked tracks
  const tracks = t.tracks.filter((tr) => tr.id !== trackId);
  const clips = t.clips.filter((c) => c.trackId !== trackId);
  return { ...t, tracks, clips };
}

export function renameTrack(t: ProjectTimeline, trackId: string, name: string): ProjectTimeline {
  return { ...t, tracks: t.tracks.map((tr) => (tr.id === trackId ? { ...tr, name } : tr)) };
}

export function setTrackFlag(
  t: ProjectTimeline,
  trackId: string,
  flag: 'locked' | 'visible' | 'muted' | 'solo',
  value: boolean,
): ProjectTimeline {
  return {
    ...t,
    tracks: t.tracks.map((tr) => (tr.id === trackId ? { ...tr, [flag]: value } : tr)),
  };
}

export function reorderTracks(t: ProjectTimeline, fromIndex: number, toIndex: number): ProjectTimeline {
  const tracks = [...t.tracks];
  if (fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) return t;
  const [moved] = tracks.splice(fromIndex, 1);
  tracks.splice(toIndex, 0, moved!);
  return { ...t, tracks };
}

export function addClip(
  t: ProjectTimeline,
  trackId: string,
  clip: Omit<TimelineClip, 'id' | 'createdAt' | 'trackId'>,
): ProjectTimeline {
  const track = t.tracks.find((tr) => tr.id === trackId);
  if (!track) return t;
  if (track.kind !== 'audio' && clip.layerKind === 'audio') return t;
  if (track.kind === 'audio' && clip.layerKind !== 'audio' && clip.layerKind !== 'video') return t;
  if (timelineOverlap(t, trackId, clip.start, clip.start + clip.duration, null)) {
    // nudge to the nearest free slot instead of overlapping
    const free = nearestFreeStart(t, trackId, clip.start, clip.duration);
    clip = { ...clip, start: free };
  }
  const newClip: TimelineClip = {
    ...clip,
    trackId,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  return { ...t, clips: [...t.clips, newClip] };
}

export function removeClip(t: ProjectTimeline, clipId: string, ripple = false): ProjectTimeline {
  const clip = t.clips.find((c) => c.id === clipId);
  if (!clip) return t;
  const track = t.tracks.find((tr) => tr.id === clip.trackId);
  if (track?.locked) return t;
  let clips = t.clips.filter((c) => c.id !== clipId);
  if (ripple) {
    const trackClips = clips.filter((c) => c.trackId === clip.trackId);
    const removedDuration = clip.duration;
    const after = trackClips.filter((c) => c.start >= clip.start);
    clips = clips.map((c) => {
      if (after.includes(c)) return { ...c, start: c.start - removedDuration };
      return c;
    });
    clips = clips.map((c) => (c.start < 0 ? { ...c, start: 0 } : c));
  }
  return { ...t, clips };
}

export function duplicateClip(t: ProjectTimeline, clipId: string, offset = 0.5): ProjectTimeline {
  const clip = t.clips.find((c) => c.id === clipId);
  if (!clip) return t;
  const track = t.tracks.find((tr) => tr.id === clip.trackId);
  if (track?.locked) return t;
  const trackClips = t.clips.filter((c) => c.trackId === clip.trackId);
  let start = clip.start + clip.duration + offset;
  const end = start + clip.duration;
  const maxEnd = trackClips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  if (start >= maxEnd - 0.001 && trackClips.length === 0) start = 0;
  // find a free slot
  const free = nearestFreeStart(t, clip.trackId, start, clip.duration);
  const clone: TimelineClip = {
    ...JSON.parse(JSON.stringify(clip)) as TimelineClip,
    id: crypto.randomUUID(),
    start: free,
    createdAt: Date.now(),
  };
  return { ...t, clips: [...t.clips, clone] };
}

export function splitClip(t: ProjectTimeline, clipId: string, time: number): ProjectTimeline {
  const clip = t.clips.find((c) => c.id === clipId);
  if (!clip) return t;
  if (time <= clip.start + 0.01 || time >= clip.start + clip.duration - 0.01) return t;
  const leftDur = time - clip.start;
  const rightDur = clip.duration - leftDur;
  const left: TimelineClip = { ...clip, duration: leftDur };
  const right: TimelineClip = {
    ...JSON.parse(JSON.stringify(clip)) as TimelineClip,
    id: crypto.randomUUID(),
    start: time,
    duration: rightDur,
    inPoint: clip.inPoint + leftDur * clip.speed,
    outPoint: clip.outPoint !== null ? clip.inPoint + clip.duration * clip.speed : null,
    createdAt: Date.now(),
  };
  const clips = t.clips.filter((c) => c.id !== clipId).concat([left, right]);
  return { ...t, clips };
}

export function moveClip(t: ProjectTimeline, clipId: string, newStart: number): ProjectTimeline {
  const clip = t.clips.find((c) => c.id === clipId);
  if (!clip) return t;
  const track = t.tracks.find((tr) => tr.id === clip.trackId);
  if (track?.locked) return t;
  const start = Math.max(0, newStart);
  if (timelineOverlap(t, clip.trackId, start, start + clip.duration, clipId)) {
    return t; // refuse to overlap
  }
  return {
    ...t,
    clips: t.clips.map((c) => (c.id === clipId ? { ...c, start } : c)),
  };
}

export function trimClip(
  t: ProjectTimeline,
  clipId: string,
  edge: 'start' | 'end',
  delta: number,
): ProjectTimeline {
  const clip = t.clips.find((c) => c.id === clipId);
  if (!clip) return t;
  const track = t.tracks.find((tr) => tr.id === clip.trackId);
  if (track?.locked) return t;
  if (edge === 'start') {
    // trimming the start: how much should the clip shrink from the left?
    const newStart = clip.start + delta;
    const newDuration = clip.duration - delta;
    if (newDuration < 0.05) return t;
    const newOverlap = timelineOverlap(t, clip.trackId, newStart, newStart + newDuration, clipId);
    if (newOverlap) return t;
    return {
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? { ...c, start: newStart, duration: newDuration, inPoint: c.inPoint + delta * c.speed }
          : c,
      ),
    };
  }
  const newDuration = clip.duration + delta;
  if (newDuration < 0.05) return t;
  if (timelineOverlap(t, clip.trackId, clip.start, clip.start + newDuration, clipId)) return t;
  return {
    ...t,
    clips: t.clips.map((c) => (c.id === clipId ? { ...c, duration: newDuration } : c)),
  };
}

export function setClipSpeed(t: ProjectTimeline, clipId: string, speed: number): ProjectTimeline {
  const clip = t.clips.find((c) => c.id === clipId);
  if (!clip) return t;
  if (speed <= 0 || !Number.isFinite(speed)) return t;
  // keep the source window fixed: timeline duration changes inversely with speed
  const sourceSpan = (clip.outPoint ?? clip.inPoint + clip.duration * clip.speed) - clip.inPoint;
  const newDuration = sourceSpan / speed;
  const clamped = Math.max(0.05, newDuration);
  // clamp against track end / next clip
  const nextClip = t.clips
    .filter((c) => c.trackId === clip.trackId && c.id !== clipId && c.start >= clip.start)
    .reduce((min, c) => Math.min(min, c.start), Infinity);
  const maxDuration = Number.isFinite(nextClip) ? nextClip - clip.start : Infinity;
  const duration = Math.min(clamped, maxDuration);
  return {
    ...t,
    clips: t.clips.map((c) => (c.id === clipId ? { ...c, speed, duration } : c)),
  };
}

export function setClipVolume(t: ProjectTimeline, clipId: string, volume: number): ProjectTimeline {
  const v = clamp01(volume);
  return { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, volume: v } : c)) };
}

export function setClipOpacity(t: ProjectTimeline, clipId: string, opacity: number): ProjectTimeline {
  const o = clamp01(opacity);
  return { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, opacity: o } : c)) };
}

export function setClipText(t: ProjectTimeline, clipId: string, text: string): ProjectTimeline {
  return { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, text } : c)) };
}

export function setClipTransform(t: ProjectTimeline, clipId: string, transform: Partial<TimelineClip['transform']>): ProjectTimeline {
  return {
    ...t,
    clips: t.clips.map((c) => (c.id === clipId ? { ...c, transform: { ...c.transform, ...transform } } : c)),
  };
}

export function setClipColor(t: ProjectTimeline, clipId: string, color: string): ProjectTimeline {
  return { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, solidColor: color, text: c.text } : c)) };
}

export function addMarker(t: ProjectTimeline, time: number, label?: string): ProjectTimeline {
  const marker = {
    id: crypto.randomUUID(),
    time: Math.max(0, time),
    label: label ?? `Marker ${t.markers.length + 1}`,
  };
  return { ...t, markers: [...t.markers, marker].sort((a, b) => a.time - b.time) };
}

export function removeMarker(t: ProjectTimeline, markerId: string): ProjectTimeline {
  return { ...t, markers: t.markers.filter((m) => m.id !== markerId) };
}

export function labelMarker(t: ProjectTimeline, markerId: string, label: string): ProjectTimeline {
  return { ...t, markers: t.markers.map((m) => (m.id === markerId ? { ...m, label } : m)) };
}

/** Ripple delete: close gap so later clips on the same track slide left. */
export function rippleDelete(t: ProjectTimeline, clipId: string): ProjectTimeline {
  return removeClip(t, clipId, true);
}

/** Split every clip on a given track at the given time (barrage). */
export function splitEveryClipAt(t: ProjectTimeline, time: number): ProjectTimeline {
  let result = t;
  const clipsToSplit = [...t.clips];
  for (const clip of clipsToSplit) {
    const current = result.clips.find((c) => c.id === clip.id);
    if (!current) continue; // already split by a previous iteration
    if (time > current.start + 0.05 && time < current.start + current.duration - 0.05) {
      result = splitClip(result, current.id, time);
    }
  }
  return result;
}

/** Returns true if any clip on the track overlaps [start, end). */
export function timelineOverlap(
  t: ProjectTimeline,
  trackId: string,
  start: number,
  end: number,
  ignoreClipId: string | null,
): boolean {
  return t.clips.some((c) => {
    if (c.trackId !== trackId) return false;
    if (ignoreClipId && c.id === ignoreClipId) return false;
    return c.start < end && c.start + c.duration > start;
  });
}

function nearestFreeStart(t: ProjectTimeline, trackId: string, desiredStart: number, duration: number): number {
  const trackClips = t.clips.filter((c) => c.trackId === trackId);
  let start = Math.max(0, desiredStart);
  for (let attempt = 0; attempt < 100; attempt++) {
    const end = start + duration;
    const blocking = trackClips.find((c) => c.start < end && c.start + c.duration > start);
    if (!blocking) return start;
    // try just after the blocking clip
    start = Math.max(start, blocking.start + blocking.duration);
  }
  return desiredStart;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Find the clip at a given time on a given track (topmost = last in array order). */
export function clipAt(t: ProjectTimeline, time: number, trackId?: string): TimelineClip | null {
  const candidates = t.clips.filter(
    (c) => c.start <= time && time < c.start + c.duration && (trackId === undefined || c.trackId === trackId),
  );
  return candidates.length ? candidates[candidates.length - 1]! : null;
}

/** Source media time for a clip at timeline time `time`. */
export function sourceTime(clip: TimelineClip, time: number): number {
  const local = Math.max(0, time - clip.start);
  return clip.inPoint + local * clip.speed;
}

/** All tracks that should render at time `time` (visible, not solo-suppressed). */
export function visibleClipsAt(t: ProjectTimeline, time: number): TimelineClip[] {
  const solos = t.tracks.filter((tr) => tr.solo);
  const allowedTracks = solos.length
    ? solos
    : t.tracks.filter((tr) => tr.visible);
  return t.clips.filter((c) => {
    if (!allowedTracks.some((tr) => tr.id === c.trackId)) return false;
    if (time < c.start || time >= c.start + c.duration) return false;
    const track = t.tracks.find((tr) => tr.id === c.trackId);
    return !track?.muted;
  });
}

/** All tracks with at least a visible clip at `time`, top-most first. */
export function visibleTracksAt(t: ProjectTimeline, time: number): TimelineTrack[] {
  const solos = t.tracks.filter((tr) => tr.solo);
  const source = solos.length ? solos : t.tracks.filter((tr) => tr.visible);
  return source.filter(
    (tr) => t.clips.some((c) => c.trackId === tr.id && time >= c.start && time < c.start + c.duration),
  );
}

/**
 * History-friendly wrapper: keeps undo/redo stacks.
 * Each operation commits the previous state (or None) to the undo stack.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  limit: number;
}

export function initHistory<T>(initial: T, limit = 100): History<T> {
  return { past: [], present: initial, future: [], limit };
}

export function commit<T>(history: History<T>, next: T): History<T> {
  const past = [...history.past, history.present];
  if (past.length > history.limit) past.shift();
  return { past, present: next, future: [], limit: history.limit };
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1]!;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future], limit: history.limit };
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  const next = history.future[0]!;
  return { past: [...history.past, history.present], present: next, future: history.future.slice(1), limit: history.limit };
}
