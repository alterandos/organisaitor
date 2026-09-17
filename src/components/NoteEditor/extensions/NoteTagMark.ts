import { Mark, mergeAttributes } from '@tiptap/core';

export const NoteTagMark = Mark.create({
  name: 'noteTag',

  addAttributes() {
    return {
      tagId:   { default: null },
      color:   { default: '#2563eb' },
      typeKey: { default: null },  // built-in type key, e.g. 'important', 'concept'
      // Set when typeKey has a registered StructuredTagTypeDef (src/config/structuredTagTypes.ts)
      // — points at the separate StructuredTagEntry this passage's fields live in. null for
      // every plain annotation tag (Important, Concept, ...), which have no structured data.
      structuredEntryId: { default: null },
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
    if (HTMLAttributes.structuredEntryId) attrs['data-structured-entry-id'] = HTMLAttributes.structuredEntryId;
    return ['mark', mergeAttributes(HTMLAttributes, attrs), 0];
  },
});
