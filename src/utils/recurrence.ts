import type { RepeatConfig } from '@/types';
import { addDaysToIso } from '@/utils/date';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stepDate(cur: Date, repeat: RepeatConfig): Date {
  const next = new Date(cur);
  const n = repeat.interval;
  if      (repeat.freq === 'daily')   next.setDate(next.getDate() + n);
  else if (repeat.freq === 'weekly')  next.setDate(next.getDate() + n * 7);
  else if (repeat.freq === 'monthly') next.setMonth(next.getMonth() + n);
  else                                next.setFullYear(next.getFullYear() + n);
  return next;
}

// Every generated occurrence date from baseDate onward (baseDate itself included), ignoring
// exceptions, stopping at the repeat's own end condition or once past `limit`.
function generate(baseDate: string, repeat: RepeatConfig, limit: string, visit: (date: string) => void) {
  let cur = new Date(baseDate + 'T00:00:00');
  let count = 0;
  const until = repeat.endKind === 'until' && repeat.until ? new Date(repeat.until + 'T00:00:00') : null;
  const maxCount = repeat.endKind === 'count' ? (repeat.count ?? 365) : 9999;

  while (count < maxCount) {
    const str = toDateStr(cur);
    if (str > limit) break;
    if (until && cur > until) break;
    visit(str);
    count++;
    const next = stepDate(cur, repeat);
    if (toDateStr(next) === str) break;
    cur = next;
  }
}

// Occurrence dates within [rangeStart, rangeEnd], excluding the base date (callers render that
// one themselves) and any date the user deleted individually (repeat.exceptions).
export function expandRepeat(baseDate: string, repeat: RepeatConfig, rangeStart: string, rangeEnd: string): string[] {
  const skipped = new Set(repeat.exceptions ?? []);
  const dates: string[] = [];
  generate(baseDate, repeat, rangeEnd, (str) => {
    if (str !== baseDate && str >= rangeStart && str <= rangeEnd && !skipped.has(str)) dates.push(str);
  });
  return dates;
}

export function isOccurrenceSkipped(repeat: RepeatConfig | null, date: string): boolean {
  return !!repeat?.exceptions?.includes(date);
}

// "Delete/edit just this one": the series minus one date.
export function withException(repeat: RepeatConfig, date: string): RepeatConfig {
  const exceptions = repeat.exceptions ?? [];
  return exceptions.includes(date) ? repeat : { ...repeat, exceptions: [...exceptions, date].sort() };
}

// "This and following" delete: the original series now stops the day before `date`.
export function endedBefore(repeat: RepeatConfig, date: string): RepeatConfig {
  return { ...repeat, endKind: 'until', until: addDaysToIso(date, -1), count: null };
}

// "This and following" edit: the repeat for a new series that starts at `date` and carries on
// where the original would have — a count-limited series keeps only its remaining occurrences.
export function tailOf(baseDate: string, repeat: RepeatConfig, date: string): RepeatConfig {
  let before = 0;
  generate(baseDate, repeat, addDaysToIso(date, -1), () => { before++; });
  return {
    ...repeat,
    count: repeat.endKind === 'count' ? Math.max(1, (repeat.count ?? 1) - before) : repeat.count,
    exceptions: (repeat.exceptions ?? []).filter((d) => d >= date),
  };
}
