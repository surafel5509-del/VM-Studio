'use client';

import { useEffect, useMemo, useState } from 'react';
import { useProjects } from '@/lib/stores/project.store';
import { useTimelineProject } from '@/lib/use-timeline-project';
import { useTimeline } from '@/lib/stores/timeline.store';
import { useAuth } from '@/lib/stores/auth.store';
import { getSupabase } from '@/lib/supabase';
import { Button, Panel, Badge, Spinner, EmptyState } from '@/components/ui';
import { ListChecks, Play, Download, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import type { RenderJob } from '@frameforge/shared';
import Link from 'next/link';

export default function RenderQueuePage() {
  const { user } = useAuth();
  const { projects } = useProjects();
  const project = projects[0] ?? null;
  const projectId = project?.id ?? '';
  const { ready, media } = useTimelineProject(projectId);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !projectId) return;
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.from('render_jobs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(50);
      setJobs((data ?? []) as RenderJob[]);
    })();
  }, [user, projectId]);

  async function startVideoExport() {
    if (!user || !projectId) return;
    setRunning('video');
    setProgress(0);
    setError(null);
    let jobId: string | null = null;
    try {
      const supabase = getSupabase();
      const { data: job } = await supabase
        .from('render_jobs')
        .insert({ project_id: projectId, owner_id: user.id, kind: 'export_video', status: 'running', settings: { format: 'webm', fps: project?.fps ?? 30, width: project?.width ?? 1920, height: project?.height ?? 1080 } })
        .select()
        .single();
      jobId = job?.id ?? null;

      const tl = useTimeline.getState().timeline;
      const signedUrls = new Map<string, string>();
      for (const asset of media.assets) {
        if (asset.kind !== 'video' && asset.kind !== 'image') continue;
        const url = await media.getSignedUrl(asset.storage_path);
        if (url) signedUrls.set(asset.id, url);
      }

      const { exportTimelineVideo, makeFileName, downloadBlob } = await import('@/lib/export/video-export');
      const blob = await exportTimelineVideo({
        timeline: tl,
        width: project?.width ?? 1920,
        height: project?.height ?? 1080,
        fps: project?.fps ?? 30,
        mediaUrls: signedUrls,
        onProgress: setProgress,
      });
      downloadBlob(blob, makeFileName(project?.name ?? 'frameforge', 'webm'));

      if (jobId) {
        await supabase.from('render_jobs').update({ status: 'completed', progress: 1, output_path: makeFileName(project?.name ?? 'frameforge', 'webm') }).eq('id', jobId);
      }
      const { data } = await supabase.from('render_jobs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(50);
      setJobs((data ?? []) as RenderJob[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
      if (jobId) {
        const supabase = getSupabase();
        await supabase.from('render_jobs').update({ status: 'failed', error: e instanceof Error ? e.message : 'Export failed' }).eq('id', jobId);
      }
    } finally {
      setRunning(null);
    }
  }

  async function cancelJob(job: RenderJob) {
    const supabase = getSupabase();
    await supabase.from('render_jobs').update({ status: 'cancelled' }).eq('id', job.id);
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'cancelled' } : j)));
  }

  if (!ready) {
    return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ListChecks className="h-8 w-8 text-zinc-600" />
        <div className="text-sm font-medium text-zinc-300">No project yet</div>
        <Link href="/dashboard"><Button variant="outline" className="text-xs">Go to dashboard</Button></Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Render Queue</h1>
          <p className="text-xs text-zinc-500">{project.name} — renders with honest status</p>
        </div>
        <Button variant="primary" className="text-xs" onClick={startVideoExport} disabled={running !== null}>
          {running ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering… {Math.round(progress * 100)}%</> : <><Play className="h-3.5 w-3.5" /> Start video export</>}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {running && (
          <div className="mb-6 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-indigo-200">Rendering WebM from the live timeline…</span>
              <span className="font-mono text-indigo-300">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-indigo-950">
              <div className="h-full bg-indigo-400 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="mt-2 text-[10px] text-indigo-300/70">Canvas capture + MediaRecorder — real output, not a full ffmpeg render. MP4/MOV requires the server worker (docs/rendering.md).</div>
          </div>
        )}

        {error && <p className="mb-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

        {jobs.length === 0 && !running && (
          <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No render jobs yet" hint="Start a video export to queue it. Jobs persist in the database with honest status — nothing is marked completed until the output exists." />
        )}

        {jobs.length > 0 && (
          <Panel title="Jobs">
            <div className="flex flex-col divide-y divide-[--color-border-soft]">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Badge tone={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : job.status === 'cancelled' ? 'default' : 'info'}>{job.status}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-200">{job.kind.replace('_', ' ')}</div>
                    <div className="text-[10px] text-zinc-500">{new Date(job.created_at).toLocaleString()} · {formatJobSettings(job)}</div>
                  </div>
                  <div className="font-mono text-[10px] text-zinc-400">{Math.round(job.progress * 100)}%</div>
                  {(job.status === 'queued' || job.status === 'running') && (
                    <button onClick={() => cancelJob(job)} className="rounded p-1 text-zinc-500 hover:text-red-300" title="Cancel job"><ListChecks className="h-3.5 w-3.5 rotate-45" /></button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-[11px] leading-relaxed text-zinc-500">
          <div className="mb-1 flex items-center gap-2 font-semibold text-zinc-300"><Download className="h-3.5 w-3.5" /> Formats</div>
          <p><span className="text-zinc-300">WebM</span> — rendered in your browser (real, playable output).</p>
          <p><span className="text-zinc-300">WAV</span> — audio mix exported from the Audio Studio.</p>
          <p><span className="text-zinc-300">MP4 / MOV</span> — requires the ffmpeg-backed render worker; see docs/rendering.md.</p>
        </div>
      </div>
    </div>
  );
}

function formatJobSettings(job: RenderJob): string {
  const s = job.settings as Record<string, unknown>;
  const parts = Object.entries(s).map(([k, v]) => `${k}: ${v}`);
  return parts.join(' · ') || '—';
}
