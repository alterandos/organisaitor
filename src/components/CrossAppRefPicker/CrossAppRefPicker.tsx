import { useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { NotePickerModal } from '@/components/NotePickerModal/NotePickerModal';
import { ListPickerModal } from '@/components/ListPickerModal/ListPickerModal';
import { useListViews } from '@/store/listViews';
import { LABELS } from '@/config/labels';
import { getNoteBreadcrumb } from '@/utils/notes';
import { tabNameOf } from '@/utils/noteTabs';
import type { CrossAppRef, CrossAppRefType } from '@/types';
import type { NoteId } from '@/types/notes';
import { createNoteForItem, type NotePlace } from '@/services/noteFromItem';
import { showToast } from '@/components/Toast/showToast';
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
  // Which kinds of thing can be linked from here. A list's own panel links notes only (a task or
  // calendar item links to a list from its own side).
  types?: ('note' | 'list')[];
  // "+ New note": make a note (in a notebook, or as a tab of a note) titled this, and link it.
  // Offered only where it's passed (the calendar panes).
  newNoteTitle?: string;
}

// Notes and lists are the wired targets. The other planned ones (List item, Tracker entry — see
// BACKLOG.md "Cross-app built-in tag types") would add their own picker dialog the same way; this
// stays the one generic { value; onChange; onNavigate? } widget and picks the dialog by type.
const ICON_BY_TYPE: Record<string, string> = { note: '📝', list: '📋', event: '📅', listItem: '📃', trackerEntry: '📊' };

// The picker is a dialog portaled to document.body (see NotePickerModal), not a popover rendered
// in place: this widget is embedded in forms that scroll, and an in-place dropdown there changes
// the scroll height as it opens/closes, which once made a click land on the wrong button.
export function CrossAppRefPicker({ value, onChange, onNavigate, suggestFrom, types = ['note', 'list'], newNoteTitle }: Props) {
  const [open, setOpen] = useState<CrossAppRefType | 'newNote' | null>(null);
  const lists = useListViews();
  // Views: an encrypted note's title is blank in the store (see services/noteSecrets.ts).
  const notesRecord = useNoteViews();
  const noteTags    = useNoteStore((s) => s.noteTags);

  const linkedNoteIds = new Set(value.filter((r) => r.type === 'note').map((r) => r.id));
  const linkedListIds = new Set(value.filter((r) => r.type === 'list').map((r) => r.id));

  const addNote = (noteId: string, tabId?: string) => onChange([...value, { type: 'note', id: noteId, ...(tabId ? { tabId } : {}) }]);
  const addList = (listId: string) => onChange([...value, { type: 'list', id: listId }]);
  const addNewNote = (place: NotePlace) => {
    const title = newNoteTitle?.trim() || LABELS.newNoteFromItem.button;
    const ref = createNoteForItem(place, title);
    onChange([...value, ref]);
    const L = LABELS.newNoteFromItem;
    showToast({
      message: place.kind === 'note' ? L.createdTab(notesRecord[place.id as NoteId]?.title || title) : L.created(title),
      actions: onNavigate ? [{ label: L.open, onClick: () => onNavigate(ref) }] : [],
    });
  };

  const removeRef = (ref: CrossAppRef) => {
    // A note can be linked as a whole and by a tab: remove only the one whose × was pressed.
    onChange(value.filter((r) => !(r.type === ref.type && r.id === ref.id && (r.tabId ?? null) === (ref.tabId ?? null))));
  };

  return (
    <div className={styles.root}>
      <div className={styles.chips}>
        {value.map((ref) => {
          const linked = ref.type === 'note' ? notesRecord[ref.id as NoteId] : undefined;
          const list = ref.type === 'list' ? lists[ref.id as never] : undefined;
          const label = ref.type === 'note'
            ? `${linked?.isEncrypted ? '🔒 ' : ''}${linked?.title || 'Untitled'}`
            : ref.type === 'list' ? `${list?.isEncrypted ? '🔒 ' : ''}${list?.name || 'Deleted list'}` : ref.id;
          const path = linked ? getNoteBreadcrumb(linked, noteTags) : null;
          const tabName = linked ? tabNameOf(linked, ref.tabId) : null;
          const icon = ICON_BY_TYPE[ref.type] ?? '🔗';
          return (
            <span key={`${ref.type}:${ref.id}:${ref.tabId ?? ''}`} className={styles.chip} title={path ? `${path} › ${label}` : undefined}>
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
        {types.includes('note') && (
          <button type="button" className={styles.addBtn} onClick={() => setOpen('note')}>{LABELS.listLinks.linkNote}</button>
        )}
        {newNoteTitle !== undefined && types.includes('note') && (
          <button type="button" className={styles.addBtn} title={LABELS.newNoteFromItem.buttonTitle} onClick={() => setOpen('newNote')}>{LABELS.newNoteFromItem.button}</button>
        )}
        {types.includes('list') && (
          <button type="button" className={styles.addBtn} onClick={() => setOpen('list')}>{LABELS.listLinks.linkList}</button>
        )}
      </div>

      {open === 'note' && <NotePickerModal excludeIds={linkedNoteIds} suggestFrom={suggestFrom} onPick={addNote} onClose={() => setOpen(null)} />}
      {open === 'newNote' && <NotePickerModal mode="place" excludeIds={linkedNoteIds} suggestFrom={suggestFrom} onPick={() => {}} onPlace={addNewNote} onClose={() => setOpen(null)} />}
      {open === 'list' && <ListPickerModal excludeIds={linkedListIds} suggestFrom={suggestFrom} onPick={addList} onClose={() => setOpen(null)} />}
    </div>
  );
}
