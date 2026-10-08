import type { Editor } from '@tiptap/core';

// Marks that carry meaning rather than styling — a link, an annotation tag, a cross-app link.
// "Normal" leaves them alone; everything else (bold, italic, underline, strike, code, colour,
// super/subscript, and any formatting mark added later) is removed.
const KEPT_MARKS = new Set(['link', 'noteTag', 'artifactLink', 'conceptRef']);

// "Normal text" (Ctrl+H then 0, or Normal in the style dropdown): the block becomes a plain
// paragraph AND its text loses all formatting. Scope: the selection, or with nothing selected the
// whole paragraph the cursor is in — plus the stored marks, so what's typed next is plain too.
export function setNormalText(editor: Editor): void {
  editor.chain().focus().setParagraph().command(({ tr, state }) => {
    const { from, to, empty, $from } = tr.selection;
    const [start, end] = empty ? [$from.start(), $from.end()] : [from, to];
    for (const type of Object.values(state.schema.marks)) {
      if (!KEPT_MARKS.has(type.name)) tr.removeMark(start, end, type);
    }
    tr.setStoredMarks([]);
    return true;
  }).run();
}
