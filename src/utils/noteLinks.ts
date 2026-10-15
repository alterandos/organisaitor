import type { Node as PMNode } from '@tiptap/pm/model';
import { BLOCK_PART_NODES, NOTE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';
import { LABELS } from '@/config/labels';
import type { Note } from '@/types/notes';

// Links between notes (the `noteLink` mark: `[[`, `\ref`, Link to a note…) and the passages they can
// point at. Pure: read from notes' stored JSON (for what links to a note, and where it's mentioned)
// or from a ProseMirror document (for the passages of a note). Agreed with the user 2026-10-13.

interface JsonNode { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: JsonNode[] }

const parse = (json: string): JsonNode | null => { try { return JSON.parse(json) as JsonNode; } catch { return null; } };
const textOf = (n: JsonNode): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');
const TEXT_BLOCKS = new Set(['paragraph', 'heading']);

// ── What links to a note ─────────────────────────────────────────────────────

export interface NoteLinkFrom {
  fromNoteId: string;
  fromTitle:  string;
  tabId:      string | null;   // the tab of the note the link is in
  text:       string;          // the linked words
  context:    string;          // the paragraph they're in
}

// Every link in `json` to `noteId`: the linked words and the paragraph around them.
function linksIn(json: string, noteId: string): { text: string; context: string }[] {
  if (!json || !json.includes(noteId)) return [];
  const root = parse(json);
  const out: { text: string; context: string }[] = [];
  const walk = (n: JsonNode) => {
    if (n.type && TEXT_BLOCKS.has(n.type)) {
      let text = '';
      for (const child of n.content ?? []) if (child.marks?.some((m) => m.type === 'noteLink' && m.attrs?.noteId === noteId)) text += child.text ?? '';
      if (text) out.push({ text, context: textOf(n) });
      return;
    }
    n.content?.forEach(walk);
  };
  if (root) walk(root);
  return out;
}

export function linksToNote(notes: Iterable<Note>, noteId: string): NoteLinkFrom[] {
  const out: NoteLinkFrom[] = [];
  for (const n of notes) {
    if (n.archivedAt) continue;
    for (const [tabId, json] of [[null, n.content] as const, ...n.tabs.map((t) => [t.id, t.content] as const)]) {
      for (const l of linksIn(json, noteId)) out.push({ fromNoteId: n.id, fromTitle: n.title, tabId, ...l });
    }
  }
  return out;
}

// ── Where a note is mentioned but not linked ─────────────────────────────────

export interface NoteMention { noteId: string; title: string; tabId: string | null; context: string }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Notes whose text names `title` (a whole-word match, any case) without linking to `noteId`. One per
// note and tab (the first paragraph that names it). Titles shorter than four letters are too
// likely to be ordinary words to suggest.
export function unlinkedMentions(notes: Iterable<Note>, noteId: string, title: string): NoteMention[] {
  const name = title.trim();
  if (name.length < 4) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'iu');
  const out: NoteMention[] = [];
  for (const n of notes) {
    if (n.id === noteId || n.archivedAt) continue;
    for (const [tabId, json] of [[null, n.content] as const, ...n.tabs.map((t) => [t.id, t.content] as const)]) {
      if (!json || !re.test(json) || linksIn(json, noteId).length) continue;
      const root = parse(json);
      let context: string | null = null;
      const walk = (x: JsonNode) => {
        if (context !== null) return;
        if (x.type && TEXT_BLOCKS.has(x.type)) {
          const linkedHere = (x.content ?? []).some((c) => c.marks?.some((m) => m.type === 'noteLink'));
          const t = textOf(x);
          if (!linkedHere && re.test(t)) context = t;
          return;
        }
        x.content?.forEach(walk);
      };
      if (root) walk(root);
      if (context !== null) out.push({ noteId: n.id, title: n.title, tabId, context });
    }
  }
  return out;
}

