'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectTimeline, MediaAsset, TimelineClip } from '@frameforge/shared';
import { sourceTime } from '@frameforge/shared';
import { formatTimecode, timelineDuration } from '@frameforge/shared';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useTimeline } from '@/lib/stores/timeline.store';
import { cn } from '@/lib/utils';

interface PreviewMonitorProps {
  projectId: string;
  projectWidth: number;
  projectHeight: number;
  fps: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  assets: MediaAsset[];
  signedUrls: Record<string, string>;
  onRef?: (el: HTMLDivElement | null) => void;
}

// How far around the playhead a clip's media element should exist
const WINDOW_SECONDS = 2.5;

export function PreviewMonitor({
  projectId,
  projectWidth,
  projectHeight,
  fps,
  isPlaying,
  onTogglePlay,
  assets,
  signedUrls,
}: PreviewMonitorProps) {
  const timeline = useTimeline((s) => s.timeline);
  const playhead = useTimeline((s) => s.playhead);
  const setPlayhead = useTimeline((s) => s.setPlayhead);
  const duration = timelineDuration(timeline);

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lastFrame = useRef<number>(0);

  const visibleClips = useMemo(() => {
    const tracks = timeline.tracks.filter((t) => t.visible);
    return timeline.clips.filter((c) => {
      const track = timeline.tracks.find((t) => t.id === c.trackId);
      if (!track || !track.visible || track.muted) return false;
      // clip must already be on screen at the time (simplest: window around playhead)
      return playhead >= c.start - WINDOW_SECONDS && playhead < c.start + c.duration + WINDOW_SECONDS;
    });
  }, [timeline, playhead]);

  const clipById = useMemo(() => new Map(timeline.clips.map((c) => [c.id, c])), [timeline]);

  // Ensure media elements exist for the visible clips and keep their playback in sync
  useEffect(() => {
    const needVideo = new Set<string>();
    const needAudio = new Set<string>();
    for (const clip of visibleClips) {
      if (clip.layerKind === 'video' && clip.mediaId) needVideo.add(clip.id);
      if (trackKind(timeline, clip.trackId) === 'audio' && clip.mediaId) needAudio.add(clip.id);
    }

    // prune stale
    for (const id of [...videoRefs.current.keys()]) {
      if (!needVideo.has(id)) {
        const v = videoRefs.current.get(id)!;
        v.pause();
        videoRefs.current.delete(id);
      }
    }
    for (const id of [...audioRefs.current.keys()]) {
      if (!needAudio.has(id)) {
        const a = audioRefs.current.get(id)!;
        a.pause();
        audioRefs.current.delete(id);
      }
    }

    // add / sync
    for (const clip of visibleClips) {
      const kind = trackKind(timeline, clip.trackId);
      if (kind === 'video' && (clip.layerKind === 'video' || clip.layerKind === 'image')) {
        const el = videoRefs.current.get(clip.id);
        if (el && clip.layerKind === 'video') {
          const target = sourceTime(clip, playhead);
          const inRange = playhead >= clip.start && playhead < clip.start + clip.duration;
          if (isPlaying && inRange) {
            if (Math.abs(el.currentTime - target) > 0.12) el.currentTime = target;
            if (el.paused) el.play().catch(() => {});
          } else {
            if (el.currentTime !== target && Math.abs(el.currentTime - target) > 0.15) el.currentTime = target;
            if (!el.paused) el.pause();
          }
          el.playbackRate = clip.speed;
        }
      }
      if (kind === 'audio' && clip.mediaId) {
        const el = audioRefs.current.get(clip.id);
        if (el) {
          const target = sourceTime(clip, playhead);
          const inRange = playhead >= clip.start && playhead < clip.start + clip.duration;
          if (isPlaying && inRange) {
            if (Math.abs(el.currentTime - target) > 0.12) el.currentTime = target;
            if (el.paused) el.play().catch(() => {});
          } else {
            if (!el.paused) el.pause();
          }
          el.playbackRate = clip.speed;
          el.volume = clip.volume;
        }
      }
    }
  }, [visibleClips, playhead, isPlaying, timeline]);

  // Stop everything on unmount
  useEffect(() => {
    const videos = videoRefs.current;
    const audios = audioRefs.current;
    return () => {
      videos.forEach((v) => v.pause());
      audios.forEach((a) => a.pause());
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Stage */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black/80 p-1">
        <div
          className="relative overflow-hidden rounded-lg bg-black shadow-2xl"
          style={{
            aspectRatio: `${projectWidth}/${projectHeight}`,
            maxHeight: '100%',
            maxWidth: '100%',
            width: '100%',
          }}
        >
          {/* Layers */}
          {timeline.tracks.map((track) => {
            if (!track.visible) return null;
            const trackClips = timeline.clips.filter((c) => c.trackId === track.id && playhead >= c.start - WINDOW_SECONDS && playhead < c.start + c.duration + WINDOW_SECONDS);
            return trackClips.map((clip) => {
              const trackKindKind = track.kind;
              const inRange = playhead >= clip.start && playhead < clip.start + clip.duration;
              const source = sourceTime(clip, playhead);
              const url = clip.mediaId ? signedUrls[clip.mediaId] : undefined;
              return (
                <Layer key={clip.id} clip={clip} inRange={inRange} url={url} timeline={timeline} trackKind={trackKindKind} videoRefs={videoRefs} />
              );
            });
          })}

          {/* Audio wave overlay strip for audio tracks — subtle */}
          {duration === 0 && timeline.clips.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-600">
              <Volume2 className="h-8 w-8" />
              <div className="text-xs">No clips yet — drag media onto a track</div>
            </div>
          )}


          {/* Hidden audio elements for audio-track clips */}
          {timeline.tracks.map((track) => {
            if (track.kind !== 'audio' || !track.visible || track.muted) return null;
            return timeline.clips
              .filter((c) => c.trackId === track.id && c.mediaId && playhead >= c.start - WINDOW_SECONDS && playhead < c.start + c.duration + WINDOW_SECONDS)
              .map((clip) => {
                const url = clip.mediaId ? signedUrls[clip.mediaId] : undefined;
                return (
                  <audio
                    key={clip.id}
                    ref={(el) => {
                      if (el) audioRefs.current.set(clip.id, el);
                      else audioRefs.current.delete(clip.id);
                    }}
                    src={url}
                    preload="auto"
                    style={{ display: 'none' }}
                  />
                );
              });
          })}

          {/* Safe zone: 90% inset guide */}
          <div className="pointer-events-none absolute inset-[5%] border border-white/10 rounded-sm" />
        </div>
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-between gap-3 border-t border-[--color-border-soft] bg-[--color-ink-900] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button className="rounded p-1.5 text-zinc-400 hover:text-white hover:bg-white/5" onClick={() => setPlayhead(0)} title="Go to start">
            <SkipBack className="h-4 w-4" />
          </button>
          <button className="rounded p-1.5 text-zinc-400 hover:text-white hover:bg-white/5" onClick={() => setPlayhead(Math.max(0, playhead - 1 / fps))} title="Frame back">
            <span className="text-[10px] font-bold px-1">◂</span>
          </button>
          <button
            onClick={onTogglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-white hover:bg-indigo-400"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
          </button>
          <button className="rounded p-1.5 text-zinc-400 hover:text-white hover:bg-white/5" onClick={() => setPlayhead(Math.min(duration, playhead + 1 / fps))} title="Frame forward">
            <span className="text-[10px] font-bold px-1">▸</span>
          </button>
          <button className="rounded p-1.5 text-zinc-400 hover:text-white hover:bg-white/5" onClick={() => setPlayhead(duration)} title="Go to end">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-zinc-200">
          <span className="rounded bg-zinc-800/80 px-2 py-1 text-indigo-300">{formatTimecode(playhead, fps)}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-500">{formatTimecode(duration, fps)}</span>
        </div>

        <div className="text-[10px] text-zinc-500">{fps} fps · {projectWidth}×{projectHeight}</div>
      </div>
    </div>
  );
}

function trackKind(timeline: ProjectTimeline, trackId: string): 'video' | 'audio' {
  return timeline.tracks.find((t) => t.id === trackId)?.kind ?? 'video';
}

function Layer({
  clip,
  inRange,
  url,
  timeline,
  trackKind,
  videoRefs,
}: {
  clip: TimelineClip;
  inRange: boolean;
  url?: string;
  timeline: ProjectTimeline;
  trackKind: 'video' | 'audio';
  videoRefs: React.MutableRefObject<Map<string, HTMLVideoElement>>;
}) {
  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    opacity: inRange ? clip.opacity : 0,
    transform: `translate(${clip.transform.x * 100}%, ${clip.transform.y * 100}%) rotate(${clip.transform.rotation}deg) scale(${clip.transform.scale})`,
    transition: 'opacity 120ms linear',
  };

  if (clip.layerKind === 'solid') {
    return <div style={{ ...style, background: clip.solidColor ?? '#18181b' }} />;
  }
  if (clip.layerKind === 'text') {
    return (
      <div style={style} className="flex items-center justify-center">
        <div className="text-center font-bold text-white drop-shadow-lg" style={{ fontSize: 'clamp(18px, 4vw, 64px)', color: clip.solidColor ?? '#ffffff' }}>
          {clip.text ?? clip.name}
        </div>
      </div>
    );
  }
  if (clip.layerKind === 'image') {
    return url ? <img src={url} alt={clip.name} style={{ ...style, objectFit: 'contain' }} /> : null;
  }
  if (trackKind === 'audio') return null; // audio has no visual
  if (clip.layerKind === 'video') {
    return (
      <video
        ref={(el) => {
          if (el) videoRefs.current.set(clip.id, el);
          else videoRefs.current.delete(clip.id);
        }}
        src={url}
        muted
        playsInline
        preload="auto"
        style={{ ...style, objectFit: 'contain', width: '100%', height: '100%' }}
      />
    );
  }
  return null;
}
