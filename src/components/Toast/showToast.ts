import { useToastStore, type ToastAction } from '@/store/toastStore';

let nextId = 1;

// See toastStore.ts. Returns the toast's id (for dismissToast).
export function showToast(opts: { message: string; detail?: string; actions?: ToastAction[]; durationMs?: number }): number {
  const id = nextId++;
  useToastStore.getState().show({
    id,
    message:    opts.message,
    detail:     opts.detail,
    actions:    opts.actions ?? [],
    durationMs: opts.durationMs ?? 7000,
  });
  return id;
}

export const dismissToast = (id: number): void => useToastStore.getState().dismiss(id);
