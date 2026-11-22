'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/stores/auth.store';
import { useProjects } from '@/lib/stores/project.store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Button, Panel, Badge, Field, TextInput, Select, Spinner } from '@/components/ui';
import { ShieldCheck, KeyRound, Sparkles, Info, Save } from 'lucide-react';

const RATIOS = [
  { value: '16:9', label: '16:9 — YouTube / Widescreen' },
  { value: '9:16', label: '9:16 — Shorts / Reels / TikTok' },
  { value: '1:1', label: '1:1 — Square' },
  { value: '4:5', label: '4:5 — Portrait feed' },
  { value: '4:3', label: '4:3 — Classic' },
];

function dimsFor(ratio: string) {
  const d = ratio.split(':').map(Number);
  if (ratio === '16:9') return { width: 1920, height: 1080 };
  if (ratio === '9:16') return { width: 1080, height: 1920 };
  if (ratio === '1:1') return { width: 1080, height: 1080 };
  if (ratio === '4:5') return { width: 1080, height: 1350 };
  if (ratio === '4:3') return { width: 1440, height: 1080 };
  return { width: 1920, height: 1080 };
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { projects, loading, loadProjects, updateProject } = useProjects();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [ratio, setRatio] = useState('16:9');
  const [fps, setFps] = useState(30);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const selected = useMemo(
    () => projects.find((p) => p.id === projectId) ?? projects[0] ?? null,
    [projects, projectId],
  );

  useEffect(() => {
    if (selected) {
      setProjectId(selected.id);
      setRatio(selected.aspect_ratio || '16:9');
      setFps(selected.fps || 30);
    }
  }, [selected]);

  async function saveProjectSettings() {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    const { width, height } = dimsFor(ratio);
    const ok = await updateProject(selected.id, { aspect_ratio: ratio, width, height, fps });
    setSaving(false);
    setMessage(ok ? `Saved ${ratio} · ${width}×${height} · ${fps}fps` : 'Could not save — see error above');
    setTimeout(() => setMessage(null), 2500);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Settings</h1>
          <p className="text-xs text-zinc-500">Account, providers and plan</p>
        </div>
        <Badge tone={isSupabaseConfigured ? 'success' : 'warning'}>{isSupabaseConfigured ? 'Connected' : 'Not configured'}</Badge>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <Panel title="Profile">
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
              <Field label="Email"><TextInput value={user?.email ?? ''} readOnly /></Field>
              <Field label="Plan"><TextInput value="FREE" readOnly /></Field>
            </div>
            <div className="border-t border-[--color-border-soft] px-3 py-2 text-[10px] text-zinc-500">Profile bootstrap: created automatically on signup (handle_new_user trigger).</div>
          </Panel>

          <Panel title="AI providers">
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                <Sparkles className="h-5 w-5 text-indigo-400" />
                <div className="flex-1">
                  <div className="text-xs font-medium text-zinc-200">Generative AI (LLM)</div>
                  <div className="text-[10px] text-zinc-500">Not configured. Add provider keys via your hosting platform; the assistant falls back to deterministic local planning.</div>
                </div>
                <Badge tone="warning">Not configured</Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                <KeyRound className="h-5 w-5 text-amber-400" />
                <div className="flex-1">
                  <div className="text-xs font-medium text-zinc-200">Speech / voiceover</div>
                  <div className="text-[10px] text-zinc-500">Browser SpeechSynthesis is always available in-preview; cloud TTS needs provider keys.</div>
                </div>
                <Badge tone="default">Browser fallback</Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                <div className="flex-1">
                  <div className="text-xs font-medium text-zinc-200">MCP server</div>
                  <div className="text-[10px] text-zinc-500">Running alongside the app (see MCP Integrations). Bearer tokens, scoped.</div>
                </div>
                <Badge tone="success">Configured</Badge>
              </div>
            </div>
          </Panel>

          <Panel title="Project defaults">
            {loading && projects.length === 0 ? (
              <div className="flex justify-center p-8"><Spinner className="h-6 w-6" /></div>
            ) : projects.length === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500">No projects yet — create one in the Dashboard to set defaults.</div>
            ) : (
              <div className="flex flex-col gap-3 p-3">
                <Field label="Project">
                  <Select value={selected?.id ?? ''} onChange={(e) => setProjectId(e.target.value)}>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.aspect_ratio} · {p.width}×{p.height}</option>)}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Aspect ratio">
                    <Select value={ratio} onChange={(e) => setRatio(e.target.value)}>
                      {RATIOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Frame rate">
                    <Select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                      {[24, 25, 30, 48, 60, 120].map((f) => <option key={f} value={f}>{f} fps</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                  <span>Resolution: {dimsFor(ratio).width}×{dimsFor(ratio).height}</span>
                  <span>·</span>
                  <span>{fps} fps</span>
                </div>
                {message && <p className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">{message}</p>}
                <Button variant="primary" className="self-start text-xs" disabled={saving || !selected} onClick={saveProjectSettings}>
                  {saving ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />} Save project defaults
                </Button>
                <div className="text-[10px] text-zinc-600">Changes apply to the selected project only — other projects keep their own settings.</div>
              </div>
            )}
          </Panel>

          <Panel title="About">
            <div className="flex items-start gap-2 p-3 text-[11px] leading-relaxed text-zinc-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
              <div>
                <p>FRAMEFORGE STUDIO — Create Without Limits.</p>
                <p className="mt-1 text-zinc-500">Fork architecture documented in README.md and docs/. Schema in supabase/migrations/0001_core_schema.sql.</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
