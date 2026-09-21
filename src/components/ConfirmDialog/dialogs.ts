import { LABELS } from '@/config/labels';
import { useDialogStore } from '@/store/dialogStore';

let nextId = 1;

export interface ConfirmOptions {
  title:         string;
  itemName?:     string;    // shown in a box under the title — what is about to be affected
  message?:      string;
  irreversible?: boolean;   // adds the standard "This cannot be undone." warning
  destructive?:  boolean;   // red confirm button, and focus starts on Cancel
  confirmLabel?: string;
  cancelLabel?:  string;
  focusDelayMs?: number;    // show now, but don't take focus for this long — see DialogRequest
  isStale?:      () => boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().enqueue({
      id:           nextId++,
      kind:         'confirm',
      title:        opts.title,
      itemName:     opts.itemName,
      message:      opts.message,
      irreversible: opts.irreversible ?? false,
      destructive:  opts.destructive ?? false,
      confirmLabel: opts.confirmLabel ?? LABELS.dialogs.confirm,
      cancelLabel:  opts.cancelLabel ?? LABELS.dialogs.cancel,
      focusDelayMs: opts.focusDelayMs ?? 0,
      isStale:      opts.isStale,
      resolve,
    });
  });
}

// The one path for "delete this permanently": same wording, red button, Cancel focused,
// "This cannot be undone." — see CLAUDE.md "Archive and delete look and behave the same".
// `noun` is lower-case ("tracker"); `detail` says what else goes with it.
export function confirmDelete(noun: string, itemName: string, detail?: string): Promise<boolean> {
  return confirmDialog({
    title:        LABELS.itemActions.deleteTitle(noun),
    itemName,
    message:      detail,
    irreversible: true,
    destructive:  true,
    confirmLabel: LABELS.itemActions.deleteConfirm,
  });
}

export function alertDialog(message: string, title: string = LABELS.dialogs.alertTitle): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().enqueue({
      id:           nextId++,
      kind:         'alert',
      title,
      message,
      irreversible: false,
      destructive:  false,
      confirmLabel: LABELS.dialogs.ok,
      cancelLabel:  '',
      focusDelayMs: 0,
      resolve:      () => resolve(),
    });
  });
}
