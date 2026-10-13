import { describe, expect, it } from 'vitest';
import { buildNoteMap, noteTargetsIn } from './noteMap';
import type { Note } from '@/types/notes';

const doc = (...content: unknown[]) => JSON.stringify({ type: 'doc', content });
const linkTo = (noteId: string, text = 'x') => ({ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'noteLink', attrs: { noteId } }] }] });
const note = (id: string, content = doc(), extra: Partial<Note> = {}) => ({ id, title: id.toUpperCase(), content, tabs: [], archivedAt: null, ...extra }) as unknown as Note;
const opts = { includeItems: false, focusNoteId: null, depth: 2, maxNodes: 100 };

describe('the notes map', () => {
  it('reads the notes a note links to and embeds, a split link once', () => {
    const json = doc(
      { type: 'paragraph', content: [
        { type: 'text', text: 'a', marks: [{ type: 'noteLink', attrs: { noteId: 'b' } }] },
        { type: 'text', text: 'b', marks: [{ type: 'bold' }, { type: 'noteLink', attrs: { noteId: 'b' } }] },
      ] },
      { type: 'noteEmbed', attrs: { noteId: 'c' } },
    );
    expect([...noteTargetsIn(json)]).toEqual([['b', 1], ['c', 1]]);
  });

  it('joins linked notes, either way round, and leaves out notes with no links', () => {
    const map = buildNoteMap([note('a', doc(linkTo('b'))), note('b', doc(linkTo('a'))), note('c'), note('d', doc(linkTo('a')))], [], opts);
    expect(map.nodes.map((n) => n.id).sort()).toEqual(['note:a', 'note:b', 'note:d']);
    expect(map.edges.find((e) => e.id === 'note:a|note:b')?.weight).toBe(2);
    expect(map.nodes.find((n) => n.id === 'note:a')?.degree).toBe(2);
  });

  it('ignores links to archived or missing notes', () => {
    const map = buildNoteMap([note('a', doc(linkTo('b'), linkTo('gone'))), note('b', doc(), { archivedAt: '2026-01-01' } as Partial<Note>)], [], opts);
    expect(map.nodes).toEqual([]);
  });

  it('adds the items linked to notes when asked', () => {
    const notes = [note('a', doc(linkTo('b'))), note('b')];
    const items = [{ type: 'task' as const, id: 't1', title: 'Do it', done: false, noteIds: ['a'] }];
    expect(buildNoteMap(notes, items, opts).nodes.some((n) => n.kind === 'task')).toBe(false);
    const map = buildNoteMap(notes, items, { ...opts, includeItems: true });
    expect(map.edges.some((e) => e.kind === 'item' && e.from === 'note:a' && e.to === 'task:t1')).toBe(true);
  });

  it('around a note: only what is within the depth, the note included', () => {
    const notes = [note('a', doc(linkTo('b'))), note('b', doc(linkTo('c'))), note('c', doc(linkTo('d'))), note('d'), note('e', doc(linkTo('f'))), note('f')];
    const map = buildNoteMap(notes, [], { ...opts, focusNoteId: 'a', depth: 2 });
    expect(map.nodes.map((n) => n.id).sort()).toEqual(['note:a', 'note:b', 'note:c']);
    expect(map.nodes.find((n) => n.focus)?.id).toBe('note:a');
  });

  it('a big map keeps its most linked notes, and says how many there were', () => {
    const notes = [note('hub', doc(linkTo('a'), linkTo('b'), linkTo('c'))), note('a'), note('b'), note('c'), note('x', doc(linkTo('y'))), note('y')];
    const map = buildNoteMap(notes, [], { ...opts, maxNodes: 2 });
    expect(map.total).toBe(6);
    expect(map.nodes).toHaveLength(2);
    expect(map.nodes.map((n) => n.id)).toContain('note:hub');
  });
});
