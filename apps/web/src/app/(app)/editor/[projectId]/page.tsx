'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTimeline } from '@/lib/stores/timeline.store';
import { useProjects } from '@/lib/stores/project.store';
import { useMedia } from '@/lib/stores/media.store';
import { useAuth } from '@/lib/stores/auth.store';
import { getSupabase } from '@/lib/supabase';
import type { TimelineClip, TrackKind } from '@frameforge/shared';
import { timelineDuration } from '@frameforge/shared';
import { Timeline } from '@/components/editor/Timeline';
import { PreviewMonitor } from '@/components/editor/PreviewMonitor';
import { Inspector } from '@/components/editor/Inspector';
import { MediaPanel } from '@/components/editor/MediaPanel';
import { AiAssistant } from '@/components/editor/AiAssistant';
import { Button, Badge, Spinner } from '@/components/ui';
import { Download, Sparkles, RefreshCw, Save } from 'lucide-react';

export default function EditorPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { projects, loadProjects, updateProject } = useProjects();
  const { user } = useAuth();
  const media = useMedia();

  const project = useMemo(() => projects.find((p) => p.id === projectId) ?? null, [projects, projectId]);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [exporting, setExporting] = useState<null | 'video' | 'audio'>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // load + persist
  const { timeline, loadTimeline, loadDefault, projectId: tlProjectId, selectClip, removeClip, undo, redo, setPlaying, playing, playhead, setPlayhead } = useTimeline();

  const load = useCallback(async () => {
    if (!projectId || !user) return;
    const supabase = getSupabase();
    const { data } = await supabase.from('timeline_states').select('data, version').eq('project_id', projectId).maybeSingle();
    if (data?.data && typeof data.data === 'object' && data.data.tracks) {
      loadTimeline(data.data, projectId);
    } else {
      loadDefault(projectId);
    }
    // load media list for this project
    await media.load();
    setSessionChecked(true);
  }, [projectId, user, loadTimeline, loadDefault, media]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  // autosave (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  const handleAutosave = useCallback(() => {
    if (!projectId || !user) return;
    const serialized = JSON.stringify(timeline);
    if (serialized === lastSavedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        const supabase = getSupabase();
        const { data: existing } = await supabase.from('timeline_states').select('version').eq('project_id', projectId).maybeSingle();
        const version = (existing?.version ?? 0) + 1;
        await supabase.from('timeline_states').upsert({
          project_id: projectId,
          version,
          data: timeline,
        });
        lastSavedRef.current = serialized;
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1500);
      } catch {
        setSaveState('error');
      }
    }, 900);
  }, [projectId, user, timeline]);

  useEffect(() => {
    handleAutosave();
  }, [timeline, handleAutosave]);

  // refresh signed urls once assets load
  useEffect(() => {
    if (!media.assets.length) return;
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const asset of media.assets) {
        if (!asset.kind || (asset.kind !== 'video' && asset.kind !== 'image' && asset.kind !== 'audio')) continue;
        const url = await media.getSignedUrl(asset.storage_path);
        if (url) urls[asset.id] = url;
      }
      if (!cancelled) setSignedUrls((prev) => ({ ...prev, ...urls }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.assets.length, projectId]);

  // ---------- playback loop ----------
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      const dur = timelineDuration(useTimeline.getState().timeline);
      const next = useTimeline.getState().playhead + dt;
      if (next >= dur) {
        setPlayhead(dur);
        setPlaying(false);
        return;
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, setPlayhead, setPlaying]);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        e.preventDefault();
        useTimeline.getState().setPlaying(!useTimeline.getState().playing);
      } else if (e.key === 'b' || e.key === 'B') {
        useTimeline.getState().splitAtPlayhead();
      } else if (e.key === 'm' || e.key === 'M') {
        useTimeline.getState().addMarker(useTimeline.getState().playhead);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = useTimeline.getState();
        if (s.selectedClipId) {
          if (e.shiftKey) s.rippleDeleteClip(s.selectedClipId);
          else s.removeClip(s.selectedClipId);
        }
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        useTimeline.getState().undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        useTimeline.getState().redo();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const s = useTimeline.getState();
        s.setPlayhead(Math.max(0, s.playhead - 1 / 30));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const s = useTimeline.getState();
        const d = timelineDuration(s.timeline);
        s.setPlayhead(Math.min(d, s.playhead + 1 / 30));
      } else if (e.key === 'Escape') {
        useTimeline.getState().selectClip(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // missing project guard
  if (!sessionChecked && !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const meta = { loaded: project !== null };

  const handleAddClip = useCallback(async (assetId: string, trackId: string, start: number) => {
    const asset = media.assets.find((a) => a.id === assetId);
    if (!asset) return;
    const track = timeline.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const layerKind = asset.kind === 'video' ? 'video' : asset.kind === 'audio' ? 'audio' : 'image';
    // don't add video assets to audio tracks and vice versa
    if (track.kind === 'audio' && asset.kind !== 'audio') return;
    if (track.kind === 'video' && asset.kind !== 'video' && asset.kind !== 'image') return;

    const duration =
      asset.kind === 'video' && asset.duration_seconds
        ? Math.max(0.1, Math.min(asset.duration_seconds, 60))
        : asset.kind === 'audio' && asset.duration_seconds
          ? Math.max(0.1, Math.min(asset.duration_seconds, 60))
          : 5;

    useTimeline.getState().addClip(trackId, {
      mediaId: asset.id,
      layerKind,
      name: asset.name,
      start,
      duration,
      inPoint: 0,
      outPoint: null,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    });
  }, [media.assets, timeline.tracks]);

  // ---------- export ----------
  const handleExportVideo = async () => {
    setExportError(null);
    setExporting('video');
    setExportProgress(0);
    try {
      const { exportTimelineVideo, downloadBlob, makeFileName } = await import('@/lib/export/video-export');
      const videoUrls = new Map<string, string>();
      for (const asset of media.assets) {
        if (asset.kind !== 'video' && asset.kind !== 'image') continue;
        const url = signedUrls[asset.id] ?? await media.getSignedUrl(asset.storage_path);
        if (url) videoUrls.set(asset.id, url);
      }
      const blob = await exportTimelineVideo({
        timeline: useTimeline.getState().timeline,
        width: project?.width ?? 1920,
        height: project?.height ?? 1080,
        fps: project?.fps ?? 30,
        mediaUrls: videoUrls,
        onProgress: setExportProgress,
      });
      downloadBlob(blob, makeFileName(project?.name ?? 'frameforge', 'webm'));
      setExporting(null);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
      setExporting(null);
    }
  };

  const handleExportAudio = async () => {
    setExportError(null);
    setExporting('audio');
    setExportProgress(0);
    try {
      const { exportTimelineAudio } = await import('@/lib/export/audio-export');
      const audioUrls = new Map<string, string>();
      for (const asset of media.assets) {
        if (asset.kind !== 'audio') continue;
        const url = signedUrls[asset.id] ?? await media.getSignedUrl(asset.storage_path);
        if (url) audioUrls.set(asset.id, url);
      }
      const blob = await exportTimelineAudio({
        timeline: useTimeline.getState().timeline,
        mediaUrls: audioUrls,
        onProgress: setExportProgress,
      });
      const { downloadBlob, makeFileName } = await import('@/lib/export/video-export');
      downloadBlob(blob, makeFileName(project?.name ?? 'frameforge-audio', 'wav'));
      setExporting(null);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
      setExporting(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] bg-[--color-ink-900] px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push('/dashboard')} className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-200">← Projects</button>
          <div className="hidden md:block h-5 w-px bg-zinc-800" />
          <div className="min-w-0 max-w-72 truncate text-sm font-semibold text-zinc-100">{project?.name ?? 'Untitled'}</div>
          {saveState === 'saving' && <Badge tone="warning">Saving…</Badge>}
          {saveState === 'saved' && <Badge tone="success">Saved</Badge>}
          {saveState === 'error' && <Badge tone="danger">Save failed</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="text-xs" onClick={() => setAiOpen((v) => !v)}>
            <Sparkles className="h-3.5 w-3.5" /> AI assistant
          </Button>
          <Button variant="outline" className="text-xs" onClick={handleExportAudio} disabled={exporting !== null || !timeline.clips.length} title="Mix audio to WAV">
            <Download className="h-3.5 w-3.5" /> WAV
          </Button>
          <Button variant="primary" className="text-xs" onClick={handleExportVideo} disabled={exporting !== null || !timeline.clips.length} title="Export composited video as WebM">
            {exporting === 'video' ? <><Spinner className="h-3.5 w-3.5" /> {Math.round(exportProgress * 100)}%</> : <><Download className="h-3.5 w-3.5" /> Export WebM</>}
          </Button>
        </div>
      </header>

      {exportError && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-1.5 text-[11px] text-red-300">Export failed: {exportError}</div>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: media */}
        <aside className="hidden w-64 shrink-0 border-r border-[--color-border-soft] bg-[--color-ink-900] lg:flex lg:flex-col">
          <MediaPanel projectId={projectId} />
        </aside>

        {/* Center */}
        <div className="flex flex-1 min-w-0 flex-col">
          <div className="flex-[2] min-h-0 border-b border-[--color-border-soft]">
            {meta.loaded ? (
              <PreviewMonitor
                projectId={projectId}
                projectWidth={project?.width ?? 1920}
                projectHeight={project?.height ?? 1080}
                fps={project?.fps ?? 30}
                isPlaying={playing}
                onTogglePlay={() => useTimeline.getState().setPlaying(!playing)}
                assets={media.assets}
                signedUrls={signedUrls}
              />
            ) : (
              <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>
            )}
          </div>
          <div className="flex-[3] min-h-[200px]">
            <Timeline assets={media.assets} onAddClipFromMedia={handleAddClip} />
          </div>
        </div>

        {/* Right: inspector / AI */}
        <aside className="hidden w-72 shrink-0 border-l border-[--color-border-soft] bg-[--color-ink-900] md:flex md:flex-col">
          {aiOpen ? <AiAssistant onClose={() => setAiOpen(false)} /> : <Inspector />}
        </aside>
      </div>
    </div>
  );
}
