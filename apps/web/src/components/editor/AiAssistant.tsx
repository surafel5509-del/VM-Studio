'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { parseCommand, type EditPlan, type PlannedAction } from '@frameforge/shared';
import { useTimeline } from '@/lib/stores/timeline.store';
import { useMedia } from '@/lib/stores/media.store';
import { Button, Panel, Spinner, Badge } from '@/components/ui';
import { Sparkles, Send, AlertTriangle, ShieldCheck, Wrench } from 'lucide-react';
import clsx from 'clsx';

type ExecutionState = {
  phase: 'idle' | 'running' | 'done' | 'error';
  note: string | null;
};

export function AiAssistant({ onClose }: { onClose?: () => void }) {
  const timeline = useTimeline((s) => s.timeline);
  const selectedClipId = useTimeline((s) => s.selectedClipId);
  const playhead = useTimeline((s) => s.playhead);
  const [input, setInput] = useState('');
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [phase, setPhase] = useState<ExecutionState>({ phase: 'idle', note: null });
  const [history, setHistory] = useState<Array<{ time: number; summary: string }>>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const media = useMedia();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedClip = useMemo(
    () => timeline.clips.find((c) => c.id === selectedClipId) ?? null,
    [timeline, selectedClipId],
  );

  const ensureSignedUrls = useCallback(async () => {
    const urlMap: Record<string, string> = {};
    for (const clip of timeline.clips) {
      if (!clip.mediaId || urlMap[clip.mediaId]) continue;
      const path = timelineAssetPath(media.assets, clip.mediaId);
      if (!path) continue;
      const signed = await media.getSignedUrl(path);
      if (signed) urlMap[clip.mediaId] = signed;
    }
    setSignedUrls((prev) => ({ ...prev, ...urlMap }));
    return urlMap;
  }, [timeline, media]);

  const handleParse = () => {
    const text = input.trim();
    if (!text) return;
    const p = parseCommand(text, {
      playheadTime: playhead,
      selectedClipId,
      timeline,
      hasAudioTracks: timeline.tracks.some((t) => t.kind === 'audio'),
    });
    setPlan(p);
    setPhase({ phase: 'idle', note: null });
  };

  const execute = async () => {
    if (!plan) return;
    const store = useTimeline.getState();
    setPhase({ phase: 'running', note: 'Applying changes…' });

    try {
      for (const action of plan.actions) {
        if (action.kind === 'unknown') continue;
        if (action.kind === 'splitAtPlayhead') {
          store.splitAtPlayhead();
        } else if (action.kind === 'addMarker') {
          store.addMarker(playhead, action.label);
        } else if (action.kind === 'deleteSelectedClip') {
          if (selectedClipId) {
            if (action.ripple) store.rippleDeleteClip(selectedClipId);
            else store.removeClip(selectedClipId);
          }
        } else if (action.kind === 'duplicateSelectedClip') {
          if (selectedClipId) store.duplicateClip(selectedClipId);
        } else if (action.kind === 'setSpeed') {
          if (selectedClipId) store.setSpeed(selectedClipId, action.speed);
        } else if (action.kind === 'setVolume') {
          if (selectedClipId) store.setVolume(selectedClipId, action.volume);
        } else if (action.kind === 'setOpacity') {
          if (selectedClipId) store.setOpacity(selectedClipId, action.opacity);
        } else if (action.kind === 'addTextLayer') {
          const track = timeline.tracks.find((t) => t.kind === 'video');
          if (track) {
            store.addClip(track.id, {
              mediaId: null, layerKind: 'text', name: 'AI Title', start: playhead, duration: action.duration ?? 3,
              inPoint: 0, outPoint: null, speed: 1, volume: 1, opacity: 1,
              transform: { x: 0, y: 0, scale: 1, rotation: 0 }, text: action.text, solidColor: '#ffffff',
            });
          }
        } else if (action.kind === 'addSolidLayer') {
          const track = timeline.tracks.find((t) => t.kind === 'video');
          if (track) {
            store.addClip(track.id, {
              mediaId: null, layerKind: 'solid', name: 'AI Solid', start: playhead, duration: action.duration ?? 3,
              inPoint: 0, outPoint: null, speed: 1, volume: 1, opacity: 1,
              transform: { x: 0, y: 0, scale: 1, rotation: 0 }, solidColor: action.color ?? '#16161d',
            });
          }
        } else if (action.kind === 'zoomTimelineIn') {
          store.zoomIn();
        } else if (action.kind === 'zoomTimelineOut') {
          store.zoomOut();
        } else if (action.kind === 'trimToShort') {
          // Ripple-delete all video-track clips beyond the cut point
          const cutTime = action.targetSeconds;
          const trackIds = new Set(timeline.tracks.filter((t) => t.kind === 'video').map((t) => t.id));
          for (const clip of [...store.timeline.clips]) {
            if (!trackIds.has(clip.trackId)) continue;
            if (clip.start >= cutTime) {
              store.removeClip(clip.id);
            } else if (clip.start < cutTime && clip.start + clip.duration > cutTime) {
              // split off the tail portion
              store.splitClipAt(clip.id, cutTime);
              const tail = store.timeline.clips.find((c) => c.trackId === clip.trackId && c.start >= cutTime - 0.01);
              if (tail) store.removeClip(tail.id);
            }
          }
        } else if (action.kind === 'silenceRemoval') {
          setPhase({ phase: 'running', note: 'Analyzing audio — this can take a moment…' });
          const { applySilenceRemoval } = await import('@/lib/silence-removal');
          const result = await applySilenceRemoval({ ensureUrls: ensureSignedUrls });
          setPhase({ phase: 'done', note: `Silence removal applied. ${result.clipsWithSilence}/${result.clipsProcessed} audio clip(s) had silent spans removed.` });
        }
      }
      setPhase({ phase: 'done', note: 'All actions applied. Undo is available (Ctrl+Z).' });
      setHistory((h) => [{ time: Date.now(), summary: plan.summary }, ...h].slice(0, 10));
    } catch (e) {
      setPhase({ phase: 'error', note: e instanceof Error ? e.message : 'Execution failed' });
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-[--color-border-soft] px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold text-zinc-100">AI Editing Assistant</span>
        </div>
        {onClose && <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" title="Close">✕</button>}
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3 rounded-lg border border-indigo-500/25 bg-indigo-500/10 p-2.5 text-[11px] leading-relaxed text-indigo-200">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> Local, validated assistant</div>
          Deterministic edit planning, no generative LLM required. Commands like <em>"cinematic"</em> or <em>"voiceover"</em> need a configured provider (see Settings → AI providers).
        </div>

        <div className="mb-2 grid grid-cols-1 gap-1.5">
          {QUICK_COMMANDS.map((c) => (
            <button
              key={c}
              onClick={() => setInput(c)}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:border-indigo-500/40 hover:text-white transition-colors"
            >
              {c}
            </button>
          ))}
        </div>

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleParse(); }
          }}
          placeholder='Try: "Split at playhead" · "Add marker at playhead" · "Make a 30 second short" · "Remove silent sections"'
          rows={3}
          className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900/80 px-2.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" onClick={handleParse} disabled={!input.trim()} className="flex-1">
            <Send className="h-3.5 w-3.5" /> Parse plan
          </Button>
        </div>

        {plan && plan.actions.some((a) => a.kind !== 'unknown') && (
          <div className="ff-fadein mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
              {plan.needsConfirmation ? <AlertTriangle className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
              Proposed plan — {plan.summary}
            </div>
            <ul className="mb-2 list-disc space-y-0.5 pl-4 text-[11px] text-amber-100/90">
              {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            <div className="flex gap-2">
              <Button variant={plan.needsConfirmation ? 'danger' : 'primary'} onClick={execute} disabled={phase.phase === 'running'} className="flex-1 text-[11px]">
                {phase.phase === 'running' ? <Spinner className="h-3.5 w-3.5" /> : plan.needsConfirmation ? 'Confirm & apply' : 'Apply'}
              </Button>
              <Button variant="ghost" onClick={() => setPlan(null)} disabled={phase.phase === 'running'}>Cancel</Button>
            </div>
          </div>
        )}

        {plan && plan.actions.every((a) => a.kind === 'unknown') && (
          <div className="ff-fadein mt-3 rounded-lg border border-zinc-700 bg-white/[0.03] p-2.5 text-[11px] text-zinc-400">
            <div className="mb-1 font-semibold text-zinc-300">Not understood by the local planner</div>
            {plan.notes.map((n, i) => <p key={i} className="mt-1">{n}</p>)}
          </div>
        )}

        {phase.note && (
          <div className={clsx(
            'sticky bottom-0 mt-3 rounded-lg border p-2 text-[11px]',
            phase.phase === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-300' :
            phase.phase === 'done' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' :
            'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
          )}>
            {phase.note}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recent edit plans</div>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="rounded-md bg-white/[0.03] px-2 py-1.5 text-[10px] text-zinc-400">
                  {h.summary} · {new Date(h.time).toLocaleTimeString()}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const QUICK_COMMANDS = [
  'Split at playhead',
  'Add marker at playhead',
  'Duplicate selected clip',
  'Zoom in timeline',
  'Remove the selected clip',
  'Make a 30 second short',
  'Remove silent sections',
  'Add a text title at playhead saying "Hello World"',
];

function timelineAssetPath(assets: Array<{ id: string; storage_path: string }>, mediaId: string): string | undefined {
  return assets.find((a) => a.id === mediaId)?.storage_path;
}
