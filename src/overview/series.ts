import type { OverviewRow } from '@/types/overview';

// A set of rows that are one thing done again and again (the tasks a rule makes for each date of an
// event: `OverviewRow.series`), folded into one row wherever rows are listed (the user, 2026-11-07,
// as the Tasks list already did): the next one open stands for the set, the rest are under it, shown
// on a click. Done ones stay on their own. Keeps the order given. Pure.
export function foldSeries(rows: OverviewRow[]): { shown: OverviewRow[]; folded: Map<string, OverviewRow[]> } {
  const lead = new Map<string, OverviewRow>();
  for (const r of rows) {
    if (!r.series || r.status !== 'open') continue;
    const was = lead.get(r.series.key);
    if (!was || (r.when ?? '9') < (was.when ?? '9')) lead.set(r.series.key, r);
  }
  const folded = new Map<string, OverviewRow[]>();
  const shown = rows.filter((r) => {
    if (!r.series || r.status !== 'open' || lead.get(r.series.key) === r) return true;
    const first = lead.get(r.series.key)!;
    folded.set(first.key, [...(folded.get(first.key) ?? []), r]);
    return false;
  });
  return { shown, folded };
}
