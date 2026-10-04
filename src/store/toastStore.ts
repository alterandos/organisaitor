import { create } from 'zustand';

// THE way to tell the user something happened, with an optional quick action ("Completed X ·
// + Follow-up · Undo"): non-blocking, dismisses itself. Call showToast() (components/Toast/showToast.ts);
// <ToastHost /> (mounted once in App.tsx) shows it. One at a time — a new toast replaces the
// current one. Memory-only. For anything the user must answer, use confirmDialog() instead.

export interface ToastAction {
  label:   string;
  onClick: () => void;
}

export interface ToastRequest {
  id:         number;
  message:    string;
  detail?:    string;
  actions:    ToastAction[];
  durationMs: number;
}

interface ToastState {
  current: ToastRequest | null;
  show:    (t: ToastRequest) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show:    (t) => set({ current: t }),
  dismiss: (id) => set((s) => (s.current?.id === id ? { current: null } : {})),
}));
