'use client';

import { useEffect, useMemo, useState } from 'react';
import { useProjects } from '@/lib/stores/project.store';
import { useAuth } from '@/lib/stores/auth.store';
import { getSupabase } from '@/lib/supabase';
import { Panel, Badge, Button, Field, Select, Spinner, EmptyState } from '@/components/ui';
import { Youtube, Instagram, Facebook, Clapperboard, CheckCircle2, ListChecks as ListChecksIcon, Loader2, AlertTriangle, Globe } from 'lucide-react';
import clsx from 'clsx';
import type { Project } from '@frameforge/shared';

/**
 * Creator Toolkit — applied-preset cards for popular platforms.
 *
 * Each preset is an honest, local configuration: it updates the project's
 * aspect ratio / size / settings and queues an export via render_jobs.
 * Nothing here publishes to YouTube, TikTok or Reels — publishing is not
 * automated; this toolkit prepares and queues the work.
 */

interface Preset {
  id: string;
  platform: string;
  icon: typeof Youtube;
  ratio: string;
  width: number;
  height: number;
  durationCapSeconds: number;
  target: string;
  notes: string[];
}

const PRESETS: Preset[] = [
  {
    id: 'youtube',
    platform: 'YouTube (long-form)',
    icon: Youtube,
    ratio: '16:9',
    width: 1920,
    height: 1080,
    durationCapSeconds: 60 * 60 * 12, // YouTube practical limit
    target: '1920×1080 · 16:9 · 5+ min',
    notes: ['16:9 · 1080p or 4K', 'Add captions — most viewers watch with sound off', 'Landscape thumbnails for the feed card', 'MP4/H.264 needs the server render worker'],
  },
  {
    id: 'youtube-shorts',
    platform: 'YouTube Shorts',
    icon: Clapperboard,
    ratio: '9:16',
    width: 1080,
    height: 1920,
    durationCapSeconds: 60,
    target: '1080×1920 · 9:16 · max 60s',
    notes: ['9:16 · 1080×1920', '60 seconds max (60s Shorts)', 'Hook in the first 1–2 seconds', 'No black bars — full-frame composition'],
  },
  {
    id: 'reels',
    platform: 'Instagram Reels',
    icon: Instagram,
    ratio: '9:16',
    width: 1080,
    height: 1920,
    durationCapSeconds: 90,
    target: '1080×1920 · 9:16 · max 90s',
    notes: ['9:16 · 1080×1920', '90 seconds max', 'Sound is expected — keep audio loud (volume > 70%)', 'No cover images needed; first frame is the poster'],
  },
  {
    id: 'tiktok',
    platform: 'TikTok',
    icon: Facebook,
    ratio: '9:16',
    width: 1080,
    height: 1920,
    durationCapSeconds: 180,
    target: '1080×1920 · 9:16 · max 180s',
    notes: ['9:16 · 1080×1920', '180 seconds max', 'Subtitles burned into the video; don\'t rely on captions only', 'TikTok compresses — export at 1080p+ to survive re-compression'],
  },
  {
    id: 'feed-square',
    platform: 'Square feed (1:1)',
    icon: Globe,
    ratio: '1:1',
    width: 1080,
    height: 1080,
    durationCapSeconds: 60,
    target: '1080×1080 · 1:1',
    notes: ['1:1 for feed carousels', 'Crop the center-safe region', 'Works on X/Instagram feeds'],
  },
  {
    id: 'feed-portrait',
    platform: 'Portrait feed (4:5)',
    icon: Globe,
    ratio: '4:5',
    width: 1080,
    height: 1350,
    durationCapSeconds: 90,
    target: '1080×1350 · 4:5',
    notes: ['4:5 for vertical feed', 'Keep headroom for captions'],
  },
];

