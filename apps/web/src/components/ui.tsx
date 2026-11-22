'use client';

import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import clsx from 'clsx';

export function Button({ className, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors select-none disabled:opacity-40 disabled:pointer-events-none';
  const variants: Record<string, string> = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-400 active:bg-indigo-600',
    ghost: 'bg-transparent text-zinc-200 hover:bg-white/10',
    outline: 'border border-zinc-700 bg-transparent text-zinc-100 hover:bg-white/5',
    danger: 'bg-red-600/90 text-white hover:bg-red-500',
    subtle: 'bg-white/5 text-zinc-200 hover:bg-white/10',
  };
  return <button className={clsx(base, variants[variant] ?? variants.primary, className)} {...props} />;
}

export function Panel({ title, children, className, style, actions }: { title?: string; children?: ReactNode; className?: string; style?: CSSProperties; actions?: ReactNode }) {
  return (
    <section className={clsx('panel-glass rounded-xl overflow-hidden flex flex-col', className)} style={style}>
      {title !== undefined && (
        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[--color-border-soft] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          <span className="truncate">{title}</span>
          {actions}
        </header>
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clsx('animate-spin text-indigo-400', className ?? 'h-5 w-5')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function EmptyState({ title, hint, icon, action }: { title: string; hint?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-zinc-600 text-3xl">{icon}</div>
      <div className="text-sm font-medium text-zinc-300">{title}</div>
      {hint && <div className="max-w-sm text-xs text-zinc-500">{hint}</div>}
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) {
  const tones: Record<string, string> = {
    default: 'bg-white/8 text-zinc-300 border-white/10',
    success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    danger: 'bg-red-500/10 text-red-300 border-red-500/30',
    info: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={clsx('h-px w-full bg-[--color-border-soft]', className)} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 items-center rounded-full border transition-colors',
        checked ? 'bg-indigo-500 border-indigo-400' : 'bg-zinc-700 border-zinc-600',
      )}
    >
      <span className={clsx('h-3.5 w-3.5 rounded-full bg-white transition-transform', checked ? 'translate-x-4' : 'translate-x-1')} />
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}

export function RangeInput({ value, min = 0, max = 100, step = 1, onChange }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-indigo-500"
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
      <span className="tracking-wide uppercase font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 outline-none"
      {...props}
    >
      {children}
    </select>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      className="text-[10px] text-zinc-500 hover:text-zinc-200 border border-zinc-700 rounded px-1.5 py-0.5"
      onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}
      title="Copy"
    >
      {label}
    </button>
  );
}
