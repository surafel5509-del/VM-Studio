'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProjects } from '@/lib/stores/project.store';
import type { Project } from '@frameforge/shared';
import { Button, TextInput, Field, Select, Panel, Spinner, EmptyState } from '@/components/ui';
import { Plus, FolderOpen, Clapperboard, Clock, Archive, Trash2 } from 'lucide-react';
import clsx from 'clsx';

const RATIOS = [
  { value: '16:9', label: '16:9 — YouTube / Widescreen' },
  { value: '9:16', label: '9:16 — Shorts / Reels / TikTok' },
  { value: '1:1', label: '1:1 — Square' },
  { value: '4:5', label: '4:5 — Portrait feed' },
  { value: '4:3', label: '4:3 — Classic' },
];

export default function DashboardPage() {
  const { projects, loading, error, loadProjects, createProject, deleteProject, archiveProject } = useProjects();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [ratio, setRatio] = useState('16:9');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const p = await createProject(name.trim(), ratio);
    setBusy(false);
    if (p) {
      setCreating(false);
      setName('');
      setRatio('16:9');
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Dashboard</h1>
          <p className="text-xs text-zinc-500">Your projects and workspace</p>
        </div>
        <Button variant="primary" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {creating && (
          <form onSubmit={handleCreate} className="panel-glass mb-6 flex flex-col gap-3 rounded-xl p-4 ff-fadein sm:flex-row sm:items-end">
            <Field label="Project name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled project" disabled={busy} />
            </Field>
            <Field label="Aspect ratio">
              <Select value={ratio} onChange={(e) => setRatio(e.target.value)}>
                {RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create'}</Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
            </div>
          </form>
        )}

        {error && <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        {loading && <div className="flex justify-center py-16"><Spinner /></div>}

        {!loading && projects.length === 0 && (
          <EmptyState
            icon={<FolderOpen />}
            title="No projects yet"
            hint="Create your first project to start editing, or upload media to your library."
            action={<Button variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New project</Button>}
          />
        )}

        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => <ProjectCard key={p.id} project={p} onDelete={deleteProject} onArchive={archiveProject} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, onDelete, onArchive }: { project: Project; onDelete: (id: string) => Promise<unknown>; onArchive: (id: string) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const archived = project.status === 'archived';

  return (
    <div className={clsx('panel-glass rounded-xl p-4 flex flex-col gap-3', archived && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-100">{project.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
              <span>{project.aspect_ratio}</span>
              <span>·</span>
              <span>{project.width}×{project.height}</span>
              <span>·</span>
              <span className={clsx('capitalize', archived ? 'text-amber-400' : project.status === 'rendering' ? 'text-indigo-400' : 'text-emerald-400')}>{project.status}</span>
            </div>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0">
          <Clock className="h-3 w-3" />
          {new Date(project.updated_at).toLocaleDateString()}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[--color-border-soft] pt-3">
        <div className="flex gap-1.5">
          <Link href={`/editor/${project.id}`}>
            <Button variant="primary" className="px-2.5 py-1">Open</Button>
          </Link>
          <Link href={`/motion/${project.id}`}>
            <Button variant="subtle" className="px-2.5 py-1">Motion</Button>
          </Link>
        </div>
        <div className="flex gap-1">
          <button title="Archive" onClick={async () => { setBusy(true); await onArchive(project.id); setBusy(false); }} className="rounded p-1.5 text-zinc-500 hover:text-amber-300 hover:bg-white/5" disabled={busy}>
            <Archive className="h-4 w-4" />
          </button>
          {confirming ? (
            <button
              title="Confirm delete"
              onClick={async () => { setBusy(true); await onDelete(project.id); setBusy(false); }}
              className="rounded p-1.5 text-red-300 bg-red-500/20"
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <button title="Delete project" onClick={() => setConfirming(true)} className="rounded p-1.5 text-zinc-500 hover:text-red-300 hover:bg-white/5" disabled={busy}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
