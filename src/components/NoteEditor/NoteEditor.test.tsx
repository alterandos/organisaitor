// @vitest-environment jsdom
//
// Regression test for the tab-overwrite bug (2026-09-30): moving to a note whose remembered tab
// isn't Main (Alt+Left/Right, or any other openNote) restored that tab as active but loaded the
// note's MAIN content into the editor, so the next save — a tab click, typing, leaving — wrote
// Main's content over that tab. The editor must always show the content of the tab it marks active.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import type { Note, NoteId } from '@/types/notes';

const doc = (text: string) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

function makeNote(id: string, content: string, tabs: Note['tabs'] = []): Note {
  return {
    id: id as NoteId, title: id, content, tagIds: [], tagData: {}, createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z', abstract: null, mainTabUpdatedAt: null, lastViewedAt: null, archivedAt: null, color: null,
    pinned: false, userId: '', parentId: null, tabs, mainTabName: 'Main', tabOrder: [], templateId: null,
    collectionId: null, isEncrypted: false, encryptedPayload: null,
  };
}

// jsdom has no layout; ProseMirror's scroll-into-view (on focus) asks for rects.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;
document.elementFromPoint = () => null;

const editorText = () => document.querySelector('.ProseMirror')?.textContent ?? '';
const stored = (id: string) => useNoteStore.getState().notes[id as NoteId];

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useNoteStore.setState({
    notes: {
      ['note-a' as NoteId]: makeNote('note-a', doc('MAIN-A'), [{ id: 't2', name: 'Second', content: doc('TAB2-A') }]),
      ['note-b' as NoteId]: makeNote('note-b', doc('MAIN-B')),
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('NoteEditor tab restore on note switch', () => {
  it('back-navigating to a note loads its remembered tab\'s content, and switching away keeps both tabs intact', async () => {
    useUIStore.setState({ activeView: 'notes', editingNoteId: 'note-b', notesTabMemory: { 'note-a': 't2' } });
    render(<StrictMode><NoteEditor /></StrictMode>);
    expect(editorText()).toContain('MAIN-B');

    act(() => { useUIStore.getState().openNote('note-a', undefined, { mode: 'silent' }); });
    expect(editorText()).toContain('TAB2-A');
    expect(editorText()).not.toContain('MAIN-A');

    // A tab switch flushes the open tab — this is where the old bug wrote Main over tab 2.
    await userEvent.click(screen.getByText('Main'));
    expect(editorText()).toContain('MAIN-A');
    expect(stored('note-a').tabs[0].content).toContain('TAB2-A');
    expect(stored('note-a').tabs[0].content).not.toContain('MAIN-A');
    expect(stored('note-a').content).toContain('MAIN-A');
  });

  it('Alt+Left back to a note returns to the tab you were working on (memory written by the app itself)', async () => {
    useUIStore.setState({ activeView: 'notes' });
    act(() => { useUIStore.getState().openNote('note-a'); });
    render(<StrictMode><NoteEditor /></StrictMode>);
    await userEvent.click(screen.getByText('Second'));
    expect(editorText()).toContain('TAB2-A');
    // Recorded as soon as the tab is active, not only on leaving — a reload or restart while on
    // this note must not forget it (the old leave-time mirror held Main here).
    expect(useUIStore.getState().notesTabMemory['note-a']).toBe('t2');
    expect(useUIStore.getState().notesLastActiveTabId).toBe('t2');

    act(() => { useUIStore.getState().openNote('note-b'); });
    expect(useUIStore.getState().notesTabMemory['note-b'] ?? null).toBeNull();
    expect(editorText()).toContain('MAIN-B');

    act(() => { useUIStore.getState().navigateBack(); });
    expect(useUIStore.getState().editingNoteId).toBe('note-a');
    expect(editorText()).toContain('TAB2-A');
    expect(document.querySelector('[class*="tabActive"]')?.textContent).toContain('Second');
    expect(useUIStore.getState().notesTabMemory['note-a']).toBe('t2');

    act(() => { useUIStore.getState().navigateForward(); });
    act(() => { useUIStore.getState().navigateBack(); });
    expect(editorText()).toContain('TAB2-A');
  });

  it('returning to Notes on a remembered tab (first mount) shows that tab\'s content', async () => {
    useUIStore.setState({
      activeView: 'notes', editingNoteId: 'note-a', notesLastEditingNoteId: 'note-a', notesLastActiveTabId: 't2',
    });
    render(<StrictMode><NoteEditor /></StrictMode>);
    expect(editorText()).toContain('TAB2-A');

    await userEvent.click(screen.getByText('Main'));
    expect(stored('note-a').tabs[0].content).toContain('TAB2-A');
    expect(stored('note-a').content).toContain('MAIN-A');
  });
});

// Ctrl+H then H puts the cursor in the tab's Title, creating it from the tab's name (the note's title, on Main). Reported broken
// 2026-10-05: with Ctrl still held for the H, the second press read as a fresh Ctrl+H and did nothing.
describe('NoteEditor Ctrl+H, H inserts the Title', () => {
  const titleText = () => document.querySelector('[data-note-title]')?.textContent ?? null;

  async function openFocused() {
    useUIStore.setState({ activeView: 'notes', editingNoteId: 'note-b' });
    render(<StrictMode><NoteEditor /></StrictMode>);
    await userEvent.click(document.querySelector('.ProseMirror') as HTMLElement);
  }

  it('Ctrl held for both presses', async () => {
    await openFocused();
    await userEvent.keyboard('{Control>}hh{/Control}');
    expect(titleText()).toBe('note-b');
  });

  it('Ctrl released before the H', async () => {
    await openFocused();
    await userEvent.keyboard('{Control>}h{/Control}h');
    expect(titleText()).toBe('note-b');
  });
});

// Paste as plain text (Ctrl+Shift+V, 2026-10-05): ProseMirror's own Shift-paste, which our
// handlePaste must not turn back into a table.
describe('NoteEditor paste as plain text', () => {
  function paste(data: Record<string, string>) {
    const pm = document.querySelector('.ProseMirror') as HTMLElement;
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => data[type] ?? '', types: Object.keys(data), files: [] },
    });
    act(() => { pm.dispatchEvent(event); });
  }
  const pressCtrlShiftV = () => {
    const pm = document.querySelector('.ProseMirror') as HTMLElement;
    act(() => { pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true })); });
  };
  const html = '<p>Hello <strong>bold</strong> <a href="https://x.test">link</a></p>';

  async function openFocused() {
    useUIStore.setState({ activeView: 'notes', editingNoteId: 'note-b' });
    render(<StrictMode><NoteEditor /></StrictMode>);
    await userEvent.click(document.querySelector('.ProseMirror') as HTMLElement);
  }

  it('a normal paste keeps the source formatting', async () => {
    await openFocused();
    paste({ 'text/html': html, 'text/plain': 'Hello bold link' });
    expect(document.querySelector('.ProseMirror strong')).not.toBeNull();
    expect(document.querySelector('.ProseMirror a[href]')).not.toBeNull();
  });

  it('Ctrl+Shift+V pastes the text only', async () => {
    await openFocused();
    pressCtrlShiftV();
    paste({ 'text/html': html, 'text/plain': 'Hello bold link' });
    expect(editorText()).toContain('Hello bold link');
    expect(document.querySelector('.ProseMirror strong')).toBeNull();
    expect(document.querySelector('.ProseMirror a[href]')).toBeNull();
  });

  it('tab-separated text becomes a table on a normal paste, but stays text on Ctrl+Shift+V', async () => {
    const tsv = 'a\tb\nc\td';
    await openFocused();
    pressCtrlShiftV();
    paste({ 'text/plain': tsv });
    expect(document.querySelector('.ProseMirror table')).toBeNull();
    paste({ 'text/plain': tsv });
    expect(document.querySelector('.ProseMirror table')).not.toBeNull();
  });
});

