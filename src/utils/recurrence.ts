import type { RepeatConfig } from '@/types';
import { addDaysToIso } from '@/utils/date';
import { LABELS } from '@/config/labels';

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

// The `week`th (1–5, or -1 = last) `day` (0=Sun…6=Sat) of a month; null when that month has none
// (a 5th Friday).
export function nthWeekdayOfMonth(year: number, month: number, week: number, day: number): Date | null {
  if (week === -1) {
    const last = new Date(year, month + 1, 0);
    last.setDate(last.getDate() - ((last.getDay() - day + 7) % 7));
    return last;
  }
  const first = new Date(year, month, 1);
  const d = new Date(year, month, 1 + ((day - first.getDay() + 7) % 7) + (week - 1) * 7);
  return d.getMonth() === month ? d : null;
}

// The first date on or after `date` that is the `week`th `day` of its month ("the next third
// Sunday"), or `date` itself if none comes within a year. A series' first date always counts as one
// of its dates, so a rule chosen for "every third Sunday" starts here.
export function firstNthWeekdayFrom(date: string, mw: { week: number; day: number }): string {
  const start = new Date(date + 'T00:00:00');
  for (let k = 0; k < 14; k++) {
    const m = new Date(start.getFullYear(), start.getMonth() + k, 1);
    const d = nthWeekdayOfMonth(m.getFullYear(), m.getMonth(), mw.week, mw.day);
    if (d && d >= start) return toDateStr(d);
  }
  return date;
}

// Which week of its month a date is in, as monthWeekday counts it: 1–4, or -1 when it's the last
// such weekday of the month (the 5th is always the last). For offering "the 2nd Tuesday" /
// "the last Friday" from a start date.
export function weekOfMonth(date: string): { week: number; isLast: boolean } {
  const d = new Date(date + 'T00:00:00');
  const week = Math.floor((d.getDate() - 1) / 7) + 1;
  const isLast = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getMonth() !== d.getMonth();
  return { week, isLast };
}

// The rule's candidate dates from baseDate onward, in order, as the rule itself defines them
// (baseDate is not necessarily one of them). Weekly-with-weekdays and nth-weekday rules make
// several or skip some per step, so they're generated per period.
function* candidates(baseDate: string, repeat: RepeatConfig): Generator<Date> {
  const base = new Date(baseDate + 'T00:00:00');
  // On a list of dates: just those (2026-10-30).
  if (repeat.freq === 'dates') {
    for (const d of [...new Set(repeat.dates ?? [])].sort()) yield new Date(d + 'T00:00:00');
    return;
  }
  const n = Math.max(1, repeat.interval);
  const days = repeat.freq === 'weekly' && repeat.daysOfWeek?.length ? [...new Set(repeat.daysOfWeek)] : null;
  const mw = (repeat.freq === 'monthly' || repeat.freq === 'yearly') ? repeat.monthWeekday : undefined;
  if (days) {
    // Weeks run Monday–Sunday (iCalendar's default WKST), so sort Sunday last.
    const order = days.map((d) => (d + 6) % 7).sort((a, b) => a - b);
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    for (let k = 0; ; k += n) {
      for (const off of order) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + k * 7 + off);
        yield d;
      }
    }
  }
  if (mw) {
    const step = repeat.freq === 'yearly' ? 12 * n : n;
    for (let k = 0; ; k += step) {
      const m = new Date(base.getFullYear(), base.getMonth() + k, 1);
      const d = nthWeekdayOfMonth(m.getFullYear(), m.getMonth(), mw.week, mw.day);
      if (d) yield d;
      else if (k > 12 * 400) return;
    }
  }
  let cur = base;
  for (;;) {
    yield cur;
    const next = stepDate(cur, repeat);
    if (toDateStr(next) === toDateStr(cur)) return;
    cur = next;
  }
}

// Every generated occurrence date from baseDate onward (baseDate itself included, always the
// first — iCalendar's DTSTART rule), ignoring exceptions, stopping at the repeat's own end
// condition or once past `limit`.
function generate(baseDate: string, repeat: RepeatConfig, limit: string, visit: (date: string) => void) {
  const until = repeat.endKind === 'until' && repeat.until ? repeat.until : null;
  const maxCount = repeat.endKind === 'count' ? (repeat.count ?? 365) : Infinity;
  let count = 0;
  let guard = 0;
  const emit = (str: string) => {
    if (str > limit || (until && str > until)) return false;
    visit(str);
    count++;
    return count < maxCount;
  };
  if (!emit(baseDate)) return;
  for (const d of candidates(baseDate, repeat)) {
    if (++guard > 200_000) return;
    const str = toDateStr(d);
    if (str <= baseDate) continue;
    if (!emit(str)) return;
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

// What a rule's weekdays or nth weekday read as ("Mon, Wed, Fri", "weekdays", "the second
// Tuesday"), or null for a plain rule. Every place that writes a rule out appends it.
export function repeatPattern(repeat: RepeatConfig): string | null {
  const L = LABELS.recurring;
  if (repeat.freq === 'weekly' && repeat.daysOfWeek?.length) {
    const days = [...new Set(repeat.daysOfWeek)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (days.join() === '1,2,3,4,5') return L.weekdays;
    return days.map((d) => L.dayShort[d]).join(', ');
  }
  if ((repeat.freq === 'monthly' || repeat.freq === 'yearly') && repeat.monthWeekday) {
    return `the ${L.nth[repeat.monthWeekday.week] ?? ''} ${L.dayName[repeat.monthWeekday.day]}`;
  }
  return null;
}
