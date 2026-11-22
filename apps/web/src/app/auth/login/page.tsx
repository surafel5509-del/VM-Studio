'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/stores/auth.store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Button, TextInput, Field } from '@/components/ui';
import { Scissors, ArrowRight, Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const { signIn, resetPassword, init } = useAuth();
  const router = useRouter();
  useEffect(() => { void init(); }, [init]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'reset') {
        const { error: rErr } = await resetPassword(email);
        if (rErr) setError(rErr);
        else setNotice('If that email is registered, a reset link is on its way.');
        return;
      }
      const { error: lErr } = await signIn(email, password);
      if (lErr) {
        setError(lErr);
        return;
      }
      router.push('/dashboard');
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[--color-ink-950] p-6 text-center">
        <h1 className="text-xl font-bold text-zinc-100">Supabase is not configured</h1>
        <p className="max-w-md text-sm text-zinc-400">
          Set <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in
          <code className="mx-1 rounded bg-white/10 px-1">.env.local</code> then restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[--color-ink-950] p-4 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
      <div className="relative w-full max-w-md panel-glass rounded-2xl p-6 md:p-8 shadow-2xl shadow-black/50">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/50">
            <Scissors className="h-6 w-6 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-50">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-400">Sign in to FRAMEFORGE STUDIO</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <TextInput
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                className="pl-9"
                disabled={busy}
              />
            </div>
          </Field>

          {mode === 'login' && (
            <Field label="Password">
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <TextInput
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  disabled={busy}
                />
              </div>
            </Field>
          )}

          {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          {notice && <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</p>}

          <Button type="submit" variant="primary" className="w-full py-2.5" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
            <ArrowRight className="h-4 w-4" />
          </Button>

          <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
            <button type="button" onClick={() => setMode(mode === 'login' ? 'reset' : 'login')} className="text-indigo-400 hover:text-indigo-300">
              {mode === 'login' ? 'Forgot password?' : 'Back to sign in'}
            </button>
            <Link href="/auth/signup" className="text-indigo-400 hover:text-indigo-300">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
