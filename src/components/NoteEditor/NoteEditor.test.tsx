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
    updatedAt: '2026-09-01T00:00:00.000Z', abstract: null, lastViewedAt: null, archivedAt: null, color: null,
    pinned: false, userId: '', parentId: null, tabs, mainTabName: 'Main', tabOrder: [], templateId: null,
    collectionId: null, isEncrypted: false, encryptedPayload: null,
  };
}

// jsdom has no layout; ProseMirror's scroll-into-view (on focus) asks for rects.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;

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

    act(() => { useUIStore.getState().openNote('note-a', undefined, { mode: 'back' }); });
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
