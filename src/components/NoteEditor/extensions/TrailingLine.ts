import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Always a line to write on after a block (asked for 2026-10-13): a section or a column that ends
// with anything but a line of text (a card, a timeline, a table, a chart…) gets an empty paragraph
// after it, so the cursor can always get past the last block. Added after every change that leaves
// one missing, kept out of undo (it isn't something the user did).

const CONTAINERS = new Set(['section', 'column']);

export const TrailingLine = Extension.create({
  name: 'trailingLine',

  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('trailingLine'),
      appendTransaction: (transactions, _old, state) => {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        const paragraph = state.schema.nodes.paragraph;
        if (!paragraph) return null;
        const ends: number[] = [];
        state.doc.descendants((node, pos) => {
          if (CONTAINERS.has(node.type.name)) {
            const last = node.lastChild;
            const end = node.content.size;
            if (last && !last.isTextblock && node.canReplaceWith(node.childCount, node.childCount, paragraph)) ends.push(pos + 1 + end);
            return true;
          }
          return node.type.name === 'columnBlock';
        });
        if (ends.length === 0) return null;
        const tr = state.tr;
        for (const at of ends.reverse()) tr.insert(at, paragraph.create());
        return tr.setMeta('addToHistory', false);
      },
    })];
  },
});
