import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './uiStore';
import { useNoteStore } from './noteStore';
import { openBeside } from '@/components/NoteSplitView/openBeside';
import { liveNote, liveNoteEditorFor, liveNoteFor, liveNotes, registerLiveNoteEditor, registerOpenNoteEditor } from '@/services/liveNoteEditor';
import type { EditorView } from '@tiptap/pm/view';

const ui = () => useUIStore.getState();
let a: string, b: string, c: string;

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  a = useNoteStore.getState().addNote({ title: 'A' });
  b = useNoteStore.getState().addNote({ title: 'B' });
  c = useNoteStore.getState().addNote({ title: 'C' });
  ui().setActiveView('notes');
  ui().openNote(a);
});

describe('notes side by side', () => {
  it('splitting keeps the open note in the first pane, in front; the others start empty', () => {
    ui().setNoteLayout('three');
    expect(ui().notePanes).toEqual([a, null, null]);
    expect(ui().focusedNotePane).toBe(0);
    expect(ui().editingNoteId).toBe(a);
  });

  it('opening a note puts it in the pane in front; focusing a pane makes its note the open one', () => {
    ui().setNoteLayout('two');
    ui().focusNotePane(1);
    expect(ui().editingNoteId).toBeNull();
    ui().openNote(b);
    expect(ui().notePanes).toEqual([a, b]);
    ui().focusNotePane(0);
    expect(ui().editingNoteId).toBe(a);
  });

  it('a note is in one pane at most: opening one already showing moves the focus to it', () => {
    ui().setNoteLayout('two');
    ui().openNoteInPane(1, b);
    expect(ui().notePanes).toEqual([a, b]);
    ui().focusNotePane(0);
    ui().openNote(b);
    expect(ui().notePanes).toEqual([a, b]);
    expect(ui().focusedNotePane).toBe(1);
    ui().openNoteInPane(0, b);
    expect(ui().notePanes).toEqual([a, b]);
  });

  it('closing a note takes its pane away; the last one left is shown alone (2026-11-02)', () => {
    const d = useNoteStore.getState().addNote({ title: 'D' });
    ui().setNoteLayout('four');
    ui().openNoteInPane(1, b);
    ui().openNoteInPane(2, c);
    ui().openNoteInPane(3, d);
    ui().closeNotePane(0);
    expect(ui().noteLayout).toBe('three');
    expect(ui().notePanes).toEqual([b, c, d]);
    expect(ui().focusedNotePane).toBe(2);
    expect(ui().editingNoteId).toBe(d);
    ui().closeNote();
    expect(ui().noteLayout).toBe('two');
    expect(ui().notePanes).toEqual([b, c]);
    expect(ui().editingNoteId).toBe(c);
    ui().closeNotePane(1);
    expect(ui().noteLayout).toBe('single');
    expect(ui().editingNoteId).toBe(b);
  });

  it('"Open beside" splits one note in two, else fills an empty pane', () => {
    openBeside(b);
    expect(ui().noteLayout).toBe('two');
    expect(ui().notePanes).toEqual([a, b]);
    ui().setNoteLayout('three');
    openBeside(c);
    expect(ui().notePanes).toEqual([a, b, c]);
  });

  it('each "Open beside" adds a pane up to four, then the note looked at least recently gives up its pane (2026-11-01)', () => {
    const d = useNoteStore.getState().addNote({ title: 'D' });
    const e = useNoteStore.getState().addNote({ title: 'E' });
    openBeside(b);
    expect(ui().noteLayout).toBe('two');
    openBeside(c);
    expect(ui().noteLayout).toBe('three');
    openBeside(d);
    expect(ui().noteLayout).toBe('four');
    expect(ui().notePanes).toEqual([a, b, c, d]);
    ui().focusNotePane(0);
    ui().focusNotePane(2);
    ui().focusNotePane(3);
    openBeside(e);
    expect(ui().noteLayout).toBe('four');
    expect(ui().notePanes).toEqual([a, e, c, d]);
    expect(ui().editingNoteId).toBe(e);
  });

  it('"Open beside" on a note already showing just goes to it', () => {
    openBeside(b);
    ui().focusNotePane(0);
    openBeside(b);
    expect(ui().noteLayout).toBe('two');
    expect(ui().focusedNotePane).toBe(1);
  });

  it('in another section a note opens in the quick view, not in a pane', () => {
    ui().setNoteLayout('two');
    ui().setActiveView('tasks');
    ui().openNote(c);
    expect(ui().notePanes).toEqual([a, null]);
  });
});

describe('the open editors', () => {
  const view = () => ({ isDestroyed: false }) as unknown as EditorView;
  it('every pane is found by its note; the one in front is liveNote()', () => {
    const v1 = view();
    const v2 = view();
    const off1 = registerOpenNoteEditor({ noteId: a, tabId: null, view: v1 });
    const off2 = registerOpenNoteEditor({ noteId: b, tabId: 't', view: v2 });
    registerLiveNoteEditor({ noteId: a, tabId: null, view: v1 });
    expect(liveNote()?.view).toBe(v1);
    expect(liveNoteEditorFor(b, 't')).toBe(v2);
    expect(liveNoteFor(b)?.view).toBe(v2);
    expect(liveNotes()).toHaveLength(2);
    off2();
    expect(liveNoteFor(b)).toBeNull();
    off1();
    registerLiveNoteEditor(null);
    expect(liveNotes()).toHaveLength(0);
  });
});
