import { describe, expect, it } from 'vitest';
import { peekSections, tileScore, tileSizes } from './mosaicLayout';
import type { NoteGroup } from '@/utils/notesBrowse';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('the Mosaic layout', () => {
  it('a group weighs its notes, plus a little for recent work', () => {
    expect(tileScore(3, daysAgo(2), NOW)).toBe(8);
    expect(tileScore(3, daysAgo(20), NOW)).toBe(5);
    expect(tileScore(3, daysAgo(90), NOW)).toBe(3);
    expect(tileScore(0, null, NOW)).toBe(0);
  });

  it('the busiest group is large and the next two wide; empty groups stay small', () => {
    const sizes = tileSizes([
      { id: 'a', total: 2, updatedAt: daysAgo(100) },
      { id: 'b', total: 9, updatedAt: daysAgo(100) },
      { id: 'c', total: 1, updatedAt: daysAgo(1) },
      { id: 'd', total: 0, updatedAt: null },
      { id: 'e', total: 1, updatedAt: daysAgo(100) },
    ], NOW);
    expect(sizes).toEqual({ b: 'large', c: 'wide', a: 'wide', d: 'small', e: 'small' });
  });

  it('with two or three groups only the busiest is wide; one group is small', () => {
    expect(tileSizes([{ id: 'a', total: 1, updatedAt: null }, { id: 'b', total: 4, updatedAt: null }], NOW)).toEqual({ a: 'small', b: 'wide' });
    expect(tileSizes([{ id: 'a', total: 5, updatedAt: null }], NOW)).toEqual({ a: 'small' });
  });

  it('the peek lists every note once, by notebook: the group’s own first, then A–Z', () => {
    const g = (id: string, noteIds: string[], children: NoteGroup[] = []) => ({ id, sourceId: id, grouping: 'notebook', label: id, color: null, icon: null, children, noteIds, total: 0, updatedAt: null }) as NoteGroup;
    const tree = g('uni', ['u1'], [g('zoo', ['z1', 'u1']), g('bio', ['b1', 'b2'])]);
    const nb: Record<string, string | null> = { u1: null, z1: 'Zoology', b1: 'Biology', b2: 'Biology' };
    expect(peekSections(tree, (id) => nb[id])).toEqual([
      { key: '', heading: null, noteIds: ['u1'] },
      { key: 'Biology', heading: 'Biology', noteIds: ['b1', 'b2'] },
      { key: 'Zoology', heading: 'Zoology', noteIds: ['z1'] },
    ]);
  });
});
