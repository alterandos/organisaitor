import { describe, expect, it } from 'vitest';
import { atlasLayout, blobPath, LOOSE_ID } from './atlasLayout';
import type { NoteGroup } from '@/utils/notesBrowse';

const g = (id: string, noteIds: string[], children: NoteGroup[] = []): NoteGroup =>
  ({ id: `notebook:${id}`, sourceId: id, grouping: 'notebook', label: id, color: null, icon: null, children, noteIds: noteIds as NoteGroup['noteIds'], total: noteIds.length, updatedAt: null, pinned: false });
const inside = (a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) => Math.hypot(a.x - b.x, a.y - b.y) + a.r <= b.r + 0.5;
const apart = (a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) => Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 0.5;

describe('the Map layout (atlasLayout)', () => {
  const uni = g('uni', ['u1'], [g('bio', ['b1', 'b2', 'b3']), g('chem', ['c1'])]);
  const atlas = atlasLayout([uni, g('work', ['w1', 'w2']), g('empty', [])], ['loose1'], 'Not in a notebook');
  const blob = (id: string) => atlas.blobs.find((b) => b.id === id)!;
  const dot = (id: string) => atlas.notes.find((n) => n.noteId === id)!;

  it('a blob per group that holds notes (empty ones left out), the loose notes one more', () => {
    expect(atlas.blobs.map((b) => b.id).sort()).toEqual(['loose', 'notebook:bio', 'notebook:chem', 'notebook:uni', 'notebook:work']);
    expect(blob(LOOSE_ID).label).toBe('Not in a notebook');
    expect(blob('notebook:uni').total).toBe(5);
  });

  it('sub-notebooks inside their notebook, notes inside their blob; islands apart; bigger holds more', () => {
    expect(inside(blob('notebook:bio'), blob('notebook:uni'))).toBe(true);
    expect(blob('notebook:bio').parentId).toBe('notebook:uni');
    expect(blob('notebook:bio').depth).toBe(2);
    expect(inside(dot('b1'), blob('notebook:bio'))).toBe(true);
    expect(dot('b1').blobId).toBe('notebook:bio');
    expect(dot('u1').blobId).toBe('notebook:uni');
    expect(apart(blob('notebook:uni'), blob('notebook:work'))).toBe(true);
    expect(blob('notebook:uni').r).toBeGreaterThan(blob('notebook:work').r);
  });

  it('a note in two groups is drawn once', () => {
    const twice = atlasLayout([g('a', ['n1']), g('b', ['n1', 'n2'])], [], '');
    expect(twice.notes.filter((n) => n.noteId === 'n1')).toHaveLength(1);
  });

  it('nothing to draw: an empty atlas', () => {
    expect(atlasLayout([g('empty', [])], [], '')).toEqual({ blobs: [], notes: [], size: 0, divider: null });
  });

  it('a blob outline is the same for the same id, different for another, and closed', () => {
    expect(blobPath('a', 50)).toBe(blobPath('a', 50));
    expect(blobPath('a', 50)).not.toBe(blobPath('b', 50));
    expect(blobPath('a', 50)).toMatch(/^M[\d.]+,[\d.]+ C.* Z$/);
  });
});

describe('the Map layout, grouped by something other than notebooks', () => {
  const e = (id: string, noteIds: string[]): NoteGroup =>
    ({ id: `endeavour:${id}`, sourceId: id, grouping: 'endeavour', label: id, color: null, icon: null, children: [], noteIds: noteIds as NoteGroup['noteIds'], total: noteIds.length, updatedAt: null, pinned: false });
  const book = (id: string, name: string) => ({ id, name, icon: null, color: null });
  const nb: Record<string, ReturnType<typeof book> | null> = { n1: book('bio', 'Biology'), n2: book('bio', 'Biology'), n3: book('chem', 'Chemistry'), n4: null };
  const atlas = atlasLayout([e('thesis', ['n1', 'n2', 'n3', 'n4'])], [], 'Not in an Endeavour', (id) => nb[id]);

  it('gathers a group’s notes into a blob per notebook inside it; a note in no notebook stays in the group', () => {
    const bio = atlas.blobs.find((b) => b.label === 'Biology')!;
    expect(bio).toMatchObject({ kind: 'notebook', parentId: 'endeavour:thesis', depth: 2, total: 2, groupId: null, sourceId: 'bio' });
    expect(atlas.notes.find((n) => n.noteId === 'n1')!.blobId).toBe(bio.id);
    expect(atlas.notes.find((n) => n.noteId === 'n4')!.blobId).toBe('endeavour:thesis');
    expect(atlas.blobs.filter((b) => b.kind === 'notebook').map((b) => b.label).sort()).toEqual(['Biology', 'Chemistry']);
  });
});

describe('the Map layout with a pinned island (Stickies)', () => {
  const stickies = { ...g('stk', ['s1', 's2']), pinned: true };
  const atlas = atlasLayout([stickies, g('work', ['w1', 'w2', 'w3'])], [], 'Not in a notebook');
  const blob = (id: string) => atlas.blobs.find((b) => b.id === `notebook:${id}`)!;

  it('sits on its own above the rest, with the divider between', () => {
    expect(atlas.divider).not.toBeNull();
    const s = blob('stk'), w = blob('work');
    expect(s.y + s.r).toBeLessThan(atlas.divider!.y);
    expect(w.y - w.r).toBeGreaterThan(atlas.divider!.y);
  });

  it('no divider when nothing is pinned, or only the pinned island is there', () => {
    expect(atlasLayout([g('work', ['w1'])], [], 'x').divider).toBeNull();
    expect(atlasLayout([stickies], [], 'x').divider).toBeNull();
  });
});
