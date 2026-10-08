import { Mark, mergeAttributes } from '@tiptap/core';
import { importanceLevel } from './importanceLevels';

const num = (v: string | null) => (v === null || v === '' ? null : Number(v));

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
      // Important only (extensions/Importance.ts): how important (1 Important, 2 Very important,
      // 3 Critical; null = 1), the passage's stable id (Key points, Review), and its review
      // schedule (Review later: the next date it's due, and how many times it's been reviewed).
      // Rendered as data-* attributes by renderHTML below.
      level:      { default: null, parseHTML: (el) => num(el.getAttribute('data-level')), renderHTML: () => ({}) },
      passageId:  { default: null, parseHTML: (el) => el.getAttribute('data-passage-id'), renderHTML: () => ({}) },
      reviewDue:  { default: null, parseHTML: (el) => el.getAttribute('data-review-due'), renderHTML: () => ({}) },
      reviewStep: { default: null, parseHTML: (el) => num(el.getAttribute('data-review-step')), renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-tag-id]' }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    const a = mark.attrs;
    const level = a.typeKey === 'important' ? importanceLevel(a.level) : null;
    const color = level?.color ?? HTMLAttributes.color ?? '#2563eb';
    const attrs: Record<string, string> = {
      'data-tag-id': HTMLAttributes.tagId,
      style: `background-color: ${color}${level?.tint ?? '22'}; border-bottom: ${level && level.level > 1 ? 3 : 2}px solid ${color}; border-radius: 2px; padding-bottom: 1px;`,
    };
    if (HTMLAttributes.typeKey) attrs['data-tag-type'] = HTMLAttributes.typeKey;
    if (HTMLAttributes.structuredEntryId) attrs['data-structured-entry-id'] = HTMLAttributes.structuredEntryId;
    if (level) attrs['data-level'] = String(level.level);
    if (a.passageId) attrs['data-passage-id'] = a.passageId;
    if (a.reviewDue) attrs['data-review-due'] = a.reviewDue;
    if (a.reviewStep !== null) attrs['data-review-step'] = String(a.reviewStep);
    return ['mark', mergeAttributes(HTMLAttributes, attrs), 0];
  },
});
