'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineClip, TimelineTrack, ProjectTimeline } from '@frameforge/shared';
import { timelineDuration } from '@frameforge/shared';
import { useTimeline } from '@/lib/stores/timeline.store';
import {
  Lock, Unlock, Eye, EyeOff, Volume2, VolumeX, User, User2, Trash2,
  Plus, Scissors, Flag, StepBack,
} from 'lucide-react';
import clsx from 'clsx';
import { cn } from '@/lib/utils';

const TRACK_HEADER_WIDTH = 180;
const TRACK_HEIGHT = 64;
const HEADER_HEIGHT = 26;

export function Timeline({ assets, onAddClipFromMedia }: { assets: { id: string; name: string }[]; onAddClipFromMedia?: (assetId: string, trackId: string, start: number) => void | Promise<void> }) {
  const {
    timeline, zoom, playhead, setPlayhead, selectedClipId, selectClip,
    selectTrack, selectedTrackId,
    moveClip, trimClip, removeClip, splitAtPlayhead, addMarker, removeMarker, addTrack, deleteTrack,
    setTrackFlag, renameTrack, reorderTracks,
    zoomIn, zoomOut, setZoom, undo, redo, canUndo, canRedo,
  } = useTimeline();

  const [dragState, setDragState] = useState<null | {
    clipId: string;
    mode: 'move' | 'trim-start' | 'trim-end';
    startX: number;
    originalStart: number;
    originalDuration: number;
    originalInPoint: number;
    originalTrackId: string;
    currentDelta: number;
  }>(null);

  const [markerLabels, setMarkerLabels] = useState<Record<string, string>>({});

  const duration = timelineDuration(timeline);
  const totalWidth = Math.max(duration + 30, 60) * zoom;
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---------- ruler ticks ----------
  const ticks = useMemo(() => {
    const tickStep = zoom >= 100 ? 1 : zoom >= 50 ? 2 : zoom >= 25 ? 5 : 10;
    const minor = tickStep / 4;
    const out: { t: number; major: boolean }[] = [];
    const span = totalWidth / zoom;
    for (let t = 0; t <= span; t += minor) {
      out.push({ t, major: Math.abs(t / tickStep - Math.round(t / tickStep)) < 1e-6 });
    }
    return out;
  }, [totalWidth, zoom]);

  // ---------- clip interactions ----------
  const onClipPointerDown = (e: React.PointerEvent, clip: TimelineClip, mode: 'move' | 'trim-start' | 'trim-end') => {
    e.stopPropagation();
    e.preventDefault();
    selectClip(clip.id);
    setDragState({
      clipId: clip.id,
      mode,
      startX: e.clientX,
      originalStart: clip.start,
      originalDuration: clip.duration,
      originalInPoint: clip.inPoint,
      originalTrackId: clip.trackId,
      currentDelta: 0,
    });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - dragState.startX;
      const deltaSeconds = dx / zoom;
      setDragState((d) => (d ? { ...d, currentDelta: deltaSeconds } : d));
    };
    const onUp = () => {
      const d = dragState;
      const delta = d.currentDelta;
      if (Math.abs(delta) > 0.001) {
        if (d.mode === 'move') {
          moveClip(d.clipId, d.originalStart + delta);
        } else if (d.mode === 'trim-start') {
          trimClip(d.clipId, 'start', delta);
        } else {
          trimClip(d.clipId, 'end', delta);
        }
      }
      setDragState(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState?.clipId, dragState?.mode]);

  // ---------- playhead / ruler ----------
  const rulerRef = useRef<HTMLDivElement>(null);
  const seekFromEvent = useCallback((e: React.PointerEvent) => {
    const el = rulerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const t = (x + scrollLeft - TRACK_HEADER_WIDTH) / zoom;
    if (t >= -0.5) setPlayhead(Math.max(0, Math.min(t, duration + 30)));
  }, [zoom, setPlayhead, duration]);

  const onRulerPointerDown = (e: React.PointerEvent) => {
    seekFromEvent(e);
    const move = (ev: PointerEvent) => seekFromEvent({ clientX: ev.clientX } as React.PointerEvent);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Drop handler for media drags — media panel sets dataTransfer with assetId
  const onLaneDrop = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('application/x-frameforge-asset');
    if (!assetId || !onAddClipFromMedia) return;
    const x = e.clientX - (scrollRef.current?.getBoundingClientRect().left ?? 0) - TRACK_HEADER_WIDTH;
    const start = Math.max(0, (x + (scrollRef.current?.scrollLeft ?? 0)) / zoom);
    onAddClipFromMedia(assetId, trackId, start);
  };

  // Add marker at playhead
  const addMarkerAtPlayhead = () => addMarker(playhead);

  return (
    <div className="flex h-full flex-col border-t border-[--color-border-soft] bg-[--color-ink-900]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-[--color-border-soft] px-3 py-1.5">
        <div className="flex items-center gap-1">
          <ToolbarButton title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo()}><IconButton name="undo" /></ToolbarButton>
          <ToolbarButton title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo()}><IconButton name="redo" /></ToolbarButton>
          <div className="mx-1 h-5 w-px bg-zinc-700" />
          <ToolbarButton title="Split at playhead (B)" onClick={splitAtPlayhead}><Scissors className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton title="Add marker (M)" onClick={addMarkerAtPlayhead}><Flag className="h-3.5 w-3.5" /></ToolbarButton>
          <div className="mx-1 h-5 w-px bg-zinc-700" />
          <ToolbarButton title="Add video track" onClick={() => addTrack('video')}><Plus className="h-3.5 w-3.5" /><span className="text-[10px] text-zinc-500">V</span></ToolbarButton>
          <ToolbarButton title="Add audio track" onClick={() => addTrack('audio')}><Plus className="h-3.5 w-3.5" /><span className="text-[10px] text-zinc-500">A</span></ToolbarButton>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">{duration.toFixed(2)}s</span>
          <div className="flex items-center gap-1">
            <button className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/5" onClick={zoomOut} title="Zoom out">−</button>
            <input type="range" min={20} max={300} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-24 accent-indigo-500" title="Timeline zoom" />
            <button className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/5" onClick={zoomIn} title="Zoom in">+</button>
          </div>
        </div>
      </div>

      {/* Scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="relative" style={{ width: totalWidth + TRACK_HEADER_WIDTH, minWidth: '100%' }}>
          {/* Ruler */}
          <div
            ref={rulerRef}
            className="sticky top-0 z-10 flex cursor-col-resize items-stretch border-b border-[--color-border-soft] bg-[--color-ink-900]"
            style={{ height: HEADER_HEIGHT, marginLeft: TRACK_HEADER_WIDTH, width: totalWidth }}
            onPointerDown={onRulerPointerDown}
          >
            {ticks.map(({ t, major }) => (
              <div
                key={t.toFixed(2)}
                className={cn('ruler-tick', major ? 'h-4 bg-white/25' : 'h-2 bg-white/10')}
                style={{ left: t * zoom }}
              >
                {major && <span className="absolute left-1.5 top-0.5 select-none text-[9px] font-mono text-zinc-500">{t.toFixed(0)}s</span>}
              </div>
            ))}
            {/* markers */}
            {timeline.markers.map((marker) => (
              <button
                key={marker.id}
                className="absolute top-0 z-20 flex flex-col items-center"
                style={{ left: marker.time * zoom }}
                title={`${marker.label} — click to remove`}
                onClick={(e) => { e.stopPropagation(); if (e.altKey || confirm(`Remove marker "${marker.label}"?`)) removeMarker(marker.id); else setMarkerLabels({ ...markerLabels, [marker.id]: marker.label }); }}
              >
                <Flag className="h-3 w-3 text-amber-400 fill-amber-400/20" />
                <span className="max-w-[80px] truncate text-[9px] font-mono text-amber-300">{marker.label}</span>
              </button>
            ))}
          </div>

          {/* Tracks */}
          {timeline.tracks.map((track, trackIndex) => (
            <TrackRow
              key={track.id}
              track={track}
              trackIndex={trackIndex}
              timeline={timeline}
              zoom={zoom}
              playhead={playhead}
              selectedClipId={selectedClipId}
              selectedTrackId={selectedTrackId}
              dragState={dragState}
              selectClip={selectClip}
              selectTrack={selectTrack}
              onClipPointerDown={onClipPointerDown}
              onLaneDrop={onLaneDrop}
              setTrackFlag={setTrackFlag}
              deleteTrack={deleteTrack}
              renameTrack={renameTrack}
              reorderTracks={reorderTracks}
              removeClip={removeClip}
              timelineWidth={totalWidth}
            />
          ))}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute z-30 top-0 bottom-0 w-px bg-rose-500"
            style={{ left: TRACK_HEADER_WIDTH + playhead * zoom }}
          />
          <div
            className="pointer-events-none absolute z-30 top-0 h-3 w-3"
            style={{ left: TRACK_HEADER_WIDTH + playhead * zoom - 6 }}
          >
            <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[9px] border-l-transparent border-r-transparent border-t-rose-500" />
          </div>
        </div>
      </div>

      {/* Selection info */}
      <div className="flex h-7 items-center gap-3 border-t border-[--color-border-soft] px-3 text-[10px] text-zinc-500">
        <span>{timeline.clips.length} clip{timeline.clips.length === 1 ? '' : 's'}</span>
        <span>{timeline.tracks.length} track{timeline.tracks.length === 1 ? '' : 's'}</span>
        <span>{timeline.markers.length} marker{timeline.markers.length === 1 ? '' : 's'}</span>
        {selectedClipId && <span className="text-indigo-300">selected · {timeline.clips.find((c) => c.id === selectedClipId)?.name ?? ''}</span>}
      </div>
    </div>
  );
}

