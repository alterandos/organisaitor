// The links of a cause-and-effect block (extensions/CauseEffect.ts), pure: stored as the block's
// `links` attr, each from one item's id to another's (an item in the next column).

export interface CeLink { from: string; to: string }

export function parseLinks(text: string | null | undefined): CeLink[] {
  try {
    const raw = text ? JSON.parse(text) : [];
    return Array.isArray(raw) ? raw.filter((l) => typeof l?.from === 'string' && typeof l?.to === 'string').map((l) => ({ from: l.from, to: l.to })) : [];
  } catch { return []; }
}

// Linked becomes unlinked, unlinked becomes linked.
export function toggleLink(links: CeLink[], from: string, to: string): CeLink[] {
  return links.some((l) => l.from === from && l.to === to)
    ? links.filter((l) => !(l.from === from && l.to === to))
    : [...links, { from, to }];
}

// An item's whole chain: everything it leads to (and what that leads to…) and everything that
// leads to it (and what leads to that…). Not sideways: a cause's other effects' other causes
// aren't in its chain.
export function chainOf(start: string, links: CeLink[]): Set<string> {
  const out = new Set<string>([start]);
  for (const dir of ['forward', 'back'] as const) {
    const queue = [start];
    while (queue.length) {
      const at = queue.shift()!;
      for (const l of links) {
        const next = dir === 'forward' ? (l.from === at ? l.to : null) : (l.to === at ? l.from : null);
        if (next && !out.has(next)) { out.add(next); queue.push(next); }
      }
    }
  }
  return out;
}

// ── Fishbone (the Ishikawa diagram) ──────────────────────────────────────────
// The same columns drawn as a fishbone: the last column's items are the head (the effect); the
// column before it gives the main bones, alternating above and below the spine; items in earlier
// columns are small bones on the main bone their links lead to (the first one reached, following
// links forward). An earlier item that leads to no main bone becomes a main bone of its own, so
// nothing is left out. Placed on a grid: main bones in columns (`col` 1…slots), the head in the
// last; above the spine a bone's main item is on row 1 and its small bones below it, towards the
// spine; below the spine the other way round.

export interface FishbonePlace { col: number; row: number; role: 'head' | 'major' | 'minor'; side?: 'top' | 'bottom'; major?: string }
export interface Fishbone { slots: number; spineRow: number; rows: number; place: Record<string, FishbonePlace> }

export function fishboneLayout(cols: string[][], links: CeLink[]): Fishbone {
  const head = cols[cols.length - 1] ?? [];
  const base = cols[cols.length - 2] ?? [];
  const isMajor = new Set(base);
  const minorsOf = new Map<string, string[]>(base.map((id) => [id, []]));
  const majors = [...base];
  for (const id of cols.slice(0, -2).flat()) {
    const seen = new Set([id]);
    const queue = [id];
    let found: string | null = null;
    while (queue.length && !found) {
      const at = queue.shift()!;
      for (const l of links) {
        if (l.from !== at || seen.has(l.to)) continue;
        if (isMajor.has(l.to)) { found = l.to; break; }
        seen.add(l.to);
        queue.push(l.to);
      }
    }
    if (found) minorsOf.get(found)!.push(id);
    else { majors.push(id); minorsOf.set(id, []); }
  }
  const top = majors.filter((_, i) => i % 2 === 0);
  const bottom = majors.filter((_, i) => i % 2 === 1);
  const topRows = 1 + Math.max(0, ...top.map((m) => minorsOf.get(m)!.length));
  const bottomRows = bottom.length ? 1 + Math.max(0, ...bottom.map((m) => minorsOf.get(m)!.length)) : 0;
  const spineRow = topRows + 1;
  const place: Record<string, FishbonePlace> = {};
  majors.forEach((m, i) => {
    const col = Math.floor(i / 2) + 1;
    const minors = minorsOf.get(m)!;
    if (i % 2 === 0) {
      place[m] = { col, row: 1, role: 'major', side: 'top' };
      minors.forEach((id, k) => { place[id] = { col, row: 2 + k, role: 'minor', side: 'top', major: m }; });
    } else {
      place[m] = { col, row: spineRow + bottomRows, role: 'major', side: 'bottom' };
      minors.forEach((id, k) => { place[id] = { col, row: spineRow + 1 + k, role: 'minor', side: 'bottom', major: m }; });
    }
  });
  const slots = Math.max(1, Math.ceil(majors.length / 2));
  head.forEach((id, k) => { place[id] = { col: slots + 1, row: spineRow + k, role: 'head' }; });
  return { slots, spineRow, rows: Math.max(spineRow + bottomRows, spineRow + head.length - 1), place };
}
