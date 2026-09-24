import { describe, expect, it } from 'vitest';
import {
  getEffectiveCollectionId, resolveNoteInheritedCollectionId, getNoteEffectiveCollectionId,
  getNotebookIcon, getNoteBreadcrumb, getVisibleNoteTagIds,
} from '@/utils/notes';
import type { CollectionId, NoteTag } from '@/types';

function tag(id: string, overrides: Partial<NoteTag> = {}): NoteTag {
  return {
    id: id as never, name: id, kind: 'area', parentTagId: null, tagTypeId: null, color: null, icon: null,
    order: 0, fieldSchema: [], collectionId: null, createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z', userId: 'u1', ...overrides,
  };
}

describe('getEffectiveCollectionId', () => {
  it('returns the tag\'s own collectionId when set', () => {
    const tags = { a: tag('a', { collectionId: 'c1' as CollectionId }) };
    expect(getEffectiveCollectionId(tags.a, tags)).toBe('c1');
  });

  it('walks up to the nearest ancestor with a collectionId', () => {
    const tags = {
      root: tag('root', { collectionId: 'c1' as CollectionId }),
      child: tag('child', { parentTagId: 'root' as never }),
      grandchild: tag('grandchild', { parentTagId: 'child' as never }),
    };
    expect(getEffectiveCollectionId(tags.grandchild, tags)).toBe('c1');
  });

  it('a closer ancestor\'s collectionId wins over a further one', () => {
    const tags = {
      root: tag('root', { collectionId: 'c-far' as CollectionId }),
      child: tag('child', { parentTagId: 'root' as never, collectionId: 'c-near' as CollectionId }),
      grandchild: tag('grandchild', { parentTagId: 'child' as never }),
    };
    expect(getEffectiveCollectionId(tags.grandchild, tags)).toBe('c-near');
  });

  it('returns null when no ancestor has one', () => {
    const tags = { a: tag('a'), b: tag('b', { parentTagId: 'a' as never }) };
    expect(getEffectiveCollectionId(tags.b, tags)).toBeNull();
  });
});

describe('resolveNoteInheritedCollectionId', () => {
  it('takes the first tag id that resolves to something, skipping ones that don\'t', () => {
    const tags = {
      empty: tag('empty'),
      withEndeavour: tag('withEndeavour', { collectionId: 'c1' as CollectionId }),
    };
    expect(resolveNoteInheritedCollectionId(['empty', 'withEndeavour'], tags)).toBe('c1');
  });

  it('skips a tagId that no longer exists in noteTags', () => {
    const tags = { real: tag('real', { collectionId: 'c1' as CollectionId }) };
    expect(resolveNoteInheritedCollectionId(['deleted-tag', 'real'], tags)).toBe('c1');
  });

  it('returns null when nothing resolves, including an empty list', () => {
    expect(resolveNoteInheritedCollectionId([], {})).toBeNull();
    expect(resolveNoteInheritedCollectionId(['x'], { x: tag('x') })).toBeNull();
  });
});

describe('getNoteEffectiveCollectionId', () => {
  it('a note\'s own collectionId wins over anything inherited from its tags', () => {
    const tags = { a: tag('a', { collectionId: 'c-from-tag' as CollectionId }) };
    const note = { collectionId: 'c-own' as CollectionId, tagIds: ['a'] };
    expect(getNoteEffectiveCollectionId(note, tags)).toBe('c-own');
  });

  it('falls back to the notebook\'s Endeavour when the note has none of its own', () => {
    const tags = { a: tag('a', { collectionId: 'c-from-tag' as CollectionId }) };
    const note = { collectionId: null, tagIds: ['a'] };
    expect(getNoteEffectiveCollectionId(note, tags)).toBe('c-from-tag');
  });
});

describe('getNotebookIcon', () => {
  it('an explicit icon always wins, regardless of contents', () => {
    expect(getNotebookIcon(tag('a', { icon: '🎓' }), {}, {})).toBe('🎓');
  });

  it('an annotation tag (kind: tag) always shows the label icon', () => {
    expect(getNotebookIcon(tag('a', { kind: 'tag' }), {}, {})).toBe('🏷️');
  });

  it('empty notebook (no sub-notebooks, no notes): plain folder', () => {
    expect(getNotebookIcon(tag('a'), {}, {})).toBe('📁');
  });

  it('sub-notebooks only: open-folders icon', () => {
    const tags = { a: tag('a'), child: tag('child', { parentTagId: 'a' as never }) };
    expect(getNotebookIcon(tags.a, tags, {})).toBe('🗂️');
  });

  it('notes only (no sub-notebooks): notebook-with-pages icon', () => {
    const tags = { a: tag('a') };
    const notes = { n1: { tagIds: ['a'], archivedAt: null } };
    expect(getNotebookIcon(tags.a, tags, notes)).toBe('📓');
  });

  it('both sub-notebooks and notes: stack-of-books icon', () => {
    const tags = { a: tag('a'), child: tag('child', { parentTagId: 'a' as never }) };
    const notes = { n1: { tagIds: ['a'], archivedAt: null } };
    expect(getNotebookIcon(tags.a, tags, notes)).toBe('📚');
  });

  it('an archived note doesn\'t count as content', () => {
    const tags = { a: tag('a') };
    const notes = { n1: { tagIds: ['a'], archivedAt: '2030-01-01T00:00:00.000Z' } };
    expect(getNotebookIcon(tags.a, tags, notes)).toBe('📁');
  });
});

describe('getNoteBreadcrumb', () => {
  it('joins the ancestor chain of a notebook (area) tag with " > "', () => {
    const tags = {
      root: tag('root', { name: 'University' }),
      subject: tag('subject', { name: 'Chemistry', parentTagId: 'root' as never }),
    };
    expect(getNoteBreadcrumb({ tagIds: ['subject'] }, tags)).toBe('University > Chemistry');
  });

  it('prefers a notebook (area) tag over an annotation tag, even if the annotation tag comes first in the array', () => {
    const tags = {
      important: tag('important', { name: 'Important', kind: 'tag' }),
      notebook: tag('notebook', { name: 'Work' }),
    };
    expect(getNoteBreadcrumb({ tagIds: ['important', 'notebook'] }, tags)).toBe('Work');
  });

  it('falls back to the annotation tag\'s own name when there is no notebook tag at all', () => {
    const tags = { important: tag('important', { name: 'Important', kind: 'tag' }) };
    expect(getNoteBreadcrumb({ tagIds: ['important'] }, tags)).toBe('Important');
  });

  it('falls back to "Uncategorized" with no tags at all', () => {
    expect(getNoteBreadcrumb({ tagIds: [] }, {})).toBe('Uncategorized');
  });
});

describe('getVisibleNoteTagIds', () => {
  it('includes a notebook whose effective Endeavour matches, plus its ancestors', () => {
    const tags = {
      root: tag('root'),
      child: tag('child', { parentTagId: 'root' as never, collectionId: 'c1' as CollectionId }),
      other: tag('other', { collectionId: 'c2' as CollectionId }),
    };
    const visible = getVisibleNoteTagIds(tags, 'c1' as CollectionId);
    expect(visible.has('child')).toBe(true);
    expect(visible.has('root')).toBe(true); // ancestor kept reachable
    expect(visible.has('other')).toBe(false);
  });

  it('excludes an annotation tag entirely (only area tags are considered)', () => {
    const tags = { tagKind: tag('tagKind', { kind: 'tag', collectionId: 'c1' as CollectionId }) };
    expect(getVisibleNoteTagIds(tags, 'c1' as CollectionId).has('tagKind')).toBe(false);
  });
});
