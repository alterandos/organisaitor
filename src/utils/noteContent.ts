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
