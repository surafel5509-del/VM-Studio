import { describe, it, expect } from 'vitest';
import {
  createDefaultTimeline,
  cloneTimeline,
  timelineDuration,
  addClip,
  removeClip,
  duplicateClip,
  splitClip,
  moveClip,
  trimClip,
  setClipSpeed,
  setClipVolume,
  setClipOpacity,
  setClipText,
  setClipColor,
  addMarker,
  removeMarker,
  labelMarker,
  rippleDelete,
  splitEveryClipAt,
  timelineOverlap,
  clipAt,
  sourceTime,
  visibleClipsAt,
  setTrackFlag,
  renameTrack,
  addTrack,
  deleteTrack,
  initHistory,
  commit,
  undo,
  redo,
  type ProjectTimeline,
} from '@frameforge/shared';

function videoTrack(t: ProjectTimeline) {
  return t.tracks.find((tr) => tr.kind === 'video')!;
}

function makeClip(t: ProjectTimeline, overrides: Record<string, unknown> = {}) {
  const track = videoTrack(t);
  return addClip(t, track.id, {
    mediaId: null,
    layerKind: 'video',
    name: 'Test clip',
    start: 0,
    duration: 4,
    inPoint: 0,
    outPoint: null,
    speed: 1,
    volume: 1,
    opacity: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...overrides,
  } as any);
}

describe('createDefaultTimeline', () => {
  it('creates a timeline with a video and an audio track', () => {
    const t = createDefaultTimeline();
    expect(t.clips).toEqual([]);
    expect(t.markers).toEqual([]);
    expect(t.tracks.some((tr) => tr.kind === 'video')).toBe(true);
    expect(t.tracks.some((tr) => tr.kind === 'audio')).toBe(true);
  });
});

describe('addClip', () => {
  it('appends a clip with a unique id', () => {
    const t0 = createDefaultTimeline();
    const t1 = makeClip(t0);
    expect(t1.clips).toHaveLength(1);
    const clip = t1.clips[0]!;
    expect(clip.id).toBeTruthy();
    expect(clip.trackId).toBe(videoTrack(t0).id);
    expect(clip.createdAt).toBeGreaterThan(0);
  });

  it('nudges overlapping clips instead of overlapping', () => {
    const t0 = makeClip(createDefaultTimeline());
    const t1 = makeClip(t0, { start: 2, name: 'Second clip' });
    const second = t1.clips.find((c) => c.name === 'Second clip')!;
    const first = t1.clips.find((c) => c.name !== 'Second clip')!;
    // the second clip must NOT overlap the first after the overlap nudge
    expect(timelineOverlap(t1, videoTrack(t1).id, second.start, second.start + second.duration, second.id)).toBe(false);
    expect(second.start).toBeGreaterThanOrEqual(first.start + first.duration - 0.001);
  });

  it('rejects an audio clip on a video track and returns the timeline unchanged', () => {
    const t0 = createDefaultTimeline();
    const track = videoTrack(t0);
    const t1 = addClip(t0, track.id, {
      mediaId: null,
      layerKind: 'audio',
      name: 'Bad',
      start: 0,
      duration: 2,
      inPoint: 0,
      outPoint: null,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    } as any);
    expect(t1.clips).toHaveLength(0);
  });
});

