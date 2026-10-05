import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    duplicateLine: {
      // Inserts a copy of the current line (paragraph, heading, list item…) below it, as in a code
      // editor; with a selection over several lines, a copy of all of them. The cursor/selection
      // moves into the copy.
      duplicateLineDown: () => ReturnType;
    };
  }
}

// Depth of the "line" the position is in: its textblock, or the list item holding that textblock
// (copying only the paragraph inside a list item would add a second paragraph to the same bullet).
function lineDepth($pos: ResolvedPos): number {
  let d = $pos.depth;
  while (d > 0 && !$pos.node(d).isTextblock) d--;
  if (d > 1 && /^(listItem|taskItem)$/.test($pos.node(d - 1).type.name) && $pos.node(d - 1).firstChild === $pos.node(d)) d--;
  return d;
}

// Alt+Shift+Down in the Notes editor (requested 2026-10-05).
export const DuplicateLine = Extension.create({
  name: 'duplicateLine',

  addCommands() {
    return {
      duplicateLineDown: () => ({ state, tr, dispatch }) => {
        const { $from, $to } = state.selection;
        const d = lineDepth($from);
        if (d === 0) return false;
        const start = $from.before(d);
        // The selection's last line counts only if it shares the first line's container (same
        // section, same list); otherwise just the first line is copied.
        const dTo = lineDepth($to);
        const sameParent = dTo === d && $from.sharedDepth($to.pos) >= d - 1;
        const end = sameParent ? $to.after(d) : $from.after(d);
        const content = state.doc.slice(start, end).content;
        if (dispatch) {
          tr.insert(end, content);
          const shift = end - start;
          tr.setSelection(TextSelection.create(tr.doc, state.selection.from + shift, state.selection.to + shift)).scrollIntoView();
        }
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return { 'Alt-Shift-ArrowDown': () => this.editor.commands.duplicateLineDown() };
  },
});
