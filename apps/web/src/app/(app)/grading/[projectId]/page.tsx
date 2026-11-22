'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTimelineProject } from '@/lib/use-timeline-project';
import { useTimeline } from '@/lib/stores/timeline.store';
import { useMedia as useMediaRef } from '@/lib/stores/media.store';
import { Panel, Badge, Button, Spinner, EmptyState, Field, TextInput, Toggle } from '@/components/ui';
import { Palette, Play, Pause, RotateCcw, Sun, ThermometerSun, Droplets } from 'lucide-react';
import { sourceTime } from '@frameforge/shared';
import clsx from 'clsx';

interface GradeParams {
  exposure: number; // -2..2
  contrast: number; // 0..2
  saturation: number; // 0..2
  temperature: number; // -100..100
  tint: number; // -100..100
  lift: [number, number, number];
  gamma: number;
  gain: [number, number, number];
  shadows: number; // -100..100
  highlights: number; // -100..100
}

const DEFAULT_GRADE: GradeParams = {
  exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0,
  lift: [0, 0, 0], gamma: 1, gain: [1, 1, 1], shadows: 0, highlights: 0,
};

export default function GradingPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { timeline, ready } = useTimelineProject(projectId);
  const playhead = useTimeline((s) => s.playhead);

  const [grade, setGrade] = useState<GradeParams>(DEFAULT_GRADE);
  const [frame, setFrame] = useState<ImageData | null>(null);
  const [frameDuration, setFrameDuration] = useState(0);
  const [mixMode, setMixMode] = useState<'preview' | 'graded'>('preview');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const paradeRef = useRef<HTMLCanvasElement>(null);
  const vectorRef = useRef<HTMLCanvasElement>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // visible video-track clip at playhead
  const activeClip = useMemo(() => {
    const clips = timeline.clips.filter((c) => c.layerKind === 'video' || c.layerKind === 'image');
    for (let i = clips.length - 1; i >= 0; i--) {
      const c = clips[i]!;
      const t = timeline.tracks.find((tr) => tr.id === c.trackId);
      if (!t || !t.visible || t.muted) continue;
      if (playhead >= c.start && playhead < c.start + c.duration) return c;
    }
    return null;
  }, [timeline, playhead]);

  // capture frame
  const captureFrame = useCallback(() => {
    if (!activeClip || !videoElRef.current) return;
    const video = videoElRef.current;
    const w = 640;
    const h = Math.round((video.videoHeight || 1080) * (w / (video.videoWidth || 1920)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx || !activeClip.mediaId) return;
    try {
      ctx.drawImage(video, 0, 0, w, h);
      setFrame(ctx.getImageData(0, 0, w, h));
      setFrameDuration(video.duration || 0);
    } catch (e) {
      // not safe to draw (e.g., CORS) — ignore
    }
  }, [activeClip]);

  // sync video element to playhead when scrubbing
  useEffect(() => {
    const video = videoElRef.current;
    if (!video || !activeClip) return;
    const source = sourceTime(activeClip, playhead);
    if (Math.abs(video.currentTime - source) > 0.2) video.currentTime = source;
    const raf = requestAnimationFrame(captureFrame);
    return () => cancelAnimationFrame(raf);
  }, [activeClip, playhead, captureFrame]);

  // grading + scopes drawing
  useEffect(() => {
    drawGraded(canvasRef, frame, grade, mixMode);
    drawScopes(waveRef, paradeRef, vectorRef, frame);
  }, [frame, grade, mixMode]);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Fetch signed URL for the active clip's media
  const mediaStore = useMediaRef();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeClip?.mediaId) return;
      const asset = mediaStore.assets.find((a) => a.id === activeClip.mediaId);
      if (!asset) return;
      const url = await mediaStore.getSignedUrl(asset.storage_path);
      if (!cancelled) setVideoUrl(url);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.mediaId, mediaStore.assets.length]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Color Grading</h1>
          <p className="text-xs text-zinc-500">Real-time grading on the active video frame</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="subtle" className="text-[11px]" onClick={() => setGrade(DEFAULT_GRADE)}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Center: preview + scopes */}
        <div className="flex flex-1 min-w-0 flex-col bg-black/70">
          <div className="relative flex flex-1 items-center justify-center p-4 min-h-0">
            {!activeClip ? (
              <EmptyState icon={<Palette className="h-6 w-6" />} title="No gradeable frame" hint="Add a video clip and scrub to it in the Video Editor." />
            ) : (
              <div className="relative max-h-full max-w-full">
                {/* hidden video element to capture frames */}
                <video ref={videoElRef} src={videoUrl ?? undefined} muted playsInline preload="auto" style={{ display: 'none' }} />
                <canvas ref={canvasRef} className="max-h-full max-w-full rounded-lg shadow-2xl" style={{ maxHeight: '100%', maxWidth: '100%' }} />
              </div>
            )}
          </div>

          {/* Scopes */}
          <div className="grid grid-cols-3 gap-2 border-t border-[--color-border-soft] bg-[--color-ink-900] p-2">
            <Panel title="Waveform"><canvas ref={waveRef} className="h-24 w-full" /></Panel>
            <Panel title="RGB parade"><canvas ref={paradeRef} className="h-24 w-full" /></Panel>
            <Panel title="Vectorscope"><canvas ref={vectorRef} className="h-24 w-full" /></Panel>
          </div>
        </div>

        {/* Right: controls */}
        <aside className="w-64 shrink-0 overflow-y-auto border-l border-[--color-border-soft] bg-[--color-ink-900] p-3">
          <div className="flex flex-col gap-3">
            <Control label="Exposure" value={grade.exposure.toFixed(2)} tone={grade.exposure !== 0 ? 'indigo' : 'default'}>
              <input type="range" min={-2} max={2} step={0.05} value={grade.exposure} onChange={(e) => setGrade({ ...grade, exposure: Number(e.target.value) })} className="w-full accent-indigo-500" />
            </Control>
            <Control label="Contrast" value={grade.contrast.toFixed(2)}>
              <input type="range" min={0.2} max={2} step={0.01} value={grade.contrast} onChange={(e) => setGrade({ ...grade, contrast: Number(e.target.value) })} className="w-full accent-indigo-500" />
            </Control>
            <Control label="Saturation" value={grade.saturation.toFixed(2)}>
              <input type="range" min={0} max={2.5} step={0.05} value={grade.saturation} onChange={(e) => setGrade({ ...grade, saturation: Number(e.target.value) })} className="w-full accent-indigo-500" />
            </Control>
            <Control label="Temperature" value={String(grade.temperature)}>
              <input type="range" min={-100} max={100} step={1} value={grade.temperature} onChange={(e) => setGrade({ ...grade, temperature: Number(e.target.value) })} className="w-full accent-indigo-500" />
            </Control>
            <Control label="Tint" value={String(grade.tint)}>
              <input type="range" min={-100} max={100} step={1} value={grade.tint} onChange={(e) => setGrade({ ...grade, tint: Number(e.target.value) })} className="w-full accent-indigo-500" />
            </Control>
            <Control label="Shadows" value={String(grade.shadows)}>
              <input type="range" min={-100} max={100} step={1} value={grade.shadows} onChange={(e) => setGrade({ ...grade, shadows: Number(e.target.value) })} className="w-full accent-indigo-500" />
            </Control>
            <Control label="Highlights" value={String(grade.highlights)}>
              <input type="range" min={-100} max={100} step={1} value={grade.highlights} onChange={(e) => setGrade({ ...grade, highlights: Number(e.target.value) })} className="w-full accent-indigo-500" />
            </Control>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Control({ label, value, children, tone }: { label: string; value: string; children: React.ReactNode; tone?: 'indigo' | 'default' }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className={clsx('font-mono text-zinc-200', tone === 'indigo' && 'text-indigo-300')}>{value}</span>
      </div>
      {children}
    </div>
  );
}

