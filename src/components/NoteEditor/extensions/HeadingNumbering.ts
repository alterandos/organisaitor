import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Computes hierarchical heading numbers (1, 1.1, 1.1.2, …) via ProseMirror
// decorations and writes them as data-heading-number on each heading DOM node.
// CSS ::before { content: attr(data-heading-number) } then renders the numbers.
// This avoids the CSS counter-reset sibling-scoping bug that causes h2 counters
// to not reset when a new h1 is encountered in a flat DOM structure.
export const HeadingNumbering = Extension.create({
  name: 'headingNumbering',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const counts = [0, 0, 0, 0, 0]; // h1–h5 counters (0-indexed)

            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'heading') return;
              const level = (node.attrs.level as number) - 1; // 0-indexed
              counts[level]++;
              for (let i = level + 1; i < 5; i++) counts[i] = 0;
              const number = counts.slice(0, level + 1).join('.');
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  'data-heading-number': number,
                })
              );
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
