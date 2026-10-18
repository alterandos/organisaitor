import { createElement } from 'react';
import { notePaneCount, useUIStore } from '@/store/uiStore';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { flushOpenNoteEditors } from '@/services/liveNoteEditor';
import { NoteLayoutIcon } from '@/components/Icons';

// "Open beside" on a note's row: in the next pane, splitting the view in two if it's one note.
export function openBeside(noteId: string): void {
  const ui = useUIStore.getState();
  if (ui.noteLayout === 'single') {
    if (!ui.editingNoteId) { ui.openNote(noteId); return; }
    flushOpenNoteEditors();
    ui.setNoteLayout('two');
  }
  const s = useUIStore.getState();
  const n = notePaneCount(s.noteLayout);
  const empty = s.notePanes.findIndex((p, i) => !p && i !== s.focusedNotePane);
  const target = empty >= 0 ? empty : (s.focusedNotePane + 1) % n;
  s.openNoteInPane(target, noteId);
}

registerContextMenuProvider({
  id: 'note-row.open-beside',
  kind: 'note-row',
  order: 40,
  items: (_ctx, scope) => {
    const id = (scope.data as { noteId?: string } | undefined)?.noteId;
    return id ? [{ id: 'open-beside', label: LABELS.noteViews.openBeside, icon: createElement(NoteLayoutIcon, { layout: 'two' }), run: () => openBeside(id) }] : [];
  },
});