// The live Tiptap editor inside the mounted NoteEditor (Tiptap keeps it on its DOM element).
const liveEditor = () => (document.querySelector('.ProseMirror') as unknown as { editor: import('@tiptap/core').Editor }).editor;
// A key pressed in the editor: it reaches the editor's own keymap first, then the document.
const keyInEditor = (init: KeyboardEventInit) => act(() => {
  document.querySelector('.ProseMirror')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
});

describe('NoteEditor keys added 2026-10-07', () => {
  const twoLines = JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Jo Bloggs' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] },
  ] }] });

  it('F2 renames the open tab, and Enter puts the cursor back where it was', async () => {
    useNoteStore.setState((s) => ({ notes: { ...s.notes, ['note-c' as NoteId]: makeNote('note-c', twoLines) } }));
    useUIStore.setState({ activeView: 'notes' });
    act(() => { useUIStore.getState().openNote('note-c'); });
    render(<NoteEditor />);
    const ed = liveEditor();
    act(() => { ed.view.dom.focus(); ed.commands.setTextSelection(15); });
    keyInEditor({ key: 'F2' });
    const input = await screen.findByDisplayValue('Main');
    await userEvent.clear(input);
    await userEvent.type(input, 'Draft{Enter}');
    expect(stored('note-c').mainTabName).toBe('Draft');
    expect(ed.state.selection.from).toBe(15);
    expect(ed.isFocused).toBe(true);
  });

  it('Ctrl+H then Ctrl+A makes the line the Author (not everything, though Ctrl+A also means Select all)', () => {
    useNoteStore.setState((s) => ({ notes: { ...s.notes, ['note-c' as NoteId]: makeNote('note-c', twoLines) } }));
    useUIStore.setState({ activeView: 'notes' });
    act(() => { useUIStore.getState().openNote('note-c'); });
    render(<NoteEditor />);
    const ed = liveEditor();
    act(() => { ed.view.dom.focus(); ed.commands.setTextSelection(4); });
    keyInEditor({ key: 'h', ctrlKey: true });
    keyInEditor({ key: 'a', ctrlKey: true });
    const blocks: string[] = [];
    ed.state.doc.forEach((section) => section.forEach((b) => blocks.push(`${b.type.name}:${b.textContent}`)));
    expect(blocks).toEqual(['noteAuthor:Jo Bloggs', 'paragraph:Body text']);
    keyInEditor({ key: 'h', ctrlKey: true });
    keyInEditor({ key: 's' });
    expect(ed.state.selection.$from.parent.type.name).toBe('noteSubtitle');
  });

  // Ctrl+H on normal text makes Heading 1 at once (2026-10-09); a second key still picks the
  // level. Holding Ctrl between the two auto-repeats Ctrl's own keydown, which used to cancel.
  describe('Ctrl+H levels', () => {
    function open() {
      useNoteStore.setState((s) => ({ notes: { ...s.notes, ['note-c' as NoteId]: makeNote('note-c', twoLines) } }));
      useUIStore.setState({ activeView: 'notes' });
      act(() => { useUIStore.getState().openNote('note-c'); });
      render(<NoteEditor />);
      const ed = liveEditor();
      act(() => { ed.view.dom.focus(); ed.commands.setTextSelection(13); });
      const blocks = () => { const b: string[] = []; ed.state.doc.forEach((s) => s.forEach((x) => b.push(`${x.type.name}${x.attrs.level ?? ''}`))); return b; };
      return { ed, blocks };
    }

    it('alone, on normal text, makes Heading 1', () => {
      const { blocks } = open();
      keyInEditor({ key: 'h', ctrlKey: true });
      expect(blocks()).toEqual(['paragraph', 'heading1']);
    });

    it('then a digit (Ctrl held, auto-repeating) makes that level', () => {
      const { blocks } = open();
      keyInEditor({ key: 'h', ctrlKey: true });
      keyInEditor({ key: 'Control', ctrlKey: true });
      keyInEditor({ key: 'Control', ctrlKey: true });
      keyInEditor({ key: '2', ctrlKey: true });
      expect(blocks()).toEqual(['paragraph', 'heading2']);
      keyInEditor({ key: 'h', ctrlKey: true });
      expect(blocks()).toEqual(['paragraph', 'heading2']);   // a heading stays as it is
      keyInEditor({ key: '1' });
      expect(blocks()).toEqual(['paragraph', 'heading1']);
    });

    it('then H goes to the Title and leaves the line as normal text', () => {
      const { blocks } = open();
      keyInEditor({ key: 'h', ctrlKey: true });
      keyInEditor({ key: 'h', ctrlKey: true });
      expect(blocks()).toEqual(['noteTitle', 'paragraph', 'paragraph']);
    });
  });
});
