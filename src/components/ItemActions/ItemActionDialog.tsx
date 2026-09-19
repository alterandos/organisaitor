import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LABELS } from '@/config/labels';
import { ArchiveIcon, TrashIcon } from './icons';
import styles from './ItemActionDialog.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

export type ItemNoun = 'task' | 'event' | 'reminder';

const HIDDEN_FROM: Record<ItemNoun, string> = {
  task:     'your task list and the calendar',
  event:    'the calendar',
  reminder: 'the calendar',
};

interface Props {
  mode:              'archive' | 'delete';
  noun:              ItemNoun;
  itemTitle:         string;
  archiveNote?:      string;   // extra sentence in the archive dialog, e.g. sub-tasks that go with it
  alsoRemoves?:      string;   // delete: "The task <alsoRemoves> will be removed for good"
  deleteNote?:       string;   // delete: appended after "for good", e.g. ", along with its calendar entries"
  canArchive?:       boolean;  // false → no "Archive instead" (an item that can't be archived)
  onArchive:         (reason: string) => void;
  onDelete:          () => void;
  onArchiveInstead:  () => void;
  onCancel:          () => void;
}

// Portaled so a slide-in pane's `transform` can't become the containing block for position:fixed
// (see CLAUDE.md "Escaping an ancestor's transform"). Escape closes only this dialog, not the
// pane behind it, because both register with useEscapeClose and the dialog registered last.
export function ItemActionDialog({
  mode, noun, itemTitle, archiveNote, alsoRemoves, deleteNote, canArchive = true,
  onArchive, onDelete, onArchiveInstead, onCancel,
}: Props) {
  const L = LABELS.itemActions;
  const [reason, setReason] = useState('');
  const formRef   = useRef<HTMLFormElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Registered after the pane behind it, so it is the top of the Escape stack.
  useEscapeClose(onCancel);

  // Delete lands on Cancel, not the destructive button, so a reflexive Enter can't confirm it.
  useEffect(() => { if (mode === 'delete') cancelRef.current?.focus(); }, [mode]);

  useEffect(() => {
    if (mode !== 'archive') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mode]);

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      // Keeps App's global single-key hotkeys (Space = new item, digits = switch section…) from
      // firing behind the dialog when a button has focus. Escape and Ctrl-combos still reach
      // the document-level handlers that close/confirm it.
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      {mode === 'archive' ? (
        <form
          ref={formRef}
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-dialog-title"
          onSubmit={(e) => { e.preventDefault(); onArchive(reason); }}
        >
          <h2 id="item-dialog-title" className={styles.title}>{L.archiveTitle(noun)}</h2>
          <p className={styles.itemName}>{itemTitle}</p>
          <p className={styles.hint}>{L.archiveHint(HIDDEN_FROM[noun])}{archiveNote && ` ${archiveNote}`}</p>
          <label className={styles.label} htmlFor="item-archive-reason">{L.reasonLabel}</label>
          <textarea
            id="item-archive-reason"
            className={styles.textarea}
            placeholder={L.reasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
            <button type="submit" className={styles.primaryBtn}>
              <ArchiveIcon /> {L.archive} <span className={styles.kbd}>Ctrl+Enter</span>
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.modal} role="alertdialog" aria-modal="true" aria-labelledby="item-dialog-title" aria-describedby="item-dialog-desc">
          <h2 id="item-dialog-title" className={styles.title}>{L.deleteTitle(noun)}</h2>
          <p className={styles.itemName}>{itemTitle}</p>
          <p id="item-dialog-desc" className={styles.warning}>
            <strong>{L.deleteWarning}</strong> The {noun}{alsoRemoves && ` ${alsoRemoves}`} will be removed for good{deleteNote ?? ''}.
          </p>
          {canArchive && <p className={styles.hint}>{L.deleteSafeHint}</p>}
          <div className={styles.actions}>
            <button ref={cancelRef} type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
            {canArchive && (
              <button type="button" className={styles.secondaryBtn} onClick={onArchiveInstead}>
                <ArchiveIcon /> {L.archiveInstead}
              </button>
            )}
            <button type="button" className={styles.dangerBtn} onClick={onDelete}>
              <TrashIcon /> {L.deleteConfirm}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
