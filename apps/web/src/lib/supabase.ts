'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabaseUrl: string = url ?? '';

/** Browser-side Supabase client. Call `isSupabaseConfigured` first; throws if unconfigured. */
export function getSupabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).',
    );
  }
  return createBrowserClient(url, key);
}

export function supabaseAnonKey(): string {
  return key ?? '';
}
