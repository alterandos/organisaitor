import { LABELS } from '@/config/labels';
import { addDaysToIso } from '@/utils/date';
import { OVERVIEW_SOURCES, SOURCE_BY_KEY, type OverviewSnapshot } from './sources';
import type { CollectionId } from '@/types';
import type { OverviewQuery, OverviewRow } from '@/types/overview';

// Runs an Overview's question against every source: which rows, in what order, in which groups.
// Pure — the section renders the result; tests call it directly.

export interface OverviewGroup { key: string; label: string; rows: OverviewRow[] }
export interface OverviewResult { groups: OverviewGroup[]; total: number; hiddenLocked: number }

// The automatic "everything for this Endeavour" Overview — built on the fly, never stored.
export const endeavourOverviewQuery = (collectionId: CollectionId): OverviewQuery => ({
  sources: [], collectionId, status: 'open', when: 'any', windowDays: null, search: '', sort: 'when-asc', groupBy: 'source',
});

export const DEFAULT_QUERY: OverviewQuery = {
  sources: [], collectionId: null, status: 'open', when: 'upcoming', windowDays: 14, search: '', sort: 'when-asc', groupBy: 'none',
};

function matches(r: OverviewRow, q: OverviewQuery, today: string): boolean {
  if (q.collectionId && r.endeavourId !== q.collectionId) return false;
  if (r.status === 'archived') return false;
  if (q.status === 'open' && r.status !== 'open') return false;
  if (q.when === 'dated' && !r.when) return false;
  if (q.when === 'upcoming') {
    if (!r.when || r.when < today) return false;
    if (q.windowDays != null && r.when > addDaysToIso(today, q.windowDays)) return false;
  }
  if (q.when === 'past') {
    if (!r.when || r.when >= today) return false;
    if (q.windowDays != null && r.when < addDaysToIso(today, -q.windowDays)) return false;
  }
  const words = q.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => r.title.toLowerCase().includes(w));
}

const SOURCE_ORDER = new Map(OVERVIEW_SOURCES.map((s, i) => [s.key, i]));

// Undated rows always go last, whichever direction dates are sorted in.
function byWhen(dir: 1 | -1) {
  return (a: OverviewRow, b: OverviewRow) => {
    if (a.when !== b.when) {
      if (!a.when) return 1;
      if (!b.when) return -1;
      return dir * a.when.localeCompare(b.when);
    }
    return dir * (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title);
  };
}

function sorter(q: OverviewQuery) {
  if (q.sort === 'title') return (a: OverviewRow, b: OverviewRow) => a.title.localeCompare(b.title);
  if (q.sort === 'source') return (a: OverviewRow, b: OverviewRow) => (SOURCE_ORDER.get(a.source)! - SOURCE_ORDER.get(b.source)!) || byWhen(1)(a, b);
  return byWhen(q.sort === 'when-desc' ? -1 : 1);
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function group(rows: OverviewRow[], q: OverviewQuery, snap: OverviewSnapshot): OverviewGroup[] {
  if (q.groupBy === 'none') return rows.length ? [{ key: 'all', label: '', rows }] : [];
  const groups = new Map<string, OverviewGroup>();
  const keyOf = (r: OverviewRow): [string, string] => {
    if (q.groupBy === 'source') return [r.source, `${SOURCE_BY_KEY[r.source].icon} ${SOURCE_BY_KEY[r.source].label}`];
    if (q.groupBy === 'endeavour') {
      const c = r.endeavourId ? snap.collections[r.endeavourId] : undefined;
      return c ? [c.id, c.name] : ['~none', LABELS.overview.noEndeavour];
    }
    return r.when ? [r.when.slice(0, 7), monthLabel(r.when)] : ['~none', LABELS.overview.whenFilter.any];
  };
  for (const r of rows) {
    const [key, label] = keyOf(r);
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
    groups.get(key)!.rows.push(r);
  }
  const list = [...groups.values()];
  if (q.groupBy === 'source') return list.sort((a, b) => SOURCE_ORDER.get(a.key as never)! - SOURCE_ORDER.get(b.key as never)!);
  // "No Endeavour" / "No date" last; months in date order; Endeavours by name.
  return list.sort((a, b) => Number(a.key === '~none') - Number(b.key === '~none')
    || (q.groupBy === 'month' ? a.key.localeCompare(b.key) : a.label.localeCompare(b.label)));
}

export function runOverview(q: OverviewQuery, snap: OverviewSnapshot, today: string): OverviewResult {
  const wanted = q.sources.length ? OVERVIEW_SOURCES.filter((s) => q.sources.includes(s.key)) : OVERVIEW_SOURCES;
  let hiddenLocked = 0;
  const rows: OverviewRow[] = [];
  for (const s of wanted) {
    const res = s.rows(snap, today);
    hiddenLocked += res.locked.filter((e) => !q.collectionId || e === q.collectionId).length;
    for (const r of res.rows) if (matches(r, q, today)) rows.push(r);
  }
  rows.sort(sorter(q));
  return { groups: group(rows, q, snap), total: rows.length, hiddenLocked };
}
