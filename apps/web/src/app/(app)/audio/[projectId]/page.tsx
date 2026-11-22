'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTimelineProject } from '@/lib/use-timeline-project';
import { useTimeline } from '@/lib/stores/timeline.store';
import { useAuth } from '@/lib/stores/auth.store';
import { Panel, Badge, Button, Spinner, EmptyState } from '@/components/ui';
import { Waves, Trash2, Download, Loader2 } from 'lucide-react';
import { computePeaks, detectSilence, windowRMS } from '@frameforge/shared';
import { getAudioContext } from '@/lib/audio-analysis';
import { applySilenceRemoval } from '@/lib/silence-removal';
import { getSupabase } from '@/lib/supabase';

const WINDOW = 40;

export default function AudioPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { media, timeline, ready } = useTimelineProject(projectId);
  const setVolume = useTimeline((s) => s.setVolume);
  const { user } = useAuth();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [peaksByClip, setPeaksByClip] = useState<Record<string, Parameters<typeof computePeaks>[0]>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [waveforms, setWaveforms] = useState<Record<string, { peaks: ReturnType<typeof computePeaks>; duration: number }>>({});
  const [error, setError] = useState<string | null>(null);

  const audioClips = useMemo(
    () => timeline.clips.filter((c) => {
      const t = timeline.tracks.find((tr) => tr.id === c.trackId);
      return t?.kind === 'audio';
    }),
    [timeline],
  );

  // resolve signed urls for assets
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const newUrls: Record<string, string> = {};
      const assets = new Set(audioClips.map((c) => c.mediaId).filter(Boolean) as string[]);
      for (const id of assets) {
        if (urls[id]) continue;
        const asset = media.assets.find((a) => a.id === id);
        if (!asset) continue;
        const url = await media.getSignedUrl(asset.storage_path);
        if (url) newUrls[id] = url;
      }
      if (!cancelled) setUrls((prev) => ({ ...prev, ...newUrls }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioClips.length, media.assets.length]);

  // render waveforms
  useEffect(() => {
    let cancelled = false;
    for (const clip of audioClips) {
      if (!clip.mediaId || waveforms[clip.id]) continue;
      const url = urls[clip.mediaId];
      if (!url) continue;
      (async () => {
        try {
          setAnalyzing(clip.id);
          const ctx = getAudioContext();
          const res = await fetch(url);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          if (cancelled) return;
          const data = buf.getChannelData(0); // mono preview
          const windowCount = 220;
          const peaks = computePeaks(data, buf.sampleRate, windowCount);
          setWaveforms((prev) => ({ ...prev, [clip.id]: { peaks, duration: buf.duration } }));
        } catch {
          // waveform unavailable — display without peaks
        } finally {
          if (!cancelled) setAnalyzing(null);
        }
      })();
    }
    return () => { cancelled = true; };
  }, [audioClips, urls, waveforms]);

  const removeSilence = async () => {
    setProcessing(true);
    setMessage(null);
    setError(null);
    try {
      const result = await applySilenceRemoval({
        ensureUrls: async () => {
          const out: Record<string, string> = {};
          for (const clip of useTimeline.getState().timeline.clips) {
            if (!clip.mediaId || out[clip.mediaId]) continue;
            const asset = media.assets.find((a) => a.id === clip.mediaId);
            if (!asset) continue;
            const url = await media.getSignedUrl(asset.storage_path);
            if (url) out[clip.mediaId] = url;
          }
          return out;
        },
      });
      setMessage(`Silence removal complete: ${result.clipsWithSilence} of ${result.clipsProcessed} clip(s) had silence removed (undoable).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silence removal failed');
    } finally {
      setProcessing(false);
    }
  };

  const exportWav = async () => {
    const { exportTimelineAudio } = await import('@/lib/export/audio-export');
    const audioUrls = new Map<string, string>();
    for (const id of new Set(audioClips.map((c) => c.mediaId).filter(Boolean) as string[])) {
      const url = urls[id];
      if (url) audioUrls.set(id, url);
    }
    const blob = await exportTimelineAudio({ timeline: useTimeline.getState().timeline, mediaUrls: audioUrls });
    const { downloadBlob, makeFileName } = await import('@/lib/export/video-export');
    downloadBlob(blob, makeFileName('audio-mix', 'wav'));
  };

  const silenceCount = useMemo(() => {
    let total = 0;
    for (const clip of audioClips) {
      const wf = waveforms[clip.id];
      if (!wf) continue;
      total += detectSilence(wf.peaks, 44100, wf.peaks.length, wf.duration, 0.02, 0.4).length;
    }
    return total;
  }, [audioClips, waveforms]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Audio Studio</h1>
          <p className="text-xs text-zinc-500">Waveforms, volume and silence removal for your project</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="text-xs" onClick={removeSilence} disabled={processing || audioClips.length === 0}>
            {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {processing ? 'Removing…' : 'Remove silence'}
          </Button>
          <Button variant="primary" className="text-xs" onClick={exportWav} disabled={audioClips.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export WAV
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {!ready && <div className="flex justify-center py-16"><Spinner /></div>}

        {ready && audioClips.length === 0 && (
          <EmptyState
            icon={<Waves className="h-6 w-6" />}
            title="No audio clips"
            hint="Add audio clips to timeline audio tracks in the Video Editor first."
          />
        )}

        {message && <p className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{message}</p>}
        {error && <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        {ready && audioClips.length > 0 && (
          <div className="flex flex-col gap-4">
            <Panel title="Silence detection">
              <div className="flex items-center gap-3 p-3">
                <Waves className="h-5 w-5 text-indigo-400" />
                <div className="flex-1">
                  <div className="text-sm text-zinc-200">{silenceCount} silent region{silenceCount === 1 ? '' : 's'} detected</div>
                  <div className="text-[11px] text-zinc-500">Click “Remove silence” to cut them out — the timeline stays undoable.</div>
                </div>
              </div>
            </Panel>

            {audioClips.map((clip) => (
              <Panel key={clip.id} title={clip.name} actions={<Badge tone="info">{clip.layerKind}</Badge>}>
                <div className="p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex-1">
                      {waveforms[clip.id] ? (
                        <Waveform peaks={waveforms[clip.id]!.peaks} currentTime={useTimeline.getState().playhead} />
                      ) : (
                        <div className="flex h-16 items-center justify-center rounded bg-zinc-900 text-[10px] text-zinc-600">
                          {analyzing === clip.id ? 'Analyzing waveform…' : 'Waveform unavailable'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Volume</label>
                      <input
                        type="range" min={0} max={100} step={1} value={clip.volume * 100}
                        onChange={(e) => setVolume(clip.id, Number(e.target.value) / 100)}
                        className="w-full accent-indigo-500"
                      />
                      <div className="text-[10px] font-mono text-zinc-400">{Math.round(clip.volume * 100)}%</div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Speed</label>
                      <div className="text-[11px] font-mono text-zinc-300">{clip.speed.toFixed(2)}x</div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Duration</label>
                      <div className="text-[11px] font-mono text-zinc-300">{clip.duration.toFixed(2)}s</div>
                    </div>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Waveform({ peaks, currentTime }: { peaks: ReturnType<typeof computePeaks>; currentTime: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0c0c10';
    ctx.fillRect(0, 0, r.width, r.height);
    const mid = r.height / 2;
    const barW = r.width / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i]!;
      const x = i * barW;
      const min = p.min;
      const max = p.max;
      const top = mid + min * (r.height * 0.45);
      const bottom = mid + max * (r.height * 0.45);
      ctx.fillStyle = i / peaks.length < 1 ? (max * max > 0.6 ? '#818cf8' : '#6366f1') : '#6366f1';
      ctx.fillRect(x + 0.5, Math.min(top, bottom), Math.max(1, barW - 1), Math.max(1.5, Math.abs(bottom - top)));
    }
    // center line
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, mid, r.width, 1);
  }, [peaks, currentTime]);

  return <canvas ref={canvasRef} className="h-16 w-full rounded" />;
}
