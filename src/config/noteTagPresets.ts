import type { NoteTagFieldDef } from '@/types/notes';

export interface TagPresetItem {
  name: string;
  icon: string;
  color: string;
  fieldSchema: NoteTagFieldDef[];
}

export interface TagPresetDef {
  key: string;
  name: string;
  description: string;
  tags: TagPresetItem[];
}

export const NOTE_TAG_PRESETS: TagPresetDef[] = [
  {
    key: 'academic',
    name: 'Academic',
    description: 'Annotation tags for thesis, research, and academic work',
    tags: [
      {
        name: 'Argument',
        icon: '⚖️',
        color: '#d97706',
        fieldSchema: [
          { id: 'strength', name: 'Strength', type: 'rating' },
        ],
      },
      {
        name: 'Evidence',
        icon: '🔬',
        color: '#059669',
        fieldSchema: [
          { id: 'source', name: 'Source', type: 'url' },
          { id: 'type', name: 'Type', type: 'select', options: ['empirical', 'anecdotal', 'theoretical', 'statistical'] },
        ],
      },
      {
        name: 'Critique',
        icon: '🔺',
        color: '#dc2626',
        fieldSchema: [
          { id: 'against', name: 'Against', type: 'text' },
        ],
      },
      {
        name: 'Methodology',
        icon: '📐',
        color: '#1d4ed8',
        fieldSchema: [
          { id: 'approach', name: 'Approach', type: 'select', options: ['qualitative', 'quantitative', 'mixed', 'review', 'other'] },
        ],
      },
      {
        name: 'Gap',
        icon: '🔍',
        color: '#7c3aed',
        fieldSchema: [
          { id: 'priority', name: 'Priority', type: 'rating' },
        ],
      },
      {
        name: 'Assumption',
        icon: '💭',
        color: '#64748b',
        fieldSchema: [
          { id: 'stated', name: 'Stated explicitly', type: 'boolean' },
        ],
      },
    ],
  },
];