// helper expecting a ref canvas + frame image — draw waveform/parade/vectorscope
function drawGraded(canvasRef: React.RefObject<HTMLCanvasElement | null>, frame: ImageData | null, grade: GradeParams, mode: 'preview' | 'graded') {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (!frame) return;
  const w = frame.width;
  const h = frame.height;
  if (canvas.width !== w) { canvas.width = w; canvas.height = h; }

  const src = new ImageData(new Uint8ClampedArray(frame.data), w, h);
  const data = src.data;
  const exposure = Math.pow(2, grade.exposure);
  const contrast = grade.contrast;
  const sat = grade.saturation;
  const temp = grade.temperature / 100;
  const tint = grade.tint / 100;
  const sh = grade.shadows / 100;
  const hi = grade.highlights / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]! / 255;
    let g = data[i + 1]! / 255;
    let b = data[i + 2]! / 255;

    // exposure
    r *= exposure; g *= exposure; b *= exposure;

    // temperature / tint
    r += temp * 0.08; b -= temp * 0.08;
    g += tint * 0.08; r -= tint * 0.04; b -= tint * 0.04;

    // contrast around 0.5
    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    // shadows/highlights (smooth lift on dark / darken on bright)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadowAmount = Math.max(0, 0.5 - lum) / 0.5;
    const highlightAmount = Math.max(0, lum - 0.5) / 0.5;
    r += sh * shadowAmount * 0.25;
    g += sh * shadowAmount * 0.25;
    b += sh * shadowAmount * 0.25;
    r += hi * highlightAmount * 0.25;
    g += hi * highlightAmount * 0.25;
    b += hi * highlightAmount * 0.25;

    // saturation
    const lum2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum2 + (r - lum2) * sat;
    g = lum2 + (g - lum2) * sat;
    b = lum2 + (b - lum2) * sat;

    // lift/gamma/gain
    r = Math.max(0, r + grade.lift[0] / 255);
    g = Math.max(0, g + grade.lift[1] / 255);
    b = Math.max(0, b + grade.lift[2] / 255);
    r = Math.pow(Math.max(0, r), 1 / Math.max(0.01, grade.gamma));
    g = Math.pow(Math.max(0, g), 1 / Math.max(0.01, grade.gamma));
    b = Math.pow(Math.max(0, b), 1 / Math.max(0.01, grade.gamma));
    r *= grade.gain[0]; g *= grade.gain[1]; b *= grade.gain[2];

    data[i] = Math.max(0, Math.min(255, r * 255));
    data[i + 1] = Math.max(0, Math.min(255, g * 255));
    data[i + 2] = Math.max(0, Math.min(255, b * 255));
    data[i + 3] = 255;
  }

  ctx.putImageData(src, 0, 0);
}

