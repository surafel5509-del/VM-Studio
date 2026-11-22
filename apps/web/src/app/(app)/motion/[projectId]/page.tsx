'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMotion, createDefaultComposition } from '@/lib/stores/motion.store';
import { MotionCanvas } from '@/components/motion/MotionCanvas';
import { Button, Panel, Badge, Spinner, EmptyState } from '@/components/ui';
import { Play, Pause, Plus, Trash2, Copy, Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown, Type, Square, Circle, Hash, Loader2, KeyRound } from 'lucide-react';
import type { MotionLayer, EasingType } from '@frameforge/shared';
import { keyframeCount } from '@/lib/motion-helpers';
import clsx from 'clsx';
import { useAuth } from '@/lib/stores/auth.store';

const LAYER_TYPES: { kind: MotionLayer['kind']; label: string; icon: typeof Type }[] = [
  { kind: 'text', label: 'Text', icon: Type },
  { kind: 'shape', label: 'Shape', icon: Square },
  { kind: 'gradient', label: 'Gradient', icon: Hash },
  { kind: 'solid', label: 'Solid', icon: Square },
  { kind: 'null', label: 'Null', icon: Circle },
];

const EASINGS: { value: EasingType; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease In' },
  { value: 'easeOut', label: 'Ease Out' },
  { value: 'easeInOut', label: 'Ease In Out' },
  { value: 'easeInOutBack', label: 'Back' },
  { value: 'easeInOutElastic', label: 'Elastic' },
];

