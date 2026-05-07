import type { FieldSchema, TrackerTemplate } from '@/types';

export interface TemplateDefinition {
  label:       string;
  description: string;
  fields:      FieldSchema[];
}

export const TRACKER_TEMPLATES: Record<TrackerTemplate, TemplateDefinition> = {
  habit: {
    label:       'Habit',
    description: 'Track a daily habit with a simple done/not-done check',
    fields: [
      { id: 'done', name: 'Done', type: 'boolean', required: true },
    ],
  },
  books: {
    label:       'Books',
    description: 'Log books you\'ve read or are reading',
    fields: [
      { id: 'title',  name: 'Title',  type: 'text',   required: true },
      { id: 'author', name: 'Author', type: 'text' },
      { id: 'status', name: 'Status', type: 'select', options: ['to-read', 'reading', 'read', 'dnf'] },
      { id: 'rating', name: 'Rating', type: 'rating', max: 5 },
    ],
  },
  movies: {
    label:       'Movies',
    description: 'Log films you\'ve watched',
    fields: [
      { id: 'title',      name: 'Title',    type: 'text',   required: true },
      { id: 'director',   name: 'Director', type: 'text' },
      { id: 'watched_at', name: 'Watched',  type: 'date' },
      { id: 'rating',     name: 'Rating',   type: 'rating', max: 5 },
    ],
  },
  custom: {
    label:       'Custom',
    description: 'Start from scratch and define your own fields',
    fields: [],
  },
};
