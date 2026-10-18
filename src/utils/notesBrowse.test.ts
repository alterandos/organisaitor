import { describe, expect, it } from 'vitest';
import { browseNotes, groupPath, EMPTY_NOTES_FILTER, type BrowseInput, type NoteGroup } from './notesBrowse';
import type { Collection, Purpose } from '@/types';
import type { Note, NoteTag } from '@/types/notes';

const note = (id: string, tagIds: string[], extra: Partial<Note> = {}): Note => ({
  id, title: id, content: '', tagIds, tagData: {}, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  abstract: null, mainTabUpdatedAt: null, lastViewedAt: null, archivedAt: null, color: null, userId: '', parentId: null,
  tabs: [], mainTabName: 'Main', tabOrder: [], templateId: null, collectionId: null, isEncrypted: false, encryptedPayload: null,
  ...extra,
} as unknown as Note);
const tag = (id: string, kind: 'area' | 'tag', parentTagId: string | null = null, order = 0): NoteTag =>
  ({ id, name: id.toUpperCase(), kind, parentTagId, color: null, icon: null, order, fieldSchema: [], collectionId: null } as unknown as NoteTag);
const endeavour = (id: string, kind: 'project' | 'list', purposeIds: string[] = [], archivedAt: string | null = null): Collection =>
  ({ id, kind, name: id, color: null, purposeIds, tagIds: [], archivedAt } as unknown as Collection);
const purpose = (id: string): Purpose => ({ id, name: id, color: null, archivedAt: null } as unknown as Purpose);

function input(over: Partial<BrowseInput> = {}): BrowseInput {
  return {
    notes: [
      note('n1', ['uni'], { updatedAt: '2026-10-05T00:00:00.000Z', collectionId: 'thesis' as never }),
      note('n2', ['bio', 'uni', 'important'], { updatedAt: '2026-10-07T00:00:00.000Z', collectionId: 'thesis' as never }),
      note('n3', [], { updatedAt: '2026-10-06T00:00:00.000Z', collectionId: 'home' as never }),
      note('old', ['bio'], { archivedAt: '2026-10-02T00:00:00.000Z' }),
    ],
    noteTags: { uni: tag('uni', 'area'), bio: tag('bio', 'area', 'uni'), chem: tag('chem', 'area', 'uni', 1), important: tag('important', 'tag') },
    collections: { home: endeavour('home', 'list'), thesis: endeavour('thesis', 'project', ['career']), gone: endeavour('gone', 'project', [], '2026-01-01') },
    purposes: { career: purpose('career') },
    filter: EMPTY_NOTES_FILTER,
    ...over,
  };
}
const shape = (gs: NoteGroup[]): unknown => gs.map((g) => ({ id: g.id, notes: g.noteIds, total: g.total, children: shape(g.children) }));

describe('the Notes browse model (utils/notesBrowse.ts)', () => {
  it('by notebook: the tree, newest note first, archived notes left out, a note counted once in a total', () => {
    const b = browseNotes(input(), 'notebook');
    expect(shape(b.roots)).toEqual([{ id: 'notebook:uni', notes: ['n2', 'n1'], total: 2, children: [
      { id: 'notebook:bio', notes: ['n2'], total: 1, children: [] },
      { id: 'notebook:chem', notes: [], total: 0, children: [] },
    ] }]);
    expect(b.loose).toEqual(['n3']);
    expect(b.roots[0].updatedAt).toBe('2026-10-07T00:00:00.000Z');
    expect(Object.keys(b.notes).sort()).toEqual(['n1', 'n2', 'n3']);
  });

  it('by Endeavour (projects, then lists; archived ones left out), by Purpose (through the Endeavour), by tag', () => {
    expect(shape(browseNotes(input(), 'endeavour').roots)).toEqual([
      { id: 'endeavour:thesis', notes: ['n2', 'n1'], total: 2, children: [] },
      { id: 'endeavour:home', notes: ['n3'], total: 1, children: [] },
    ]);
    const byPurpose = browseNotes(input(), 'purpose');
    expect(shape(byPurpose.roots)).toEqual([{ id: 'purpose:career', notes: ['n2', 'n1'], total: 2, children: [] }]);
    expect(byPurpose.loose).toEqual(['n3']);
    expect(shape(browseNotes(input(), 'tag').roots)).toEqual([{ id: 'tag:important', notes: ['n2'], total: 1, children: [] }]);
  });

  it('the filter: Endeavours, Purposes and tags, each narrowing', () => {
    const only = (filter: Partial<BrowseInput['filter']>) => Object.keys(browseNotes(input({ filter: { ...EMPTY_NOTES_FILTER, ...filter } }), 'notebook').notes).sort();
    expect(only({ collectionIds: ['home'] })).toEqual(['n3']);
    expect(only({ purposeIds: ['career'] })).toEqual(['n1', 'n2']);
    expect(only({ tagIds: ['important'] })).toEqual(['n2']);
    expect(only({ purposeIds: ['career'], tagIds: ['important'] })).toEqual(['n2']);
  });

  it('notebooks whose parents loop are put at the top rather than lost', () => {
    const b = browseNotes(input({ noteTags: { a: tag('a', 'area', 'b'), b: tag('b', 'area', 'a') }, notes: [] }), 'notebook');
    expect(b.roots.map((g) => g.id).sort()).toEqual(['notebook:a', 'notebook:b']);
  });

  it("a note takes its notebook's Endeavour when it has none; a sub-note sits under its parent note, not in groups", () => {
    const inp = input();
    inp.noteTags.uni = { ...inp.noteTags.uni, collectionId: 'home' } as NoteTag;
    inp.notes.push(note('n4', ['uni']), note('sub', ['uni'], { parentId: 'n4' } as Partial<Note>));
    const b = browseNotes(inp, 'endeavour');
    expect(b.roots.find((g) => g.id === 'endeavour:home')?.noteIds).toContain('n4');
    expect(b.subNotes).toEqual({ n4: ['sub'] });
    expect(JSON.stringify(b.roots)).not.toContain('"sub"');
  });

  it('the trail down to a group', () => {
    const { roots } = browseNotes(input(), 'notebook');
    expect(groupPath(roots, 'notebook:bio').map((g) => g.id)).toEqual(['notebook:uni', 'notebook:bio']);
    expect(groupPath(roots, 'notebook:nope')).toEqual([]);
    expect(groupPath(roots, null)).toEqual([]);
  });

  it('the Stickies notebook is pinned first among the top-level groups, whatever its order', () => {
    const stickies = { ...tag('stk', 'area', null, 9), presetKey: 'stickies' } as NoteTag;
    const b = browseNotes(input({ noteTags: { ...input().noteTags, stk: stickies } }), 'notebook');
    expect(b.roots.map((g) => [g.id, g.pinned])).toEqual([['notebook:stk', true], ['notebook:uni', false]]);
  });
});
