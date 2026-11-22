'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Clapperboard,
  Sparkles,
  Mic,
  AudioWaveform,
  Wand2,
  Library,
  Subtitles,
  Palette,
  ListChecks,
  Bot,
  Settings,
  LogOut,
  Scissors,
  Network,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/stores/auth.store';
import { isSupabaseConfigured } from '@/lib/supabase';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/editor', label: 'Video Editor', icon: Clapperboard },
  { href: '/motion', label: 'Motion Studio', icon: Sparkles },
  { href: '/vfx', label: 'VFX Studio', icon: Network },
  { href: '/ai', label: 'AI Studio', icon: Wand2 },
  { href: '/audio', label: 'Audio Studio', icon: AudioWaveform },
  { href: '/subtitles', label: 'Subtitles', icon: Subtitles },
  { href: '/grading', label: 'Color Grading', icon: Palette },
  { href: '/media', label: 'Media Library', icon: Library },
  { href: '/render', label: 'Render Queue', icon: ListChecks },
  { href: '/mcp', label: 'MCP Integrations', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[--color-border-soft] bg-[--color-ink-900]">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[--color-border-soft]">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/50">
          <Scissors className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight text-zinc-50 leading-tight">FRAMEFORGE</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-400">Studio</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                active ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[--color-border-soft] p-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-[11px] font-bold text-zinc-100">
            {user?.email?.slice(0, 2).toUpperCase() ?? 'FF'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-zinc-200">{user?.email ?? 'Signed out'}</div>
            <div className="text-[10px] text-zinc-500 capitalize">{isSupabaseConfigured ? 'Free plan' : 'Not configured'}</div>
          </div>
          <button
            onClick={() => {
              void signOut();
              router.push('/auth/login');
            }}
            title="Sign out"
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
