// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useUIStore } from '@/store/uiStore';

vi.mock('@/components/NoteEditor/NoteEditor', () => ({ NoteEditor: () => <div className="ProseMirror" tabIndex={0} /> }));
const { NoteSplitView } = await import('./NoteSplitView');

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(cleanup);

const press = (key: string) => act(() => {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }));
});

describe('notes side by side: Ctrl+PgUp / Ctrl+PgDn', () => {
  it('moves to the next and previous note, round the ends, and stops the editor cycling tabs', () => {
    useUIStore.setState({ activeView: 'notes', noteLayout: 'three', notePanes: ['a', 'b', 'c'], focusedNotePane: 0, editingNoteId: 'a' });
    render(<NoteSplitView />);
    const editorIn = (i: number) => document.querySelector(`[data-note-pane="${i}"] .ProseMirror`);
    const onDocument = vi.fn();
    document.addEventListener('keydown', onDocument, true);
    press('PageDown');
    expect(useUIStore.getState().focusedNotePane).toBe(1);
    expect(document.activeElement).toBe(editorIn(1));
    press('PageUp');
    press('PageUp');
    expect(useUIStore.getState().focusedNotePane).toBe(2);
    expect(useUIStore.getState().editingNoteId).toBe('c');
    expect(onDocument).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onDocument, true);
  });

  it('with one note open it leaves the keys to the editor (its tabs)', () => {
    useUIStore.setState({ activeView: 'notes', noteLayout: 'single', notePanes: ['a'], focusedNotePane: 0, editingNoteId: 'a' });
    render(<NoteSplitView />);
    const onDocument = vi.fn();
    document.addEventListener('keydown', onDocument, true);
    press('PageDown');
    expect(onDocument).toHaveBeenCalled();
    document.removeEventListener('keydown', onDocument, true);
  });
});
