import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { stopSync } from '@/services/sync/syncService';
import { clearSyncedLocalData } from '@/services/clearLocalData';

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
    // Stop sync FIRST. The wipe below empties the synced stores while the sync subscription
    // is still live, which syncDiff reads as "the user deleted every item" and answers with a
    // soft-delete of everything in the cloud. That used to be rejected with 401 only because
    // supabase.auth.signOut() had already revoked the token — a data-loss bug protected purely
    // by ordering luck. With sync stopped, the wipe is a purely local cache clear.
    stopSync();
    await supabase.auth.signOut();
    set({ user: null, session: null });
    // Clear this device's copy of every cloud-synced store. Callers go through requestSignOut()
    // (services/signOut.ts), which has already confirmed the data is safely in the cloud.
    clearSyncedLocalData();
  },
}));
