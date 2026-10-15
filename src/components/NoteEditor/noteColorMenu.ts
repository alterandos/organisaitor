import { createElement } from 'react';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import type { ContextMenuItem } from '@/contextMenu/types';
import { ColorDotIcon } from '@/components/Icons';
import { useNoteStore } from '@/store/noteStore';
import { liveNote } from '@/services/liveNoteEditor';
import { SWATCHES } from '@/config/swatches';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types';

// A note's colour (Note.color), set from the right-click menu on its row and in the editor, and
// from the ribbon's Note ▾ menu: the palette, plus No colour. How it shows is in Settings.

export function setNoteColor(noteId: string, color: string | null): void {
  useNoteStore.getState().updateNote(noteId as NoteId, { color });
}

export function noteColorMenuItem(noteId: string): ContextMenuItem {
  const current = useNoteStore.getState().notes[noteId as NoteId]?.color ?? null;
  const dot = (c: string | null) => createElement(ColorDotIcon, { color: c });
  return {
    id: 'note-colour',
    label: LABELS.noteColors.menu,
    icon: dot(current),
    submenu: [
      [{ id: 'none', label: LABELS.noteColors.none, icon: current === null ? '✓' : dot(null), run: () => setNoteColor(noteId, null) }],
      SWATCHES.map((s) => ({ id: s.id, label: s.label, icon: current === s.hex ? '✓' : dot(s.hex), run: () => setNoteColor(noteId, s.hex) })),
    ],
  };
}

registerContextMenuProvider({
  id: 'note-row.colour',
  kind: 'note-row',
  order: 50,
  items: (_ctx, scope) => {
    const id = (scope.data as { noteId?: string } | undefined)?.noteId;
    return id ? [noteColorMenuItem(id)] : [];
  },
});

registerContextMenuProvider({
  id: 'note-editor.colour',
  kind: 'note-editor',
  order: 200,
  items: () => {
    const open = liveNote();
    return open ? [noteColorMenuItem(open.noteId)] : [];
  },
});
