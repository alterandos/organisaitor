import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { useUIStore } from '@/store/uiStore';
import { EditIcon, IndentIcon, OutdentIcon, TrashIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import '@/components/NoteSplitView/openBeside';
import '@/components/NoteEditor/noteColorMenu';
import '@/services/quickAccessPins';

// Right-click on a note (a row of the notes list, a Mosaic card: a `note-row` scope, CLAUDE.md
// "Right-click menus"). Laid out 2026-11-03, when each feature's item had its own section:
//   Open, Open beside                                         (section 'open')
//   Details…, Make sub-note, Move up a level, Colour ▸, Pin, Export as PDF   (section 'note')
//   Delete                                                    (kept apart, at the bottom)
// A scope's `data` is `NoteRowMenuData`: the note, and what only the row can do (the list knows
// where a note can be indented to, and asks before deleting). Another feature adds to a note's
// menu with a `note-row` provider naming one of those sections.

export interface NoteRowMenuData {
  noteId:  string;
  indent?: () => void;
  outdent?: () => void;
  delete?: () => void;
}

const dataOf = (data: unknown) => data as NoteRowMenuData | undefined;

registerContextMenuProvider({
  id: 'note-row.open',
  kind: 'note-row',
  order: 1,
  section: 'open',
  items: (_ctx, scope) => {
    const id = dataOf(scope.data)?.noteId;
    return id ? [{ id: 'open', label: LABELS.contextMenu.openNote, icon: '📝', run: () => useUIStore.getState().openNote(id) }] : [];
  },
});

registerContextMenuProvider({
  id: 'note-row.edit',
  kind: 'note-row',
  order: 20,
  section: 'note',
  items: (_ctx, scope) => {
    const d = dataOf(scope.data);
    if (!d?.noteId) return [];
    return [
      { id: 'details', label: LABELS.contextMenu.noteDetails, icon: createElement(EditIcon), run: () => useUIStore.getState().showEditNoteMeta(d.noteId) },
      ...(d.indent ? [{ id: 'indent', label: LABELS.rowActions.indentNote, icon: createElement(IndentIcon), run: d.indent }] : []),
      ...(d.outdent ? [{ id: 'outdent', label: LABELS.rowActions.outdent, icon: createElement(OutdentIcon), run: d.outdent }] : []),
    ];
  },
});

registerContextMenuProvider({
  id: 'note-row.delete',
  kind: 'note-row',
  order: 90,
  items: (_ctx, scope) => {
    const d = dataOf(scope.data);
    return d?.delete ? [{ id: 'delete', label: LABELS.rowActions.delete, icon: createElement(TrashIcon, { width: '1em', height: '1em' }), destructive: true, run: d.delete }] : [];
  },
});
