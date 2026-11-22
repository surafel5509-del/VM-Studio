'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/lib/stores/project.store';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Plus, ArrowRight, Clapperboard } from 'lucide-react';

/**
 * Studio hub — pick a project, jump into the studio for it.
 * Keeps every studio route linkable from the sidebar without an id in the URL.
 */
export function StudioHub({ studio, title, description, accent }: { studio: string; title: string; description: string; accent: string }) {
  const router = useRouter();
  const { projects, loading, loadProjects, createProject } = useProjects();

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const handleNew = async () => {
    const p = await createProject('Untitled Project');
    if (p) router.push(`/${studio}/${p.id}`);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-[--color-border-soft] px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight text-zinc-50">{title}</h1>
        <p className="text-xs text-zinc-500">{description}</p>
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 p-6">
        {loading && projects.length === 0 ? (
          <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<Clapperboard className="h-6 w-6" />}
            title="No projects yet"
            hint="Create one to start. It seeds an empty timeline so the studio has something to open."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <Link key={p.id} href={`/${studio}/${p.id}`} className="group rounded-xl border border-[--color-border-soft] bg-[--color-ink-850] p-4 transition-all hover:border-[--color-accent]/60 hover:bg-[--color-ink-800]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">{p.name}</div>
                    <div className="mt-1 text-[10px] text-zinc-500">{p.aspect_ratio} · {p.width}×{p.height} · {p.fps}fps</div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-indigo-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-center">
          <Button variant="primary" onClick={handleNew} className="text-xs"><Plus className="h-3.5 w-3.5" /> New project</Button>
        </div>
      </div>
    </div>
  );
}