export default function MotionPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { user } = useAuth();
  const motion = useMotion();
  const { composition, playhead, playing, selectedLayerId } = motion;

  const selectedLayer = useMemo(
    () => composition.layers.find((l) => l.id === selectedLayerId) ?? null,
    [composition.layers, selectedLayerId],
  );

  // rAF playback
  const rafRef = useRef(0);
  const lastTick = useRef(0);
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    lastTick.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTick.current) / 1000;
      lastTick.current = now;
      const { playhead: ph, setPlayhead, setPlaying, composition: c } = useMotion.getState();
      const next = ph + dt;
      if (next >= c.duration) {
        setPlayhead(c.duration);
        setPlaying(false);
        return;
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  // load the project's composition on mount — or seed a default
  useEffect(() => {
    if (!user || !projectId) return;
    let cancelled = false;
    void import('@/lib/stores/motion.store').then(async ({ loadCompositionFromDb, useMotion }) => {
      const existing = await loadCompositionFromDb(user.id, projectId);
      if (cancelled) return;
      useMotion.getState().load(existing ?? createDefaultComposition('Untitled Composition'), projectId);
    });
    return () => { cancelled = true; };
  }, [user, projectId]);

  // autosave (debounced) — honest persistence
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user || !projectId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void import('@/lib/stores/motion.store').then(({ saveComposition }) => {
        void saveComposition(composition, user.id, projectId);
      });
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition, user, projectId]);

  const addLayer = (kind: MotionLayer['kind']) => {
    const base = { kind, name: `${kind.charAt(0).toUpperCase() + kind.slice(1)} layer` };
    if (kind === 'text') motion.addLayer({ ...base, text: 'New text', color: '#ffffff' });
    else if (kind === 'shape') motion.addLayer({ ...base, shape: 'rect', color: '#6366f1' });
    else if (kind === 'gradient') motion.addLayer({ ...base, gradient: { from: '#6366f1', to: '#a855f7', angle: 45 } });
    else if (kind === 'solid') motion.addLayer({ ...base, solidColor: '#18181b' });
    else if (kind === 'null') motion.addLayer(base);
    else motion.addLayer(base);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] bg-[--color-ink-900] px-4 py-2">
        <div className="flex items-center gap-3">
          <button onClick={() => motion.renameComposition(composition.name)} className="min-w-0" title="Rename via prompt">
            <input
              value={composition.name}
              onChange={(e) => {}}
              onBlur={(e) => motion.renameComposition(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="min-w-0 bg-transparent text-sm font-semibold text-zinc-100 outline-none border-b border-transparent hover:border-zinc-700 focus:border-indigo-500"
              aria-label="Composition name"
            />
          </button>
          <Badge tone="info">{composition.width}×{composition.height}</Badge>
          <Badge>{composition.duration.toFixed(1)}s</Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => useMotion.getState().setPlaying(!playing)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-white hover:bg-indigo-400"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
          </button>
          <Button variant="subtle" className="text-[11px]" onClick={() => { motion.setPlayhead(0); motion.setPlaying(false); }}>
            <Play className="h-3 w-3" /> Restart
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left: layers panel */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-[--color-border-soft] bg-[--color-ink-900] md:flex">
          <div className="flex items-center justify-between border-b border-[--color-border-soft] px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Layers</span>
            <div className="flex gap-1">
              {LAYER_TYPES.map(({ kind, label, icon: Icon }) => (
                <button key={kind} title={`Add ${label}`} onClick={() => addLayer(kind)} className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/10">
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {composition.layers.length === 0 && <div className="p-4 text-center text-[11px] text-zinc-500">No layers. Add one above.</div>}
            {composition.layers.map((layer) => (
              <button
                key={layer.id}
                onClick={() => motion.selectLayer(layer.id)}
                className={clsx(
                  'flex w-full items-center gap-2 border-b border-[--color-border-soft] px-2.5 py-2 text-left transition-colors',
                  selectedLayerId === layer.id ? 'bg-indigo-500/15 border-indigo-500/30' : 'hover:bg-white/5',
                )}
              >
                <span className="max-w-24 truncate text-xs font-medium text-zinc-200">{layer.name}</span>
                <span className="ml-auto flex items-center gap-1 text-zinc-500">
                  {keyframeCount(layer) > 0 && <KeyRound className="h-3 w-3 text-amber-400" />}
                  <span
                    role="button"
                    title={layer.visible ? 'Hide' : 'Show'}
                    onClick={(e) => { e.stopPropagation(); motion.toggleVisible(layer.id); }}
                    className="rounded p-0.5"
                  >
                    {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 opacity-40" />}
                  </span>
                  <span
                    role="button"
                    title={layer.locked ? 'Unlock' : 'Lock'}
                    onClick={(e) => { e.stopPropagation(); motion.toggleLock(layer.id); }}
                    className="rounded p-0.5"
                  >
                    {layer.locked ? <Lock className="h-3 w-3 text-amber-400" /> : <Unlock className="h-3 w-3" />}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Center: canvas + timeline */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 min-h-0 border-b border-[--color-border-soft]">
            <MotionCanvas composition={composition} playhead={playhead} />
          </div>

          {/* Keyframe timeline ruler */}
          <div className="flex h-20 shrink-0 flex-col border-t border-[--color-border-soft] bg-[--color-ink-850]">
            <div className="flex items-center gap-3 border-b border-[--color-border-soft] px-3 py-1.5">
              <button
                onClick={() => { motion.setPlayhead(Math.max(0, playhead - 1 / composition.fps)); }}
                className="rounded p-1 text-zinc-400 hover:text-white"
                title="Frame back"
              ><span className="text-[10px] font-bold px-1">◂</span></button>
              <button
                onClick={() => { motion.setPlayhead(Math.min(composition.duration, playhead + 1 / composition.fps)); }}
                className="rounded p-1 text-zinc-400 hover:text-white"
                title="Frame forward"
              ><span className="text-[10px] font-bold px-1">▸</span></button>
              <span className="font-mono text-[11px] text-zinc-300">{playhead.toFixed(2)}s / {composition.duration.toFixed(1)}s</span>
              <span className="ml-auto text-[10px] text-zinc-500">{composition.fps} fps</span>
            </div>
            <div
              className="relative flex-1 cursor-col-resize mx-3 my-2 rounded-md bg-zinc-900 border border-zinc-800"
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const t = ((e.clientX - rect.left) / rect.width) * composition.duration;
                motion.setPlayhead(t);
                const move = (ev: PointerEvent) => {
                  const tt = ((ev.clientX - rect.left) / rect.width) * composition.duration;
                  motion.setPlayhead(Math.max(0, Math.min(composition.duration, tt)));
                };
                const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            >
              <div className="absolute top-0 bottom-0 w-px bg-rose-500" style={{ left: `${(playhead / composition.duration) * 100}%` }} />
              {selectedLayer && (
                <>
                  {renderKeyframeMarkers(selectedLayer, composition.duration, composition.fps)}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: inspector */}
        <aside className="w-64 shrink-0 overflow-y-auto border-l border-[--color-border-soft] bg-[--color-ink-900] p-3">
          {selectedLayer ? (
            <LayerInspector layer={selectedLayer} />
          ) : (
            <EmptyState title="No layer selected" hint="Pick a layer from the hierarchy to edit it." />
          )}
        </aside>
      </div>
    </div>
  );
}

function renderKeyframeMarkers(layer: MotionLayer, duration: number, fps: number) {
  const markers: React.ReactNode[] = [];
  for (const [path, keys] of Object.entries(layer.keyframes)) {
    for (const key of keys) {
      const color = path === 'opacity' ? 'bg-violet-400' : path.includes('rotation') ? 'bg-amber-400' : 'bg-indigo-400';
      markers.push(
        <div
          key={key.id}
          title={`${path} @ ${key.time.toFixed(2)}s — ${key.easing}`}
          className={clsx('absolute top-1.5 h-2.5 w-2.5 rotate-45', color)}
          style={{ left: `calc(${(key.time / duration) * 100}% - 5px)` }}
        />,
      );
    }
  }
  return markers;
}

function LayerInspector({ layer }: { layer: MotionLayer }) {
  const motion = useMotion();
  const keysCount = keyframeCount(layer);

  const transformProps = [
    { path: 'transform.x' as const, label: 'Position X', defaultValue: layer.transform.x, min: -1, max: 1, step: 0.01 },
    { path: 'transform.y' as const, label: 'Position Y', defaultValue: layer.transform.y, min: -1, max: 1, step: 0.01 },
    { path: 'transform.scale' as const, label: 'Scale', defaultValue: layer.transform.scale, min: 0.1, max: 3, step: 0.02 },
    { path: 'transform.rotation' as const, label: 'Rotation', defaultValue: layer.transform.rotation, min: -360, max: 360, step: 1 },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Layer</div>
        <input
          value={layer.name}
          onChange={(e) => motion.renameLayer(layer.id, e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-xs font-semibold text-zinc-100 outline-none focus:border-indigo-500"
          aria-label="Layer name"
        />
        <div className="mt-1 text-[10px] text-zinc-500">{layer.kind} · {keysCount} keyframe{keysCount === 1 ? '' : 's'}</div>
      </div>

      {(layer.kind === 'text') && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Text</label>
          <textarea
            value={layer.text ?? ''}
            onChange={(e) => motion.setText(layer.id, e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
          />
        </div>
      )}

      {(layer.kind === 'shape' || layer.kind === 'gradient' || layer.kind === 'solid' || layer.kind === 'text') && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{layer.kind === 'gradient' ? 'Gradient from' : 'Color'}</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={layer.color ?? layer.gradient?.from ?? layer.solidColor ?? '#6366f1'}
              onChange={(e) => {
                if (layer.kind === 'gradient') motion.setGradient(layer.id, { ...(layer.gradient ?? { from: '#6366f1', to: '#a855f7', angle: 45 }), from: e.target.value });
                else motion.setColor(layer.id, e.target.value);
              }}
              className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            {layer.kind === 'gradient' && (
              <input
                type="color"
                value={layer.gradient?.to ?? '#a855f7'}
                onChange={(e) => motion.setGradient(layer.id, { ...(layer.gradient ?? { from: '#6366f1', to: '#a855f7', angle: 45 }), to: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
                title="Gradient to"
              />
            )}
          </div>
        </div>
      )}

      {layer.kind === 'shape' && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Shape</label>
          <select
            value={layer.shape ?? 'rect'}
            onChange={(e) => motion.update((c) => ({ ...c, layers: c.layers.map((l) => (l.id === layer.id ? { ...l, shape: e.target.value as MotionLayer['shape'] } : l)) }))}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-xs text-zinc-100 outline-none"
          >
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="triangle">Triangle</option>
            <option value="star">Star</option>
            <option value="line">Line</option>
          </select>
        </div>
      )}

      <div className="space-y-2 border-t border-[--color-border-soft] pt-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Transform</div>
        {transformProps.map(({ path, label, defaultValue, min, max, step }) => (
          <div key={path} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[10px] text-zinc-500">{label}</span>
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={(layer.transform[path.replace('transform.', '') as keyof MotionLayer['transform']] as number) ?? defaultValue}
              onChange={(e) => motion.setTransform(layer.id, { [path.replace('transform.', '')]: Number(e.target.value) } as Partial<MotionLayer['transform']>)}
              className="w-full rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-1 text-[11px] font-mono text-zinc-100 outline-none focus:border-indigo-500"
            />
            <button
              title="Add keyframe at playhead"
              onClick={() => motion.addKeyframe(layer.id, path, (layer.transform[path.replace('transform.', '') as keyof MotionLayer['transform']] as number) ?? defaultValue)}
              className="shrink-0 rounded p-1 text-amber-400 hover:bg-amber-500/15"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {/* opacity */}
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[10px] text-zinc-500">Opacity</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={clamp01(opacityValueAt(layer, motion.playhead))}
            onChange={(e) => {
              const v = Math.max(0, Math.min(1, Number(e.target.value)));
              // set transform default; keyframe if requested below
              motion.update((c) => ({
                ...c,
                layers: c.layers.map((l) =>
                  l.id === layer.id
                    ? {
                        ...l,
                        keyframes: {
                          ...l.keyframes,
                          opacity: l.keyframes.opacity?.length
                            ? l.keyframes.opacity
                            : [{ id: crypto.randomUUID(), time: 0, value: v, easing: 'linear' as EasingType }],
                        },
                      }
                    : l,
                ),
              }));
              // also add a keyframe at playhead
              motion.addKeyframe(layer.id, 'opacity', v);
            }}
            className="w-full rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-1 text-[11px] font-mono text-zinc-100 outline-none focus:border-indigo-500"
          />
          <button
            title="Add keyframe at playhead"
            onClick={() => motion.addKeyframe(layer.id, 'opacity', clamp01(opacityValueAt(layer, motion.playhead)))}
            className="shrink-0 rounded p-1 text-amber-400 hover:bg-amber-500/15"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Keyframe list */}
      {keyframeGroups(layer).length > 0 && (
        <div className="space-y-2 border-t border-[--color-border-soft] pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Keyframes</div>
          {keyframeGroups(layer).map(({ path, keys }) => (
            <div key={path}>
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-400">{path}</span>
                <span className="text-[9px] text-zinc-600">{keys.length} key</span>
              </div>
              <div className="space-y-1">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center gap-1.5 rounded bg-white/[0.03] px-1.5 py-1">
                    <span className="font-mono text-[10px] text-zinc-300">{k.time.toFixed(2)}s</span>
                    <span className="font-mono text-[10px] text-zinc-500">{k.value.toFixed(2)}</span>
                    <select
                      value={k.easing}
                      onChange={(e) => motion.setKeyframeEasing(layer.id, path, k.id, e.target.value as EasingType)}
                      className="ml-auto rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[9px] text-zinc-300 outline-none"
                    >
                      {EASINGS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                    <button onClick={() => motion.removeKeyframe(layer.id, path, k.id)} title="Delete keyframe" className="rounded p-0.5 text-red-400/80 hover:text-red-300">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Layer actions */}
      <div className="flex gap-2 border-t border-[--color-border-soft] pt-2">
        <Button variant="subtle" className="flex-1 text-[10px]" onClick={() => motion.moveLayerUp(layer.id)}><ArrowUp className="h-3 w-3" /> Up</Button>
        <Button variant="subtle" className="flex-1 text-[10px]" onClick={() => motion.moveLayerDown(layer.id)}><ArrowDown className="h-3 w-3" /> Down</Button>
        <Button variant="subtle" className="flex-1 text-[10px]" onClick={() => motion.duplicateLayer(layer.id)}><Copy className="h-3 w-3" /></Button>
        <Button variant="danger" className="flex-1 text-[10px]" onClick={() => { if (confirm('Delete this layer?')) motion.removeLayer(layer.id); }}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function keyframeGroups(layer: MotionLayer) {
  return Object.entries(layer.keyframes)
    .map(([path, keys]) => ({ path, keys: keys.slice().sort((a, b) => a.time - b.time) }))
    .filter(({ keys }) => keys.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

function opacityValueAt(layer: MotionLayer, t: number): number {
  const keys = layer.keyframes.opacity ?? [];
  if (!keys.length) return 1;
  const sorted = keys.slice().sort((a, b) => a.time - b.time);
  if (t <= sorted[0]!.time) return sorted[0]!.value;
  if (t >= sorted[sorted.length - 1]!.time) return sorted[sorted.length - 1]!.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t >= a.time && t < b.time) {
      const local = (t - a.time) / Math.max(1e-6, b.time - a.time);
      return a.value + (b.value - a.value) * local;
    }
  }
  return 1;
}
