'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTimelineProject } from '@/lib/use-timeline-project';
import { useTimeline } from '@/lib/stores/timeline.store';
import { useMedia as useMediaRef } from '@/lib/stores/media.store';
import { sourceTime } from '@frameforge/shared';
import type { TimelineClip } from '@frameforge/shared';

/**
 * Returns the active (topmost visible, at playhead) video/image clip
 * plus a hidden <video>/<img> element bound to it.
 */
export function useActiveVideoFrame(projectId: string) {
  const { timeline, ready } = useTimelineProject(projectId);
  const playhead = useTimeline((s) => s.playhead);
  const mediaStore = useMediaRef();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLVideoElement | HTMLImageElement | null>(null);

  const activeClip = useMemo<TimelineClip | null>(() => {
    const clips = timeline.clips.filter((c) => c.layerKind === 'video' || c.layerKind === 'image');
    for (let i = clips.length - 1; i >= 0; i--) {
      const c = clips[i]!;
      const t = timeline.tracks.find((tr) => tr.id === c.trackId);
      if (!t || !t.visible || t.muted) continue;
      if (playhead >= c.start && playhead < c.start + c.duration) return c;
    }
    return null;
  }, [timeline, playhead]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeClip?.mediaId) { setVideoUrl(null); return; }
      const asset = mediaStore.assets.find((a) => a.id === activeClip.mediaId);
      if (!asset) return;
      const url = await mediaStore.getSignedUrl(asset.storage_path);
      if (!cancelled) setVideoUrl(url);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.mediaId, mediaStore.assets.length]);

  const videoRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => setLoaded(false), [videoUrl]);

  const captureFrame = useCallback(() => {
    const el = videoRef.current;
    if (!el || !activeClip) return;
    const isVideo = el instanceof HTMLVideoElement;
    const w = isVideo ? el.videoWidth || 1920 : (el as HTMLImageElement).naturalWidth || 1920;
    const h = isVideo ? el.videoHeight || 1080 : (el as HTMLImageElement).naturalHeight || 1080;
    return { el, width: w, height: h };
  }, [activeClip]);

  // set current time for video clips
  useEffect(() => {
    const el = videoRef.current;
    if (!activeClip || !(el instanceof HTMLVideoElement)) return;
    const source = sourceTime(activeClip, playhead);
    if (Math.abs(el.currentTime - source) > 0.15) el.currentTime = source;
  }, [activeClip, playhead]);

  return { timeline, ready, activeClip, videoUrl, videoRef, loaded, setLoaded, captureFrame, playhead };
}
