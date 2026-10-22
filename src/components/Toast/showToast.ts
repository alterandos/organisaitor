import { useToastStore, type ToastAction } from '@/store/toastStore';

// How long a toast stays (the user's choice, 2026-10-22). Pass durationMs only for a toast that
// must stay longer (none do today).
export const TOAST_MS = 4000;

let nextId = 1;

// See toastStore.ts. Returns the toast's id (for dismissToast).
export function showToast(opts: { message: string; detail?: string; actions?: ToastAction[]; durationMs?: number }): number {
  const id = nextId++;
  useToastStore.getState().show({
    id,
    message:    opts.message,
    detail:     opts.detail,
    actions:    opts.actions ?? [],
    durationMs: opts.durationMs ?? TOAST_MS,
  });
  return id;
}

export const dismissToast = (id: number): void => useToastStore.getState().dismiss(id);
