'use client';

import { useEffect, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useProjects } from '@/lib/stores/project.store';
import { useTimelineProject } from '@/lib/use-timeline-project';
import { AiAssistant } from '@/components/editor/AiAssistant';
import { Panel, Badge, Spinner, EmptyState } from '@/components/ui';
import { Sparkles, Mic, AudioWaveform, Subtitles, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';

export default function AiStudioPage() {
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId ?? '';
  const { projects, loadProjects } = useProjects();
  const { project, ready } = useTimelineProject(projectId);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const projectName = project?.name ?? projects.find((p) => p.id === projectId)?.name ?? null;

  if (!ready) {
    return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }

  if (!project && !projectName) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-6 w-6 text-amber-400/70" />
        <div className="text-sm text-zinc-400">Project not found.</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Left: conversational assistant */}
      <div className="flex min-h-0 flex-1 flex-col border-r border-[--color-border-soft]">
        <header className="flex items-center justify-between border-b border-[--color-border-soft] bg-[--color-ink-900]/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <div>
              <div className="text-sm font-bold text-zinc-50">AI Creative Studio</div>
              <div className="text-[10px] text-zinc-500">{projectName ?? 'Project'} — conversational editing</div>
            </div>
          </div>
          <Badge tone="info"><Lock className="h-3 w-3" /> Validated, undoable</Badge>
        </header>
        {/* needs the editor's timeline hydrated — useTimelineProject hydrates it */}
        <div className="min-h-0 flex-1">
          <AiAssistant />
        </div>
      </div>

      {/* Right: capabilities */}
      <aside className="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto p-4 lg:flex">
        <Panel title="Capabilities">
          <div className="flex flex-col gap-2 p-3 text-[11px]">
            <Capability
              icon={<Sparkles className="h-4 w-4 text-indigo-400" />}
              title="Edit planning"
              detail="Natural language → validated ops, undoable"
              status="available"
            />
            <Capability
              icon={<AudioWaveform className="h-4 w-4 text-amber-400" />}
              title="Silence removal"
              detail="Local RMS analysis — no provider required"
              status="available"
            />
            <Capability
              icon={<Mic className="h-4 w-4 text-rose-400" />}
              title="Voiceover (TTS)"
              detail="Browser SpeechSynthesis fallback; cloud TTS needs provider keys"
              status="provider"
            />
            <Capability
              icon={<Subtitles className="h-4 w-4 text-emerald-400" />}
              title="Auto-subtitles"
              detail="Requires a speech-to-text provider — see docs"
              status="provider"
            />
          </div>
        </Panel>

        <Panel title="Safety">
          <div className="space-y-2 p-3 text-[11px] leading-relaxed text-zinc-400">
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> Every proposed action shows a plan and waits for confirmation.</p>
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> Destructive actions require confirmation and are undoable.</p>
            <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" /> AI never claims an edit succeeded unless the operation actually succeeded.</p>
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function Capability({ icon, title, detail, status }: { icon: ReactNode; title: string; detail: string; status: 'available' | 'provider' }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-200">{title}</span>
          <Badge tone={status === 'available' ? 'success' : 'warning'}>{status === 'available' ? 'Available' : 'Needs keys'}</Badge>
        </div>
        <div className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{detail}</div>
      </div>
    </div>
  );
}
