import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { listView } from '@/services/listSecrets';
import { glossaryKindOf, recordIntoList, forgetEntryInLists } from '@/services/glossaryLists';
import { DICTIONARY_TYPE_ID, addToDictionary } from '@/services/dictionary';
import { BOOKS_TYPE_ID, fillBookDetails } from '@/services/readingList';
import { deleteForever, trashedBy } from '@/services/trash';
import { openNoteLink } from '@/services/noteLinkTargets';
import { showToast } from '@/components/Toast/showToast';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';
import type { ListItemDraft } from '@/utils/listDrafts';
import type { ListId, ListItem, ListItemId } from '@/types/lists';
import type { NoteId, StructuredTagEntryId } from '@/types';

// Send to ▸ A list… (agreed with the user 2026-11-03): selected note text copied into any list, as
// items the person has checked (SendToListModal, over utils/listDrafts.ts). Each item remembers the
// passage it came from (its `_from`, shown as a link back on the item, ListItemSource). A list whose
// type does something with what arrives does it: a Glossary list makes records (services/
// glossaryLists.ts), the Dictionary fetches each word's meaning, a Books list looks each book up.
// Text from an encrypted note into a list that isn't asks first.

export const SOURCE_FIELD = '_from';
export interface ItemSource { noteId: string; tabId: string | null; blockId: string | null }
export interface SendSource { noteId: string | null; tabId: string | null; blockId: string | null }

export function itemSource(item: Pick<ListItem, 'data'>): ItemSource | null {
  const s = item.data?.[SOURCE_FIELD] as Partial<ItemSource> | undefined;
  return s && typeof s.noteId === 'string' ? { noteId: s.noteId, tabId: s.tabId ?? null, blockId: s.blockId ?? null } : null;
}

export function openItemSource(item: Pick<ListItem, 'data'>): void {
  const s = itemSource(item);
  if (s) openNoteLink(s.noteId, s.tabId, s.blockId);
}

// The title of the note an item came from, if it's still there.
export function itemSourceTitle(item: Pick<ListItem, 'data'>): string | null {
  const s = itemSource(item);
  const note = s ? useNoteStore.getState().notes[s.noteId as NoteId] : undefined;
  return note ? note.title || LABELS.notePicker.untitled : null;
}

// Whether text from this note may go to this list: asked when it would lose its encryption.
async function mayCopy(listId: ListId, noteId: string | null): Promise<boolean> {
  const note = noteId ? useNoteStore.getState().notes[noteId as NoteId] : undefined;
  const list = useListStore.getState().lists[listId];
  if (!note?.isEncrypted || list?.isEncrypted || glossaryKindOf(list)) return true;   // a Glossary list's records follow their note
  const S = LABELS.sendSelection;
  return confirmDialog({ title: S.unencryptTitle, message: S.unencryptMessage, confirmLabel: S.unencryptConfirm });
}

// Sends the checked drafts. Resolves how many went (0 when cancelled).
export async function sendDraftsToList(listId: ListId, drafts: ListItemDraft[], source: SendSource): Promise<number> {
  const go = drafts.filter((d) => d.title.trim());
  if (!go.length || !(await mayCopy(listId, source.noteId))) return 0;
  const list = useListStore.getState().lists[listId];
  if (!list) return 0;
  const madeItems: ListItemId[] = [];
  const madeRecords: string[] = [];
  const from = source.noteId ? { [SOURCE_FIELD]: { noteId: source.noteId, tabId: source.tabId, blockId: source.blockId } } : {};
  if (glossaryKindOf(list)) {
    for (const d of go) { const id = recordIntoList(listId, d.title, d.notes, source.noteId); if (id) madeRecords.push(id); }
  } else if (list.typeId === DICTIONARY_TYPE_ID) {
    for (const d of go) { const r = await addToDictionary(d.title); if (r && !r.existed) madeItems.push(r.itemId); }
  } else {
    for (const d of go) {
      const id = useListStore.getState().addListItem({ listId, title: d.title.trim(), data: { ...d.data, ...from }, notes: d.notes || null });
      madeItems.push(id);
      if (list.typeId === BOOKS_TYPE_ID) void fillBookDetails(id, d.title.trim());
    }
  }
  const n = madeItems.length + madeRecords.length;
  const S = LABELS.sendToList;
  showToast({
    message: S.sent(n, listView(list).name),
    actions: [
      { label: S.open, onClick: () => { const ui = useUIStore.getState(); ui.setActiveView('lists'); ui.setActiveListId(listId); } },
      { label: LABELS.swipeActions.undo, onClick: () => {
        for (const id of madeItems) for (const t of trashedBy(() => useListStore.getState().deleteListItem(id))) deleteForever(t);
        for (const id of madeRecords) {
          forgetEntryInLists(id);
          for (const t of trashedBy(() => useNoteStore.getState().deleteStructuredTagEntry(id as StructuredTagEntryId))) deleteForever(t);
        }
      } },
    ],
  });
  return n;
}
