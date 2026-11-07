// The suite's tags passing down (utils/tagScope.ts): an Endeavour takes those of what it's part of,
// a notebook its parents' and its Endeavour's, a note its notebooks' and Endeavour's; the tag test
// finds an item tagged only through any of them.
import { describe, expect, it } from 'vitest';
import type { Collection, CollectionId, TagId } from '@/types';
import type { NoteTag } from '@/types/notes';
import { endeavourTagIds, inheritedEndeavourTags, inheritedNotebookTags, noteItem, tagTest, tagsForNote, tagsFromParents } from './tagScope';

const T0 = '2030-01-01T00:00:00.000Z';
function col(id: string, tags: string[], partOf: string[] = []): Collection {
  return {
    id: id as CollectionId, kind: 'project', name: id, description: null, color: null, purposeIds: [], tagIds: tags as TagId[], deadline: null,
    fieldSchema: [], routineTasks: [], repeatConfig: null, collectionId: null, archivedAt: null, createdAt: T0, updatedAt: T0,
    links: partOf.map((t) => ({ kind: 'partOf' as const, targetId: t as CollectionId, createdAt: T0 })),
  };
}
function nb(id: string, tags: string[], parent: string | null = null, collectionId: string | null = null): NoteTag {
  return { id: id as never, name: id, kind: 'area', parentTagId: parent as never, tagTypeId: null, color: null, icon: null, order: 0, fieldSchema: [], collectionId: collectionId as CollectionId | null, createdAt: T0, updatedAt: T0, userId: 'u', suiteTagIds: tags as TagId[] };
}

const all = { degree: col('degree', ['uni']), sem: col('sem', ['y2026'], ['degree']), bio: col('bio', ['subject', 'uni'], ['sem']), home: col('home', []) } as Record<string, Collection>;
const books = { semNb: nb('semNb', ['notes'], null, 'sem'), bioNb: nb('bioNb', [], 'semNb', 'bio') } as Record<string, NoteTag>;

describe('tags passing down', () => {
  it('an Endeavour takes the tags of everything it’s part of, nearest first, and not its own again', () => {
    expect(inheritedEndeavourTags('bio', all)).toEqual([{ id: 'y2026', from: 'sem' }]);
    expect(endeavourTagIds('bio', all).sort()).toEqual(['subject', 'uni', 'y2026']);
    expect(tagsFromParents(['sem'], all)).toEqual([{ id: 'y2026', from: 'sem' }, { id: 'uni', from: 'degree' }]);
  });

  it('a notebook takes its parent notebooks’ and its Endeavour’s; a note its notebooks’ and Endeavour’s', () => {
    expect(inheritedNotebookTags('bioNb', books, all).map((t) => t.id).sort()).toEqual(['notes', 'subject', 'uni', 'y2026']);
    expect(tagsForNote(['bioNb'], null, books, all).map((t) => t.id).sort()).toEqual(['notes', 'subject', 'uni', 'y2026']);
  });

  it('the tag test finds what has a tag of its own or passed down, and nothing else', () => {
    const uni = tagTest(['uni'], all, books)!;
    expect(uni({ tagIds: [], collectionId: 'sem' })).toBe(true);          // through Degree
    expect(uni({ tagIds: ['uni'] })).toBe(true);                          // its own
    expect(uni({ collectionId: 'home' })).toBe(false);
    const notes = tagTest(['notes'], all, books)!;
    expect(notes(noteItem({ tagIds: ['bioNb'], collectionId: null }, books))).toBe(true);   // through its notebook's parent
    expect(notes(noteItem({ tagIds: [], collectionId: 'bio' as CollectionId }, books))).toBe(false);
    expect(tagTest([], all, books)).toBeNull();
  });
});
