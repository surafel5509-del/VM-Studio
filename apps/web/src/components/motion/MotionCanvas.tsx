'use client';

import { useEffect, useRef, useState } from 'react';
import type { Composition, MotionLayer } from '@frameforge/shared';
import { easingFunction, sampleTrack } from '@frameforge/shared';

/**
 * Renders the composition onto a <canvas> using the same keyframe math
 * the editor UI exposes. Real rendering, no fake output.
 */
export function MotionCanvas({ composition, playhead }: { composition: Composition; playhead: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(600);

  // Resize handling: fit canvas to container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setFitWidth(w);
    });
    ro.observe(el);
    setFitWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Redraw on playhead/composition change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = composition.width * dpr;
    canvas.height = composition.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // background
    ctx.fillStyle = composition.backgroundColor;
    ctx.fillRect(0, 0, composition.width, composition.height);

    for (const layer of layersTopToBottom(composition)) {
      if (!layer.visible) continue;
      drawLayer(ctx, layer, composition, playhead);
    }
  }, [composition, playhead]);

  const aspect = composition.width / composition.height;
  const cssHeight = fitWidth / aspect;

  return (
    <div ref={containerRef} className="flex h-full items-center justify-center bg-black/60 p-2">
      <div style={{ width: fitWidth, height: cssHeight, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: fitWidth, height: cssHeight, borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
      </div>
    </div>
  );
}

function layersTopToBottom(c: Composition): MotionLayer[] {
  return [...c.layers].reverse(); // layers[0] is topmost in UI => render from bottom up
}

function sampleProperty(layer: MotionLayer, path: string, t: number): number {
  const keys = layer.keyframes[path] ?? [];
  if (!keys.length) {
    // default: look at transform defaults
    const m = path.match(/^transform\.(.+)$/);
    if (m) {
      const key = m[1] as keyof MotionLayer['transform'];
      return layer.transform[key] ?? 0;
    }
    if (path === 'opacity') return 1;
    return 0;
  }
  return sampleTrack(keys, t, undefined, layer.id);
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: MotionLayer, comp: Composition, t: number) {
  const w = comp.width;
  const h = comp.height;

  const x = sampleProperty(layer, 'transform.x', t);
  const y = sampleProperty(layer, 'transform.y', t);
  const scale = sampleProperty(layer, 'transform.scale', t) || 1;
  const rotation = sampleProperty(layer, 'transform.rotation', t);
  const opacity = sampleProperty(layer, 'opacity', t) || 1;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.translate(w / 2 + x * w * 0.5, h / 2 + y * h * 0.5);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);

  switch (layer.kind) {
    case 'solid': {
      ctx.fillStyle = layer.solidColor ?? layer.color ?? '#18181b';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case 'gradient': {
      const grad = layer.gradient ?? { from: '#6366f1', to: '#a855f7', angle: 45 };
      const angle = (grad.angle * Math.PI) / 180;
      const len = Math.hypot(w, h);
      const cx = Math.cos(angle) * len * 0.5;
      const cy = Math.sin(angle) * len * 0.5;
      const g = ctx.createLinearGradient(-cx, -cy, cx, cy);
      g.addColorStop(0, grad.from);
      g.addColorStop(1, grad.to);
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case 'shape': {
      const shape = layer.shape ?? 'rect';
      const color = layer.color ?? '#6366f1';
      ctx.fillStyle = color;
      const rw = w * 0.5;
      const rh = h * 0.5;
      if (shape === 'rect') {
        ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
      } else if (shape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(0, 0, rw / 2, rh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(0, -rh / 2);
        ctx.lineTo(rw / 2, rh / 2);
        ctx.lineTo(-rw / 2, rh / 2);
        ctx.closePath();
        ctx.fill();
      } else if (shape === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? rw / 2 : rw / 5;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else if (shape === 'line') {
        ctx.fillStyle = color;
        ctx.fillRect(-rw / 2, -2, rw, 4);
      }
      break;
    }
    case 'text': {
      const fontSize = Math.floor(h * 0.09);
      ctx.fillStyle = layer.color ?? '#ffffff';
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = layer.text ?? layer.name;
      const lines = String(text).split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * (fontSize * 1.25));
      });
      break;
    }
    case 'null': {
      // Null object: render nothing visually (anchor marker only)
      break;
    }
    default: {
      // unknown kind: render as solid for now
      ctx.fillStyle = layer.solidColor ?? '#111';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
  }

  ctx.restore();
}
