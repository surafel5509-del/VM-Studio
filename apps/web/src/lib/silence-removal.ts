'use client';

/**
 * Shared silence-removal logic: splits audio clips at silent spans and
 * drops the silent segments. Runs as a single undoable store commit.
 */
import { useTimeline } from '@/lib/stores/timeline.store';
import { computeKeepSegments } from '@/lib/audio-analysis';
import type { TimelineClip } from '@frameforge/shared';

export async function applySilenceRemoval(options: {
  ensureUrls: () => Promise<Record<string, string>>;
}): Promise<{ clipsProcessed: number; clipsWithSilence: number }> {
  const store = useTimeline.getState();
  const timeline = store.timeline;
  const urls = await options.ensureUrls();

  const audioClips = timeline.clips.filter((c) => {
    const track = timeline.tracks.find((t) => t.id === c.trackId);
    return track?.kind === 'audio' && Boolean(c.mediaId);
  });

  if (audioClips.length === 0) {
    throw new Error('No audio clips found on the timeline. Add audio clips first.');
  }

  let next = timeline;
  let clipsProcessed = 0;
  let clipsWithSilence = 0;

  for (const clip of audioClips) {
    const current = next.clips.find((c) => c.id === clip.id);
    if (!current) continue;
    const url = current.mediaId ? urls[current.mediaId] : undefined;
    if (!url) {
      throw new Error(`Could not load media for "${current.name}" (signed URL failed).`);
    }
    const sourceDuration = current.duration * current.speed;
    const keep = await computeKeepSegments(url, current.inPoint, sourceDuration);
    const coveredSource = (keep.reduce((sum, s) => sum + (s.end - s.start), 0));
    const before = current.duration * current.speed;
    if (keep.length === 1 && keep[0]!.start <= current.inPoint + 0.1 && keep[0]!.end >= current.inPoint + before - 0.1) {
      clipsProcessed++;
      continue; // nothing to remove — skip
    }
    if (keep.length === 0) {
      // whole clip is silence — removing everything would be wrong; keep it unchanged
      clipsProcessed++;
      continue;
    }

    const newClips: TimelineClip[] = keep.map((seg) => ({
      ...current,
      id: crypto.randomUUID(),
      start: current.start + (seg.start - current.inPoint) / current.speed,
      duration: (seg.end - seg.start) / current.speed,
      inPoint: seg.start,
      outPoint: seg.end,
      createdAt: Date.now(),
    }));

    next = {
      ...next,
      clips: [...next.clips.filter((c) => c.id !== current.id), ...newClips],
    };
    clipsProcessed++;
    clipsWithSilence++;
  }

  if (clipsWithSilence > 0) {
    const s = useTimeline.getState();
    useTimeline.setState((prev) => ({
      timeline: next,
      history: {
        past: [...prev.history.past, prev.timeline],
        present: next,
        future: [],
        limit: prev.history.limit,
      },
    }));
  }
  return { clipsProcessed, clipsWithSilence };
}
