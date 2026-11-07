import type { Collection, EndeavourPeriod } from '@/types';
import { addDaysToIso } from '@/utils/date';
import { parentsOf } from '@/utils/endeavourGraph';
import { periodFromUse, periodsFor } from '@/utils/datePeriods';

// An Endeavour's period and breaks (docs/features/endeavours.md phase 7), pure: its own, or the
// nearest Endeavour's above it that has one (a subject takes its semester's, live), nearest first
// and then in the order its parents are listed. Its own replaces the inherited one whole (a summer
// subject sets its own dates and breaks). Since 2026-11-07 an Endeavour says which named periods it
// runs during and pauses during (`dateUse`, utils/datePeriods.ts), read here into the same shape;
// an old single `period` is still read until it's converted.

export interface EffectivePeriod { period: EndeavourPeriod; from: string; inherited: boolean }

export function effectivePeriod(id: string, collections: Record<string, Collection>): EffectivePeriod | null {
  const seen = new Set<string>();
  let level = [id];
  while (level.length) {
    const next: string[] = [];
    for (const cid of level) {
      if (seen.has(cid)) continue;
      seen.add(cid);
      const c = collections[cid];
      if (!c) continue;
      if (c.dateUse && (c.dateUse.runs.length || c.dateUse.pauses.length)) {
        const p = periodFromUse(c.dateUse, periodsFor(cid, collections));
        if (p) return { period: p, from: cid, inherited: cid !== id };
      }
      if (c.period) return { period: c.period, from: cid, inherited: cid !== id };
      next.push(...parentsOf(c, collections));
    }
    level = next;
  }
  return null;
}

// Every date inside its breaks (both ends included), to skip.
export function breakDates(period: EndeavourPeriod | null | undefined): string[] {
  if (!period) return [];
  const out: string[] = [];
  for (const b of period.breaks) {
    // A break with no end yet is its one day (2026-11-06: the end waits empty for its suggestion).
    const to = b.to || b.from;
    for (let d = b.from; d && d <= to && out.length < 4000; d = addDaysToIso(d, 1)) out.push(d);
  }
  return [...new Set(out)].sort();
}

// The teaching week a date falls in (week 1 is the week of the start, Monday first), or null
// outside the period. Breaks don't stop the count: a week in a break still has its number.
export function teachingWeek(date: string, period: EndeavourPeriod | null | undefined): number | null {
  if (!period?.start || date < period.start || (period.end && date > period.end)) return null;
  const monday = (iso: string) => { const d = new Date(iso + 'T00:00:00').getDay(); return addDaysToIso(iso, d === 0 ? -6 : 1 - d); };
  return Math.floor((Date.parse(monday(date) + 'T00:00:00Z') - Date.parse(monday(period.start) + 'T00:00:00Z')) / (7 * 86_400_000)) + 1;
}
