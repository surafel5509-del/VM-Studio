'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/stores/auth.store';
import { getSupabase } from '@/lib/supabase';
import { Button, Panel, Badge, Spinner, TextInput, Field } from '@/components/ui';
import { Bot, Copy, Plus, Trash2, ShieldCheck, KeyRound, Link as LinkIcon } from 'lucide-react';

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'ffmcp_' + Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join('');
}

interface McpKey {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function McpPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read:projects', 'read:timeline', 'write:timeline']);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('mcp_api_keys').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setKeys((data ?? []) as McpKey[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const toggleScope = (s: string) => {
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const createKey = async () => {
    if (!user || !name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const token = generateToken();
      const hash = await hashToken(token);
      const { error } = await supabase.from('mcp_api_keys').insert({
        owner_id: user.id,
        name: name.trim(),
        key_hash: hash,
        scopes,
      });
      if (error) throw error;
      setNewToken(token);
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    const supabase = getSupabase();
    await supabase.from('mcp_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    await load();
  };

  const connections = [
    { label: 'MCP endpoint', value: 'https://<deployment>/mcp/streamable', hint: 'Streamable HTTP transport — point your MCP client here.' },
    { label: 'Auth', value: 'Bearer <ffmcp_...>', hint: 'Send your MCP key in the Authorization header.' },
    { label: 'Tools', value: '~35 registered (see docs/mcp.md)', hint: 'Read + write tools, scoped by key permissions.' },
    { label: 'Resources', value: 'frameforge://*', hint: 'Permission-controlled project/timeline/media references.' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">MCP Integrations</h1>
          <p className="text-xs text-zinc-500">Model Context Protocol — connect ChatGPT and other MCP clients to your studio</p>
        </div>
        <Badge tone="info"><Bot className="h-3 w-3" /> MCP v1</Badge>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          <Panel title="Connection" className="mb-4">
            <div className="flex flex-col gap-2 p-3">
              {connections.map((c) => (
                <div key={c.label} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">{c.label}</div>
                    <div className="mt-0.5 font-mono text-xs text-zinc-200">{c.value}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">{c.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="API keys" className="mb-4">
            <div className="flex flex-col gap-3 p-3">
              <p className="text-[11px] text-zinc-400">Create a key with explicit scopes. Keys grant access to the data layer — treat them like passwords. The token is shown once, then only the hash is stored.</p>
              <Field label="Key name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="ChatGPT bridge" /></Field>
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">Scopes</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {['read:projects', 'write:projects', 'read:timeline', 'write:timeline', 'read:media', 'write:media', 'read:motion', 'write:motion', 'read:subtitles', 'write:subtitles', 'read:render', 'write:render', 'read:ai'].map((s) => (
                    <button key={s} onClick={() => toggleScope(s)} className={`rounded-md border px-2 py-1.5 text-left font-mono text-[10px] transition-colors ${scopes.includes(s) ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200' : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="primary" onClick={createKey} disabled={creating || !name.trim() || scopes.length === 0}>
                <Plus className="h-3.5 w-3.5" /> {creating ? 'Creating…' : 'Create key'}
              </Button>
              {newToken && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> Save this now — shown once</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-black/40 px-2 py-1.5 font-mono text-[11px] text-emerald-200">{newToken}</code>
                    <button onClick={() => navigator.clipboard?.writeText(newToken)} title="Copy" className="rounded p-1.5 text-emerald-300 hover:bg-white/10"><Copy className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
              {error && <p className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">{error}</p>}
            </div>
          </Panel>

          <Panel title={`Keys (${keys.length})`}>
            {loading ? <div className="flex justify-center py-6"><Spinner /></div> : keys.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-zinc-500">No keys yet. Create one above.</div>
            ) : (
              <ul className="divide-y divide-[--color-border-soft]">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center gap-2 px-3 py-2.5">
                    <KeyRound className="h-3.5 w-3.5 text-zinc-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-zinc-200">{k.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {k.scopes.map((s) => <Badge key={s} tone="default">{s}</Badge>)}
                      </div>
                      <div className="mt-0.5 text-[9px] text-zinc-500">{new Date(k.created_at).toLocaleDateString()}{k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleString()}` : ' · never used'}</div>
                    </div>
                    {k.revoked_at ? <Badge tone="danger">revoked</Badge> : <button onClick={() => revokeKey(k.id)} className="rounded p-1.5 text-zinc-500 hover:text-red-300" title="Revoke"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-[--color-border-soft] bg-[--color-ink-900] p-3 lg:flex">
          <Panel title="ChatGPT setup">
            <div className="flex flex-col gap-2 p-3 text-[11px] leading-relaxed text-zinc-400">
              <p>1. Start the MCP server (apps/mcp-server).</p>
              <p>2. In ChatGPT, Settings → Connectors → add the MCP URL.</p>
              <p>3. Paste your generated key as the Bearer token.</p>
              <p>4. Ask: “List my projects and make a cinematic 30-second trailer.”</p>
              <div className="mt-1 border-t border-[--color-border-soft] pt-2 text-[10px] text-zinc-500">
                MCP write tools require confirmation confirmation in the client — the server enforces read/write scopes per key.
              </div>
            </div>
          </Panel>
          <Panel title="Docs">
            <div className="flex flex-col gap-2 p-3 text-[11px] text-zinc-400">
              <a className="text-indigo-300 hover:underline" href="/docs/mcp.md">Read docs/mcp.md</a>
              <a className="text-indigo-300 hover:underline" href="/docs/chatgpt-integration.md">ChatGPT integration</a>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
