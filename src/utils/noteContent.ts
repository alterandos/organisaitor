// Pure, editor-independent helpers over a Note's stored Tiptap JSON content (a stringified
// ProseMirror doc). Used by services/crossAppLinkCleanup.ts to strip a dead ArtifactLinkMark
// when the entity it points at is deleted, without needing a live editor instance mounted —
// the note being cleaned up is very often not the one currently open.

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

// Whether a stored content JSON string has `mark` with `attr === value` anywhere.
export function contentHasMark(contentJson: string, find: PassageMark): boolean {
  if (!contentJson || !contentJson.includes(find.value)) return false;
  let found = false;
  try {
    const walk = (node: TiptapNode) => {
      if (found) return;
      if (node.marks?.some((m) => m.type === find.mark && m.attrs?.[find.attr] === find.value)) { found = true; return; }
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
export interface ReviewPassage {
  passageId:  string;
  text:       string;
  context:    string;
  level:      number;
  reviewDue:  string;
  reviewStep: number;
}

export function collectReviewPassages(contentJson: string): ReviewPassage[] {
  if (!contentJson || !contentJson.includes('reviewDue')) return [];
  const out = new Map<string, ReviewPassage>();
  const blockText = (node: TiptapNode): string =>
    typeof node.text === 'string' ? node.text : (node.content ?? []).map(blockText).join('');
  const walk = (node: TiptapNode) => {
    const children = node.content ?? [];
    if (children.some((c) => typeof c.text === 'string')) {
      const context = blockText(node);
      for (const c of children) {
        const m = c.marks?.find((mk) => mk.type === 'noteTag' && mk.attrs?.typeKey === 'important' && mk.attrs?.reviewDue && mk.attrs?.passageId);
        if (!m || typeof c.text !== 'string') continue;
        const id = String(m.attrs!.passageId);
        const existing = out.get(id);
        if (existing) { existing.text += c.text; continue; }
        out.set(id, {
          passageId: id, text: c.text, context,
          level: Number(m.attrs!.level ?? 1), reviewDue: String(m.attrs!.reviewDue), reviewStep: Number(m.attrs!.reviewStep ?? 0),
        });
      }
      return;
    }
    children.forEach(walk);
  };
  try { walk(JSON.parse(contentJson)); } catch { return []; }
  return [...out.values()];
}

// Sets attributes on every noteTag mark of one passage (by passageId) in a stored content JSON
// string. Returns the string unchanged (changed: false) if the passage isn't in it.
export function updatePassageInContent(contentJson: string, passageId: string, attrs: Record<string, unknown>): { changed: boolean; content: string } {
  if (!contentJson || !contentJson.includes(passageId)) return { changed: false, content: contentJson };
  let doc: TiptapNode;
  try { doc = JSON.parse(contentJson); } catch { return { changed: false, content: contentJson }; }
  let changed = false;
  const walk = (node: TiptapNode) => {
    for (const m of node.marks ?? []) {
      if (m.type === 'noteTag' && m.attrs?.passageId === passageId) { m.attrs = { ...m.attrs, ...attrs }; changed = true; }
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return changed ? { changed: true, content: JSON.stringify(doc) } : { changed: false, content: contentJson };
}
