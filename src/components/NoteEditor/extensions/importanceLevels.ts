import { LABELS } from '@/config/labels';

// How important an Important passage is. Level 1 is the original Important tag; Ctrl+1 steps up
// through the levels and then off. Colours are accent colours, the same in both themes, like the
// built-in tags' own (builtinTags.ts).
export interface ImportanceLevel {
  level: 1 | 2 | 3;
  label: string;
  icon:  string;
  color: string;
  tint:  string;   // the background's alpha, as two hex digits after the colour
}

export const IMPORTANCE_LEVELS: ImportanceLevel[] = [
  { level: 1, label: LABELS.importance.levels[1], icon: '⭐', color: '#f59e0b', tint: '22' },
  { level: 2, label: LABELS.importance.levels[2], icon: '🌟', color: '#f97316', tint: '30' },
  { level: 3, label: LABELS.importance.levels[3], icon: '❗', color: '#ef4444', tint: '2b' },
];

export const importanceLevel = (level: unknown): ImportanceLevel =>
  IMPORTANCE_LEVELS.find((l) => l.level === level) ?? IMPORTANCE_LEVELS[0];
