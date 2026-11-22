'use client';

import { create } from 'zustand';
import {
  createDefaultTimeline,
  cloneTimeline,
  timelineDuration,
  initHistory,
  commit as historyCommit,
  undo as historyUndo,
  redo as historyRedo,
  type History,
  type ProjectTimeline,
  type TimelineClip,
  type TimelineTrack,
  type TrackKind,
  addTrack as tlAddTrack,
  deleteTrack as tlDeleteTrack,
  renameTrack as tlRenameTrack,
  setTrackFlag as tlSetTrackFlag,
  reorderTracks as tlReorderTracks,
  addClip as tlAddClip,
  removeClip as tlRemoveClip,
  duplicateClip as tlDuplicateClip,
  splitClip as tlSplitClip,
  moveClip as tlMoveClip,
  trimClip as tlTrimClip,
  setClipSpeed as tlSetSpeed,
  setClipVolume as tlSetVolume,
  setClipOpacity as tlSetOpacity,
  setClipText as tlSetText,
  setClipTransform as tlSetTransform,
  setClipColor as tlSetColor,
  addMarker as tlAddMarker,
  removeMarker as tlRemoveMarker,
  labelMarker as tlLabelMarker,
  rippleDelete as tlRippleDelete,
  splitEveryClipAt as tlSplitEvery,
} from '@frameforge/shared';

interface TimelineState {
  projectId: string | null;
  timeline: ProjectTimeline;
  history: History<ProjectTimeline>;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  playhead: number;
  zoom: number; // px per second
  playing: boolean;

  loadTimeline: (timeline: ProjectTimeline | null, projectId: string) => void;
  reset: () => void;
  loadDefault: (projectId: string) => void;

  // tracks
  addTrack: (kind: TrackKind) => void;
  deleteTrack: (trackId: string) => void;
  renameTrack: (trackId: string, name: string) => void;
  setTrackFlag: (trackId: string, flag: 'locked' | 'visible' | 'muted' | 'solo', value: boolean) => void;
  reorderTracks: (from: number, to: number) => void;

  // clips
  addClip: (trackId: string, clip: Omit<TimelineClip, 'id' | 'createdAt' | 'trackId'>) => void;
  removeClip: (clipId: string, ripple?: boolean) => void;
  rippleDeleteClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  splitClipAt: (clipId: string, time: number) => void;
  splitAtPlayhead: () => void;
  splitEveryClipAt: (time: number) => void;
  moveClip: (clipId: string, start: number) => void;
  trimClip: (clipId: string, edge: 'start' | 'end', delta: number) => void;
  setSpeed: (clipId: string, speed: number) => void;
  setVolume: (clipId: string, volume: number) => void;
  setOpacity: (clipId: string, opacity: number) => void;
  setText: (clipId: string, text: string) => void;
  setTransform: (clipId: string, transform: Partial<TimelineClip['transform']>) => void;
  setColor: (clipId: string, color: string) => void;

  // markers
  addMarker: (time: number, label?: string) => void;
  removeMarker: (markerId: string) => void;
  labelMarker: (markerId: string, label: string) => void;

  // selection & playback
  selectClip: (clipId: string | null) => void;
  selectTrack: (trackId: string | null) => void;
  setPlayhead: (time: number) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setPlaying: (playing: boolean) => void;

  undo: () => void;
  redo: () => void;

