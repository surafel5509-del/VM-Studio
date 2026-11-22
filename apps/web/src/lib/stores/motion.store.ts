'use client';

import { create } from 'zustand';
import type {
  MotionLayer,
  Composition,
  Keyframe,
  EasingType,
} from '@frameforge/shared';
import { getSupabase } from '@/lib/supabase';

export const PLAYHEAD_DEFAULT = 0;

function makeLayer(partial: Partial<MotionLayer> & { name: string; kind: MotionLayer['kind'] }): MotionLayer {
  return {
    id: crypto.randomUUID(),
    name: partial.name,
    kind: partial.kind,
    visible: true,
    locked: false,
    lockedToParent: false,
    parentId: null,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    anchor: { x: 0, y: 0 },
    keyframes: {},
    text: partial.text,
    color: partial.color,
    shape: partial.shape,
    gradient: partial.gradient,
    solidColor: partial.solidColor,
    mediaId: partial.mediaId,
    ...(partial.text !== undefined ? { text: partial.text } : {}),
    ...(partial.color !== undefined ? { color: partial.color } : {}),
    ...(partial.shape !== undefined ? { shape: partial.shape } : {}),
    ...(partial.gradient !== undefined ? { gradient: partial.gradient } : {}),
    ...(partial.solidColor !== undefined ? { solidColor: partial.solidColor } : {}),
    ...(partial.mediaId !== undefined ? { mediaId: partial.mediaId } : {}),
  };
}

