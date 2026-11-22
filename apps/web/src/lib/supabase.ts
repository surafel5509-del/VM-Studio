'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Accept either the current new-format publishable key or the legacy anon key
// so deployments on either convention work without code changes.
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabaseUrl: string = url ?? '';

/** Browser-side Supabase client. Call `isSupabaseConfigured` first; throws if unconfigured. */
export function getSupabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) (see .env.example).',
    );
  }
  return createBrowserClient(url, key);
}

export function supabaseAnonKey(): string {
  return key ?? '';
}
