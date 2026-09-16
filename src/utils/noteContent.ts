// Pure, editor-independent helpers over a Note's stored Tiptap JSON content (a stringified
// ProseMirror doc). Used by services/crossAppLinkCleanup.ts to strip a dead ArtifactLinkMark
// when the entity it points at is deleted, without needing a live editor instance mounted —
// the note being cleaned up is very often not the one currently open.

interface TiptapNode {
  marks?:   { type: string; attrs?: Record<string, unknown> }[];
  content?: TiptapNode[];
  [key: string]: unknown;
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
