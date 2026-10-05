import { useUIStore, type AppView } from '@/store/uiStore';
import { LABELS } from '@/config/labels';

// Everything a creation pane can switch to (CreateKindSwitcher, the strip at the top of the pane).
// A section's kinds show as one switcher, so a new creatable thing is one entry here plus the
// switcher in its pane; nothing else changes. `open` opens that kind's pane the way the rest of
// the app does (the uiStore show* action), with the section's current context (a notebook made
// from Notes goes inside the selected notebook). Whatever was typed in the pane being left
// travels in uiStore.createDraft, which the next pane reads as its starting name/title.
export interface CreateKind {
  id:      string;
  section: AppView;
  label:   string;
  icon:    string;
  open:    () => void;
}

export const CREATE_KINDS: CreateKind[] = [
  {
    id: 'note', section: 'notes', label: LABELS.createKinds.note, icon: '📝',
    open: () => useUIStore.getState().showAddNote(),
  },
  {
    id: 'notebook', section: 'notes', label: LABELS.createKinds.notebook, icon: '📓',
    open: () => { const ui = useUIStore.getState(); ui.showAddNoteTag(ui.selectedNoteTagId, 'area'); },
  },
  {
    id: 'note-tag', section: 'notes', label: LABELS.createKinds.noteTag, icon: '🏷️',
    open: () => useUIStore.getState().showAddNoteTag(null, 'tag'),
  },
];

// The kinds offered alongside `currentId`: the same section's.
export function siblingCreateKinds(currentId: string): CreateKind[] {
  const current = CREATE_KINDS.find((k) => k.id === currentId);
  return current ? CREATE_KINDS.filter((k) => k.section === current.section) : [];
}

// Switch the open creation pane to another kind, carrying what was typed.
export function switchCreateKind(kind: CreateKind, draft: string): void {
  useUIStore.getState().setCreateDraft(draft.trim() ? draft : null);
  kind.open();
}
