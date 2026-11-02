// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { LookUpPane } from './LookUpPane';

const content = JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Mitochondria make the cell’s energy.' }] },
] }] });

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(cleanup);

describe('Look up', () => {
  it('shows the passage in its note, what’s around it unmarked, and the tab it’s on', () => {
    const tab = JSON.stringify({ type: 'doc', content: [{ type: 'section', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before it.' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ribosomes build proteins.' }] }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'After it.' }] },
    ] }] });
    const id = useNoteStore.getState().addNote({ title: 'Cells', content });
    useNoteStore.getState().updateNote(id, { tabs: [{ id: 't1', name: 'Organelles', content: tab }] } as never);
    render(<LookUpPane />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ribosomes' } });
    expect(screen.getByRole('option')).toHaveTextContent('Cells › Organelles');
    const marked = document.querySelectorAll('[data-lookup-passage]');
    expect([...marked].map((m) => m.textContent)).toEqual(['Ribosomes build proteins.']);
    expect(document.body.textContent).toContain('Before it.');
    expect(document.body.textContent).toContain('After it.');
    expect(document.querySelectorAll('[data-lookup-context]').length).toBeGreaterThan(0);
  });

  it('finds a passage, shows it, and Enter opens its note; with no note open, embedding says why', () => {
    const id = useNoteStore.getState().addNote({ title: 'Cells', content });
    useUIStore.getState().openLookUp();
    render(<LookUpPane />);
    const search = screen.getByRole('textbox');
    fireEvent.change(search, { target: { value: 'mitochondria' } });
    expect(screen.getByRole('option')).toHaveTextContent('Mitochondria make the cell’s energy.');
    expect(document.querySelector('[data-lookup-passage]')?.closest('.ProseMirror')).not.toBeNull();   // drawn by the note editor
    expect(screen.getByText('Open a note to embed or link this in it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Embed here/ })).toBeDisabled();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(useUIStore.getState().lookUpOpen).toBe(false);
    expect(useUIStore.getState().activeView).toBe('notes');
    expect(useUIStore.getState().editingNoteId).toBe(id);
  });
});
