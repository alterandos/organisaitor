import { ListItem } from '@tiptap/extension-list';

// A bullet or numbered item that can start with a block, not only a line of text (2026-10-16): a
// timeline typed on an empty bullet takes that bullet's line, the bullet beside it, instead of
// going under an empty bullet (CLAUDE.md "Note blocks", placement by category). Everything else is
// Tiptap's list item; an empty item is still filled with a paragraph (the first block type).
export const NoteListItem = ListItem.extend({
  content: 'block+',
});