// Where in `doc` the mention is: the first whole-word match of `title` in a paragraph or heading
// with no link in it. For turning it into a link.
export function mentionRange(doc: PMNode, title: string): { from: number; to: number } | null {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(title.trim())}(?![\\p{L}\\p{N}])`, 'iu');
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    let linked = false;
    node.forEach((c) => { if (c.marks.some((m) => m.type.name === 'noteLink')) linked = true; });
    if (linked) return false;
    const m = node.textContent.match(re);
    if (m?.index !== undefined) {
      // Text offsets map to positions while the block holds only text (inline atoms count as one).
      let offset = 0;
      let start = -1;
      node.forEach((child, childOffset) => {
        if (start >= 0) return;
        const len = child.isText ? child.text!.length : 1;
        if (child.isText && m.index! >= offset && m.index! < offset + len) start = pos + 1 + childOffset + (m.index! - offset);
        offset += len;
      });
      if (start >= 0) found = { from: start, to: start + m[0].length };
    }
    return false;
  });
  return found;
}

// ── Passages ─────────────────────────────────────────────────────────────────

export interface Passage {
  pos:     number;
  kind:    'heading' | 'paragraph' | 'block' | 'part';
  level:   number;            // a heading's level; 1 for a block's part; 0 otherwise
  text:    string;
  blockId: string | null;
  label:   string | null;     // a block's kind ("Types"), for a block
}

const PART_NODES = new Set(Object.values(BLOCK_PART_NODES));
const SUMMARY = 80;

// What a block is called (its `\` menu label), for the picker and a link's name.
export function blockLabel(name: string): string {
  const B = LABELS.noteBlocks;
  const names: Record<string, string> = {
    timeline: B.timeline.label, quoteBlock: B.quote.label, conclusion: B.conclusion.label, types: B.types.label,
    idKey: B.idKey.label, prosCons: B.prosCons.label, options: B.options.label, cycle: B.cycle.label,
    breakdown: B.breakdown.label, hierarchy: B.hierarchy.label, pyramid: B.pyramid.label, chart: B.chart.label,
    codeBlock: B.code.label, mathBlock: B.maths.label, inbox: B.inbox.label, glossaryCard: B.definition.label,
    questionBlock: B.question.label, compareBlock: B.compare.label, diagram: B.diagram.label, hub: LABELS.hubs.label,
  };
  return names[name] ?? name;
}

// The headings and paragraphs of a note that a link or an embed can point at, in order, and every
// note block and its parts (2026-10-15: "should be able to link any block").
export function passagesOf(doc: PMNode): Passage[] {
  const out: Passage[] = [];
  doc.descendants((node, pos) => {
    const name = node.type.name;
    const blockId = (node.attrs.blockId as string | null) ?? null;
    if (NOTE_BLOCK_NODES.has(name)) {
      const words = node.textContent.trim().replace(/\s+/g, ' ');
      out.push({ pos, kind: 'block', level: 0, text: words.length > SUMMARY ? `${words.slice(0, SUMMARY)}…` : words, blockId, label: blockLabel(name) });
      return true;
    }
    if (PART_NODES.has(name)) {
      const text = node.textContent.trim();
      if (text) out.push({ pos, kind: 'part', level: 1, text, blockId, label: null });
      return false;
    }
    if (node.type.name === 'heading' || node.type.name === 'paragraph') {
      const text = node.textContent.trim();
      if (text) out.push({ pos, kind: node.type.name === 'heading' ? 'heading' : 'paragraph', level: node.type.name === 'heading' ? (node.attrs.level as number) : 0, text, blockId, label: null });
      return false;
    }
    return true;
  });
  return out;
}

export function findBlock(doc: PMNode, blockId: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.blockId === blockId) { found = { node, pos }; return false; }
    return !node.isTextblock;
  });
  return found;
}

// What a passage covers: a paragraph, itself; a heading, itself and what follows it up to the next
// heading of the same or a higher level (its section), within the same parent.
export function passageRange(doc: PMNode, pos: number): { from: number; to: number } {
  const node = doc.nodeAt(pos);
  if (!node) return { from: pos, to: pos };
  if (node.type.name !== 'heading') return { from: pos, to: pos + node.nodeSize };
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const level = node.attrs.level as number;
  let end = pos + node.nodeSize;
  for (let i = $pos.index() + 1; i < parent.childCount; i++) {
    const next = parent.child(i);
    if (next.type.name === 'heading' && (next.attrs.level as number) <= level) break;
    end += next.nodeSize;
  }
  return { from: pos, to: end };
}
