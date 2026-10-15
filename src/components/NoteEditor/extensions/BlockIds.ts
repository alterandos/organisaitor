import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { LINKABLE_BLOCK_NODES } from '../blockNodes';

// A lasting id on a paragraph or heading, and (since 2026-10-15) on any note block and any block's
// part (`blockId`), so a link or an embed from another note can point at it however the text
// around it changes. Given only when something first
// points at the passage (services/noteLinkTargets.ts ensureBlockId), never to every paragraph.
// Splitting a paragraph leaves the id on its first half; copying one would duplicate the id, so a
// repeat is cleared (the first in the note keeps it), kept out of undo.

const PASSAGE_NODES = ['paragraph', 'heading', ...LINKABLE_BLOCK_NODES];

export const BlockIds = Extension.create({
  name: 'blockIds',

  addGlobalAttributes() {
    return [{
      types: PASSAGE_NODES,
      attributes: {
        blockId: {
          default: null,
          keepOnSplit: false,
          parseHTML: (el) => el.getAttribute('data-block-id'),
          renderHTML: (attrs) => (attrs.blockId ? { 'data-block-id': attrs.blockId } : {}),
        },
      },
    }];
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('blockIds'),
      appendTransaction: (transactions, _old, state) => {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        const seen = new Set<string>();
        const repeats: number[] = [];
        state.doc.descendants((node, pos) => {
          const id = node.attrs.blockId as string | null | undefined;
          if (id) { if (seen.has(id)) repeats.push(pos); else seen.add(id); }
          return !node.isTextblock;
        });
        if (repeats.length === 0) return null;
        const tr = state.tr;
        for (const pos of repeats) tr.setNodeAttribute(pos, 'blockId', null);
        return tr.setMeta('addToHistory', false);
      },
    })];
  },
});
