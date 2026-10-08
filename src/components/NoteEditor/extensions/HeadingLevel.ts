import { Extension } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';

const MAX_LEVEL = 5;

// Ctrl+= / Ctrl+− on a heading change its level instead of zooming the editor: = makes it more
// prominent (H3 → H2), − less (H2 → H3, and H5 → normal text). H1 stays H1. Anywhere else the
// keys aren't handled here, so App.tsx's zoom gets them (it skips a key the editor already took).
export function shiftHeadingLevel(state: EditorState, dir: 1 | -1, dispatch?: (tr: Transaction) => void): boolean {
  const { $from, $to } = state.selection;
  const node = $from.parent;
  if (node.type.name !== 'heading' || !$from.sameParent($to)) return false;
  const level = node.attrs.level as number;
  if (dispatch) {
    const pos = $from.before();
    const next = level + dir;
    if (next < 1) return true;
    const tr = next > MAX_LEVEL
      ? state.tr.setNodeMarkup(pos, state.schema.nodes.paragraph)
      : state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: next });
    dispatch(tr);
  }
  return true;
}

export const HeadingLevel = Extension.create({
  name: 'headingLevel',

  addKeyboardShortcuts() {
    return {
      'Mod-=': () => shiftHeadingLevel(this.editor.state, -1, this.editor.view.dispatch),
      'Mod--': () => shiftHeadingLevel(this.editor.state, 1, this.editor.view.dispatch),
    };
  },
});
