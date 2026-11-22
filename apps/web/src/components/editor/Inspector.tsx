'use client';

import { useTimeline, useSelectedClip } from '@/lib/stores/timeline.store';
import { TextInput, Field, RangeInput, Button, Panel, EmptyState } from '@/components/ui';
import { Trash2, Copy, Type, Square } from 'lucide-react';
import type { TimelineClip } from '@frameforge/shared';

export function Inspector() {
  const clip = useSelectedClip();
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Panel title="Inspector" className="min-h-0 flex-1">
        {clip ? <ClipInspector clip={clip} /> : <EmptyState icon={<Square className="h-6 w-6" />} title="No clip selected" hint="Select a clip on the timeline to edit its properties." />}
      </Panel>
      <Panel title="Add layer" className="shrink-0">
        <AddLayerButtons />
      </Panel>
    </div>
  );
}

function ClipInspector({ clip }: { clip: TimelineClip }) {
  const {
    setText, setSpeed, setVolume, setOpacity, setTransform, setColor, removeClip, duplicateClip,
  } = useTimeline();

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-100" title={clip.name}>{clip.name}</div>
        <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{clip.layerKind}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Start (s)">
          <TextInput value={clip.start.toFixed(2)} readOnly className="font-mono text-xs" />
        </Field>
        <Field label="Duration (s)">
          <TextInput value={clip.duration.toFixed(2)} readOnly className="font-mono text-xs" />
        </Field>
      </div>

      {clip.layerKind !== 'audio' && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Speed</span>
            <span className="font-mono text-zinc-200">{clip.speed.toFixed(2)}x</span>
          </div>
          <RangeInput value={clip.speed * 100} min={50} max={400} step={5} onChange={(v) => setSpeed(clip.id, v / 100)} />
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Volume</span>
          <span className="font-mono text-zinc-200">{Math.round(clip.volume * 100)}%</span>
        </div>
        <RangeInput value={clip.volume * 100} min={0} max={100} step={1} onChange={(v) => setVolume(clip.id, v / 100)} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Opacity</span>
          <span className="font-mono text-zinc-200">{Math.round(clip.opacity * 100)}%</span>
        </div>
        <RangeInput value={clip.opacity * 100} min={0} max={100} step={1} onChange={(v) => setOpacity(clip.id, v / 100)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="X">
          <TextInput type="number" step={0.01} min={-1} max={1} value={clip.transform.x.toFixed(2)} onChange={(e) => setTransform(clip.id, { x: Number(e.target.value) })} className="font-mono text-xs" />
        </Field>
        <Field label="Y">
          <TextInput type="number" step={0.01} min={-1} max={1} value={clip.transform.y.toFixed(2)} onChange={(e) => setTransform(clip.id, { y: Number(e.target.value) })} className="font-mono text-xs" />
        </Field>
        <Field label="Scale">
          <TextInput type="number" step={0.05} min={0.1} max={3} value={clip.transform.scale.toFixed(2)} onChange={(e) => setTransform(clip.id, { scale: Number(e.target.value) })} className="font-mono text-xs" />
        </Field>
        <Field label="Rotation °">
          <TextInput type="number" step={1} value={clip.transform.rotation.toFixed(0)} onChange={(e) => setTransform(clip.id, { rotation: Number(e.target.value) })} className="font-mono text-xs" />
        </Field>
      </div>

      {clip.layerKind === 'text' && (
        <Field label="Text">
          <TextInput value={clip.text ?? ''} onChange={(e) => setText(clip.id, e.target.value)} />
        </Field>
      )}
      {(clip.layerKind === 'solid' || clip.layerKind === 'text') && (
        <Field label="Color">
          <div className="flex items-center gap-2">
            <input type="color" value={clip.solidColor ?? '#ffffff'} onChange={(e) => setColor(clip.id, e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-zinc-700 bg-transparent" />
            <TextInput value={clip.solidColor ?? '#ffffff'} onChange={(e) => setColor(clip.id, e.target.value)} className="font-mono text-xs" />
          </div>
        </Field>
      )}

      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="subtle" onClick={() => duplicateClip(clip.id)}><Copy className="h-3.5 w-3.5" /> Duplicate</Button>
        <Button variant="danger" onClick={() => removeClip(clip.id)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
      </div>
    </div>
  );
}

function AddLayerButtons() {
  const track = useTimeline((s) => s.timeline.tracks.find((t) => t.kind === 'video') ?? null);
  const playhead = useTimeline((s) => s.playhead);
  const { addClip, addTrack } = useTimeline();

  const addText = () => {
    if (!track) return;
    addClip(track.id, {
      mediaId: null, layerKind: 'text', name: 'Title', start: playhead, duration: 3,
      inPoint: 0, outPoint: null, speed: 1, volume: 1, opacity: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      text: 'Your headline here',
      solidColor: '#ffffff',
    });
  };

  const addSolid = () => {
    if (!track) return;
    addClip(track.id, {
      mediaId: null, layerKind: 'solid', name: 'Solid', start: playhead, duration: 3,
      inPoint: 0, outPoint: null, speed: 1, volume: 1, opacity: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      solidColor: '#16161d',
    });
  };

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      <Button variant="subtle" className="w-full" onClick={addText}><Type className="h-3.5 w-3.5" /> Text</Button>
      <Button variant="subtle" className="w-full" onClick={addSolid}><Square className="h-3.5 w-3.5" /> Solid</Button>
      <Button variant="ghost" className="col-span-2 w-full text-[11px]" onClick={() => addTrack('video')}>+ Video track</Button>
      <Button variant="ghost" className="col-span-2 w-full text-[11px]" onClick={() => addTrack('audio')}>+ Audio track</Button>
    </div>
  );
}
