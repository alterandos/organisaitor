# Overview — everything, from every app, for a question

**Status:** step 1 built 2026-10-01. Steps 2–3 are planned (see "Plan" below and BACKLOG.md "Overview — next steps").

## What it is and why

Endeavours live across every app: the tasks, calendar items, lists, notes and tracker entries for one Endeavour are spread over five sections. **Overview** is the suite-level section that answers a question across all of them, for example:

- *everything open for Endeavour X*
- *what's due in the next two weeks, from any app*
- *every dated list item in one Endeavour, sorted by date*
- *what I logged this month*

The capture of data doesn't change: tasks stay in Tasks, list items in Lists, and so on. Overview only reads and links back.

It came out of a Notes request: how to bring together related information scattered over several notes, where exam dates across subject notes was only one example. The design conversation (2026-10-01) moved it up a level. The user pointed out that a roll-up usually needs data from several apps, since Endeavours live across all of them. So roll-ups became a suite-level section, named **Overview** by the user.

It sits at the top of the left nav, above a divider, with hotkey `0`.

## Model

- **Source** (`src/overview/sources.ts`, `OVERVIEW_SOURCES`): one per kind of item, contributed by its app. It maps the app's items onto one common row, `OverviewRow`:
  - **What**: title, plus a context line (the list/tab, the parent task, the event's location).
  - **When**: the main date.
  - **Status**: `open` / `done` / `past` / `archived`.
  - **Endeavour**.
- **Query** (`OverviewQuery`, `src/types/overview.ts`):
  - which sources (none = all),
  - an Endeavour,
  - open only / open and done (archived never shows),
  - dates: any / has a date / upcoming / past, with an optional window in days,
  - a title search (every word must match),
  - sort (date either way, with undated always last; title; app),
  - grouping (none / app / Endeavour / month).
- **Overview**: a saved query with a name and icon (`overviewStore`, synced as `overviews`). The automatic **Endeavour Overview** is `endeavourOverviewQuery(id)`: every source, open items, grouped by app. It's built on the fly and never stored.

### How each app maps

| Source | When | Status | Endeavour | Notes |
|--------|------|--------|-----------|-------|
| Tasks (incl. sub-tasks) | deadline, else scheduled day | done / archived / open | `collectionId` | context = parent task |
| Events / Reminders / Deadlines | own date; **next occurrence** if repeating (within 2 years) | `past` once the (end) date has gone by; archived | `collectionId` | a task's own shadow items (`eventType`/`reminderType`/`deadlineType` `'task'`) are left out, since the task row stands for them |
| Notes | none | open / archived | effective Endeavour (own, else notebook's) | reference material, so undated |
| Lists | none | open | `List.collectionId` (new) | context = list kind |
| List items | the list's **first date field** (or the tab's own field schema's) | done when ticked/done | the list's | context = list › tab |
| Tracker entries | entry date | done | the tracker's `collectionId` | title = tracker name, context = entry notes |

**Encrypted notes and lists** are read through their views (`noteView`/`listView`, via `useNoteViews`/`useListViews`). While locked, they are never shown, only counted ("N items in locked notes or lists hidden"). Endeavour ids stay plaintext, so the count respects the Endeavour filter: each source returns `locked: (endeavourId | null)[]`, not a bare number.

## Architecture rules

- **A new app or item kind adds a source**: an entry in `OVERVIEW_SOURCES`, its key in `OverviewSourceKey`, its label in `LABELS.overview.sources`, and a case in `overview/open.ts` if it can be opened. Nothing else knows about apps.
- **Sources are pure** (a snapshot in, rows out). Only `useOverviewSnapshot` subscribes to stores and only `open.ts` touches uiStore, so `engine.test.ts` exercises everything without React.
- **Opening a row** reuses `openArtifactTarget` (the cross-app-link opener) for tasks, calendar items and lists. Notes open via `openNote`, list items via `setListsLastActive` + `openEditListItem`, and tracker entries via `setActiveTracker` + `openEditEntry`.
- **The saved definition is one jsonb blob** (`overviews.definition`), so a new query option never needs a migration. The mapper defaults every missing key.

## UI

- **`OverviewSection`**:
  - The sidebar lists **Endeavours** (active projects/lists, clicking one opens its automatic Overview) and **My overviews** (saved; ✎/✕ via the `RowHoverActions` pattern), plus "+ New overview".
  - The main panel shows the heading, a one-line summary of the query plus a count, the locked-hidden line, then collapsible groups of rows. Columns: app icon · What (+context) · When (overdue open items in red) · Status pill · Endeavour (hidden when the query is for one Endeavour).
  - Clicking a row opens the item in its app.
  - The selection is persisted (`uiStore.overviewSelection`, uiStore v2).
- **`AddOverviewModal`** creates or edits a saved Overview. It's mounted keyed by the edited id, with Ctrl+Enter and Escape as usual. N/Space/Ctrl+N and the FAB in the Overview section open it.
- **An Endeavour's Overview from elsewhere**: the ◔ button in an Endeavour's row menu in the hover Sidebar (`uiStore.openEndeavourOverview`).
- **Lists**: `AddListModal` gained an Endeavour picker. `List.collectionId` is list-level only (confirmed with the user) and written through `updateListLinks`, the plaintext-metadata path, so it never goes through re-encryption.

## Decisions (confirmed with the user 2026-10-01 unless marked)

- **Suite-level, not a Notes feature**; named **Overview**; top of the nav with a divider; hotkey `0`. Ctrl+0 is deliberately *not* bound, since it's the browser/desktop zoom reset (mine, stated to the user).
- **Custom saved Overviews in step 1**, not only the automatic Endeavour one.
- **Lists get an Endeavour, list-level only.**
- **Note-level structured records ("record types") were dropped in favour of Lists.** A list with its own typed fields *is* a record type. Notes will create list items from a selection (step 2), the way they create tasks and calendar items today.
- **Calendar layer for date fields**: when built (step 2), it is a *Lists* feature, on by default and switchable off per date field.
- **Editing from an Overview** (step 3+): editable where the value is a simple property, otherwise click through to the source.
- **Mine**:
  - Notes and lists appear as undated "open" rows, because Endeavour overviews should list them.
  - Calendar items that have gone by are `past`, not `done`.
  - A task's shadow calendar items are excluded to avoid duplicates.
  - Repeating calendar items show their next occurrence.

## Files

- **Engine and types**: `src/types/overview.ts`, `src/overview/{sources,engine,useOverviewSnapshot,open}.ts`.
- **Store**: `src/store/overviewStore.ts`.
- **Components**: `src/components/OverviewSection/`, `src/components/AddOverviewModal/`.
- **Sync, backup and trash**: migration `supabase/migrations/040_overviews.sql`; the mapper `overviewToRow`/`rowToOverview` (+ `lists.collection_id`); syncService (`SYNC_TABLES`, `TABLE_DEFS`, hydrate, upload, watch); `PERSISTED_STORAGE_KEYS`; `clearSyncedLocalData`; the Recycling Bin (`TrashableKind 'overview'`, resolver, restore target, `sourceApp 'suite'`).
- **Shell and navigation**: `NavSidebar` (top item + divider), `MobileMoreSheet`, `App.tsx` (section, header title, `nav-overview` hotkey, new-item hotkey, modal mount; the header Endeavour picker is hidden here, since Overview has its own), `AddTaskButton` (FAB), `Sidebar` (◔ Endeavour Overview), `config/apps.ts` (`overview: 'core'`), `LABELS.views.overview`/`LABELS.overview`.
- **Lists**: `List.collectionId` (types, listStore v7, `CreateListInput`, `updateListLinks`, `AddListModal`).
- **Fixed while here**: `clearSyncedLocalData` now also clears calendar **deadlines** on sign-out. They have been synced since `037` but were missed there.

## Verified

- **Automated**:
  - `src/overview/engine.test.ts`: every source's mapping (task dates and sub-task context; calendar shadow exclusion, past, next repeat; list-item date field incl. tab schema and list Endeavour; note notebook Endeavour; tracker Endeavour; locked hidden and counted under the filter), filters (upcoming/past windows, has a date, open vs all, search), sort (undated last both ways), grouping (month order, Endeavour with "none" last), and the Endeavour Overview across apps.
  - `mappers.test.ts`: the Overview round trip, and `List.collectionId`.
- **Manual**: see the implemented-features entry "Overview".

## Plan

1. **Built**: the section, the engine with sources for tasks, events, reminders, deadlines, notes, lists, list items and tracker entries, the Endeavour Overview, saved Overviews, and Lists' Endeavour.
2. **Notes → Create ▸ List item** from a selection (field guessing like tasks and calendar items; the passage keeps a link mark and the list item a "Linked from"). **List date fields on the Calendar** (default on, per field).
3. **Save a note as a template**; **Create ▸ Tracker entry**; Overviews embedded in a note; more display styles (timeline, board); editing simple properties inline.