export function createDefaultComposition(name = 'Untitled composition'): Composition {
  return {
    id: crypto.randomUUID(),
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 10,
    backgroundColor: '#0b0b0f',
    layers: [
      makeLayer({ name: 'Background', kind: 'solid', solidColor: '#0b0b0f' }),
      makeLayer({ name: 'Title', kind: 'text', text: 'Your title here', color: '#ffffff' }),
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

interface MotionState {
  composition: Composition;
  projectId: string | null;
  playhead: number;
  playing: boolean;
  selectedLayerId: string | null;

  load: (composition: Composition, projectId: string | null) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  selectLayer: (id: string | null) => void;

  update: (mutator: (c: Composition) => Composition) => void;

  // layers
  addLayer: (partial: Partial<MotionLayer> & { name: string; kind: MotionLayer['kind'] }) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  toggleVisible: (id: string) => void;
  toggleLock: (id: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  setTransform: (id: string, transform: Partial<MotionLayer['transform']>) => void;
  setText: (id: string, text: string) => void;
  setColor: (id: string, color: string) => void;
  setGradient: (id: string, gradient: MotionLayer['gradient']) => void;

  // keyframes
  addKeyframe: (id: string, propertyPath: string, value: number, easing?: EasingType) => void;
  removeKeyframe: (id: string, propertyPath: string, keyframeId: string) => void;
  setKeyframeEasing: (id: string, propertyPath: string, keyframeId: string, easing: EasingType) => void;

  renameComposition: (name: string) => void;
  setDuration: (duration: number) => void;
}

export const useMotion = create<MotionState>((set, get) => ({
  composition: createDefaultComposition(),
  projectId: null,
  playhead: 0,
  playing: false,
  selectedLayerId: null,

  load: (composition, projectId) => set({ composition, projectId, playhead: 0, playing: false, selectedLayerId: null }),
  setPlayhead: (t) => set({ playhead: Math.max(0, Math.min(t, get().composition.duration)) }),
  setPlaying: (p) => set({ playing: p }),
  selectLayer: (id) => set({ selectedLayerId: id }),

  update: (mutator) => {
    const next = mutator(get().composition);
    set({ composition: { ...next, updatedAt: new Date().toISOString() } });
  },

  addLayer: (partial) => {
    const layer = makeLayer(partial);
    get().update((c) => ({ ...c, layers: [layer, ...c.layers] }));
    set({ selectedLayerId: layer.id });
  },

  removeLayer: (id) => {
    const sel = get().selectedLayerId === id ? null : get().selectedLayerId;
    get().update((c) => ({ ...c, layers: c.layers.filter((l) => l.id !== id) }));
    set({ selectedLayerId: sel });
  },

  duplicateLayer: (id) => {
    const layer = get().composition.layers.find((l) => l.id === id);
    if (!layer) return;
    const clone: MotionLayer = {
      ...JSON.parse(JSON.stringify(layer)),
      id: crypto.randomUUID(),
      name: layer.name + ' copy',
    };
    get().update((c) => ({ ...c, layers: [clone, ...c.layers] }));
    set({ selectedLayerId: clone.id });
  },

  renameLayer: (id, name) => get().update((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, name } : l)) })),

  toggleVisible: (id) => get().update((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) })),

  toggleLock: (id) => get().update((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)) })),

  moveLayerUp: (id) => {
    const c = get().composition;
    const idx = c.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    const layers = [...c.layers];
    const [l] = layers.splice(idx, 1);
    layers.splice(idx - 1, 0, l!);
    get().update((c) => ({ ...c, layers }));
  },

  moveLayerDown: (id) => {
    const c = get().composition;
    const idx = c.layers.findIndex((l) => l.id === id);
    if (idx < 0 || idx >= c.layers.length - 1) return;
    const layers = [...c.layers];
    const [l] = layers.splice(idx, 1);
    layers.splice(idx + 1, 0, l!);
    get().update((c) => ({ ...c, layers }));
  },

  setTransform: (id, transform) =>
    get().update((c) => ({
      ...c,
      layers: c.layers.map((l) => (l.id === id ? { ...l, transform: { ...l.transform, ...transform } } : l)),
    })),

  setText: (id, text) =>
    get().update((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, text } : l)) })),

  setColor: (id, color) =>
    get().update((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, color, solidColor: color } : l)) })),

  setGradient: (id, gradient) =>
    get().update((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, gradient } : l)) })),

  addKeyframe: (id, propertyPath, value, easing = 'easeInOut') => {
    const playhead = get().playhead;
    get().update((c) => ({
      ...c,
      layers: c.layers.map((l) => {
        if (l.id !== id) return l;
        const existing = l.keyframes[propertyPath] ?? [];
        const replaced = existing.filter((k) => Math.abs(k.time - playhead) > 0.001);
        const keyframe: Keyframe = { id: crypto.randomUUID(), time: playhead, value, easing };
        return { ...l, keyframes: { ...l.keyframes, [propertyPath]: [...replaced, keyframe].sort((a, b) => a.time - b.time) } };
      }),
    }));
  },

  removeKeyframe: (id, propertyPath, keyframeId) =>
    get().update((c) => ({
      ...c,
      layers: c.layers.map((l) =>
        l.id === id
          ? { ...l, keyframes: { ...l.keyframes, [propertyPath]: (l.keyframes[propertyPath] ?? []).filter((k) => k.id !== keyframeId) } }
          : l,
      ),
    })),

  setKeyframeEasing: (id, propertyPath, keyframeId, easing) =>
    get().update((c) => ({
      ...c,
      layers: c.layers.map((l) =>
        l.id === id
          ? { ...l, keyframes: { ...l.keyframes, [propertyPath]: (l.keyframes[propertyPath] ?? []).map((k) => (k.id === keyframeId ? { ...k, easing } : k)) } }
          : l,
      ),
    })),

  renameComposition: (name) => get().update((c) => ({ ...c, name })),

  setDuration: (duration) => get().update((c) => ({ ...c, duration: Math.max(1, duration) })),
}));

// ---------- persistence ----------

export async function saveComposition(composition: Composition, ownerId: string | null, projectId: string | null = null): Promise<string | null> {
  if (!ownerId) return null;
  try {
    const supabase = getSupabase();
    const payload = {
      id: composition.id !== 'local' ? composition.id : undefined,
      project_id: projectId,
      owner_id: ownerId,
      name: composition.name,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      duration: composition.duration,
      background_color: composition.backgroundColor,
      data: composition,
    };
    const { data, error } = await supabase.from('compositions').upsert(payload, { onConflict: 'id' }).select('id');
    if (error) return null;
    return (data?.[0] as { id: string } | undefined)?.id ?? null;
  } catch {
    return null;
  }
}

export async function loadCompositionFromDb(ownerId: string | null, projectId: string | null = null): Promise<Composition | null> {
  if (!ownerId) return null;
  try {
    const supabase = getSupabase();
    let q = supabase.from('compositions').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }).limit(1);
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) return null;
    const row = data?.[0];
    if (!row) return null;
    const rowData = (row.data ?? {}) as Partial<Composition>;
    return { ...createDefaultComposition(row.name), ...rowData, id: rowData.id ?? row.id, name: row.name, width: row.width, height: row.height, fps: row.fps, duration: Number(row.duration), backgroundColor: row.background_color ?? '#0b0b0f' } as Composition;
  } catch {
    return null;
  }
}
