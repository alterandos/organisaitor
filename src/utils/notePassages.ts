import type { Node as PMNode } from '@tiptap/pm/model';
import { passageRange } from '@/utils/noteLinks';

// Look up (components/LookUpPane, 2026-11-01): every passage of the notes that can be found and
// read on its own: a heading (with its section), a paragraph, a picture. Pure, over a parsed note.

// A Glossary term (2026-11-02) is found too: the record, read where it's defined.
export type PassageKind = 'heading' | 'text' | 'picture' | 'term';

export interface PassageTerm {
  entryId: string;
  typeKey: string;
  icon:    string;
  names:   string[];   // its acronym and what that stands for, besides the term
  meaning: string;
}

export interface Passage {
  noteId:    string;
  tabId:     string | null;
  pos:       number;             // the passage's node in its tab's document
  kind:      PassageKind;
  text:      string;             // what's searched and shown in the list (a picture: its caption, or '')
  pictureId: string | null;
  noteTitle: string;
  notebooks: string[];           // the notebook it's in, root first ([] when in none)
  tabName:   string | null;      // the tab it's on, when the note has more than one
  term?:     PassageTerm;        // a Glossary term (`kind` 'term'): `text` is its name, `pos` unused
}

// Where a passage is, outermost first: its notebooks, its note, its tab (when the note has several).
export const passageWhere = (p: Passage): string[] => [...p.notebooks, p.noteTitle, ...(p.tabName ? [p.tabName] : [])];

type At = Pick<Passage, 'noteId' | 'tabId' | 'noteTitle' | 'notebooks' | 'tabName'>;

export function collectPassages(doc: PMNode, at: At): Passage[] {
  const out: Passage[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      const pictureId = (node.attrs.pictureId as string | null) ?? null;
      if (pictureId) out.push({ ...at, pos, kind: 'picture', text: String(node.attrs.alt ?? node.attrs.title ?? ''), pictureId });
      return false;
    }
    if (!node.isTextblock) return true;
    const text = node.textContent.trim();
    if (text && (node.type.name === 'heading' || node.type.name === 'paragraph')) {
      out.push({ ...at, pos, kind: node.type.name === 'heading' ? 'heading' : 'text', text, pictureId: null });
    }
    return false;
  });
  return out;
}

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

// Every word typed must be in the passage or its note's title. Ranked: a Glossary term whose name is
// what was typed first, then words in the passage itself, a term's meaning next, then a heading
// ahead of a paragraph, then a shorter passage (more to the point). A picture is found by its
// caption or its note's title.
export function searchPassages(passages: Passage[], query: string, limit = 60): Passage[] {
  const ws = words(query);
  if (!ws.length) return [];
  const scored: { p: Passage; score: number }[] = [];
  for (const p of passages) {
    const text = [p.text, ...(p.term?.names ?? [])].join(' ').toLowerCase();
    const meaning = (p.term?.meaning ?? '').toLowerCase();
    const title = `${p.noteTitle} ${p.notebooks.join(' ')}`.toLowerCase();
    let score = 0;
    let all = true;
    for (const w of ws) {
      if (text.includes(w)) score += 3;
      else if (meaning.includes(w)) score += 2;
      else if (title.includes(w)) score += 1;
      else { all = false; break; }
    }
    if (!all) continue;
    const typed = ws.join(' ');
    if (p.term && [p.text, ...p.term.names].some((n) => n.toLowerCase() === typed)) score += 10;
    else if (p.term) score += 1;
    if (p.kind === 'heading') score += 1.5;
    if (p.kind === 'picture') score += 0.5;
    score -= Math.min(p.text.length, 2000) / 2000;
    scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.p);
}

// The nodes a passage shows, with where each is: a paragraph itself; a heading and its section; a picture.
export function passageParts(doc: PMNode, p: Pick<Passage, 'pos' | 'kind'>): { pos: number; node: PMNode }[] {
  if (p.kind === 'picture') { const node = doc.nodeAt(p.pos); return node ? [{ pos: p.pos, node }] : []; }
  const { from, to } = passageRange(doc, p.pos);
  const depth = doc.resolve(from).depth;
  const parts: { pos: number; node: PMNode }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (pos >= from && pos < to && doc.resolve(pos).depth === depth) { parts.push({ pos, node }); return false; }
    return true;
  });
  return parts;
}

export const passageNodes = (doc: PMNode, pos: number): PMNode[] => passageParts(doc, { pos, kind: 'text' }).map((x) => x.node);

// How a passage is shown in its note: its own nodes' ranges, and the ranges of everything around it
// (drawn greyed). A node holding the passage is neither: its other children are the context.
export function contextRanges(doc: PMNode, p: Pick<Passage, 'pos' | 'kind'>): { passage: [number, number][]; context: [number, number][] } {
  const passage = passageParts(doc, p).map(({ pos, node }): [number, number] => [pos, pos + node.nodeSize]);
  if (!passage.length) return { passage, context: [] };
  const start = passage[0][0];
  const end = passage[passage.length - 1][1];
  const context: [number, number][] = [];
  doc.descendants((node, pos) => {
    const to = pos + node.nodeSize;
    if (to <= start || pos >= end) { context.push([pos, to]); return false; }
    return (pos < start || to > end) && !node.isTextblock;
  });
  return { passage, context };
}
