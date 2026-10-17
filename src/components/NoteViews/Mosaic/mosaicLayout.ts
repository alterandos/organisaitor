// The Mosaic's layout rules, pure (tested in mosaicLayout.test.ts): how big each tile is, and
// what a tile's peek lists.
import type { NoteGroup } from '@/utils/notesBrowse';

export type TileSize = 'large' | 'wide' | 'small';

const DAY = 86_400_000;

// A group's weight: how many notes it holds, plus a little for being worked on lately.
export function tileScore(total: number, updatedAt: string | null, now: number): number {
  if (!updatedAt) return total;
  const age = (now - Date.parse(updatedAt)) / DAY;
  return total + (age <= 7 ? 5 : age <= 30 ? 2 : 0);
}

// The busiest group gets a large tile and the next two wide ones, when there are enough groups
// for sizes to mean something (four or more; with two or three only the busiest is wide). Empty
// groups are always small.
export function tileSizes(groups: { id: string; total: number; updatedAt: string | null }[], now: number): Record<string, TileSize> {
  const out: Record<string, TileSize> = Object.fromEntries(groups.map((g) => [g.id, 'small' as TileSize]));
  const ranked = groups.filter((g) => g.total > 0)
    .map((g) => ({ id: g.id, score: tileScore(g.total, g.updatedAt, now) }))
    .sort((a, b) => b.score - a.score);
  if (groups.length >= 4) {
    if (ranked[0]) out[ranked[0].id] = 'large';
    for (const r of ranked.slice(1, 3)) out[r.id] = 'wide';
  } else if (groups.length >= 2 && ranked[0]) {
    out[ranked[0].id] = 'wide';
  }
  return out;
}

// The peek beside a tile: every note the group holds (each once), in sections by the notebook it
// sits in; `notebookOf` gives that notebook's name, or null for a note directly in the group being
// peeked at (or in no notebook): that section comes first, the rest A–Z. Notes keep their order
// (newest first within each group).
export interface PeekSection { key: string; heading: string | null; noteIds: string[] }

export function peekSections(group: NoteGroup, notebookOf: (noteId: string) => string | null): PeekSection[] {
  const seen = new Set<string>();
  const byHeading = new Map<string | null, string[]>();
  const walk = (g: NoteGroup) => {
    for (const id of g.noteIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const h = notebookOf(id);
      if (!byHeading.has(h)) byHeading.set(h, []);
      byHeading.get(h)!.push(id);
    }
    g.children.forEach(walk);
  };
  walk(group);
  return [...byHeading.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)))
    .map(([heading, noteIds]) => ({ key: heading ?? '', heading, noteIds }));
}

// The most tiles a level shows before "N more".
export const LEVEL_MAX = 24;
