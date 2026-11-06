import { LABELS } from '@/config/labels';

// How important an Important passage is: Important or Critical (two levels since 2026-11-05, the
// user's call: a middle level was hard to tell apart in the moment, so it was used unevenly).
// Critical keeps its stored number, 3; a stored 2 (Very important, never used) reads as Important.
// Ctrl+1 steps Important → Critical → off. Colours are accent colours, the same in both themes, like the
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
  { level: 3, label: LABELS.importance.levels[3], icon: '❗', color: '#ef4444', tint: '2b' },
];

export const importanceLevel = (level: unknown): ImportanceLevel =>
  IMPORTANCE_LEVELS.find((l) => l.level === level) ?? IMPORTANCE_LEVELS[0];

// The level after this one when stepping (Ctrl+1): none → Important → Critical → none.
export const nextImportance = (level: number): 0 | 1 | 3 => (level === 0 ? 1 : level < 3 ? 3 : 0);
