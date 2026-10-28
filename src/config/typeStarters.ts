import type { FieldSchema, ItemTypeDefaults, TypePart } from '@/types';

// Ready-made Types, added only when the person asks (Manage → Types → "Add a starter set"; decided
// with the user 2026-10-29: nothing built into every account, so a non-student never sees "Exam").
// The "University subject" template (docs/features/endeavours.md phase 6) will add the same set.
// Ids here are stable keys for the set, not the Types' ids: services/itemTypes.ts addStarterSet
// gives each Type a fresh id, and each field and part keeps its key (unique within its Type chain).

export interface StarterType {
  key:       string;
  name:      string;
  icon:      string;
  extends?:  string;              // another starter's key
  fields:    FieldSchema[];
  defaults:  ItemTypeDefaults;
  parts:     TypePart[];
}

export type StarterSet = 'university';

export const STARTER_SETS: Record<StarterSet, StarterType[]> = {
  university: [
    {
      key: 'assessment', name: 'Assessment', icon: '📝',
      fields: [
        { id: 'weight', name: 'Weight', type: 'number', unit: '%' },
        { id: 'mark',   name: 'Mark',   type: 'number', unit: '%' },
        { id: 'status', name: 'Status', type: 'select', options: ['Not started', 'In progress', 'Submitted', 'Marked'] },
      ],
      defaults: { makeAs: 'deadline', important: true },
      parts: [],
    },
    {
      key: 'exam', name: 'Exam', icon: '🎓', extends: 'assessment',
      fields: [
        { id: 'room',      name: 'Room',              type: 'text' },
        { id: 'materials', name: 'Allowed materials', type: 'text' },
      ],
      defaults: { makeAs: 'event' },
      parts: [
        { id: 'revise', kind: 'task',     title: 'Revise',          offsetDays: 7 },
        { id: 'result', kind: 'followUp', title: 'Check the result', offsetDays: 14 },
      ],
    },
    {
      key: 'essay', name: 'Essay', icon: '✍️', extends: 'assessment',
      fields: [
        { id: 'question', name: 'Question',   type: 'text' },
        { id: 'words',    name: 'Word limit', type: 'number' },
      ],
      defaults: { makeAs: 'deadline' },
      parts: [
        { id: 'plan',      kind: 'task', title: 'Plan',      offsetDays: 14 },
        { id: 'draft',     kind: 'task', title: 'Draft',     offsetDays: 7 },
        { id: 'proofread', kind: 'task', title: 'Proofread', offsetDays: 1 },
      ],
    },
    {
      key: 'reading', name: 'Reading', icon: '📖',
      fields: [
        { id: 'source', name: 'What to read', type: 'text' },
        { id: 'pages',  name: 'Pages',        type: 'text' },
      ],
      defaults: { makeAs: 'task' },
      parts: [],
    },
    {
      key: 'lecture', name: 'Lecture', icon: '🏛️',
      fields: [
        { id: 'topic', name: 'Topic', type: 'text' },
      ],
      defaults: { makeAs: 'event' },
      parts: [
        { id: 'review', kind: 'followUp', title: 'Review the notes', offsetDays: 1 },
      ],
    },
  ],
};
