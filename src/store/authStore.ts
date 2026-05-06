import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

interface AuthState {
  user:        User | null;
  session:     Session | null;
  initialized: boolean;
  loading:     boolean;

  setSession: (session: Session | null) => void;
  signIn:     (email: string, password: string) => Promise<string | null>;
  signUp:     (email: string, password: string) => Promise<string | null>;
  signOut:    () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user:        null,
  session:     null,
  initialized: false,
  loading:     false,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, initialized: true }),

  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    return error?.message ?? null;
  },

  signUp: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signUp({ email, password });
    set({ loading: false });
    return error?.message ?? null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));
