'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/stores/auth.store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Button, TextInput, Field } from '@/components/ui';
import { Scissors, ArrowRight, Mail, Lock, User } from 'lucide-react';

export default function SignupPage() {
  const { signUp, init } = useAuth();
  const router = useRouter();
  useEffect(() => { void init(); }, [init]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      const { error: sErr } = await signUp(email, password, fullName);
      if (sErr) {
        setError(sErr);
        return;
      }
      setNotice('Account created. You can sign in now (email confirmation may be pending).');
      setTimeout(() => router.push('/auth/login'), 1400);
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[--color-ink-950] p-6 text-center">
        <h1 className="text-xl font-bold text-zinc-100">Supabase is not configured</h1>
        <p className="max-w-md text-sm text-zinc-400">Set the environment variables in .env.local then restart the dev server.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[--color-ink-950] p-4 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />
      <div className="relative w-full max-w-md panel-glass rounded-2xl p-6 md:p-8 shadow-2xl shadow-black/50">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/50">
            <Scissors className="h-6 w-6 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-50">Create your studio</h1>
          <p className="mt-1 text-sm text-zinc-400">Start your free account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Full name">
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <TextInput type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className="pl-9" disabled={busy} />
            </div>
          </Field>
          <Field label="Email">
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" className="pl-9" disabled={busy} />
            </div>
          </Field>
          <Field label="Password (min 8 chars)">
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <TextInput type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9" disabled={busy} />
            </div>
          </Field>

          {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          {notice && <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</p>}

          <Button type="submit" variant="primary" className="w-full py-2.5" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
            <ArrowRight className="h-4 w-4" />
          </Button>

          <div className="mt-1 text-center text-xs text-zinc-500">
            <span>Already have an account? </span>
            <Link href="/auth/login" className="text-indigo-400 hover:text-indigo-300">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
