/**
 * Video export engine.
 *
 * Renders the timeline (video/image/solid/text layers) onto a canvas and
 * records it via MediaRecorder into a playable WebM file.
 *
 * This is an honest, self-contained renderer — it does NOT use ffmpeg and
 * cannot produce MP4/MOV. For MP4/MOV export see docs/rendering.md: a server
 * worker with ffmpeg is required for those formats.
 */
import type { ProjectTimeline, MediaAsset, TimelineClip } from '@frameforge/shared';
import { sourceTime } from '@frameforge/shared';

export interface ExportVideoOptions {
  timeline: ProjectTimeline;
  width: number;
  height: number;
  fps: number;
  /** map of mediaId -> playable URL */
  mediaUrls: Map<string, string>;
  mimeType?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

interface LoadedMedia {
  video: HTMLVideoElement | null;
  image: HTMLImageElement | null;
  clip: TimelineClip;
}

function chooseMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4', // not video/mp4 in all browsers; guarded by isTypeSupported below
  ];
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c) && !c.includes('mp4')) return c;
  }
  return 'video/webm';
}

function loadMedia(clip: TimelineClip, url: string): Promise<LoadedMedia> {
  return new Promise((resolve) => {
    if (clip.layerKind === 'video' || clip.layerKind === 'audio') {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = true; // video track: muted during canvas record; audio handled separately
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve({ video, image: null, clip });
      };
      video.onloadedmetadata = done;
      video.onerror = done;
      setTimeout(done, 20000);
      video.src = url;
      return;
    }
    const image = document.createElement('img');
    image.crossOrigin = 'anonymous';
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve({ video: null, image, clip });
    };
    image.onload = done;
    image.onerror = done;
    setTimeout(done, 20000);
    image.src = url;
  });
}

export async function exportTimelineVideo(options: ExportVideoOptions): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser.');
  }
  const { timeline, width, height, fps, mediaUrls, onProgress, signal } = options;
  const duration = Math.max(0.5, timeline.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0));
  const mimeType = options.mimeType ?? chooseMimeType();

  // Gather clips that need media and load them in parallel
  const clipsWithMedia = timeline.clips.filter((c) => c.mediaId && mediaUrls.has(c.mediaId));
  const loaded: LoadedMedia[] = await Promise.all(
    clipsWithMedia.map(async (clip) => {
      const url = mediaUrls.get(clip.mediaId!)!;
      return loadMedia(clip, url);
    }),
  );
  if (signal?.aborted) throw new Error('Export cancelled');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const recorder = new MediaRecorder(canvas.captureStream(fps), { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const recordingDone = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(100);

  const frameDuration = 1 / fps;
  let time = 0;
  let i = 0;
  let framesProduced = 0;

  const drawFrame = async (t: number) => {
    // clear
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, width, height);

    const trackById = new Map(timeline.tracks.map((tr) => [tr.id, tr]));
    const sortedVisibleClips = timeline.clips
      .filter((c) => {
        const tr = trackById.get(c.trackId);
        if (!tr || !tr.visible || tr.muted) return false;
        return t >= c.start && t < c.start + c.duration;
      })
      .sort((a, b) => {
        const ta = trackById.get(a.trackId);
        const tb = trackById.get(b.trackId);
        const ai = timeline.tracks.findIndex((tr) => tr.id === a.trackId);
        const bi = timeline.tracks.findIndex((tr) => tr.id === b.trackId);
        return bi - ai; // topmost first (earlier track index = visually on top)
      });

    for (const clip of sortedVisibleClips) {
      const local = t - clip.start;
      const source = sourceTime(clip, t);
      ctx.save();
      ctx.globalAlpha = clip.opacity;
      const cx = width / 2 + clip.transform.x * width;
      const cy = height / 2 + clip.transform.y * height;
      ctx.translate(cx, cy);
      ctx.rotate((clip.transform.rotation * Math.PI) / 180);
      ctx.scale(clip.transform.scale, clip.transform.scale);
      ctx.translate(-cx, -cy);

      if (clip.layerKind === 'solid') {
        ctx.fillStyle = clip.solidColor ?? '#18181b';
        ctx.fillRect(0, 0, width, height);
      } else if (clip.layerKind === 'text') {
        ctx.fillStyle = clip.solidColor ?? '#ffffff';
        ctx.font = `700 ${Math.floor(height * 0.12)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(clip.text ?? clip.name, cx, cy);
      } else {
        const loadedOne = loaded.find((l) => l.clip.id === clip.id);
        if (loadedOne?.image && clip.layerKind === 'image') {
          const img = loadedOne.image;
          ctx.drawImage(img, 0, 0, width, height);
        } else if (loadedOne?.video && clip.layerKind === 'video') {
          const v = loadedOne.video;
          // Sync video element to the source time (tolerate tiny seek drift)
          const target = Math.max(0, source);
          if (Math.abs(v.currentTime - target) > 0.08) {
            try {
              v.currentTime = target;
              await waitForVideoSeek(v, target, 800);
            } catch {
              // seek failed; draw last-known frame rather than stall
            }
          }
          try {
            // Letterbox to preserve aspect
            const vW = v.videoWidth || width;
            const vH = v.videoHeight || height;
            const scale = Math.min(width / vW, height / vH);
            const dw = vW * scale;
            const dh = vH * scale;
            ctx.drawImage(v, (width - dw) / 2, (height - dh) / 2, dw, dh);
          } catch {
            // ignore frame draw failure
          }
        }
      }
      ctx.restore();
    }
  };

  while (time < duration && framesProduced < Math.ceil(duration * fps)) {
    if (signal?.aborted) {
      recorder.stop();
      throw new Error('Export cancelled');
    }
    await drawFrame(time);
    time += frameDuration;
    framesProduced++;
    onProgress?.(Math.min(1, framesProduced / Math.ceil(duration * fps)));
    i++;
  }

  recorder.stop();
  await recordingDone;
  const blob = new Blob(chunks, { type: mimeType });
  // cleanup
  for (const l of loaded) {
    if (l.video) {
      l.video.pause();
      l.video.removeAttribute('src');
      l.video.load();
    }
  }
  return blob;
}

function waitForVideoSeek(v: HTMLVideoElement, target: number, timeoutMs = 800): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (Math.abs(v.currentTime - target) < 0.25 || Date.now() - started > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function makeFileName(base: string, ext: string): string {
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'frameforge';
  return `${safe}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
}