function drawScopes(waveRef: React.RefObject<HTMLCanvasElement | null>, paradeRef: React.RefObject<HTMLCanvasElement | null>, vectorRef: React.RefObject<HTMLCanvasElement | null>, frame: ImageData | null) {
  if (!frame) return;
  const w = frame.width;
  const h = frame.height;
  const data = frame.data;

  // Waveform: luminance column averages
  const wave = waveRef.current;
  if (wave) {
    const r = wave.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    wave.width = r.width * dpr; wave.height = r.height * dpr;
    const ctx = wave.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, 0, r.width, r.height);
      const step = Math.max(1, Math.floor(w / r.width));
      for (let x = 0; x < r.width; x++) {
        let sum = 0; let cnt = 0;
        for (let y = 0; y < h; y += Math.max(1, Math.floor(h / r.height))) {
          const i = (y * w + Math.floor(x * step)) * 4;
          const lum = (data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722) / 255;
          sum += lum; cnt++;
        }
        if (cnt === 0) continue;
        const avg = sum / cnt;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x, r.height - avg * r.height, 1, avg * r.height);
      }
    }
  }

  // RGB parade: per-column averages for each channel
  const par = paradeRef.current;
  if (par) {
    const r = par.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    par.width = r.width * dpr; par.height = r.height * dpr;
    const ctx = par.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, 0, r.width, r.height);
      const segH = r.height / 3;
      const colors = ['#ef4444', '#22c55e', '#3b82f6'];
      for (let ch = 0; ch < 3; ch++) {
        ctx.beginPath();
        ctx.moveTo(0, (ch + 1) * segH);
        for (let x = 0; x < r.width; x++) {
          let sum = 0; let cnt = 0;
          for (let y = 0; y < h; y += Math.max(1, Math.floor(h / r.height))) {
            const i = (y * w + Math.floor((x / r.width) * w)) * 4 + ch;
            sum += data[i]!; cnt++;
          }
          const avg = cnt ? sum / cnt / 255 : 0;
          ctx.lineTo(x, (ch + 1) * segH - avg * segH);
        }
        ctx.lineTo(r.width, (ch + 1) * segH);
        ctx.closePath();
        ctx.fillStyle = colors[ch] ?? '#888';
        ctx.globalAlpha = 0.45;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // Vectorscope: chroma points
  const vec = vectorRef.current;
  if (vec) {
    const r = vec.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    vec.width = r.width * dpr; vec.height = r.height * dpr;
    const ctx = vec.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, 0, r.width, r.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(r.width / 2, r.height / 2, Math.min(r.width, r.height) / 2 - 4, 0, Math.PI * 2);
      ctx.stroke();
      // sample points
      const cx = r.width / 2;
      const cy = r.height / 2;
      const radius = Math.min(r.width, r.height) / 2 - 6;
      for (let i = 0; i < w * h * 0.05; i++) {
        const idx = Math.floor(Math.random() * w * h) * 4;
        const r0 = data[idx]!, g = data[idx + 1]!, b = data[idx + 2]!;
        const u = 0.492 * (b - g) / 255;
        const v = 0.877 * (r0 - g) / 255;
        const px = cx + u * radius * 1.8;
        const py = cy - v * radius * 1.8;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }
  }
}
