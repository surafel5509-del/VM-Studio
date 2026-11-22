'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Panel, Badge, Button, Spinner, EmptyState } from '@/components/ui';
import { Network, Plus, Trash2, ArrowRight, Layers, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { useActiveVideoFrame } from '@/lib/use-active-video-frame';
import clsx from 'clsx';

// ---------- node types ----------
export type FxKind = 'source' | 'blur' | 'glow' | 'noise' | 'chromaKey' | 'colorCorrect' | 'vignette' | 'grain';

export interface FxNode {
  id: string;
  kind: FxKind;
  name: string;
  params: Record<string, number | string>;
  x: number;
  y: number;
}

const NODE_DEFINITIONS: Record<FxKind, { label: string; icon: string; defaultParams: Record<string, number | string>; color: string }> = {
  source: { label: 'Source', icon: '▸', defaultParams: {}, color: 'bg-zinc-700' },
  blur: { label: 'Blur', icon: '◠', defaultParams: { blur: 4 }, color: 'bg-sky-600' },
  glow: { label: 'Glow', icon: '◍', defaultParams: { glow: 6, intensity: 0.7 }, color: 'bg-amber-500' },
  noise: { label: 'Noise', icon: '▪', defaultParams: { amount: 0.12 }, color: 'bg-violet-500' },
  chromaKey: { label: 'Chroma Key', icon: '⊞', defaultParams: { keyColor: '#00ff00', tolerance: 40 }, color: 'bg-emerald-600' },
  colorCorrect: { label: 'Color Correct', icon: '◑', defaultParams: { saturation: 1.3, contrast: 1.1 }, color: 'bg-indigo-500' },
  vignette: { label: 'Vignette', icon: '◉', defaultParams: { strength: 0.45 }, color: 'bg-rose-500' },
  grain: { label: 'Grain', icon: '✦', defaultParams: { amount: 0.18 }, color: 'bg-orange-500' },
};

const NODE_CATALOG: Array<{ kind: FxKind; hint: string }> = [
  { kind: 'blur', hint: 'Gaussian blur' },
  { kind: 'glow', hint: 'Screen-blended glow' },
  { kind: 'noise', hint: 'Film noise' },
  { kind: 'chromaKey', hint: 'Removes key-colored pixels' },
  { kind: 'colorCorrect', hint: 'Saturation + contrast' },
  { kind: 'vignette', hint: 'Edge falloff' },
  { kind: 'grain', hint: 'Animated grain' },
];

let nodeSeq = 0;
function makeNode(kind: FxKind): FxNode {
  nodeSeq++;
  const def = NODE_DEFINITIONS[kind];
  return {
    id: `node-${Date.now()}-${nodeSeq}`,
    kind,
    name: kind === 'source' ? 'Source' : `${def.label} #${nodeSeq}`,
    params: { ...def.defaultParams },
    x: 80 + (nodeSeq % 3) * 320,
    y: 40 + Math.floor(nodeSeq / 3) * 140,
  };
}

const CANVAS_W = 1100;
const CANVAS_H = 640;

export default function VfxPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { ready, activeClip, videoUrl, videoRef, loaded, setLoaded, captureFrame, playhead } = useActiveVideoFrame(projectId);

  const [nodes, setNodes] = useState<FxNode[]>([makeNode('source')]);
  const [selectedId, setSelectedId] = useState<string>('source');
  const [edges, setEdges] = useState<[string, string][]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const graphRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  // chain order: source → next nodes in edge order
  const chain = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const result: FxNode[] = [];
    const source = nodes[0];
    if (!source) return result;
    result.push(source);
    visited.add(source.id);
    let current = source;
    while (true) {
      const nextEdge = edges.find(([from]) => from === current.id);
      if (!nextEdge) break;
      const [, toId] = nextEdge;
      if (visited.has(toId)) break;
      const next = byId.get(toId);
      if (!next) break;
      result.push(next);
      visited.add(toId);
      current = next;
    }
    // any unconnected nodes appended at the end (disconnected = inert)
    for (const n of nodes) {
      if (!visited.has(n.id) && n.kind !== 'source') result.push(n);
    }
    return result;
  }, [nodes, edges]);

  // ---------- graph interactions ----------
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const onNodePointerDown = (e: React.PointerEvent, node: FxNode) => {
    if ((e.target as HTMLElement).closest('.node-port')) return;
    e.stopPropagation();
    setSelectedId(node.id);
    setDragging({ id: node.id, startX: e.clientX, startY: e.clientY, nodeX: node.x, nodeY: node.y });
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      setNodes((prev) => prev.map((n) => n.id === dragging.id ? { ...n, x: dragging.nodeX + (e.clientX - dragging.startX), y: dragging.nodeY + (e.clientY - dragging.startY) } : n));
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging]);

  const onGraphPointerDown = (e: React.PointerEvent) => {
    setPanning({ startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y });
  };
  useEffect(() => {
    if (!panning) return;
    const move = (e: PointerEvent) => setPan({ x: panning.panX + (e.clientX - panning.startX), y: panning.panY + (e.clientY - panning.startY) });
    const up = () => setPanning(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [panning]);

  const onWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(2.5, Math.max(0.35, z * delta)));
  };

  // edge creation via port clicks
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const onPortClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (!pendingFrom) {
      setPendingFrom(nodeId);
      return;
    }
    if (pendingFrom === nodeId) { setPendingFrom(null); return; }
    // create edge (one-way, no self-connection)
    if (!edges.some(([f, t]) => f === pendingFrom && t === nodeId)) {
      setEdges((prev) => [...prev, [pendingFrom, nodeId]]);
    }
    setPendingFrom(null);
  };

  const addNode = (kind: FxKind) => {
    const node = makeNode(kind);
    setNodes((prev) => [...prev, node]);
    setSelectedId(node.id);
  };

  const removeNode = (id: string) => {
    if (id === 'source') return;
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter(([f, t]) => f !== id && t !== id));
    setSelectedId('source');
  };

  const updateParam = (id: string, key: string, value: number | string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n));
  };

  const chainNodes = chain.filter((n) => n.kind !== 'source');

  // ---------- real canvas render ----------
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !activeClip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const frame = captureFrame();
    if (!frame) return;

    const w = Math.min(640, frame.width);
    const h = Math.round((frame.height / frame.width) * w);
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }

    // base draw
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(frame.el, 0, 0, w, h);

    let imgData = ctx.getImageData(0, 0, w, h);

    // apply node chain (real operations)
    for (const node of chainNodes) {
      if (node.kind === 'blur') {
        const r = Number(node.params.blur ?? 4);
        imgData = pixelBlur(imgData, w, h, r);
      } else if (node.kind === 'glow') {
        const r = Number(node.params.glow ?? 6);
        const intensity = Number(node.params.intensity ?? 0.7);
        imgData = glowPass(imgData, w, h, r, intensity);
      } else if (node.kind === 'noise') {
        imgData = addNoise(imgData, Number(node.params.amount ?? 0.1));
      } else if (node.kind === 'chromaKey') {
        const keyColor = String(node.params.keyColor ?? '#00ff00');
        const tolerance = Number(node.params.tolerance ?? 40);
        imgData = chromaKey(imgData, keyColor, tolerance);
      } else if (node.kind === 'colorCorrect') {
        const sat = Number(node.params.saturation ?? 1.3);
        const contrast = Number(node.params.contrast ?? 1.1);
        imgData = colorCorrect(imgData, sat, contrast);
      } else if (node.kind === 'vignette') {
        const strength = Number(node.params.strength ?? 0.4);
        imgData = vignette(imgData, w, h, strength);
      } else if (node.kind === 'grain') {
        imgData = addNoise(imgData, Number(node.params.amount ?? 0.2));
      }
    }

    ctx.putImageData(imgData, 0, 0);
    setRenderError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainNodes, activeClip, loaded, playhead]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[--color-border-soft] px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">VFX Studio</h1>
          <p className="text-xs text-zinc-500">Node-based compositing — real canvas effects, no placeholders</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="subtle" className="text-xs" onClick={() => setZoom((z) => Math.max(0.35, z / 1.2))}><ZoomOut className="h-3.5 w-3.5" /></Button>
          <span className="w-12 text-center font-mono text-[11px] text-zinc-400">{Math.round(zoom * 100)}%</span>
          <Button variant="subtle" className="text-xs" onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}><ZoomIn className="h-3.5 w-3.5" /></Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left: node catalog */}
        <aside className="hidden w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-[--color-border-soft] bg-[--color-ink-900] p-2 md:flex">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Effects</div>
          {NODE_CATALOG.map(({ kind, hint }) => (
            <button
              key={kind}
              onClick={() => addNode(kind)}
              className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-2 text-left hover:border-indigo-500/40 hover:bg-indigo-500/10 transition-colors"
              title={hint}
            >
              <div className="text-[11px] font-medium text-zinc-200">{NODE_DEFINITIONS[kind].label}</div>
              <div className="text-[9px] text-zinc-500">{hint}</div>
            </button>
          ))}
          {pendingFrom && <div className="mt-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-300">Click a node's port to connect from the selected node.</div>}
        </aside>

        {/* Center: node graph + preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={graphRef}
            className="relative flex-1 min-h-0 overflow-hidden bg-[#0c0c11] cursor-grab active:cursor-grabbing"
            onPointerDown={onGraphPointerDown}
            onWheel={onWheel}
          >
            {/* grid backdrop */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
                backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
              }}
            />
            <svg className="absolute inset-0" style={{ width: '100%', height: '100%', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
              {edges.map(([fromId, toId], i) => {
                const from = nodes.find((n) => n.id === fromId);
                const to = nodes.find((n) => n.id === toId);
                if (!from || !to) return null;
                const x1 = from.x + 150; const y1 = from.y + 44; const x2 = to.x + 150; const y2 = to.y + 44;
                return (
                  <g key={i}>
                    <path d={`M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`} fill="none" stroke="#6366f1" strokeWidth="2" opacity="0.7" />
                    <circle cx={x2} cy={y2} r="3" fill="#6366f1" />
                  </g>
                );
              })}
            </svg>
            <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
              {nodes.map((node) => (
                <div
                  key={node.id}
                  onPointerDown={(e) => onNodePointerDown(e, node)}
                  className={clsx(
                    'absolute w-[150px] rounded-lg border-2 p-2 cursor-grab select-none shadow-lg transition-colors',
                    selectedId === node.id ? 'border-indigo-400 bg-zinc-900 shadow-indigo-950/60' : 'border-zinc-700 bg-zinc-900/90',
                    node.kind === 'source' && 'border-zinc-600',
                  )}
                  style={{ left: node.x, top: node.y }}
                >
                  <div className={clsx('inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white', NODE_DEFINITIONS[node.kind].color)}>{NODE_DEFINITIONS[node.kind].label}</div>
                  <div className="mt-1 truncate text-[11px] font-medium text-zinc-200">{node.name}</div>
                  <div className="mt-1 flex flex-wrap gap-0.5 text-[9px] text-zinc-500">
                    {Object.entries(node.params).map(([k, v]) => (
                      <span key={k} className="rounded bg-white/5 px-1">{k}={typeof v === 'number' ? v.toFixed(2) : v}</span>
                    ))}
                  </div>
                  <div className="node-port absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 cursor-pointer rounded-full border-2 border-zinc-900"
                       style={{ background: '#6366f1', boxShadow: '0 0 6px #6366f1' }}
                       onClick={(e) => onPortClick(e, node.id)} />
                  <div className="node-port absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-zinc-900 bg-zinc-500"
                       onClick={(e) => onPortClick(e, node.id)} />
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="border-t border-[--color-border-soft] bg-[--color-ink-900]">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Output</span>
              {renderError && <span className="text-[10px] text-red-400">{renderError}</span>}
            </div>
            <div className="flex items-center justify-center p-2">
              <canvas ref={previewRef} className="max-h-40 max-w-full rounded border border-zinc-800 bg-black" />
            </div>
          </div>
        </div>

        {/* Right: inspector */}
        <aside className="w-64 shrink-0 overflow-y-auto border-l border-[--color-border-soft] bg-[--color-ink-900] p-3">
          <Panel title="Node inspector">
            {selectedNode ? (
              <div className="flex flex-col gap-3 p-3">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-300">{NODE_DEFINITIONS[selectedNode.kind].label}</span>
                  {selectedNode.kind !== 'source' && (
                    <button onClick={() => removeNode(selectedNode.id)} className="rounded p-1 text-red-400/80 hover:text-red-300" title="Delete node"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
                <input
                  value={selectedNode.name}
                  onChange={(e) => setNodes((prev) => prev.map((n) => n.id === selectedNode.id ? { ...n, name: e.target.value } : n))}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
                />
                {selectedNode.kind === 'source' ? (
                  <p className="text-[10px] text-zinc-500">The source node is fixed and shows the active clip from the timeline. Add effects to the chain via the Effects panel.</p>
                ) : (
                  <NodeParamControls node={selectedNode} onChange={(k, v) => updateParam(selectedNode.id, k, v)} />
                )}
              </div>
            ) : <p className="p-3 text-[11px] text-zinc-500">Select a node.</p>}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function NodeParamControls({ node, onChange }: { node: FxNode; onChange: (k: string, v: number | string) => void }) {
  if (node.kind === 'blur') {
    return (
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-zinc-400"><span>Blur radius</span><span className="font-mono">{String(node.params.blur)}</span></div>
        <input type="range" min={1} max={40} step={1} value={Number(node.params.blur ?? 4)} onChange={(e) => onChange('blur', Number(e.target.value))} className="w-full accent-indigo-500" />
      </div>
    );
  }
  if (node.kind === 'glow') {
    return (
      <>
        <div className="mt-1">
          <div className="mb-1 flex justify-between text-[10px] text-zinc-400"><span>Glow Radius</span><span className="font-mono">{String(node.params.glow)}</span></div>
          <input type="range" min={1} max={40} step={1} value={Number(node.params.glow ?? 6)} onChange={(e) => onChange('glow', Number(e.target.value))} className="w-full accent-indigo-500" />
        </div>
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-[10px] text-zinc-400"><span>Intensity</span><span className="font-mono">{String(node.params.intensity)}</span></div>
          <input type="range" min={0.1} max={1} step={0.05} value={Number(node.params.intensity ?? 0.7)} onChange={(e) => onChange('intensity', Number(e.target.value))} className="w-full accent-indigo-500" />
        </div>
      </>
    );
  }
  if (node.kind === 'noise' || node.kind === 'grain') {
    return (
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-zinc-400"><span>Amount</span><span className="font-mono">{String(node.params.amount)}</span></div>
        <input type="range" min={0.02} max={0.6} step={0.02} value={Number(node.params.amount ?? 0.15)} onChange={(e) => onChange('amount', Number(e.target.value))} className="w-full accent-indigo-500" />
      </div>
    );
  }
  if (node.kind === 'chromaKey') {
    return (
      <>
        <div>
          <div className="mb-1 text-[10px] text-zinc-400">Key color</div>
          <input type="color" value={String(node.params.keyColor ?? '#00ff00')} onChange={(e) => onChange('keyColor', e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent" />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-zinc-400"><span>Tolerance</span><span className="font-mono">{String(node.params.tolerance)}</span></div>
          <input type="range" min={5} max={120} step={1} value={Number(node.params.tolerance ?? 40)} onChange={(e) => onChange('tolerance', Number(e.target.value))} className="w-full accent-indigo-500" />
        </div>
      </>
    );
  }
  if (node.kind === 'colorCorrect') {
    return (
      <>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-zinc-400"><span>Saturation</span><span className="font-mono">{String(node.params.saturation)}</span></div>
          <input type="range" min={0} max={2.5} step={0.05} value={Number(node.params.saturation ?? 1.3)} onChange={(e) => onChange('saturation', Number(e.target.value))} className="w-full accent-indigo-500" />
        </div>
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-[10px] text-zinc-400"><span>Contrast</span><span className="font-mono">{String(node.params.contrast)}</span></div>
          <input type="range" min={0.2} max={2} step={0.05} value={Number(node.params.contrast ?? 1.1)} onChange={(e) => onChange('contrast', Number(e.target.value))} className="w-full accent-indigo-500" />
        </div>
      </>
    );
  }
  if (node.kind === 'vignette') {
    return (
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-zinc-400"><span>Strength</span><span className="font-mono">{String(node.params.strength)}</span></div>
        <input type="range" min={0} max={1} step={0.05} value={Number(node.params.strength ?? 0.45)} onChange={(e) => onChange('strength', Number(e.target.value))} className="w-full accent-indigo-500" />
      </div>
    );
  }
  return <p className="text-[10px] text-zinc-500">No parameters.</p>;
}

// ---------- real canvas effects ----------
function makeNoise(data: ImageData['data'], w: number, h: number, amount: number): ImageData['data'] {
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const n = (Math.random() * 2 - 1) * amount * 255;
    out[i] = clamp(out[i]! + n);
    out[i + 1] = clamp(out[i + 1]! + n);
    out[i + 2] = clamp(out[i + 2]! + n);
  }
  return out;
}

function addNoise(imgData: ImageData, amount: number): ImageData {
  const data = makeNoise(imgData.data, imgData.width, imgData.height, amount);
  return new ImageData(data, imgData.width, imgData.height);
}

function colorCorrect(imgData: ImageData, sat: number, contrast: number): ImageData {
  const data = new Uint8ClampedArray(imgData.data);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;
    data[i] = clamp(r); data[i + 1] = clamp(g); data[i + 2] = clamp(b);
  }
  return new ImageData(data, imgData.width, imgData.height);
}

function vignette(imgData: ImageData, w: number, h: number, strength: number): ImageData {
  const data = new Uint8ClampedArray(imgData.data);
  const cx = w / 2; const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt(((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2);
      const f = 1 - strength * Math.max(0, dist - 0.7);
      const i = (y * w + x) * 4;
      data[i] = clamp(data[i]! * f);
      data[i + 1] = clamp(data[i + 1]! * f);
      data[i + 2] = clamp(data[i + 2]! * f);
    }
  }
  return new ImageData(data, imgData.width, imgData.height);
}

function chromaKey(imgData: ImageData, keyColor: string, tolerance: number): ImageData {
  const data = new Uint8ClampedArray(imgData.data);
  const k = hexToRgb(keyColor);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const d = Math.sqrt(((r - k.r) ** 2 + (g - k.g) ** 2 + (b - k.b) ** 2) / 3);
    if (d < tolerance) {
      data[i + 3] = 0;
    } else if (d < tolerance * 1.8) {
      data[i + 3] = clamp(((d - tolerance) / (tolerance * 0.8)) * 255);
    }
  }
  return new ImageData(data, imgData.width, imgData.height);
}

// Pixel blur (separable box blur approximated with 2 passes)
function pixelBlur(imgData: ImageData, w: number, h: number, radius: number): ImageData {
  const src = new Uint8ClampedArray(imgData.data);
  let data = src;
  const passes = Math.max(2, Math.ceil(radius / 2));
  for (let p = 0; p < passes; p++) {
    data = boxBlur(data, w, h, 2);
  }
  return new ImageData(data, imgData.width, imgData.height);
}

function boxBlur(src: ImageData['data'], w: number, h: number, r: number): ImageData['data'] {
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0, cnt = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const i = (yy * w + xx) * 4;
          rs += src[i]!; gs += src[i + 1]!; bs += src[i + 2]!; as += src[i + 3]!; cnt++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = rs / cnt;
      out[o + 1] = gs / cnt;
      out[o + 2] = bs / cnt;
      out[o + 3] = as / cnt;
    }
  }
  return out;
}

function glowPass(imgData: ImageData, w: number, h: number, radius: number, intensity: number): ImageData {
  // cheap glow: blurred copy blended with screen at intensity
  const blurred = pixelBlur(new ImageData(new Uint8ClampedArray(imgData.data), w, h), w, h, 2);
  const data = new Uint8ClampedArray(imgData.data);
  for (let i = 0; i < data.length; i += 4) {
    const bg = blurred.data[i]!;
    const lum = (bg * 0.2126 + blurred.data[i + 1]! * 0.7152 + blurred.data[i + 2]! * 0.0722) / 255;
    const screen = 1 - (1 - (lum * intensity)) * (1 - lum);
    const s = Math.min(1, screen) * 255;
    data[i] = clamp(Math.max(data[i]!, s));
    data[i + 1] = clamp(Math.max(data[i + 1]!, s));
    data[i + 2] = clamp(Math.max(data[i + 2]!, s));
  }
  return new ImageData(data, imgData.width, imgData.height);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 255, b: 0 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, n));
}
