import { create } from 'zustand';

// THE replacement for window.confirm() / window.alert() across the suite — native browser popups
// are not themed, don't follow the Escape / Ctrl+Enter rules, and look different in the Tauri and
// Android webviews. Call confirmDialog()/alertDialog() from anywhere (a handler, an inline
// onClick); <ConfirmDialogHost /> (mounted once in App.tsx) renders whichever request is first
// in the queue and resolves the promise.

export interface DialogRequest {
  id:            number;
  kind:          'confirm' | 'alert';
  title:         string;
  itemName?:     string;
  message?:      string;
  irreversible:  boolean;
  destructive:   boolean;
  confirmLabel:  string;
  cancelLabel:   string;
  // Non-zero: the dialog is shown at once but doesn't take keyboard focus (or answer Ctrl+Enter) for
  // this long, so a prompt caused by what the user is typing can't be answered by their next keystroke.
  focusDelayMs:  number;
  // Checked when the delay ends; if it returns true the dialog closes itself as "cancel" — for a
  // prompt whose reason went away while it was waiting.
  isStale?:      () => boolean;
  resolve:       (ok: boolean) => void;
}

interface DialogState {
  queue:   DialogRequest[];
  enqueue: (r: DialogRequest) => void;
  settle:  (id: number, ok: boolean) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  enqueue: (r) => set((s) => ({ queue: [...s.queue, r] })),
  settle: (id, ok) => {
    const req = get().queue.find((r) => r.id === id);
    if (!req) return;
    set((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
    req.resolve(ok);
  },
}));
