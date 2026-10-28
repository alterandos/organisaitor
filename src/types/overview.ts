import type { CollectionId } from '@/types';

// Overview — the suite-level "show me everything like this, from every app" layer (see
// docs/features/overview.md). Each app contributes a SOURCE (src/overview/sources.ts); an
// Overview is a saved question over those sources. Not re-exported from types/index.ts, same as
// types/agent.ts and types/trash.ts.

export type OverviewId = string & { readonly _brand: 'OverviewId' };

// One per source in OVERVIEW_SOURCES. A new app contributes a new key.
export type OverviewSourceKey = 'task' | 'event' | 'reminder' | 'deadline' | 'note' | 'list' | 'listItem' | 'trackerEntry' | 'inboxItem' | 'question' | 'review' | 'rhythm';

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
  key:         string;               // `${source}:${id}` — unique across sources; a done date of a repeating item adds `@${date}`
  source:      OverviewSourceKey;
  id:          string;
  title:       string;
  when:        string | null;        // YYYY-MM-DD — the item's main date (next occurrence if it repeats)
  time:        string | null;        // HH:MM
  status:      OverviewStatus;
  endeavourId: string | null;
  context:     string | null;        // where it lives, e.g. the list's or tracker's name
  plan?:       OverviewPlan;         // how it's drawn on a timeline (the Runway, the Board); absent = left off them
}

// How a row is drawn on a timeline (components/OverviewRunway, agreed with the user 2026-10-22):
//   due    work toward a date (a task's deadline, a Deadline, a dated list item): a bar of the time
//          left, from `start` (a task's scheduled day) or today, to `when`
//   block  an event: its own span, `when` to `endDate`
//   point  a moment (a reminder, a review, a question's follow-up, a task with only a scheduled day)
//   tray   nothing to do by a date (an inbox item, a question with no follow-up): the No date tray
export interface OverviewPlan {
  shape:     'due' | 'block' | 'point' | 'tray';
  start:     string | null;          // YYYY-MM-DD: when work starts (due), if set
  endDate:   string | null;          // YYYY-MM-DD: an event's last day
  endTime:   string | null;
  important: boolean;                // the Important band at the top
  movable:   boolean;                // its date can be dragged (not a repeating item, not a review)
  // The key of the row this one sits under on the Runway, when that row is shown (a task linked to
  // an event sits under the event: utils/eventTaskLinks.ts). Generic, so any grouping can use it.
  under?:    string;
}

// How an Overview is shown: the list, the Runway (time left, on a time line) or the Board (time
// buckets). Remembered per Overview on this device (uiStore.overviewLayouts).
export const OVERVIEW_LAYOUTS = ['list', 'runway', 'board'] as const;
export type OverviewLayout = typeof OVERVIEW_LAYOUTS[number];
