'use client';

import { create } from 'zustand';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,

  async init() {
    if (!isSupabaseConfigured) {
      set({ initialized: true, loading: false, user: null });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getUser();
      set({ user: data.user ?? null, initialized: true, loading: false });
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ user: session?.user ?? null });
      });
    } catch {
      set({ initialized: true, loading: false, user: null });
    }
  },

  async signUp(email, password, fullName) {
    if (!isSupabaseConfigured) return { error: 'Supabase is not configured. See .env.example.' };
    const supabase = getSupabase();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error?.message ?? null };
  },

  async signIn(email, password) {
    if (!isSupabaseConfigured) return { error: 'Supabase is not configured. See .env.example.' };
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },

  async signOut() {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    await supabase.auth.signOut();
    set({ user: null });
  },

  async resetPassword(email) {
    if (!isSupabaseConfigured) return { error: 'Supabase is not configured. See .env.example.' };
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/login`,
    });
    return { error: error?.message ?? null };
  },
}));
