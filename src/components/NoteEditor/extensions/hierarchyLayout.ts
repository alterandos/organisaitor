// Where each item of a hierarchy block (Hierarchy.ts) sits. The block stores its items flat, in
// outline order, each with a level; the tree is read from that. Pure, so it's testable.

export const MAX_LEVEL = 7;

export interface HierarchyPlace {
  level:      number;           // effective: never more than one below the item before it
  parent:     number | null;    // index of the item it hangs from
  start:      number;           // its span across the leaves (Tree: columns; Columns: rows)
  end:        number;
  hasChildren: boolean;
  siblings:   'only' | 'first' | 'middle' | 'last';
  sinceAbove: number;           // items between it and its previous sibling (or parent), plus one
}

export interface HierarchyLayout {
  places: HierarchyPlace[];
  depth:  number;               // levels in use
  leaves: number;
}

// A level as stored can be anything (an item deleted from above it, a paste); read it so the first
// item is a root and no item is more than one below the one before it.
export function effectiveLevels(levels: readonly number[]): number[] {
  const out: number[] = [];
  for (const raw of levels) {
    const max = out.length ? out[out.length - 1] + 1 : 0;
    out.push(Math.max(0, Math.min(Math.round(raw) || 0, max, MAX_LEVEL)));
  }
  return out;
}

export function hierarchyLayout(rawLevels: readonly number[]): HierarchyLayout {
  const levels = effectiveLevels(rawLevels);
  const n = levels.length;
  const parent: (number | null)[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    while (stack.length && levels[stack[stack.length - 1]] >= levels[i]) stack.pop();
    parent.push(stack.length ? stack[stack.length - 1] : null);
    stack.push(i);
  }
  const children: number[][] = levels.map(() => []);
  const roots: number[] = [];
  parent.forEach((p, i) => (p === null ? roots : children[p]).push(i));

  const start: number[] = new Array(n).fill(0);
  const end: number[] = new Array(n).fill(0);
  let cursor = 0;
  const place = (i: number) => {
    start[i] = cursor;
    if (children[i].length === 0) cursor++;
    else children[i].forEach(place);
    end[i] = cursor;
  };
  roots.forEach(place);

  const places = levels.map((level, i): HierarchyPlace => {
    const group = parent[i] === null ? roots : children[parent[i]!];
    const at = group.indexOf(i);
    const prev = at > 0 ? group[at - 1] : parent[i];
    return {
      level,
      parent: parent[i],
      start: start[i],
      end: end[i],
      hasChildren: children[i].length > 0,
      siblings: group.length === 1 ? 'only' : at === 0 ? 'first' : at === group.length - 1 ? 'last' : 'middle',
      sinceAbove: prev === null ? 0 : i - prev,
    };
  });
  return { places, depth: n ? Math.max(...levels) + 1 : 0, leaves: cursor };
}

// The items an item carries with it when it moves a level: itself and everything below it.
export function subtreeEnd(levels: readonly number[], index: number): number {
  const eff = effectiveLevels(levels);
  let j = index + 1;
  while (j < eff.length && eff[j] > eff[index]) j++;
  return j;
}
