import { describe, expect, it } from 'vitest';
import type { NoteTag } from '@/types/notes';
import { noteNotebookId, resolveNoteBackdrop, resolveNotebookFallback } from './noteBackdrop';

const tag = (id: string, over: Partial<NoteTag> = {}): NoteTag => ({
  id: id as never, name: id, kind: 'area', parentTagId: null, tagTypeId: null, color: null, icon: null, order: 0,
  fieldSchema: [], collectionId: null, createdAt: '', updatedAt: '', userId: '', ...over,
});

const tags = {
  uni:  tag('uni', { backdrop: { kind: 'preset', id: 'ocean' } }),
  bio:  tag('bio', { parentTagId: 'uni' as never }),
  chem: tag('chem', { parentTagId: 'uni' as never, backdrop: { kind: 'plain' } }),
  imp:  tag('imp', { kind: 'tag', backdrop: { kind: 'preset', id: 'dusk' } }),
};

describe('which backdrop a note shows', () => {
  it("the note's own wins", () => {
    const r = resolveNoteBackdrop({ backdrop: { kind: 'preset', id: 'paper' }, tagIds: ['chem'] }, tags, null);
    expect(r).toEqual({ backdrop: { kind: 'preset', id: 'paper' }, from: { kind: 'note' } });
  });

  it('else its notebook, else the notebooks above it', () => {
    expect(resolveNoteBackdrop({ tagIds: ['chem'] }, tags, null)).toEqual({ backdrop: { kind: 'plain' }, from: { kind: 'notebook', id: 'chem' } });
    expect(resolveNoteBackdrop({ backdrop: null, tagIds: ['bio'] }, tags, null)).toEqual({ backdrop: { kind: 'preset', id: 'ocean' }, from: { kind: 'notebook', id: 'uni' } });
  });

  it('annotation tags are not notebooks; with nothing set, the app-wide one (null = plain)', () => {
    expect(noteNotebookId({ tagIds: ['imp', 'bio'] }, tags)).toBe('bio');
    expect(resolveNoteBackdrop({ tagIds: ['imp'] }, tags, { kind: 'preset', id: 'sunset' }).backdrop).toEqual({ kind: 'preset', id: 'sunset' });
    expect(resolveNoteBackdrop({ tagIds: [] }, tags, null)).toEqual({ backdrop: { kind: 'plain' }, from: { kind: 'app' } });
  });

  it("a notebook falls back to its parent's, else the app-wide one; a loop doesn't hang", () => {
    expect(resolveNotebookFallback(tags.bio, tags, null)).toEqual({ kind: 'preset', id: 'ocean' });
    expect(resolveNotebookFallback(tags.uni, tags, null)).toEqual({ kind: 'plain' });
    const loop = { a: tag('a', { parentTagId: 'b' as never }), b: tag('b', { parentTagId: 'a' as never }) };
    expect(resolveNoteBackdrop({ tagIds: ['a'] }, loop, null).from).toEqual({ kind: 'app' });
  });
});
