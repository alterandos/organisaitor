import { hierarchy, pack, type HierarchyCircularNode } from 'd3-hierarchy';
import type { NoteGroup } from '@/utils/notesBrowse';

// The Map's layout (agreed with the user 2026-10-17), pure: the browse model's groups as blobs,
// packed like a map rather than lined up like a list. Each group is a blob sized by what it holds,
// its own groups smaller blobs inside it, its notes dots inside it. Circle packing (d3-hierarchy)
// places them; the top-level blobs get a wide margin so they read as islands. A note in two
// groups is drawn once, in the first. Notes in no group make one more blob ("not in a ...").
//
// Grouped by something other than notebooks (an Endeavour, a Purpose, a tag), a group's notes are
// gathered into a blob per notebook inside it (asked for 2026-10-18: an Endeavour of 32 notes is
// its notebooks first, each holding its notes), `notebookOf` saying which; notes in no notebook
// stay in the group itself. Whether a blob shows what's inside it is decided as you zoom
// (mapDetail.ts), never here.

export interface NotebookRef { id: string; name: string; icon: string | null; color: string | null }

export interface AtlasBlob {
  id:       string;          // the group's id, `<group id>>nb:<notebook id>` for a notebook inside one, or LOOSE_ID
  kind:     'group' | 'notebook' | 'loose';
  groupId:  string | null;   // the browse model's group (going into it is the shared focus); null otherwise
  sourceId: string | null;
  label:    string;
  color:    string | null;
  icon:     string | null;
  total:    number;          // notes inside, at any depth
  x: number; y: number; r: number;
  depth:    number;          // 1 = an island
  parentId: string | null;   // the blob it sits in
}

export interface AtlasNote { noteId: string; x: number; y: number; r: number; blobId: string }

// `divider`: the line between a pinned island (Stickies, packed on its own above the others) and
// the rest of the map; null when nothing is pinned.
export interface Atlas { blobs: AtlasBlob[]; notes: AtlasNote[]; size: number; divider: { y: number; x1: number; x2: number } | null }

export const LOOSE_ID = 'loose';

type NotebookDatum = { kind: 'notebook'; id: string; notebook: NotebookRef; children: Datum[] };
type Datum =
  | { kind: 'root'; children: Datum[] }
  | { kind: 'group'; group: NoteGroup; children: Datum[] }
  | NotebookDatum
  | { kind: 'loose'; children: Datum[] }
  | { kind: 'note'; noteId: string };

// How much room one note takes, and the gaps: between islands, and inside a blob.
const NOTE_AREA = 70;
const ISLAND_GAP = 56;
const INNER_GAP = 12;
const PINNED_GAP = 80;   // between the pinned island and the rest (the divider runs through it)

