'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/stores/auth.store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Spinner } from '@/components/ui';
import { Sidebar } from './Sidebar';

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, initialized, init } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!initialized) return;
    if (!isSupabaseConfigured) {
      setReady(true); // setup screen handles itself below
      return;
    }
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    setReady(true);
  }, [initialized, user, router]);

  if (!isSupabaseConfigured) {
    return <SetupRequired />;
  }

  if (loading && !initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-[--color-ink-950]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[--color-ink-950]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return <>{children}</>;
}

function SetupRequired() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[--color-ink-950] p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-950/50">
        <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.5 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
          <path d="M14.5 2v5.5h5.5" />
        </svg>
      </div>
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Supabase is not configured</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          FRAMEFORGE STUDIO needs a Supabase project. Create one, then set the environment variables in
          <code className="mx-1 rounded bg-white/10 px-1 py-0.5 text-xs text-indigo-300">.env.local</code> — see
          <code className="mx-1 rounded bg-white/10 px-1 py-0.5 text-xs text-indigo-300">.env.example</code>.
        </p>
      </div>
      <pre className="max-w-2xl overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left text-xs text-zinc-300">
{`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}
      </pre>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[--color-ink-950]">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
