import { createElement, type MouseEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { notePaneCount, useUIStore, type NoteLayout } from '@/store/uiStore';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { flushOpenNoteEditors } from '@/services/liveNoteEditor';
import { NoteLayoutIcon } from '@/components/Icons';

// "Open beside" (2026-11-01, grown from the right-click item): each one adds a pane, one note to
// two, three, then four; with four showing, the note looked at least recently gives up its pane
// (never the one you're in). From a note's right-click, or Ctrl+click / middle-click on a note
// (`noteClickProps`). Desktop only: on a phone (no side by side, gap F31) it just opens the note.

const GROW: Record<NoteLayout, NoteLayout> = { single: 'two', two: 'three', three: 'four', four: 'four' };

// When each note was last the one in front, to know which pane to give up at four.
const lastUsed = new Map<string, number>();
let tick = 0;
useUIStore.subscribe((s, prev) => {
  if (s.editingNoteId && s.editingNoteId !== prev.editingNoteId) lastUsed.set(s.editingNoteId, ++tick);
});

export function openBeside(noteId: string): void {
  const ui = useUIStore.getState();
  if (Capacitor.getPlatform() === 'android') { ui.openNote(noteId); return; }
  if (ui.activeView !== 'notes') ui.setActiveView('notes');
  const now = useUIStore.getState();
  if (!now.editingNoteId) { now.openNote(noteId); return; }
  const showing = now.noteLayout === 'single' ? [now.editingNoteId] : now.notePanes;
  const at = showing.indexOf(noteId);
  if (at >= 0) { if (now.noteLayout !== 'single') now.focusNotePane(at); return; }
  const hasEmpty = now.noteLayout !== 'single' && now.notePanes.some((p, i) => !p && i !== now.focusedNotePane);
  if (!hasEmpty && now.noteLayout !== 'four') {
    flushOpenNoteEditors();
    now.setNoteLayout(GROW[now.noteLayout]);
  }
  const s = useUIStore.getState();
  const n = notePaneCount(s.noteLayout);
  const empty = s.notePanes.findIndex((p, i) => !p && i !== s.focusedNotePane);
  s.openNoteInPane(empty >= 0 ? empty : leastRecent(s.notePanes, s.focusedNotePane, n), noteId);
}

function leastRecent(panes: (string | null)[], focused: number, n: number): number {
  let best = (focused + 1) % n;
  for (let i = 0; i < n; i++) {
    if (i === focused) continue;
    if ((lastUsed.get(panes[i] ?? '') ?? 0) < (lastUsed.get(panes[best] ?? '') ?? 0)) best = i;
  }
  return best;
}

// Ctrl (Cmd) + click, or a middle-click, opens beside.
export const opensBeside = (e: { ctrlKey: boolean; metaKey: boolean; button: number }): boolean =>
  e.button === 1 || e.ctrlKey || e.metaKey;

// For an element that opens a note on click: Ctrl+click and middle-click open it beside instead.
export function noteClickProps(noteId: string, open: () => void) {
  return {
    onClick: (e: MouseEvent) => { if (opensBeside(e)) { e.preventDefault(); openBeside(noteId); } else open(); },
    onAuxClick: (e: MouseEvent) => { if (e.button === 1) { e.preventDefault(); openBeside(noteId); } },
    // A middle press would otherwise start the browser's autoscroll.
    onMouseDown: (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); },
  };
}

registerContextMenuProvider({
  id: 'note-row.open-beside',
  kind: 'note-row',
  order: 40,
  items: (_ctx, scope) => {
    const id = (scope.data as { noteId?: string } | undefined)?.noteId;
    return id ? [{ id: 'open-beside', label: LABELS.noteViews.openBeside, icon: createElement(NoteLayoutIcon, { layout: 'two' }), shortcut: 'Ctrl+click', run: () => openBeside(id) }] : [];
  },
});
