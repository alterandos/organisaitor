import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteTitle: {
      // Puts the cursor in this tab's Title, creating it at the top (filled with `prefill`) if the
      // tab has none yet.
      insertOrFocusNoteTitle: (prefill: string) => ReturnType;
    };
  }
}

// Where the one allowed Title lives: the first block of the first section (doc > section > block).
const TITLE_POS = 1;

// A tab's Title: one per tab, always its first line, larger than Heading 1 and never numbered
// (HeadingNumbering only counts `heading` nodes). Its own node rather than a heading level so it
// picks up none of the heading styles, numbering or table-of-contents behaviour. Created only by
// insertOrFocusNoteTitle; the plugin below keeps the "one, at the top" rule whatever else
// happens (paste, drag, a split): any other Title becomes Heading 1.
export const NoteTitle = Node.create({
  name: 'noteTitle',
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-note-title]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-note-title': '' }), 0];
  },

  addCommands() {
    return {
      insertOrFocusNoteTitle: (prefill) => ({ state, tr, dispatch }) => {
        const first = state.doc.firstChild?.firstChild;
        if (first?.type.name === this.name) {
          if (dispatch) tr.setSelection(TextSelection.create(tr.doc, TITLE_POS + 1 + first.content.size)).scrollIntoView();
          return true;
        }
        if (dispatch) {
          const text = prefill.trim();
          tr.insert(TITLE_POS, this.type.create(null, text ? state.schema.text(text) : null));
          tr.setSelection(TextSelection.create(tr.doc, TITLE_POS + 1 + text.length)).scrollIntoView();
        }
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Enter in the Title continues in ordinary text, never a second Title.
      Enter: ({ editor }) => {
        if (!editor.isActive(this.name)) return false;
        return editor.commands.command(({ tr, state, dispatch }) => {
          if (dispatch) {
            if (!tr.selection.empty) tr.deleteSelection();
            const pos = tr.selection.from;
            tr.split(pos, 1, [{ type: state.schema.nodes.paragraph }]);
            tr.setSelection(TextSelection.create(tr.doc, pos + 2)).scrollIntoView();
          }
          return true;
        });
      },
    };
  },

  addProseMirrorPlugins() {
    const titleType = this.type;
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const heading = state.schema.nodes.heading;
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type === titleType && pos !== TITLE_POS) tr.setNodeMarkup(pos, heading, { level: 1 });
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