export function atlasLayout(roots: NoteGroup[], loose: string[], looseLabel: string, notebookOf?: (noteId: string) => NotebookRef | null): Atlas {
  const placed = new Set<string>();
  const notesOf = (ids: string[]): Datum[] => ids.filter((id) => !placed.has(id) && placed.add(id)).map((noteId) => ({ kind: 'note', noteId }));
  // A group's own notes: a blob per notebook, when grouped by something other than notebooks.
  const ownNotes = (ownerId: string, ids: string[], byNotebook: boolean): Datum[] => {
    const notes = notesOf(ids);
    if (!byNotebook || !notebookOf) return notes;
    const direct: Datum[] = [];
    const books = new Map<string, NotebookDatum>();
    for (const n of notes) {
      const nb = n.kind === 'note' ? notebookOf(n.noteId) : null;
      if (!nb) { direct.push(n); continue; }
      if (!books.has(nb.id)) books.set(nb.id, { kind: 'notebook', id: `${ownerId}>nb:${nb.id}`, notebook: nb, children: [] });
      books.get(nb.id)!.children.push(n);
    }
    return [...books.values(), ...direct];
  };
  const groupDatum = (g: NoteGroup): Datum | null => {
    const children = [...g.children.map(groupDatum).filter((d): d is Datum => !!d), ...ownNotes(g.id, g.noteIds, g.grouping !== 'notebook')];
    return children.length ? { kind: 'group', group: g, children } : null;
  };
  const all = roots.map(groupDatum).filter((d): d is Datum => !!d);
  const islands = all.filter((d) => !(d.kind === 'group' && d.group.pinned));
  const pinned = all.filter((d) => d.kind === 'group' && d.group.pinned);
  const looseNotes = ownNotes(LOOSE_ID, loose, !!roots[0] && roots[0].grouping !== 'notebook');
  if (looseNotes.length) islands.push({ kind: 'loose', children: looseNotes });
  if (islands.length === 0 && pinned.length === 0) return { blobs: [], notes: [], size: 0, divider: null };

  const blobs: AtlasBlob[] = [];
  const notes: AtlasNote[] = [];
  const blobIdOf = (n: HierarchyCircularNode<Datum>): string | null =>
    n.data.kind === 'group' ? n.data.group.id : n.data.kind === 'notebook' ? n.data.id : n.data.kind === 'loose' ? LOOSE_ID : null;
  const leavesOf = (ds: Datum[]): number => ds.reduce((sum, d) => sum + (d.kind === 'note' ? 1 : 'children' in d ? leavesOf(d.children) : 0), 0);
  const sizeFor = (ds: Datum[]) => Math.max(ds === pinned ? 160 : 480, Math.sqrt(leavesOf(ds)) * NOTE_AREA + ds.length * ISLAND_GAP);
  // Packs one set of islands into a size × size square and emits it, shifted by (dx, dy).
  const place = (ds: Datum[], size: number, dx: number, dy: number) => {
    const root = hierarchy<Datum>({ kind: 'root', children: ds }, (d) => ('children' in d ? d.children : undefined))
      .sum((d) => (d.kind === 'note' ? 1 : 0))
      // Busiest first, so the biggest islands sit near the middle.
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const laid = pack<Datum>().size([size, size]).padding((n) => (n.depth === 0 ? ISLAND_GAP : INNER_GAP))(root);
    laid.each((n) => {
      const d = n.data;
      const parentId = n.parent ? blobIdOf(n.parent) : null;
      const x = n.x + dx, y = n.y + dy;
      const at = { total: n.value ?? 0, x, y, r: n.r, depth: n.depth, parentId };
      if (d.kind === 'note') { notes.push({ noteId: d.noteId, x, y, r: n.r, blobId: parentId ?? LOOSE_ID }); return; }
      if (d.kind === 'group') {
        blobs.push({ id: d.group.id, kind: 'group', groupId: d.group.id, sourceId: d.group.sourceId, label: d.group.label, color: d.group.color, icon: d.group.icon, ...at });
      } else if (d.kind === 'notebook') {
        blobs.push({ id: d.id, kind: 'notebook', groupId: null, sourceId: d.notebook.id, label: d.notebook.name, color: d.notebook.color, icon: d.notebook.icon, ...at });
      } else if (d.kind === 'loose') {
        blobs.push({ id: LOOSE_ID, kind: 'loose', groupId: null, sourceId: null, label: looseLabel, color: null, icon: null, ...at, parentId: null });
      }
    });
  };

  const size = islands.length ? sizeFor(islands) : 0;
  if (islands.length) place(islands, size, 0, 0);
  let divider: Atlas['divider'] = null;
  // A pinned island (Stickies) sits on its own above the map, centred, with a line between.
  if (pinned.length) {
    const p = sizeFor(pinned);
    const width = Math.max(size, p);
    place(pinned, p, (width - p) / 2, islands.length ? -(p + PINNED_GAP) : 0);
    if (islands.length) divider = { y: -PINNED_GAP / 2, x1: 0, x2: width };
  }
  return { blobs, notes, size: Math.max(size, 1), divider };
}

// ── A soft blob's outline ────────────────────────────────────────────────────
// A circle of radius r made a little irregular (each blob its own shape, always the same for the
// same id), as a closed smooth SVG path in a 2r × 2r box.

function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
}

export function blobPath(id: string, r: number, wobble = 0.06): string {
  const rnd = seeded(id);
  const n = 9;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    const rr = r * (1 - wobble + rnd() * wobble * 2) - 1;
    return [r + Math.cos(a) * rr, r + Math.sin(a) * rr] as const;
  });
  // Catmull–Rom through the points, as cubic Béziers, closed.
  const p = (i: number) => pts[(i + n) % n];
  let path = `M${p(0)[0].toFixed(1)},${p(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p(i - 1), [x1, y1] = p(i), [x2, y2] = p(i + 1), [x3, y3] = p(i + 2);
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
    const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    path += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return `${path} Z`;
}