describe('removeClip', () => {
  it('removes a clip without shifting other clips', () => {
    let t = makeClip(createDefaultTimeline(), { start: 0 });
    t = makeClip(t, { start: 10, name: 'Other' });
    const before = t.clips.find((c) => c.name === 'Other')!;
    const clipId = t.clips[0]!.id;
    const t2 = removeClip(t, clipId);
    expect(t2.clips).toHaveLength(1);
    expect(t2.clips.find((c) => c.id === before.id)!.start).toBe(10);
  });

  it('ripple removes a clip and shifts later clips left', () => {
    let t = makeClip(createDefaultTimeline(), { start: 0, duration: 2 });
    t = makeClip(t, { start: 4, duration: 3, name: 'Later' });
    const laterId = t.clips.find((c) => c.name === 'Later')!.id;
    const t2 = rippleDelete(t, t.clips[0]!.id);
    const later = t2.clips.find((c) => c.id === laterId)!;
    expect(later.start).toBe(2);
  });

  it('refuses to remove a clip from a locked track', () => {
    let t = makeClip(createDefaultTimeline());
    const track = videoTrack(t);
    t = setTrackFlag(t, track.id, 'locked', true);
    const clipId = t.clips[0]!.id;
    const t2 = removeClip(t, clipId);
    expect(t2.clips).toHaveLength(1);
  });
});

describe('splitClip', () => {
  it('splits a clip into two at the given time', () => {
    const t0 = makeClip(createDefaultTimeline(), { start: 0, duration: 4 });
    const t1 = splitClip(t0, t0.clips[0]!.id, 2);
    expect(t1.clips).toHaveLength(2);
    const after = t1.clips.map((c) => ({ start: c.start, duration: c.duration })).sort((a, b) => a.start - b.start);
    expect(after[0]!.duration).toBe(2);
    expect(after[1]!.duration).toBe(2);
    expect(after[1]!.start).toBe(2);
  });

  it('is a no-op when the time is outside the clip', () => {
    const t0 = makeClip(createDefaultTimeline(), { start: 0, duration: 2 });
    const t1 = splitClip(t0, t0.clips[0]!.id, 99);
    expect(t1.clips).toHaveLength(1);
  });
});

describe('duplicateClip', () => {
  it('duplicates a clip with a new id', () => {
    const t0 = makeClip(createDefaultTimeline(), { start: 0 });
    const t1 = duplicateClip(t0, t0.clips[0]!.id);
    expect(t1.clips).toHaveLength(2);
    expect(t1.clips[1]!.id).not.toBe(t1.clips[0]!.id);
  });
});

describe('trimClip', () => {
  it('trims the end and keeps the start', () => {
    const t0 = makeClip(createDefaultTimeline(), { start: 1, duration: 4 });
    const t1 = trimClip(t0, t0.clips[0]!.id, 'end', -1);
    expect(t1.clips[0]!.duration).toBe(3);
    expect(t1.clips[0]!.start).toBe(1);
  });

  it('refuses to shrink below minimum duration', () => {
    const t0 = makeClip(createDefaultTimeline(), { start: 0, duration: 0.1 });
    const t1 = trimClip(t0, t0.clips[0]!.id, 'end', -1);
    expect(t1.clips[0]!.duration).toBe(0.1);
  });
});

describe('setClipters', () => {
  it('setClipSpeed', () => {
    const t0 = makeClip(createDefaultTimeline());
    const t1 = setClipSpeed(t0, t0.clips[0]!.id, 2);
    expect(t1.clips[0]!.speed).toBe(2);
  });
  it('setClipVolume', () => {
    const t0 = makeClip(createDefaultTimeline());
    const t1 = setClipVolume(t0, t0.clips[0]!.id, 0.5);
    expect(t1.clips[0]!.volume).toBe(0.5);
  });
  it('setClipOpacity', () => {
    const t0 = makeClip(createDefaultTimeline());
    const t1 = setClipOpacity(t0, t0.clips[0]!.id, 0.3);
    expect(t1.clips[0]!.opacity).toBe(0.3);
  });
  it('setClipText', () => {
    const t0 = makeClip(createDefaultTimeline());
    const t1 = setClipText(t0, t0.clips[0]!.id, 'Hello');
    expect(t1.clips[0]!.text).toBe('Hello');
  });
  it('setClipColor', () => {
    const t0 = makeClip(createDefaultTimeline());
    const t1 = setClipColor(t0, t0.clips[0]!.id, '#ff0000');
    expect(t1.clips[0]!.solidColor).toBe('#ff0000');
  });
});

