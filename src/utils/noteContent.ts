// Pure, editor-independent helpers over a Note's stored Tiptap JSON content (a stringified
// ProseMirror doc). Used by services/crossAppLinkCleanup.ts to strip a dead ArtifactLinkMark
// when the entity it points at is deleted, without needing a live editor instance mounted —
// the note being cleaned up is very often not the one currently open.

import { NOTE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';

interface TiptapNode {
  marks?:   { type: string; attrs?: Record<string, unknown> }[];
  content?: TiptapNode[];
  [key: string]: unknown;
}

// Plain text of a stored Tiptap doc, blocks separated by a space — for searching and for a short
// preview line, never for rendering. Stops after `maxChars` so a huge note stays cheap.
export function noteContentToText(contentJson: string, maxChars = 4000): string {
  if (!contentJson) return '';
  let doc: TiptapNode;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return '';
  }
  const parts: string[] = [];
  let length = 0;
  const walk = (node: TiptapNode) => {
    if (length >= maxChars) return;
    if (typeof node.text === 'string') {
      parts.push(node.text);
      length += node.text.length;
    }
    if (node.content?.length) {
      node.content.forEach(walk);
      parts.push(' ');
      length += 1;
    }
  };
  walk(doc);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

// Every cross-app target ("task:<id>", "event:<id>", …) that a stored content JSON string has an
// `artifactLink` mark for — i.e. which items this piece of a note links to from its text.
export function collectArtifactTargets(contentJson: string): Set<string> {
  const out = new Set<string>();
  if (!contentJson) return out;
  let doc: TiptapNode;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return out;
  }
  const walk = (node: TiptapNode) => {
    for (const m of node.marks ?? []) {
      if (m.type === 'artifactLink' && m.attrs?.targetId) out.add(`${m.attrs.targetType}:${m.attrs.targetId}`);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

// Removes any `artifactLink` mark pointing at (targetType, targetId) from a content JSON
// string, leaving the underlying text intact (same effect as the editor's "Remove link"
// button — unmarks, never deletes). Returns the original string unchanged (changed: false)
// if there was nothing to strip, so callers can skip writing back to the store.
export function stripArtifactLinksFromContent(
  contentJson: string,
  targetType: string,
  targetId: string
): { changed: boolean; content: string } {
  if (!contentJson) return { changed: false, content: contentJson };

  let doc: TiptapNode;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return { changed: false, content: contentJson };
  }

  let changed = false;
  const walk = (node: TiptapNode) => {
    if (node.marks?.length) {
      const before = node.marks.length;
      node.marks = node.marks.filter(
        (m) => !(m.type === 'artifactLink' && m.attrs?.targetType === targetType && m.attrs?.targetId === targetId)
      );
      if (node.marks.length !== before) changed = true;
    }
    node.content?.forEach(walk);
  };
  walk(doc);

  return changed ? { changed: true, content: JSON.stringify(doc) } : { changed: false, content: contentJson };
}

// A passage in a note, found by a mark on it: the definition of a Glossary entry (noteTag with
// structuredEntryId), a reference to one (conceptRef with entryId), an Important passage (noteTag
// with passageId).
export interface PassageMark {
  mark:  string;
  attr:  string;
  value: string;
}

// A passage found by a node instead of a mark: a block (an inbox item) or an inline node (the
// marker a sent passage leaves behind) whose `attr === value`.
export interface PassageNode {
  node:  string;
  attr:  string;
  value: string;
}

export type PassageFind = PassageMark | PassageNode;

export const isNodeFind = (find: PassageFind): find is PassageNode => 'node' in find;

// Whether a stored content JSON string has the passage anywhere: `mark` with `attr === value` on
// some text, or a `node` with `attr === value`.
export function contentHasMark(contentJson: string, find: PassageFind): boolean {
  if (!contentJson || !contentJson.includes(find.value)) return false;
  let found = false;
  try {
    const walk = (node: TiptapNode) => {
      if (found) return;
      if (isNodeFind(find)) {
        if (node.type === find.node && (node.attrs as Record<string, unknown> | undefined)?.[find.attr] === find.value) { found = true; return; }
      } else if (node.marks?.some((m) => m.type === find.mark && m.attrs?.[find.attr] === find.value)) { found = true; return; }
      node.content?.forEach(walk);
    };
    walk(JSON.parse(contentJson));
  } catch { return false; }
  return found;
}

// How many separate passages of a stored content JSON string each conceptRef entry id marks (a
// run of marked text counts once, however many pieces bold or a line break split it into).
export function countConceptRefs(contentJson: string, into: Map<string, number> = new Map()): Map<string, number> {
  if (!contentJson || !contentJson.includes('conceptRef')) return into;
  let current: string | null = null;
  const walk = (node: TiptapNode) => {
    if (typeof node.text === 'string') {
      const id = node.marks?.find((m) => m.type === 'conceptRef')?.attrs?.entryId as string | undefined;
      if (id && id !== current) into.set(id, (into.get(id) ?? 0) + 1);
      if (id || node.text.trim()) current = id ?? null;
      return;
    }
    node.content?.forEach(walk);
  };
  try { walk(JSON.parse(contentJson)); } catch { /* not JSON: nothing to count */ }
  return into;
}

// Important passages on the review list in a stored content JSON string: each passage (by its
// passageId), its text, the text of the block it's in (for context), level and schedule.
// What's on the review list in a stored note (Review later): passages of text (the `review` mark,
// NoteEditor/extensions/ReviewMark.ts; or, from before 2026-11-05, an Important mark with a date)
// and whole blocks (their reviewId / reviewDue / reviewStep). A Glossary card's is on its record
// (services/noteReview.ts reads those).
export interface ReviewPassage {
  passageId:  string;           // the review mark's / block's reviewId, or the old Important passageId
  where:      'text' | 'block';
  text:       string;
  context:    string;
  level:      number;           // the old Important mark's level; 0 for the rest
  reviewDue:  string;
  reviewStep: number;
}

export function collectReviewPassages(contentJson: string): ReviewPassage[] {
  if (!contentJson || !contentJson.includes('reviewDue')) return [];
  const out = new Map<string, ReviewPassage>();
  const blockText = (node: TiptapNode): string =>
    typeof node.text === 'string' ? node.text : (node.content ?? []).map(blockText).join(node.type === 'paragraph' ? '' : ' ');
  const walk = (node: TiptapNode) => {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (typeof node.type === 'string' && NOTE_BLOCK_NODES.has(node.type) && attrs?.reviewId && attrs?.reviewDue) {
      const id = String(attrs.reviewId);
      if (!out.has(id)) out.set(id, { passageId: id, where: 'block', text: blockText(node).trim(), context: '', level: 0, reviewDue: String(attrs.reviewDue), reviewStep: Number(attrs.reviewStep ?? 0) });
    }
    const children = node.content ?? [];
    if (children.some((c) => typeof c.text === 'string')) {
      const context = blockText(node);
      for (const c of children) {
        if (typeof c.text !== 'string') continue;
        for (const m of c.marks ?? []) {
          const review = m.type === 'review' && m.attrs?.reviewDue && m.attrs?.reviewId;
          const legacy = m.type === 'noteTag' && m.attrs?.typeKey === 'important' && m.attrs?.reviewDue && m.attrs?.passageId;
          if (!review && !legacy) continue;
          const id = String(review ? m.attrs!.reviewId : m.attrs!.passageId);
          const existing = out.get(id);
          if (existing) { existing.text += c.text; continue; }
          out.set(id, {
            passageId: id, where: 'text', text: c.text, context,
            level: legacy ? Number(m.attrs!.level ?? 1) : 0, reviewDue: String(m.attrs!.reviewDue), reviewStep: Number(m.attrs!.reviewStep ?? 0),
          });
        }
      }
      return;
    }
    children.forEach(walk);
  };
  try { walk(JSON.parse(contentJson)); } catch { return []; }
  return [...out.values()];
}

// The ways to find a review item in its note, for openNotePassage: its review mark, the old
// Important mark, or a block holding it.
export const reviewFinds = (id: string): PassageFind[] => [
  { mark: 'review', attr: 'reviewId', value: id },
  { mark: 'noteTag', attr: 'passageId', value: id },
  ...[...NOTE_BLOCK_NODES].map((node) => ({ node, attr: 'reviewId', value: id })),
];

// Sets attributes on one passage in a stored content JSON string, by id: every noteTag mark with
// that passageId, every review mark with that reviewId, a block with that reviewId. Returns the
// string unchanged (changed: false) if it isn't in it. A review mark or block given reviewDue null
// loses its schedule (off the list).
export function updatePassageInContent(contentJson: string, passageId: string, attrs: Record<string, unknown>): { changed: boolean; content: string } {
  if (!contentJson || !contentJson.includes(passageId)) return { changed: false, content: contentJson };
  let doc: TiptapNode;
  try { doc = JSON.parse(contentJson); } catch { return { changed: false, content: contentJson }; }
  let changed = false;
  const walk = (node: TiptapNode) => {
    for (const m of node.marks ?? []) {
      if ((m.type === 'noteTag' && m.attrs?.passageId === passageId) || (m.type === 'review' && m.attrs?.reviewId === passageId)) { m.attrs = { ...m.attrs, ...attrs }; changed = true; }
    }
    if (node.marks) node.marks = node.marks.filter((m) => !(m.type === 'review' && m.attrs?.reviewId === passageId && !m.attrs?.reviewDue));
    const a = node.attrs as Record<string, unknown> | undefined;
    if (a?.reviewId === passageId && typeof node.type === 'string' && NOTE_BLOCK_NODES.has(node.type)) {
      node.attrs = { ...a, ...attrs, ...(attrs.reviewDue === null ? { reviewId: null, reviewStep: null } : {}) };
      changed = true;
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return changed ? { changed: true, content: JSON.stringify(doc) } : { changed: false, content: contentJson };
}

// The document schema requires content to be `section+` (see extensions/Section.ts).
// Notes saved before the sections feature (or very old plain-text notes) have block
// nodes directly under doc — wrap them in a single default section so old notes keep
// loading unchanged. Every reader of stored note content goes through this (the editor, Look up,
// links and embeds, editNoteText), or an old note is an invalid document there (2026-11-05: Look up
// crashed on one). Content that's already sectioned round-trips as-is.
export function parseNoteContent(raw: string): '' | { type: string; content?: Record<string, unknown>[] } {
  if (!raw) return '';
  let parsed: { type: string; content?: Record<string, unknown>[] } | null;
  try {
    const candidate = JSON.parse(raw);
    parsed = candidate?.type === 'doc' ? candidate : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    parsed = {
      type: 'doc',
      content: [{ type: 'paragraph', content: raw ? [{ type: 'text', text: raw }] : [] }],
    };
  }
  const content = parsed.content ?? [];
  const alreadySectioned = content.length > 0 && content.every((n) => n.type === 'section');
  if (alreadySectioned) return parsed;
  return {
    type: 'doc',
    content: [{ type: 'section', attrs: { columns: 1 }, content: content.length ? content : [{ type: 'paragraph' }] }],
  };
}
