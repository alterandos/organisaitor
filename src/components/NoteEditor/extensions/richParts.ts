import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { Decoration } from '@tiptap/pm/view';

// A block's long parts hold paragraphs and bullets (agreed with the user 2026-11-11): a case
// study's parts first. A short part (a title, a name) keeps holding one line of text. The keys,
// the same in every block with long parts:
//   Enter              a new line (or, in a list, a new bullet); on an empty last line, the next
//                      part (an empty bullet: Enter makes it a plain line, then the next part)
//   Shift+Enter        a line break, as anywhere
//   Tab / Shift+Tab    in a list, indent and outdent; otherwise the next and previous part
//   Backspace          at the start of a bullet, it becomes a plain line; at the start of a
//                      part's first line, the previous part
//   Ctrl+Enter         leaves the block (NoteBlockKeys)
// A block uses `richPartAt` in its own Enter / Tab / Backspace and returns false where this says
// the editor's own key is meant (the list's, or a new line). `RICH_PART_NODES`
// (NoteEditor/blockNodes.ts) lists the parts that are long; a part stored before held its text
// straight inside it, which utils/noteContent.ts `normaliseRichParts` wraps in a paragraph when
// the note is read.

export const RICH_PART_CONTENT = '(paragraph | bulletList | orderedList)+';

export interface RichPartAt {
  depth:      number;    // the part's depth at the cursor
  pos:        number;    // where the part starts
  part:       PMNode;
  inList:     boolean;   // the cursor is in a bullet or a numbered item
  atStart:    boolean;   // at the very start of the part's first line
  emptyLast:  boolean;   // in an empty plain line, the part's last
}

export function richPartAt($pos: ResolvedPos, partName: string): RichPartAt | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== partName) continue;
    const part = $pos.node(d);
    const inList = (() => { for (let k = $pos.depth; k > d; k--) if ($pos.node(k).type.name === 'listItem') return true; return false; })();
    const direct = $pos.depth === d + 1;
    const atStart = direct && $pos.index(d) === 0 && $pos.parentOffset === 0;
    const emptyLast = direct && !inList && $pos.parent.type.name === 'paragraph' && $pos.parent.content.size === 0 && $pos.index(d) === part.childCount - 1;
    return { depth: d, pos: $pos.before(d), part, inList, atStart, emptyLast };
  }
  return null;
}

// Nothing written in it: one empty line.
export const richPartEmpty = (part: PMNode): boolean =>
  part.childCount === 0 || (part.childCount === 1 && part.firstChild!.type.name === 'paragraph' && part.firstChild!.content.size === 0);

// The cursor at the end (or start) of the part starting at `pos`.
export const richPartEnd = (doc: PMNode, pos: number, part: PMNode): Selection => Selection.near(doc.resolve(pos + part.nodeSize - 1), -1);

// Enter on the empty last line of a part with lines above it: that line goes before the block
// moves on. Null when it's the part's only line.
export function dropEmptyLast(state: EditorState, at: RichPartAt): Transaction | null {
  if (at.part.childCount < 2) return null;
  const $from = state.selection.$from;
  return state.tr.delete($from.before(), $from.after());
}

// The empty-part placeholder goes on its line, not on the part (which now holds lines).
export function richPlaceholder(partPos: number, part: PMNode, text: string): Decoration | null {
  const line = part.firstChild;
  if (!line || line.type.name !== 'paragraph' || !richPartEmpty(part)) return null;
  return Decoration.node(partPos + 1, partPos + 1 + line.nodeSize, { 'data-part-placeholder': text });
}

// The cursor at the end of whatever part starts at `partPos` (one line of text, or lines).
export const cursorAtPartEnd = (tr: Transaction, partPos: number): Transaction => {
  const part = tr.doc.nodeAt(partPos);
  return part ? tr.setSelection(richPartEnd(tr.doc, partPos, part)) : tr;
};
