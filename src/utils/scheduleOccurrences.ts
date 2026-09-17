import type { ScheduleBlock, ScheduleTemplate } from '@/types';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}

function maxDateStr(a: string | null, b: string): string {
  return a && a > b ? a : b;
}

function minDateStr(a: string | null, b: string): string {
  return a && a < b ? a : b;
}

// Expands one block into concrete occurrence dates within [rangeStart, rangeEnd], clipped by
// the parent template's own startDate/endDate, honouring `interval` (every Nth week from the
// week containing `intervalAnchor`) and skipping anything in `exceptions`.
export function expandScheduleBlock(
  block: ScheduleBlock,
  template: Pick<ScheduleTemplate, 'startDate' | 'endDate'>,
  rangeStart: string,
  rangeEnd: string
): string[] {
  const lo = maxDateStr(template.startDate, rangeStart);
  const hi = minDateStr(template.endDate, rangeEnd);
  if (lo > hi || block.daysOfWeek.length === 0) return [];

  const exceptionSet = new Set(block.exceptions);
  const anchorWeekStart = startOfWeek(new Date(`${block.intervalAnchor}T00:00:00`)).getTime();
  const interval = Math.max(1, block.interval || 1);

  const dates: string[] = [];
  const cur = new Date(`${lo}T00:00:00`);
  const end = new Date(`${hi}T00:00:00`);

  while (cur <= end) {
    if (block.daysOfWeek.includes(cur.getDay())) {
      const weeksSinceAnchor = Math.round((startOfWeek(cur).getTime() - anchorWeekStart) / (7 * 86_400_000));
      if (weeksSinceAnchor >= 0 && weeksSinceAnchor % interval === 0) {
        const ds = toDateStr(cur);
        if (!exceptionSet.has(ds)) dates.push(ds);
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  return dates;
}

// For the occurrence popover's "commit for the next N weeks" bulk action: starting from
// `fromDate` (itself a real occurrence of `block`), steps forward one week at a time and
// keeps only the dates that are genuinely valid occurrences per the block's own
// interval/anchor/exceptions — so a biweekly block's "off" weeks are skipped automatically,
// and the result is always N *real* upcoming occurrences of this exact weekly slot, not N
// calendar weeks. Bounded by the template's own endDate (if any) and a generous iteration
// guard so a malformed block can't loop forever.
export function computeNextOccurrenceDates(
  block: ScheduleBlock,
  template: Pick<ScheduleTemplate, 'startDate' | 'endDate'>,
  fromDate: string,
  count: number
): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00`);
  let guard = 0;
  while (dates.length < count && guard < count * 20 + 52) {
    guard++;
    cursor.setDate(cursor.getDate() + 7);
    const ds = toDateStr(cursor);
    if (template.endDate && ds > template.endDate) break;
    const matches = expandScheduleBlock(block, template, ds, ds);
    if (matches.includes(ds)) dates.push(ds);
  }
  return dates;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Simple, deliberately non-exhaustive conflict signal: flags two blocks as "potentially
// clashing" whenever they share a day-of-week and an overlapping time range — regardless of
// `interval`/`intervalAnchor` alignment (an every-other-week block is flagged even against a
// weekly one it might never actually land on the same date as). This is a conservative "you
// might want to check this" heads-up for the schedule manager, not an exact per-date collision
// check — exact collisions are already visible for free once both are active, via the same
// side-by-side overlap layout the calendar's time grid already does for any overlapping items.
export function blocksMayConflict(a: ScheduleBlock, b: ScheduleBlock): boolean {
  const sharesDay = a.daysOfWeek.some((d) => b.daysOfWeek.includes(d));
  if (!sharesDay) return false;
  const aStart = timeToMinutes(a.startTime), aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime), bEnd = timeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

// Counts, for one template, how many of its blocks conflict with any block belonging to a
// DIFFERENT active template. Used for the small "N potential conflicts" hint in the schedule
// manager when deciding whether to switch a schedule on.
export function countTemplateConflicts(target: ScheduleTemplate, others: ScheduleTemplate[]): number {
  let count = 0;
  for (const block of target.blocks) {
    for (const other of others) {
      if (other.id === target.id) continue;
      for (const otherBlock of other.blocks) {
        if (blocksMayConflict(block, otherBlock)) count++;
      }
    }
  }
  return count;
}
