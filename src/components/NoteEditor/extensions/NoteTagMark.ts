import { Mark, mergeAttributes } from '@tiptap/core';

export const NoteTagMark = Mark.create({
  name: 'noteTag',

  addAttributes() {
    return {
      tagId:   { default: null },
      color:   { default: '#2563eb' },
      typeKey: { default: null },  // built-in type key, e.g. 'important', 'concept'
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-tag-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes.color ?? '#2563eb';
    const attrs: Record<string, string> = {
      'data-tag-id': HTMLAttributes.tagId,
      style: `background-color: ${color}22; border-bottom: 2px solid ${color}; border-radius: 2px; padding-bottom: 1px;`,
    };
    if (HTMLAttributes.typeKey) attrs['data-tag-type'] = HTMLAttributes.typeKey;
    return ['mark', mergeAttributes(HTMLAttributes, attrs), 0];
  },
});
