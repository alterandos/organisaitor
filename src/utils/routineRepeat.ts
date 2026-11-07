import type { RepeatConfig } from '@/types';

// A routine's days as its repeat: none chosen is every day (no rule).
export function routineRepeat(daysOfWeek: number[]): RepeatConfig | null {
  if (daysOfWeek.length === 0) return null;
  return { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek };
}
