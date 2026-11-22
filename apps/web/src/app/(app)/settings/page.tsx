'use client';

import { useAuth } from '@/lib/stores/auth.store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Button, Panel, Badge, Field, TextInput } from '@/components/ui';
import { Settings as SettingsIcon, ShieldCheck, KeyRound, Sparkles, Info } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();

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
