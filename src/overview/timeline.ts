import type { OverviewRow } from '@/types/overview';

// What the Runway and the Board draw, worked out from Overview rows: pure, so it's tested without
// React (timeline.test.ts). Rows with no `plan` (notes, lists, tracker entries) are left off both.

export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const byWhen = (a: OverviewRow, b: OverviewRow) =>
  (a.when ?? '').localeCompare(b.when ?? '') || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title);

// The Runway's three bands: Important (dated, flagged important), By date (the rest that have a
// date, soonest first) and No date (the tray: things with nothing to be done by). A row whose
// `plan.under` names a dated row that's shown goes under that row instead (`children`, by its key,
// soonest first, undated last), whatever its own date or importance: a task linked to an event
// sits under the event (agreed with the user 2026-10-23).
export interface RunwayBands { important: OverviewRow[]; due: OverviewRow[]; noDate: OverviewRow[]; children: Record<string, OverviewRow[]> }

export function runwayBands(rows: OverviewRow[]): RunwayBands {
  const planned = rows.filter((r) => r.plan);
  const isDated = (r: OverviewRow) => r.plan!.shape !== 'tray' && !!r.when;
  const anchors = new Set(planned.filter((r) => isDated(r) && !r.plan!.under).map((r) => r.key));
  const children: Record<string, OverviewRow[]> = {};
  const own: OverviewRow[] = [];
  for (const r of planned) {
    const under = r.plan!.under;
    if (under && anchors.has(under)) (children[under] ??= []).push(r);
    else own.push(r);
  }
  for (const k of Object.keys(children)) children[k].sort((a, b) => Number(!a.when) - Number(!b.when) || byWhen(a, b));
  const dated = own.filter(isDated);
  return {
    important: dated.filter((r) => r.plan!.important).sort(byWhen),
    due:       dated.filter((r) => !r.plan!.important).sort(byWhen),
    noDate:    own.filter((r) => !isDated(r)),
    children,
  };
}

// The days the Runway spans: from a little before the earliest thing shown (an overdue date, a
// start) to a little after the latest, never shorter than the zoom's window and never longer than
// its cap (things beyond run off the right edge, with their date).
export const ZOOMS = { week: { px: 96, window: 14, cap: 60 }, month: { px: 28, window: 35, cap: 180 }, quarter: { px: 9, window: 100, cap: 540 } } as const;
export type Zoom = keyof typeof ZOOMS;

export function runwayRange(rows: OverviewRow[], today: string, zoom: Zoom): { start: string; days: number } {
  const z = ZOOMS[zoom];
  let first = 0;
  let last: number = z.window;
  for (const r of rows) {
    if (!r.plan || !r.when) continue;
    for (const d of [r.when, r.plan.start, r.plan.endDate]) {
      if (!d) continue;
      const off = daysBetween(today, d);
      first = Math.min(first, off);
      last = Math.max(last, off);
    }
  }
  first = Math.max(first - 2, -z.cap / 3);
  last = Math.min(last + 3, z.cap);
  return { start: shift(today, Math.floor(first)), days: Math.ceil(last - first) + 1 };
}

export function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The Board's columns, by when each thing is (weeks run Monday to Sunday, as the calendar's do).
// Important things first in each column, then soonest.
export const BUCKETS = ['overdue', 'today', 'week', 'nextWeek', 'month', 'later', 'none'] as const;
export type Bucket = typeof BUCKETS[number];

// null: gone by and finished (done, past): history, not on the Board.
export function bucketOf(row: OverviewRow, today: string): Bucket | null {
  if (!row.when || row.plan?.shape === 'tray') return 'none';
  const off = daysBetween(today, row.when);
  if (off < 0) return row.status === 'open' ? 'overdue' : null;
  if (off === 0) return 'today';
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;   // Monday = 0
  const toSunday = 6 - weekday;
  if (off <= toSunday) return 'week';
  if (off <= toSunday + 7) return 'nextWeek';
  if (row.when.slice(0, 7) === today.slice(0, 7)) return 'month';
  return 'later';
}

export function boardBuckets(rows: OverviewRow[], today: string): Record<Bucket, OverviewRow[]> {
  const out = Object.fromEntries(BUCKETS.map((b) => [b, [] as OverviewRow[]])) as Record<Bucket, OverviewRow[]>;
  for (const r of rows) {
    const b = r.plan ? bucketOf(r, today) : null;
    if (b) out[b].push(r);
  }
  for (const b of BUCKETS) out[b].sort((a, z) => Number(!!z.plan!.important) - Number(!!a.plan!.important) || byWhen(a, z));
  return out;
}
