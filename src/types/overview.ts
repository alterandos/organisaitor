import type { CollectionId } from '@/types';

// Overview — the suite-level "show me everything like this, from every app" layer (see
// docs/features/overview.md). Each app contributes a SOURCE (src/overview/sources.ts); an
// Overview is a saved question over those sources. Not re-exported from types/index.ts, same as
// types/agent.ts and types/trash.ts.

export type OverviewId = string & { readonly _brand: 'OverviewId' };

// One per source in OVERVIEW_SOURCES. A new app contributes a new key.
export type OverviewSourceKey = 'task' | 'event' | 'reminder' | 'deadline' | 'note' | 'list' | 'listItem' | 'trackerEntry';

// open = still to do / upcoming; done = completed / ticked / logged; past = a calendar item whose
// date has gone by (not "done", just over); archived = sunset.
export type OverviewStatus = 'open' | 'done' | 'past' | 'archived';

export type OverviewStatusFilter = 'open' | 'all';          // 'all' still never shows archived
export type OverviewWhenFilter   = 'any' | 'dated' | 'upcoming' | 'past';
export type OverviewSort         = 'when-asc' | 'when-desc' | 'title' | 'source';
export type OverviewGroupBy      = 'none' | 'source' | 'endeavour' | 'month';

// What an Overview asks for. The same shape is used for a saved (custom) Overview and for the
// automatic per-Endeavour one, which is built on the fly (endeavourOverviewQuery).
export interface OverviewQuery {
  sources:      OverviewSourceKey[];   // [] = every source
  collectionId: CollectionId | null;   // Endeavour filter; null = any (including none)
  status:       OverviewStatusFilter;
  when:         OverviewWhenFilter;
  windowDays:   number | null;         // for 'upcoming'/'past': how far ahead/back; null = no limit
  search:       string;                // title contains (case-insensitive); '' = no filter
  sort:         OverviewSort;
  groupBy:      OverviewGroupBy;
}

export interface Overview extends OverviewQuery {
  id:        OverviewId;
  name:      string;
  icon:      string | null;
  createdAt: string;
  updatedAt: string;
}

// One item from any app, in the common shape every source maps onto.
export interface OverviewRow {
  key:         string;               // `${source}:${id}` — unique across sources
  source:      OverviewSourceKey;
  id:          string;
  title:       string;
  when:        string | null;        // YYYY-MM-DD — the item's main date (next occurrence if it repeats)
  time:        string | null;        // HH:MM
  status:      OverviewStatus;
  endeavourId: string | null;
  context:     string | null;        // where it lives, e.g. the list's or tracker's name
}
