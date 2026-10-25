// Where things go in a Venn diagram (extensions/Venn.ts, the Circles design), pure: the circles,
// the set names, and each item at the middle of its region, items in one region stacked around
// it. In a box of `w` × `h` units (the block keeps that shape), returned as percentages of it.

export type SetId = 'a' | 'b' | 'c';
export const SET_IDS: SetId[] = ['a', 'b', 'c'];

interface Shape {
  w: number; h: number; tight: number; r: number; step: number;   // tight: the height with nothing in no set
  centres: Record<SetId, [number, number]>;
  labels: Record<SetId, [number, number]>;
  anchors: Record<string, [number, number]>;   // a region ('a', 'ab', 'abc'…) → its middle
  outside: [number, number];                   // where things in no set go: a strip at the foot
}

const TWO: Shape = {
  w: 100, h: 76, tight: 64, r: 27, step: 6,
  centres: { a: [37, 34], b: [63, 34], c: [0, 0] },
  labels:  { a: [16, 3.5], b: [84, 3.5], c: [0, 0] },
  anchors: { a: [21, 34], b: [79, 34], ab: [50, 34] },
  outside: [50, 70],
};

const THREE: Shape = {
  w: 100, h: 106, tight: 96, r: 26, step: 5,
  centres: { a: [38, 38], b: [62, 38], c: [50, 60] },
  labels:  { a: [14, 6], b: [86, 6], c: [50, 91] },
  anchors: { a: [24, 31], b: [76, 31], c: [50, 76], ab: [50, 26], ac: [35, 56], bc: [65, 56], abc: [50, 45] },
  outside: [50, 100],
};

export const regionOf = (sets: readonly string[], n: number): string =>
  SET_IDS.slice(0, n).filter((s) => sets.includes(s)).join('');

export interface VennLayout {
  w: number; h: number;
  circles: { id: SetId; cx: number; cy: number; r: number }[];
  labels: { id: SetId; x: number; y: number }[];   // percentages of the box
  items: { x: number; y: number }[];                 // percentages, item order
}

export function vennLayout(n: 2 | 3, itemSets: readonly (readonly string[])[]): VennLayout {
  const s = n === 3 ? THREE : TWO;
  const ids = SET_IDS.slice(0, n);
  const regions = itemSets.map((sets) => regionOf(sets, n));
  const count = new Map<string, number>();
  for (const r of regions) count.set(r, (count.get(r) ?? 0) + 1);
  const seen = new Map<string, number>();
  // The strip for things in no set only when something's there.
  const h = count.get('') ? s.h : s.tight;
  const pct = (x: number, y: number) => ({ x: (x / s.w) * 100, y: (y / h) * 100 });
  const items = regions.map((r) => {
    const k = seen.get(r) ?? 0;
    seen.set(r, k + 1);
    const total = count.get(r)!;
    if (!r) {
      // In no set: side by side along the foot, wrapping every four.
      const row = Math.floor(k / 4), col = k % 4, inRow = Math.min(4, total - row * 4);
      return pct(s.outside[0] + (col - (inRow - 1) / 2) * 22, s.outside[1] + row * s.step);
    }
    const [x, y] = s.anchors[r];
    return pct(x, y + (k - (total - 1) / 2) * s.step);
  });
  return {
    w: s.w, h,
    circles: ids.map((id) => ({ id, cx: s.centres[id][0], cy: s.centres[id][1], r: s.r })),
    labels: ids.map((id) => ({ id, ...pct(s.labels[id][0], s.labels[id][1]) })),
    items,
  };
}
