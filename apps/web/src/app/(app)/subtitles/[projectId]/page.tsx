'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTimelineProject } from '@/lib/use-timeline-project';
import { useAuth } from '@/lib/stores/auth.store';
import { Button, Panel, Badge, Spinner, EmptyState, TextInput, Field } from '@/components/ui';
import { Subtitles as SubtitlesIcon, Upload, Download, Trash2, Plus, Pencil, Save, Volume2 } from 'lucide-react';
import { speak, stopSpeaking, speechSupported, hasVoiceFor } from '@/lib/voiceover';
import { parseSubtitles, serializeSrt, serializeVtt } from '@frameforge/shared';
import type { SubtitleCue } from '@frameforge/shared';
import { getSupabase } from '@/lib/supabase';

export default function SubtitlesPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { timeline, ready } = useTimelineProject(projectId);
  const { user } = useAuth();
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [docName, setDocName] = useState('Subtitles');
  const [language, setLanguage] = useState('en');
  const [docId, setDocId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // load existing document
  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('subtitle_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setDocId(data.id);
        setDocName(data.name ?? 'Subtitles');
        setLanguage(data.language ?? 'en');
        const parsed = data.data?.cues ?? [];
        if (Array.isArray(parsed) && parsed.length) setCues(parsed);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const supabase = getSupabase();
      const payload = {
        project_id: projectId,
        owner_id: user.id,
        name: docName,
        language,
        data: { cues },
      };
      if (docId) {
        await supabase.from('subtitle_documents').update(payload).eq('id', docId);
      } else {
        const { data } = await supabase.from('subtitle_documents').insert(payload).select('id').single();
        if (data) setDocId(data.id);
      }
      setDirty(false);
      setMessage('Saved.');
      setTimeout(() => setMessage(null), 1800);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function addCue() {
    const t = timeline.clips.length ? Math.max(...timeline.clips.map((c) => c.start + c.duration)) : 0;
    const newCue: SubtitleCue = { index: cues.length + 1, start: t, end: t + 2, text: '', style: 'default' };
    setCues([...cues, newCue]);
    setEditing(cues.length);
    setDirty(true);
  }

  function updateCue(index: number, patch: Partial<SubtitleCue>) {
    setCues((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    setDirty(true);
  }

  function removeCue(index: number) {
    setCues((prev) => prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, index: i + 1 })));
    setDirty(true);
  }

  async function importFile(file: File) {
    const text = await file.text();
    const parsed = parseSubtitles(text);
    if (parsed.length === 0) {
      setMessage('No subtitle cues could be parsed from that file.');
      return;
    }
    setCues(parsed);
    setDocName(file.name.replace(/\.(srt|vtt)$/i, ''));
    setDirty(true);
  }

  function download(format: 'srt' | 'vtt') {
    const content = format === 'srt' ? serializeSrt(cues) : serializeVtt(cues);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docName}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function previewSpeech() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    const text = cues.map((c) => c.text).filter(Boolean).join(' ');
    if (!text) return;
    const lang = language === 'am' ? 'am-ET' : language === 'en' ? 'en-US' : language.includes('-') ? language : `${language}-US`;
    setSpeaking(true);
    await speak(text, {
      language: lang,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
    setSpeaking(false);
  }

  const totalDuration = cues.length ? Math.max(...cues.map((c) => c.end)) : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Subtitle Studio</h1>
          <p className="text-xs text-zinc-500">{cues.length} cue{cues.length === 1 ? '' : 's'} · {totalDuration.toFixed(1)}s {language !== 'en' ? `· ${language}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <input ref={inputRef} type="file" accept=".srt,.vtt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
          <Button variant="outline" className="text-xs" onClick={() => inputRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Import SRT/VTT</Button>
          <Button variant="subtle" className="text-xs" onClick={previewSpeech} disabled={cues.length === 0 || !speechSupported()} title={speechSupported() ? 'Read cues aloud (in-browser speech preview, not an export)' : 'Speech preview not supported in this browser'}><Volume2 className="h-3.5 w-3.5" /> {speaking ? 'Stop preview' : 'Preview speech'}</Button>
          <Button variant="subtle" className="text-xs" onClick={() => download('srt')} disabled={cues.length === 0}><Download className="h-3.5 w-3.5" /> SRT</Button>
          <Button variant="subtle" className="text-xs" onClick={() => download('vtt')} disabled={cues.length === 0}><Download className="h-3.5 w-3.5" /> VTT</Button>
          <Button variant="primary" className="text-xs" onClick={save} disabled={saving || !dirty}>{saving ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />} Save</Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? <div className="flex justify-center py-16"><Spinner /></div> : (
            <>
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <Field label="Document name">
                    <TextInput value={docName} onChange={(e) => { setDocName(e.target.value); setDirty(true); }} className="w-56" />
                  </Field>
                </div>
                <div>
                  <Field label="Language">
                    <TextInput value={language} onChange={(e) => { setLanguage(e.target.value); setDirty(true); }} className="w-24" placeholder="en / am" />
                  </Field>
                </div>
                <Button variant="outline" className="ml-auto" onClick={addCue}><Plus className="h-3.5 w-3.5" /> Add cue</Button>
              </div>

              {message && <p className="mb-3 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">{message}</p>}

              {cues.length === 0 ? (
                <EmptyState icon={<SubtitlesIcon className="h-6 w-6" />} title="No subtitles yet" hint="Import an SRT/VTT file or add cues manually. Auto-generation needs a speech-provider key (Settings → AI providers) and is not fabricated locally." />
              ) : (
                <div className="flex flex-col gap-2">
                  {cues.map((cue, i) => (
                    <div key={i} className="panel-glass flex flex-col gap-2 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <Badge tone="default">{String(cue.index).padStart(2, '0')}</Badge>
                        <span className="font-mono text-[10px] text-zinc-500">{cue.start.toFixed(2)}s → {cue.end.toFixed(2)}s</span>
                        <button onClick={() => setEditing(editing === i ? null : i)} className="ml-auto rounded p-1 text-zinc-400 hover:text-white" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => removeCue(i)} className="rounded p-1 text-zinc-500 hover:text-red-300" title="Delete cue">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {editing === i ? (
                        <div className="grid grid-cols-3 gap-2">
                          <Field label="Start (s)">
                            <TextInput type="number" step={0.01} value={cue.start.toFixed(2)} onChange={(e) => updateCue(i, { start: Number(e.target.value) })} className="font-mono text-xs" />
                          </Field>
                          <Field label="End (s)">
                            <TextInput type="number" step={0.01} value={cue.end.toFixed(2)} onChange={(e) => updateCue(i, { end: Number(e.target.value) })} className="font-mono text-xs" />
                          </Field>
                          <Field label="Duration">
                            <div className="flex items-center text-[11px] font-mono text-zinc-500">{(cue.end - cue.start).toFixed(2)}s</div>
                          </Field>
                          <div className="col-span-3">
                            <Field label="Text">
                              <TextInput value={cue.text} onChange={(e) => updateCue(i, { text: e.target.value })} placeholder="Subtitle line…" />
                            </Field>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-md bg-black/40 px-2 py-1.5 text-sm text-zinc-100">
                          {cue.text || <span className="italic text-zinc-600">Empty cue — click to edit</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Preview panel */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-[--color-border-soft] bg-[--color-ink-900] lg:flex">
          <div className="border-b border-[--color-border-soft] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Preview</div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
            <div className="relative flex w-full flex-col justify-end overflow-hidden rounded-xl border border-zinc-800 bg-black px-4 pb-4 aspect-video">
              {cues.length > 0 ? (
                <>
                  <div className="self-start rounded bg-black/70 px-2 py-0.5 text-[10px] text-zinc-400">{language.toUpperCase()}</div>
                  {cues.slice(0, 2).map((cue, i) => (
                    <div key={i} className="w-full text-center text-lg font-semibold text-white drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                      {cue.text}
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-[11px] text-zinc-600">Subtitle preview</div>
              )}
            </div>
            <div className="text-center text-[10px] text-zinc-600">
              Languages: English and Amharic (am) supported natively by the player stack. Translation requires a speech/translation provider — not fabricated locally.
            </div>
            {speaking && <div className="text-[10px] text-indigo-300">Reading aloud…</div>}
            {language !== 'en' && !hasVoiceFor(language.slice(0, 2)) && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">No {language.toUpperCase()} voice detected in this browser — preview may fall back to another voice.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
