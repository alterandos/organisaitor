import type { Collection } from '@/types';
import type { OverviewRow, OverviewSourceKey } from '@/types/overview';
import { addDaysToIso } from '@/utils/date';
import { endeavourSubtree, inEndeavourScope } from '@/utils/endeavourGraph';

// Where an Endeavour stands, for its home and the Endeavours page (docs/features/endeavours.md
// phase 2): worked out from Overview's rows (every app's items on one common row), so the home and
// an Overview can never disagree. Pure, over the rows and the collections.

// What can fall behind: something due, not something that just happened (an event in the past).
const DUE: ReadonlySet<OverviewSourceKey> = new Set(['task', 'deadline', 'reminder']);
// What's worth listing as coming up beyond this week.
const COMING: ReadonlySet<OverviewSourceKey> = new Set(['task', 'deadline', 'reminder', 'event']);

export const WEEK_DAYS = 7;
export const COMING_UP_DAYS = 30;

export function isBehind(r: OverviewRow, today: string): boolean {
  if (!DUE.has(r.source)) return false;
  return r.status === 'past' || (r.status === 'open' && !!r.when && r.when < today);
}

export interface EndeavourSummary {
  behind:   OverviewRow[];   // oldest first
  thisWeek: OverviewRow[];   // today and the next six days
  comingUp: OverviewRow[];   // after that, up to a month
  next:     OverviewRow | null;
}

const byWhen = (a: OverviewRow, b: OverviewRow) =>
  (a.when ?? '').localeCompare(b.when ?? '') || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title);

export function summarizeRows(rows: readonly OverviewRow[], today: string): EndeavourSummary {
  const weekEnd = addDaysToIso(today, WEEK_DAYS - 1);
  const monthEnd = addDaysToIso(today, COMING_UP_DAYS);
  const upcoming = rows.filter((r) => r.status === 'open' && !!r.when && r.when >= today).sort(byWhen);
  return {
    behind:   rows.filter((r) => isBehind(r, today)).sort(byWhen),
    thisWeek: upcoming.filter((r) => r.when! <= weekEnd),
    comingUp: upcoming.filter((r) => r.when! > weekEnd && r.when! <= monthEnd && COMING.has(r.source)),
    next:     upcoming[0] ?? null,
  };
}

// The rows of an Endeavour and everything part of it.
export function rowsOfEndeavour(rows: readonly OverviewRow[], id: string, collections: Record<string, Collection>): OverviewRow[] {
  const scope = endeavourSubtree(id, collections);
  return rows.filter((r) => inEndeavourScope(scope, r.endeavourId));
}
