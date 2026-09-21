import { useEffect, useState } from 'react';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';

interface Options {
  itemKey:     string | null;   // identity of the open item — the dialog resets when it changes
  archived:    boolean;
  canArchive?: boolean;
  onClose:     () => void;      // closes the whole pane (Escape when no dialog is open)
  onRestore:   () => void;
}

// Owns everything keyboard-and-dialog about the shared archive/delete pattern for a pane:
//   Ctrl+Shift+A        archive (opens the dialog) — or restore, if already archived
//   Delete              delete (opens the confirmation) — ignored while typing in a field
//   Ctrl+Shift+D        delete (opens the confirmation)
//   Escape              closes the pane (the dialog registers its own, later, so it closes first —
//                       see useEscapeClose)
//   Ctrl+Enter          commits the focused field and closes the pane (see useCtrlEnterSubmit)
export function useItemActions({ itemKey, archived, canArchive = true, onClose, onRestore }: Options) {
  const [dialog, setDialog] = useState<'archive' | 'delete' | null>(null);

  const [prevItemKey, setPrevItemKey] = useState(itemKey);
  if (prevItemKey !== itemKey) {
    setPrevItemKey(itemKey);
    setDialog(null);
  }

  useEscapeClose(onClose, !!itemKey);

  // These panes save each field as it changes or loses focus, so "accept" means: blur the focused
  // field (which commits a half-typed title, note, time or link) and close. While a dialog is open
  // Ctrl+Enter belongs to the dialog.
  useCtrlEnterSubmit(() => {
    if (dialog) return;
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  }, !!itemKey);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (dialog || !itemKey) return;

      if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
        e.preventDefault();
        setDialog('delete');
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'a') {
        if (archived) { e.preventDefault(); onRestore(); }
        else if (canArchive) { e.preventDefault(); setDialog('archive'); }
      } else if (key === 'd') {
        e.preventDefault();
        setDialog('delete');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [dialog, itemKey, archived, canArchive, onRestore]);

  return { dialog, setDialog, closeDialog: () => setDialog(null) };
}
