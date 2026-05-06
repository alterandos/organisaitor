import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';

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
    // Clear in-memory stores and localStorage cache so the app shows empty
    // when signed out. Data is safely in Supabase and reloads on next sign-in.
    useTaskStore.setState({ tasks: {}, collections: {}, tags: {}, purposes: {} } as never);
    useCalendarStore.setState({ events: {}, reminders: {} } as never);
    localStorage.removeItem('todo-app-storage');
    localStorage.removeItem('todo-calendar');
  },
}));