function TrackRow({
  track, timeline, zoom, playhead, selectedClipId, selectedTrackId, dragState,
  selectClip, selectTrack, onClipPointerDown, onLaneDrop,
  setTrackFlag, deleteTrack, renameTrack, reorderTracks, removeClip, timelineWidth,
}: {
  track: TimelineTrack;
  timeline: ProjectTimeline;
  zoom: number;
  playhead: number;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  dragState: { clipId: string; mode: string; currentDelta: number; originalStart: number; originalDuration: number; originalTrackId: string } | null;
  selectClip: (id: string | null) => void;
  selectTrack: (id: string | null) => void;
  onClipPointerDown: (e: React.PointerEvent, clip: TimelineClip, mode: 'move' | 'trim-start' | 'trim-end') => void;
  onLaneDrop: (e: React.DragEvent, trackId: string) => void;
  setTrackFlag: (trackId: string, flag: 'locked' | 'visible' | 'muted' | 'solo', value: boolean) => void;
  deleteTrack: (trackId: string) => void;
  renameTrack: (trackId: string, name: string) => void;
  reorderTracks: (from: number, to: number) => void;
  removeClip: (clipId: string, ripple?: boolean) => void;
  timelineWidth: number;
  trackIndex?: number;
}) {
  const clips = timeline.clips.filter((c) => c.trackId === track.id);
  const trackIndex = timeline.tracks.findIndex((t) => t.id === track.id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);
  const [dragOver, setDragOver] = useState(false);

  // Clip display start/duration, respecting drag preview
  const displayClips = clips.map((clip) => {
    if (dragState && dragState.clipId === clip.id) {
      if (dragState.mode === 'move') {
        return { ...clip, start: Math.max(0, dragState.originalStart + dragState.currentDelta) };
      }
      if (dragState.mode === 'trim-start') {
        const newStart = Math.max(0, dragState.originalStart + dragState.currentDelta);
        const newDur = dragState.originalDuration - (newStart - dragState.originalStart);
        return { ...clip, start: newStart, duration: Math.max(0.05, newDur) };
      }
      if (dragState.mode === 'trim-end') {
        return { ...clip, duration: Math.max(0.05, dragState.originalDuration + dragState.currentDelta) };
      }
    }
    return clip;
  });

  const kindColor = track.kind === 'video' ? 'indigo' : 'emerald';

  return (
    <div
      className={cn('relative flex border-b border-[--color-border-soft]', track.id === selectedTrackId && 'bg-indigo-500/5')}
      style={{ height: TRACK_HEIGHT }}
      onPointerEnter={() => selectTrack(track.id)}
      onPointerLeave={() => {}}
    >
      {/* Track header */}
      <div
        className="sticky left-0 z-10 flex h-full shrink-0 flex-col justify-center gap-1 border-r border-[--color-border-soft] bg-[--color-ink-850] px-2"
        style={{ width: TRACK_HEADER_WIDTH }}
      >
        <div className="flex items-center gap-1">
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { setEditing(false); renameTrack(track.id, name.trim() || track.name); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { setEditing(false); renameTrack(track.id, name.trim() || track.name); }
                if (e.key === 'Escape') { setName(track.name); setEditing(false); }
              }}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-100 outline-none"
            />
          ) : (
            <div
              className="truncate text-[11px] font-semibold text-zinc-200"
              onDoubleClick={() => setEditing(true)}
              title="Double-click to rename"
            >
              {track.name}
            </div>
          )}
          <span className="ml-auto flex max-w-12 items-center gap-0.5">
            <button
              title={track.locked ? 'Unlock track' : 'Lock track'}
              onClick={() => setTrackFlag(track.id, 'locked', !track.locked)}
              className={cn('rounded p-1', track.locked ? 'text-amber-400 bg-amber-500/15' : 'text-zinc-500 hover:text-zinc-200')}
            >
              {track.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            </button>
            <button
              title={track.visible ? 'Hide track' : 'Show track'}
              onClick={() => setTrackFlag(track.id, 'visible', !track.visible)}
              className={cn('rounded p-1', track.visible ? 'text-zinc-300' : 'text-zinc-600 bg-white/5')}
            >
              {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
            {track.kind === 'audio' ? (
              <button
                title={track.muted ? 'Unmute' : 'Mute'}
                onClick={() => setTrackFlag(track.id, 'muted', !track.muted)}
                className={cn('rounded p-1', track.muted ? 'text-red-400 bg-red-500/15' : 'text-zinc-300 hover:text-zinc-200')}
              >
                {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              </button>
            ) : (
              <button
                title={track.solo ? 'Unsolo' : 'Solo'}
                onClick={() => setTrackFlag(track.id, 'solo', !track.solo)}
                className={cn('rounded p-1', track.solo ? 'text-indigo-300 bg-indigo-500/15' : 'text-zinc-300 hover:text-zinc-200')}
              >
                {track.solo ? <User2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
              </button>
            )}
            <button
              title="Delete track"
              disabled={track.locked}
              onClick={() => { if (confirm(`Delete track "${track.name}" and its clips?`)) deleteTrack(track.id); }}
              className="rounded p-1 text-zinc-500 hover:text-red-300 disabled:opacity-30"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        </div>
        <div className="text-[9px] uppercase tracking-wider text-zinc-600">{track.kind}</div>
      </div>

      {/* Lane */}
      <div
        className={cn(
          'relative h-full flex-1 border-l border-[--color-border-soft]',
          track.locked && 'bg-zinc-900/40',
          dragOver && 'bg-indigo-500/10',
        )}
        style={{ width: timelineWidth }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); onLaneDrop(e, track.id); }}
        onPointerDown={() => selectTrack(track.id)}
      >
        {/* ruler grid lines */}
        {Array.from({ length: Math.ceil(timelineWidth / zoom) }, (_, i) => (
          <div key={i} className="absolute top-0 bottom-0 w-px bg-white/[0.03]" style={{ left: i * zoom }} />
        ))}

        {displayClips.map((clip) => {
          const isSelected = clip.id === selectedClipId;
          return (
            <div
              key={clip.id}
              role="button"
              tabIndex={0}
              aria-label={`Clip ${clip.name}`}
              onPointerDown={(e) => onClipPointerDown(e, clip, 'move')}
              onClick={(e) => { e.stopPropagation(); selectClip(clip.id); }}
              className={cn(
                'group absolute top-1.5 bottom-1.5 overflow-hidden rounded-md border text-left shadow-sm transition-colors',
                kindColor === 'indigo'
                  ? 'border-indigo-400/40 bg-gradient-to-b from-indigo-500/40 to-indigo-700/40 hover:border-indigo-300/60'
                  : 'border-emerald-400/40 bg-gradient-to-b from-emerald-500/40 to-emerald-700/40 hover:border-emerald-300/60',
                isSelected && 'ring-2 ring-indigo-300 border-indigo-300',
                track.locked && 'pointer-events-none opacity-70',
              )}
              style={{
                left: clip.start * zoom,
                width: Math.max(8, clip.duration * zoom),
                cursor: track.locked ? 'not-allowed' : 'grab',
              }}
              title={`${clip.name} (${formatClipTime(clip.start, clip.duration)})`}
            >
              <span className="clip-clip-label pointer-events-none absolute left-1.5 top-1 right-1 truncate text-zinc-100">{clip.name}</span>
              <span className="pointer-events-none absolute left-1.5 bottom-1 text-[9px] font-mono text-zinc-300">
                {clip.duration.toFixed(1)}s
              </span>
              {/* trim handles */}
              {!track.locked && (
                <>
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md bg-white/25 hover:bg-white/50"
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onClipPointerDown(e, clip, 'trim-start'); }}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md bg-white/25 hover:bg-white/50"
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onClipPointerDown(e, clip, 'trim-end'); }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToolbarButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function IconButton({ name }: { name: 'undo' | 'redo' }) {
  if (name === 'undo') return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13" /></svg>;
}

function formatClipTime(start: number, duration: number): string {
  return `${start.toFixed(2)}s → ${(start + duration).toFixed(2)}s`;
}
