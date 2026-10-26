import { describe, expect, it } from 'vitest';
import { listScopes, noteScopes, notebookEncryptionSource, type ScopeContext } from './encryptionScopes';
import type { Collection, CollectionId } from '@/types';
import type { NoteTag } from '@/types/notes';

// Encryption by scope: which notebooks and Endeavours keep a note or a list encrypted.

function nb(id: string, o: Partial<NoteTag> = {}): NoteTag {
  return {
    id: id as never, name: id, kind: 'area', parentTagId: null, tagTypeId: null, color: null, icon: null, order: 0,
    fieldSchema: [], collectionId: null, createdAt: '', updatedAt: '', userId: '', ...o,
  };
}
function col(id: string, o: Partial<Collection> = {}): Collection {
  return {
    id: id as CollectionId, kind: 'project', name: id, description: null, color: null, purposeIds: [], tagIds: [], deadline: null,
    fieldSchema: [], routineTasks: [], repeatConfig: null, collectionId: null, archivedAt: null, createdAt: '', updatedAt: '', ...o,
  };
}
function ctx(tags: NoteTag[], cols: Collection[] = []): ScopeContext {
  return { noteTags: Object.fromEntries(tags.map((t) => [t.id, t])), collections: Object.fromEntries(cols.map((c) => [c.id, c])) };
}
const note = (tagIds: string[], collectionId: string | null = null) => ({ tagIds, collectionId: collectionId as CollectionId | null });

describe('notebooks', () => {
  it('a note in a notebook that encrypts its contents is covered; one elsewhere is not', () => {
    const c = ctx([nb('secret', { encryptContents: true }), nb('open')]);
    expect(noteScopes(note(['secret']), c)).toEqual([{ kind: 'notebook', id: 'secret', name: 'secret' }]);
    expect(noteScopes(note(['open']), c)).toEqual([]);
    expect(noteScopes(note([]), c)).toEqual([]);
  });

  it('notebooks inside inherit it, at any depth; the nearest setting is named', () => {
    const c = ctx([nb('top', { encryptContents: true }), nb('mid', { parentTagId: 'top' as never }), nb('leaf', { parentTagId: 'mid' as never })]);
    expect(noteScopes(note(['leaf']), c).map((s) => s.id)).toEqual(['top']);
    expect(notebookEncryptionSource(c.noteTags.leaf, c.noteTags)?.id).toBe('top');
  });

  it('turned off (false) or never set covers nothing', () => {
    const c = ctx([nb('a', { encryptContents: false }), nb('b')]);
    expect(noteScopes(note(['a', 'b']), c)).toEqual([]);
  });

  it('a note in two notebooks is covered if either encrypts; each counts once', () => {
    const c = ctx([nb('x', { encryptContents: true }), nb('y'), nb('z', { parentTagId: 'x' as never })]);
    expect(noteScopes(note(['y', 'x']), c).map((s) => s.id)).toEqual(['x']);
    expect(noteScopes(note(['x', 'z']), c).map((s) => s.id)).toEqual(['x']);
  });

  it('the pinned notebooks (Stickies, Scratchpad) never take it, and annotation tags never count', () => {
    const c = ctx([
      nb('stickies', { presetKey: 'stickies', encryptContents: true }),
      nb('scratch', { presetKey: 'scratchpad', encryptContents: true }),
      nb('tag', { kind: 'tag', encryptContents: true }),
    ]);
    expect(noteScopes(note(['stickies']), c)).toEqual([]);
    expect(noteScopes(note(['scratch']), c)).toEqual([]);
    expect(noteScopes(note(['tag']), c)).toEqual([]);
  });

  it('a loop in the notebook tree can’t hang it', () => {
    const c = ctx([nb('a', { parentTagId: 'b' as never }), nb('b', { parentTagId: 'a' as never })]);
    expect(notebookEncryptionSource(c.noteTags.a, c.noteTags)).toBeNull();
  });
});

describe('Endeavours', () => {
  it('a note filed under an Endeavour that encrypts is covered, directly or through its notebook', () => {
    const c = ctx([nb('nb', { collectionId: 'e' as CollectionId })], [col('e', { encryptContents: true })]);
    expect(noteScopes(note([], 'e'), c)).toEqual([{ kind: 'endeavour', id: 'e', name: 'e' }]);
    expect(noteScopes(note(['nb']), c).map((s) => s.kind)).toEqual(['endeavour']);
  });

  it('the note’s own Endeavour wins over its notebook’s', () => {
    const c = ctx([nb('nb', { collectionId: 'e' as CollectionId })], [col('e', { encryptContents: true }), col('other')]);
    expect(noteScopes(note(['nb'], 'other'), c)).toEqual([]);
  });

  it('an archived Endeavour still covers; trackers and routines can’t hold the setting', () => {
    const c = ctx([], [col('old', { encryptContents: true, archivedAt: '2030-01-01' }), col('t', { kind: 'tracker', encryptContents: true })]);
    expect(listScopes({ collectionId: 'old' as CollectionId }, c)).toHaveLength(1);
    expect(listScopes({ collectionId: 't' as CollectionId }, c)).toEqual([]);
  });

  it('a list is covered by its Endeavour only; a note can be covered by both kinds of scope', () => {
    const c = ctx([nb('nb', { encryptContents: true })], [col('e', { encryptContents: true })]);
    expect(listScopes({ collectionId: 'e' as CollectionId }, c)).toEqual([{ kind: 'endeavour', id: 'e', name: 'e' }]);
    expect(listScopes({ collectionId: null }, c)).toEqual([]);
    expect(noteScopes(note(['nb'], 'e'), c).map((s) => s.kind)).toEqual(['notebook', 'endeavour']);
  });
});
