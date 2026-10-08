import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

// Two paragraph styles for the top of a piece of writing, beside the Title (NoteTitle.ts):
//   Subtitle (Ctrl+H, S) — the standfirst: a sentence under the title saying what the piece is.
//   Author   (Ctrl+H, A) — the byline: who wrote it.
// Their own nodes rather than heading levels, so they're never numbered and never in the outline,
// like the Title. Either can be used anywhere; Enter after one continues in ordinary text.

function continueInParagraph(editor: Editor, name: string): boolean {
  if (!editor.isActive(name)) return false;
  return editor.commands.command(({ tr, state, dispatch }) => {
    const { $from } = tr.selection;
    if (dispatch) {
      if (!tr.selection.empty) tr.deleteSelection();
      const pos = tr.selection.from;
      // At the end: a new paragraph below. Mid-text: split, the rest becoming a paragraph.
      if (pos === $from.end()) {
        tr.insert(pos + 1, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, pos + 2));
      } else {
        tr.split(pos, 1, [{ type: state.schema.nodes.paragraph }]);
        tr.setSelection(TextSelection.create(tr.doc, pos + 2));
      }
      tr.scrollIntoView();
    }
    return true;
  });
}

const byline = (name: string, attr: string) => Node.create({
  name,
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: `div[${attr}]`, priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { [attr]: '' }), 0];
  },

  addKeyboardShortcuts() {
    return { Enter: ({ editor }) => continueInParagraph(editor as Editor, name) };
  },
});

export const NoteSubtitle = byline('noteSubtitle', 'data-note-subtitle');
export const NoteAuthor = byline('noteAuthor', 'data-note-author');