export default function CreatorToolkitPage() {
  const { projects, loading, loadProjects, updateProject } = useProjects();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const selected: Project | null = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? projects[0] ?? null,
    [projects, selectedId],
  );

  async function applyPreset(preset: Preset) {
    if (!selected) return;
    setBusy(preset.id);
    setError(null);
    const ok = await updateProject(selected.id, {
      aspect_ratio: preset.ratio,
      width: preset.width,
      height: preset.height,
      settings: { ...(selected.settings ?? {}), creatorPreset: preset.id, creatorPlatform: preset.platform },
    });
    setBusy(null);
    if (ok) {
      setMessage(`“${preset.platform}” preset applied — ${preset.width}×${preset.height} (${preset.ratio}) for ${selected.name}.`);
      setTimeout(() => setMessage(null), 3000);
    } else {
      setError(`Could not apply preset to ${selected.name}`);
    }
  }

  async function queueRender(preset: Preset) {
    if (!selected || !user) return;
    setBusy(`${preset.id}-render`);
    setError(null);
    try {
      const supabase = getSupabase();
      const { error: insertError } = await supabase.from('render_jobs').insert({
        project_id: selected.id,
        owner_id: user.id,
        kind: 'export_video',
        status: 'queued',
        settings: { format: 'webm', preset: preset.id, platform: preset.platform, width: preset.width, height: preset.height, fps: selected.fps },
      });
      if (insertError) throw insertError;
      setMessage(`Render job queued for ${preset.platform} — see Render Queue.`);
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not queue render');
    } finally {
      setBusy(null);
    }
  }

  if (loading && projects.length === 0) {
    return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <EmptyState
          icon={<Youtube className="h-6 w-6" />}
          title="No projects yet"
          hint="Create a project in the Dashboard first — the Creator Toolkit applies platform presets to an existing project."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Creator Toolkit</h1>
          <p className="text-xs text-zinc-500">Platform presets — YouTube, Shorts, Reels, TikTok, feed formats</p>
        </div>
        <Badge tone="info"><Globe className="h-3 w-3" /> {PRESETS.length} presets</Badge>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          {/* Project picker */}
          <Panel className="mb-6">
            <div className="flex flex-wrap items-end gap-3 p-3">
              <Field label="Project">
                <Select value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value || null)} className="min-w-64">
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.aspect_ratio} · {p.width}×{p.height}</option>
                  ))}
                </Select>
              </Field>
              {selected && <Badge tone="default">Current: {selected.aspect_ratio} · {selected.width}×{selected.height}</Badge>}
            </div>
          </Panel>

          {message && <p className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {message}</p>}
          {error && <p className="mb-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

          {/* Presets */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {PRESETS.map((preset) => {
              const current = selected && selected.aspect_ratio === preset.ratio;
              return (
                <Panel key={preset.id} title={undefined} actions={<Badge tone={current ? 'success' : 'default'}>{current ? 'Applied' : 'Not applied'}</Badge>}>
                  <div className="p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <preset.icon className="h-4 w-4 text-indigo-400" />
                      <div className="text-sm font-semibold text-zinc-100">{preset.platform}</div>
                    </div>
                    <div className="mb-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded bg-white/[0.03] px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-zinc-500">Spec</div>
                        <div className="font-mono text-zinc-300">{preset.target}</div>
                      </div>
                      <div className="rounded bg-white/[0.03] px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-zinc-500">Duration cap</div>
                        <div className="font-mono text-zinc-300">{preset.durationCapSeconds >= 3600 ? `${Math.round(preset.durationCapSeconds / 3600)}h` : `${Math.round(preset.durationCapSeconds / 60)}min`}</div>
                      </div>
                    </div>
                    <ul className="mb-3 space-y-1">
                      {preset.notes.map((n, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/80" /> {n}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <Button variant="primary" className="flex-1 text-xs" disabled={busy !== null || !selected} onClick={() => applyPreset(preset)}>
                        {busy === preset.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {current ? 'Re-apply' : 'Apply preset'}
                      </Button>
                      <Button variant="outline" className="text-xs" disabled={busy !== null || !selected || !user} onClick={() => queueRender(preset)}>
                        {busy === `${preset.id}-render` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecksIcon className="h-3.5 w-3.5" />}
                        Queue render
                      </Button>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-[11px] leading-relaxed text-zinc-500">
            <div className="mb-1 flex items-center gap-2 font-semibold text-zinc-300"><Globe className="h-3.5 w-3.5" /> What this does and does not do</div>
            <p><span className="text-zinc-300">Applies real settings to your project</span> (aspect ratio, width, height, preset marker) — persisted via the project store.</p>
            <p><span className="text-zinc-300">Queues render jobs</span> — job rows appear in the Render Queue; nothing is marked complete until the export actually finishes.</p>
            <p><span className="text-zinc-300">Does not upload or publish</span> — no YouTube/TikTok/Instagram API adapters exist in this build; publishing is not automated. Use the preset + queue the export from Video Studio to get the file.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