  duration: () => number;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function commit(state: TimelineState, next: ProjectTimeline) {
  return { timeline: next, history: historyCommit({ ...state.history, present: state.timeline }, next) };
}

export const useTimeline = create<TimelineState>((set, get) => ({
  projectId: null,
  timeline: createDefaultTimeline(),
  history: initHistory(createDefaultTimeline(), 100),
  selectedClipId: null,
  selectedTrackId: null,
  playhead: 0,
  zoom: 100,
  playing: false,

  loadTimeline: (timeline, projectId) => {
    const t = timeline ?? createDefaultTimeline();
    set({
      projectId,
      timeline: t,
      history: initHistory(t, 100),
      selectedClipId: null,
      selectedTrackId: null,
      playhead: 0,
      playing: false,
    });
  },

  loadDefault: (projectId) => {
    const t = createDefaultTimeline();
    set({
      projectId,
      timeline: t,
      history: initHistory(t, 100),
      selectedClipId: null,
      selectedTrackId: null,
      playhead: 0,
      playing: false,
    });
  },

  reset: () => get().loadDefault(''),

  addTrack: (kind) => {
    const state = get();
    const next = tlAddTrack(state.timeline, kind);
    if (next !== state.timeline) set(commit(state, next));
  },

  deleteTrack: (trackId) => {
    const state = get();
    const next = tlDeleteTrack(state.timeline, trackId);
    if (next !== state.timeline) set({ ...commit(state, next), selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId });
  },

  renameTrack: (trackId, name) => {
    const state = get();
    const next = tlRenameTrack(state.timeline, trackId, name);
    if (next !== state.timeline) set(commit(state, next));
  },

  setTrackFlag: (trackId, flag, value) => {
    const state = get();
    const next = tlSetTrackFlag(state.timeline, trackId, flag, value);
    if (next !== state.timeline) set(commit(state, next));
  },

  reorderTracks: (from, to) => {
    const state = get();
    const next = tlReorderTracks(state.timeline, from, to);
    if (next !== state.timeline) set(commit(state, next));
  },

  addClip: (trackId, clip) => {
    const state = get();
    const next = tlAddClip(state.timeline, trackId, clip);
    if (next !== state.timeline) {
      const added = next.clips[next.clips.length - 1];
      set({ ...commit(state, next), selectedClipId: added?.id ?? state.selectedClipId });
    }
  },

  removeClip: (clipId, ripple = false) => {
    const state = get();
    const next = tlRemoveClip(state.timeline, clipId, ripple);
    if (next !== state.timeline) set({ ...commit(state, next), selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId });
  },

  rippleDeleteClip: (clipId) => {
    const state = get();
    const next = tlRippleDelete(state.timeline, clipId);
    if (next !== state.timeline) set({ ...commit(state, next), selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId });
  },

  duplicateClip: (clipId) => {
    const state = get();
    const next = tlDuplicateClip(state.timeline, clipId);
    if (next !== state.timeline) {
      const added = next.clips[next.clips.length - 1];
      set({ ...commit(state, next), selectedClipId: added?.id ?? state.selectedClipId });
    }
  },

  splitClipAt: (clipId, time) => {
    const state = get();
    const next = tlSplitClip(state.timeline, clipId, time);
    if (next !== state.timeline) set(commit(state, next));
  },

  splitAtPlayhead: () => {
    const state = get();
    const time = state.playhead;
    const clip = state.timeline.clips.find((c) => c.start <= time && time < c.start + c.duration && c.trackId === state.selectedTrackId);
    const target = clip ?? state.timeline.clips.find((c) => c.start <= time && time < c.start + c.duration);
    if (target) {
      const next = tlSplitClip(state.timeline, target.id, time);
      if (next !== state.timeline) set(commit(state, next));
    }
  },

  splitEveryClipAt: (time) => {
    const state = get();
    const next = tlSplitEvery(state.timeline, time);
    if (next !== state.timeline) set(commit(state, next));
  },

  moveClip: (clipId, start) => {
    const state = get();
    const next = tlMoveClip(state.timeline, clipId, start);
    if (next !== state.timeline) set(commit(state, next));
  },

  trimClip: (clipId, edge, delta) => {
    const state = get();
    const next = tlTrimClip(state.timeline, clipId, edge, delta);
    if (next !== state.timeline) set(commit(state, next));
  },

  setSpeed: (clipId, speed) => {
    const state = get();
    const next = tlSetSpeed(state.timeline, clipId, speed);
    if (next !== state.timeline) set(commit(state, next));
  },

  setVolume: (clipId, volume) => {
    const state = get();
    const next = tlSetVolume(state.timeline, clipId, volume);
    if (next !== state.timeline) set(commit(state, next));
  },

  setOpacity: (clipId, opacity) => {
    const state = get();
    const next = tlSetOpacity(state.timeline, clipId, opacity);
    if (next !== state.timeline) set(commit(state, next));
  },

  setText: (clipId, text) => {
    const state = get();
    const next = tlSetText(state.timeline, clipId, text);
    if (next !== state.timeline) set(commit(state, next));
  },

  setTransform: (clipId, transform) => {
    const state = get();
    const next = tlSetTransform(state.timeline, clipId, transform);
    if (next !== state.timeline) set(commit(state, next));
  },

  setColor: (clipId, color) => {
    const state = get();
    const next = tlSetColor(state.timeline, clipId, color);
    if (next !== state.timeline) set(commit(state, next));
  },

  addMarker: (time, label) => {
    const state = get();
    const next = tlAddMarker(state.timeline, time, label);
    if (next !== state.timeline) set(commit(state, next));
  },

  removeMarker: (markerId) => {
    const state = get();
    const next = tlRemoveMarker(state.timeline, markerId);
    if (next !== state.timeline) set(commit(state, next));
  },

  labelMarker: (markerId, label) => {
    const state = get();
    const next = tlLabelMarker(state.timeline, markerId, label);
    if (next !== state.timeline) set(commit(state, next));
  },

  selectClip: (clipId) => set({ selectedClipId: clipId }),
  selectTrack: (trackId) => set({ selectedTrackId: trackId }),

  setPlayhead: (time) => set({ playhead: Math.max(0, time) }),

  setZoom: (zoom) => set({ zoom: Math.min(500, Math.max(20, zoom)) }),

  zoomIn: () => set({ zoom: Math.min(500, get().zoom * 1.25) }),

  zoomOut: () => set({ zoom: Math.max(20, get().zoom / 1.25) }),

  setPlaying: (playing) => set({ playing }),

  undo: () => {
    const state = get();
    const next = historyUndo({ ...state.history, present: state.timeline });
    if (next.present !== state.timeline) set({ timeline: next.present, history: next });
  },

  redo: () => {
    const state = get();
    const next = historyRedo({ ...state.history, present: state.timeline });
    if (next.present !== state.timeline) set({ timeline: next.present, history: next });
  },

  duration: () => timelineDuration(get().timeline),

  canUndo: () => get().history.past.length > 0,

  canRedo: () => get().history.future.length > 0,
}));

export function useSelectedClip(): TimelineClip | null {
  const timeline = useTimeline((s) => s.timeline);
  const selectedClipId = useTimeline((s) => s.selectedClipId);
  return timeline.clips.find((c) => c.id === selectedClipId) ?? null;
}
