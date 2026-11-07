import type { Collection, DateRangeValue, DateUse, EndeavourPeriod, FieldSchema, PeriodBreak } from '@/types';
import { addDaysToIso } from '@/utils/date';
import { endeavourAncestors, parentsOf } from '@/utils/endeavourGraph';

// Named periods (agreed with the user 2026-11-07), the rules here and nowhere else. A period is a
// custom detail of kind 'dateRange' ("Teaching", "Exams", "Mid-semester break"): named, passed down
// like any detail. It's neither on nor off: what uses it says which it runs during and which it
// pauses during (DateUse). An Endeavour's use is the default for everything repeating in it (a
// subject's classes); a Schedule can choose its own. A use resolves to the EndeavourPeriod shape the
// rest of the app reads (start, end, breaks), so the classes, Work and Behind need nothing new: runs
// span from the first to the last day of the periods it runs during, a gap between them is skipped,
// and the periods it pauses during are its breaks.

type Collections = Record<string, Collection>;

export interface NamedPeriod { id: string; name: string; from: string; to: string; endeavourId: string }

export const isDateRange = (f: FieldSchema) => f.type === 'dateRange';

export function rangeOf(v: unknown): DateRangeValue {
  const r = (v ?? {}) as Partial<DateRangeValue>;
  return { from: typeof r.from === 'string' ? r.from : '', to: typeof r.to === 'string' ? r.to : '' };
}

function ownPeriods(c: Collection): NamedPeriod[] {
  const values = c.attributes?.values ?? {};
  return (c.attributes?.fields ?? []).filter(isDateRange).map((f) => ({ id: f.id, name: f.name, ...rangeOf(values[f.id]), endeavourId: c.id }));
}

// Every named period it can use: its own, then those of what it's part of (nearest first), once each.
export function periodsFor(id: string | null | undefined, all: Collections): NamedPeriod[] {
  if (!id || !all[id]) return [];
  const out: NamedPeriod[] = [];
  for (const cid of [id, ...endeavourAncestors(id, all)]) {
    const c = all[cid];
    if (c) for (const p of ownPeriods(c)) if (!out.some((o) => o.id === p.id)) out.push(p);
  }
  return out;
}

// Those it would take when made part of `parents` (the creator, before it exists).
export function periodsFromParents(parents: readonly string[], all: Collections): NamedPeriod[] {
  const out: NamedPeriod[] = [];
  for (const p of parents) for (const x of periodsFor(p, all)) if (!out.some((o) => o.id === x.id)) out.push(x);
  return out;
}

// Its own use, else the nearest above it (null: none anywhere).
export function dateUseOf(id: string, all: Collections): { use: DateUse; from: string } | null {
  const seen = new Set<string>();
  let level = [id];
  while (level.length) {
    const next: string[] = [];
    for (const cid of level) {
      if (seen.has(cid)) continue;
      seen.add(cid);
      const c = all[cid];
      if (!c) continue;
      if (c.dateUse && (c.dateUse.runs.length || c.dateUse.pauses.length)) return { use: c.dateUse, from: cid };
      next.push(...parentsOf(c, all));
    }
    level = next;
  }
  return null;
}

// A use, as the period the app reads: from the first day it runs to the last, skipping the days
// between the periods it runs during and the periods it pauses during. null when nothing it names has
// dates.
export function periodFromUse(use: DateUse, periods: readonly NamedPeriod[]): EndeavourPeriod | null {
  const byId = new Map(periods.map((p) => [p.id, p]));
  const runs = use.runs.map((id) => byId.get(id)).filter((p): p is NamedPeriod => !!p && !!p.from)
    .map((p) => ({ ...p, to: p.to && p.to >= p.from ? p.to : p.from }))
    .sort((a, b) => a.from.localeCompare(b.from));
  const pauses = use.pauses.map((id) => byId.get(id)).filter((p): p is NamedPeriod => !!p && !!p.from);
  if (!runs.length && !pauses.length) return null;
  const breaks: PeriodBreak[] = pauses.map((p) => ({ id: p.id, label: p.name, from: p.from, to: p.to && p.to >= p.from ? p.to : p.from }));
  // The days between two periods it runs during (teaching, then exams after a gap) aren't in it.
  let reach = runs[0]?.to ?? '';
  for (const r of runs.slice(1)) {
    if (r.from > addDaysToIso(reach, 1)) breaks.push({ id: `gap-${r.id}`, label: '', from: addDaysToIso(reach, 1), to: addDaysToIso(r.from, -1) });
    if (r.to > reach) reach = r.to;
  }
  return { start: runs[0]?.from ?? null, end: runs.length ? reach : null, breaks };
}

// ── The old single period, as named periods (services/periodConversion.ts, and anything that still
// writes a period: the agent's semester, a subject read from an outline) ─────────────────────────

export interface ConvertedPeriod { fields: FieldSchema[]; values: Record<string, DateRangeValue>; use: DateUse }

export function periodToNamed(period: EndeavourPeriod, labels: { dates: string; exams: string; timeOff: string }, newId: () => string): ConvertedPeriod {
  const fields: FieldSchema[] = [];
  const values: Record<string, DateRangeValue> = {};
  const use: DateUse = { runs: [], pauses: [] };
  if (period.start || period.end) {
    const id = newId();
    fields.push({ id, name: labels.dates, type: 'dateRange' });
    values[id] = { from: period.start ?? '', to: period.end ?? '' };
    use.runs.push(id);
  }
  if (period.exams) {
    const id = newId();
    fields.push({ id, name: labels.exams, type: 'dateRange' });
    values[id] = { from: period.exams.from, to: period.exams.to };
  }
  for (const b of period.breaks) {
    const id = b.id && !values[b.id] ? b.id : newId();
    fields.push({ id, name: b.label || labels.timeOff, type: 'dateRange' });
    values[id] = { from: b.from, to: b.to || b.from };
    use.pauses.push(id);
  }
  return { fields, values, use };
}
