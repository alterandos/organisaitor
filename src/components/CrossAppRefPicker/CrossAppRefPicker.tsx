import { useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { NotePickerModal } from '@/components/NotePickerModal/NotePickerModal';
import { getNoteBreadcrumb } from '@/utils/notes';
import { tabNameOf } from '@/utils/noteTabs';
import type { CrossAppRef } from '@/types';
import type { NoteId } from '@/types/notes';
import styles from './CrossAppRefPicker.module.css';

interface Props {
  value:    CrossAppRef[];
  onChange: (next: CrossAppRef[]) => void;
  // If provided, clicking an existing chip's label navigates there (TaskPane — the task
  // already exists). Omitted in a create form (AddTaskModal) where navigating away would
  // just abandon the in-progress task.
  onNavigate?: (ref: CrossAppRef) => void;
  // Title of the item the links are being added to; its keywords drive the picker's suggestions.
  suggestFrom?: string;
}

// Note is the only wired target today. The other planned targets (Calendar item, List item,
// Tracker entry — see BACKLOG.md "Cross-app built-in tag types") need their own picker dialog
// alongside NotePickerModal; this component stays the one generic { value; onChange; onNavigate? }
// widget and would pick the dialog by type.
const ICON_BY_TYPE: Record<string, string> = { note: '📝', event: '📅', listItem: '📃', trackerEntry: '📊' };

// The picker is a dialog portaled to document.body (see NotePickerModal), not a popover rendered
// in place: this widget is embedded in forms that scroll, and an in-place dropdown there changes
// the scroll height as it opens/closes, which once made a click land on the wrong button.
export function CrossAppRefPicker({ value, onChange, onNavigate, suggestFrom }: Props) {
  const [open, setOpen] = useState(false);
  // Views: an encrypted note's title is blank in the store (see services/noteSecrets.ts).
  const notesRecord = useNoteViews();
  const noteTags    = useNoteStore((s) => s.noteTags);

  const linkedNoteIds = new Set(value.filter((r) => r.type === 'note').map((r) => r.id));

  const addNote = (noteId: string, tabId?: string) => onChange([...value, { type: 'note', id: noteId, ...(tabId ? { tabId } : {}) }]);

  const removeRef = (ref: CrossAppRef) => {
    onChange(value.filter((r) => !(r.type === ref.type && r.id === ref.id)));
  };

  return (
    <div className={styles.root}>
      <div className={styles.chips}>
        {value.map((ref) => {
          const linked = ref.type === 'note' ? notesRecord[ref.id as NoteId] : undefined;
          const label = ref.type === 'note' ? `${linked?.isEncrypted ? '🔒 ' : ''}${linked?.title || 'Untitled'}` : ref.id;
          const path = linked ? getNoteBreadcrumb(linked, noteTags) : null;
          const tabName = linked ? tabNameOf(linked, ref.tabId) : null;
          const icon = ICON_BY_TYPE[ref.type] ?? '🔗';
          return (
            <span key={`${ref.type}:${ref.id}`} className={styles.chip} title={path ? `${path} › ${label}` : undefined}>
              {onNavigate ? (
                <button type="button" className={styles.chipLabel} onClick={() => onNavigate(ref)}>
                  {icon} {label}
                </button>
              ) : (
                <span className={styles.chipLabel}>{icon} {label}</span>
              )}
              {tabName && <span className={styles.chipTab}>› {tabName}</span>}
              {path && <span className={styles.chipPath}>{path.split(' > ').pop()}</span>}
              <button type="button" className={styles.chipRemove} onClick={() => removeRef(ref)} aria-label="Remove link">×</button>
            </span>
          );
        })}
        <button type="button" className={styles.addBtn} onClick={() => setOpen(true)}>+ Link</button>
      </div>

      {open && <NotePickerModal excludeIds={linkedNoteIds} suggestFrom={suggestFrom} onPick={addNote} onClose={() => setOpen(false)} />}
    </div>
  );
}