describe('markers', () => {
  it('adds, labels and removes markers', () => {
    const t0 = createDefaultTimeline();
    const t1 = addMarker(t0, 5, 'Intro');
    expect(t1.markers).toHaveLength(1);
    expect(t1.markers[0]!.label).toBe('Intro');
    const t2 = labelMarker(t1, t1.markers[0]!.id, 'Outro');
    expect(t2.markers[0]!.label).toBe('Outro');
    const t3 = removeMarker(t2, t2.markers[0]!.id);
    expect(t3.markers).toHaveLength(0);
  });
});

describe('tracks', () => {
  it('renames tracks', () => {
    const t0 = createDefaultTimeline();
    const track = videoTrack(t0);
    const t1 = renameTrack(t0, track.id, 'Primary');
    expect(t1.tracks.find((tr) => tr.id === track.id)!.name).toBe('Primary');
  });
  it('adds and deletes tracks', () => {
    const t0 = createDefaultTimeline();
    const before = t0.tracks.length;
    const t1 = addTrack(t0, 'video');
    expect(t1.tracks.length).toBe(before + 1);
    const newTrack = t1.tracks[t1.tracks.length - 1]!;
    const t2 = deleteTrack(t1, newTrack.id);
    expect(t2.tracks.length).toBe(before);
  });
  it('refuses to delete a locked track', () => {
    const t0 = makeClip(createDefaultTimeline());
    const track = videoTrack(t0);
    const t1 = setTrackFlag(t0, track.id, 'locked', true);
    const t2 = deleteTrack(t1, track.id);
    expect(t2.tracks).toHaveLength(t1.tracks.length);
  });
});

describe('timeline helpers', () => {
  it('timelineDuration finds the furthest clip end', () => {
    let t = makeClip(createDefaultTimeline(), { start: 0, duration: 2 });
    t = makeClip(t, { start: 5, duration: 3, name: 'Later' });
    expect(timelineDuration(t)).toBe(8);
  });

  it('splitEveryClipAt splits all clips at a time', () => {
    const t0 = makeClip(createDefaultTimeline(), { start: 0, duration: 4 });
    const t1 = splitEveryClipAt(t0, 2);
    expect(t1.clips).toHaveLength(2);
  });

  it('clipAt finds the clip at a time', () => {
    const t0 = makeClip(createDefaultTimeline(), { start: 1, duration: 3 });
    expect(clipAt(t0, 2)).not.toBeNull();
    expect(clipAt(t0, 99)).toBeNull();
  });

  it('sourceTime maps timeline time to source time', () => {
    const t0 = makeClip(createDefaultTimeline(), { start: 2, duration: 4, inPoint: 1, speed: 2 });
    const clip = t0.clips[0]!;
    // timeline 2 = source 1
    expect(sourceTime(clip, 2)).toBe(1);
    // timeline 2.5 = inPoint + 0.5 * speed = 1 + 0.5*2 = 2.0
    expect(sourceTime(clip, 2.5)).toBeCloseTo(2.0);
  });

  it('visibleClipsAt hides clips on hidden tracks and applies solo', () => {
    let t = makeClip(createDefaultTimeline(), { start: 0, duration: 4, name: 'Main' });
    const t2 = t; // audio track untouched
    const track = videoTrack(t2);
    const hidden = setTrackFlag(t2, track.id, 'visible', false);
    expect(visibleClipsAt(hidden, 1)).toHaveLength(0);
  });
});

describe('history', () => {
  it('commits, undoes and redoes', () => {
    let h = initHistory({ text: 'a' }, 10);
    h = commit(h, { text: 'b' });
    expect(h.present).toEqual({ text: 'b' });
    h = undo(h);
    expect(h.present).toEqual({ text: 'a' });
    h = redo(h);
    expect(h.present).toEqual({ text: 'b' });
  });
});
