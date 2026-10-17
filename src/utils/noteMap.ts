import type { Note } from '@/types/notes';

// The Notes Map's links (drawn over its blobs by components/NoteViews/Map/): notes joined by their links to each
// other (`noteLink` marks and `noteEmbed` blocks, either way round, counted), and, when asked, the
// tasks, events and lists that link to them (their crossAppRefs). Pure, computed when shown, never
// stored. Notes with no links are left out (a map of islands says nothing); a big map keeps its
// most linked nodes. Agreed with the user 2026-10-13: v1 shows the major links.

export type MapItemType = 'task' | 'event' | 'reminder' | 'deadline' | 'list';

export interface MapItemInput {
  type:    MapItemType;
  id:      string;
  title:   string;
  done:    boolean;
  noteIds: string[];   // the notes it links to
}

export interface MapNode {
  id:     string;                  // `note:<id>` or `<type>:<id>`
  kind:   'note' | MapItemType;
  refId:  string;
  label:  string;
  degree: number;                  // its links, counted once per other end
  focus:  boolean;
  done:   boolean;
}

export interface MapEdge { id: string; from: string; to: string; weight: number; kind: 'note' | 'item' }

export interface NoteMap { nodes: MapNode[]; edges: MapEdge[]; total: number }

export interface NoteMapOptions {
  includeItems: boolean;
  focusNoteId:  string | null;   // only what's within `depth` links of this note
  depth:        number;
  maxNodes:     number;
}

interface JsonNode { type?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: JsonNode[] }

// The notes a note's text links to or embeds, with how often.
export function noteTargetsIn(json: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!json || (!json.includes('noteLink') && !json.includes('noteEmbed'))) return out;
  let root: JsonNode;
  try { root = JSON.parse(json) as JsonNode; } catch { return out; }
  let current: string | null = null;   // a link run split by bold counts once
  const walk = (n: JsonNode) => {
    if (n.type === 'noteEmbed' && typeof n.attrs?.noteId === 'string') out.set(n.attrs.noteId, (out.get(n.attrs.noteId) ?? 0) + 1);
    if (n.type === 'text') {
      const id = n.marks?.find((m) => m.type === 'noteLink')?.attrs?.noteId as string | undefined;
      if (id && id !== current) out.set(id, (out.get(id) ?? 0) + 1);
      current = id ?? null;
      return;
    }
    current = null;
    n.content?.forEach(walk);
  };
  walk(root);
  return out;
}

const noteKey = (id: string) => `note:${id}`;

export function buildNoteMap(notes: Note[], items: MapItemInput[], opts: NoteMapOptions): NoteMap {
  const live = new Map(notes.filter((n) => !n.archivedAt).map((n) => [n.id as string, n]));
  const edges = new Map<string, MapEdge>();
  const addEdge = (a: string, b: string, weight: number, kind: MapEdge['kind']) => {
    if (a === b) return;
    const [from, to] = a < b ? [a, b] : [b, a];
    const id = `${from}|${to}`;
    const e = edges.get(id);
    if (e) e.weight += weight; else edges.set(id, { id, from, to, weight, kind });
  };
  for (const n of live.values()) {
    for (const json of [n.content, ...n.tabs.map((t) => t.content)]) {
      for (const [target, count] of noteTargetsIn(json)) if (live.has(target)) addEdge(noteKey(n.id), noteKey(target), count, 'note');
    }
  }
  const itemNodes = new Map<string, MapNode>();
  if (opts.includeItems) {
    for (const it of items) {
      const key = `${it.type}:${it.id}`;
      for (const noteId of it.noteIds) {
        if (!live.has(noteId)) continue;
        itemNodes.set(key, { id: key, kind: it.type, refId: it.id, label: it.title, degree: 0, focus: false, done: it.done });
        addEdge(key, noteKey(noteId), 1, 'item');
      }
    }
  }

  // Who is joined to whom.
  const adjacent = new Map<string, Set<string>>();
  for (const e of edges.values()) {
    if (!adjacent.has(e.from)) adjacent.set(e.from, new Set());
    if (!adjacent.has(e.to)) adjacent.set(e.to, new Set());
    adjacent.get(e.from)!.add(e.to);
    adjacent.get(e.to)!.add(e.from);
  }

  let keep: Set<string>;
  const focusKey = opts.focusNoteId && live.has(opts.focusNoteId) ? noteKey(opts.focusNoteId) : null;
  if (focusKey) {
    keep = new Set([focusKey]);
    let ring = [focusKey];
    for (let d = 0; d < opts.depth; d++) {
      const next: string[] = [];
      for (const k of ring) for (const m of adjacent.get(k) ?? []) if (!keep.has(m)) { keep.add(m); next.push(m); }
      ring = next;
    }
  } else {
    keep = new Set(adjacent.keys());
  }

  const total = keep.size;
  if (keep.size > opts.maxNodes) {
    const ranked = [...keep].sort((a, b) => (b === focusKey ? 1 : 0) - (a === focusKey ? 1 : 0) || (adjacent.get(b)?.size ?? 0) - (adjacent.get(a)?.size ?? 0));
    keep = new Set(ranked.slice(0, opts.maxNodes));
  }

  const nodes: MapNode[] = [];
  for (const key of keep) {
    const degree = [...(adjacent.get(key) ?? [])].filter((m) => keep.has(m)).length;
    if (key.startsWith('note:')) {
      const n = live.get(key.slice(5))!;
      nodes.push({ id: key, kind: 'note', refId: n.id, label: n.title, degree, focus: key === focusKey, done: false });
    } else {
      const it = itemNodes.get(key);
      if (it) nodes.push({ ...it, degree });
    }
  }
  return { nodes, edges: [...edges.values()].filter((e) => keep.has(e.from) && keep.has(e.to)), total };
}
