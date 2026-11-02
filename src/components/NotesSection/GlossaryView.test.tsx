// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { SENT_TO_GLOSSARY, toggleGlossaryKind } from '@/services/glossary';
import { GlossaryView } from './GlossaryView';

const add = (typeKey: string, term: string, fields: Record<string, unknown>, noteId: string) =>
  useNoteStore.getState().addStructuredTagEntry({ typeKey, tagId: `builtin-${typeKey}`, term, fields: { ...fields, [SENT_TO_GLOSSARY]: true }, noteId: noteId as never, collectionId: null });

beforeEach(() => {
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  const noteId = useNoteStore.getState().addNote({ title: 'Biology' });
  add('definition', 'Osmosis', { meaning: 'Water across a membrane' }, noteId);
  add('concept', 'Entropy', { summary: 'Disorder' }, noteId);
  add('acronym', 'DNA', { expansion: 'Deoxyribonucleic acid' }, noteId);
});
afterEach(cleanup);

const terms = () => [...document.querySelectorAll('article')].map((a) => a.querySelector('header')?.textContent ?? '');

describe('the Glossary', () => {
  it('filters by any combination of kinds; All clears them', () => {
    render(<GlossaryView />);
    expect(terms()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Definition' }));
    fireEvent.click(screen.getByRole('button', { name: 'Acronym' }));
    expect(terms().some((t) => t.includes('Osmosis')) && terms().some((t) => t.includes('DNA'))).toBe(true);
    expect(terms()).toHaveLength(2);
    expect(terms().some((t) => t.includes('Entropy'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(terms()).toHaveLength(3);
  });

  it('every kind picked is All', () => {
    const shown = new Map([['definition', 'Definition'], ['concept', 'Concept']]);
    expect(toggleGlossaryKind(new Set(['definition']), 'concept', shown).size).toBe(0);
    expect([...toggleGlossaryKind(new Set(['definition']), 'definition', shown)]).toEqual([]);
    expect([...toggleGlossaryKind(new Set(), 'concept', shown)]).toEqual(['concept']);
  });

  it('shows tiles or a list, remembered', () => {
    render(<GlossaryView />);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(useUIStore.getState().glossaryLayout).toBe('list');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(terms()).toHaveLength(3);
  });
});
