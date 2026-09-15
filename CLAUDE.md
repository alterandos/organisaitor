# Organisaitor — Organizer App: Claude Instructions

Standing rules for all work on this codebase. Read before making any change.

---

## Project overview

The **Organizer app** — tasks, calendar, and records/tracking in one place. Built as a desktop app (Tauri v2) and PWA (Vercel), with optional Supabase cloud sync. This is the first app in the **Organisaitor suite**. BACKLOG.md in the project root is the source of truth for confirmed-but-unimplemented requirements.

### Terminology hierarchy

Use these terms consistently in code, docs, and conversation:

| Level | Term | Examples |
|-------|------|---------|
| 1 | **Suite** | Organisaitor (the whole product) |
| 2 | **App** | Organizer, Portfolio, Notes |
| 3 | **Section** | Tasks, Calendar, Records (top-level nav areas within an app) |
| 4 | **View** | Month / Week / Day; List / Heatmap / Chart (rendering modes within a section) |
| 5 | **Tool** | Tracker, Routine, Daily Planner, Mini-calendar (specific capabilities within a section) |
| 6 | **Entity** | Task, Entry, Event, Endeavour, Purpose, Tag (data objects) |

> **Pending code rename:** `activeView` / `AppView` / `setActiveView` → `activeSection` / `AppSection` / `setActiveSection`.

### Multi-app suite architecture (confirmed)

The suite deploys as a **single Vite build, single Vercel deployment, and single Tauri binary** — so users install one app for access to the whole suite. Each app is a separate package in the monorepo with hard code boundaries; route-based navigation handles app-switching (`/`, `/organizer`, `/portfolio`, `/notes`). Code-splitting ensures each app's bundle only loads when needed.

A shared platform layer (a package imported by all apps) provides:

- **Supabase auth** — single session across all apps; same Supabase project, separate domain tables
- **Purposes** — cross-app tagging entity; a Purpose can tag tasks, portfolio items, notes, and tracker entries alike
- **Cross-app event bus** — a typed in-process event emitter in the shared package (no network hop needed; everything runs in the same browser context). E.g. Portfolio emits `'create-task'`; Organizer handles it using existing store actions.
- **Shared design system** — UI primitives extracted to the shared package as the second app is built

An **app-switcher** at the root route ties the apps together.

**Implication for this repo:** keep the StorageAdapter swappable and Purposes generic. Do not embed portfolio or notes domain logic here — those belong in their own packages and communicate via the shared layer's typed event bus.

### Android build (Capacitor) — Track A + Phases 1–2 built and verified on-device

The suite is extended to Android via **Capacitor**, wrapping this same codebase (no rewrite, no separate app) — one APK/one Play Store listing, with Tasks/Calendar/Records/Lists free and Notes/Portfolio/Fitness as individually-purchasable one-time add-ons, each eventually surfaced as its own home-screen launcher icon via native `activity-alias` even though it's all one running process. Full architecture (entry points, entitlements, ads, monetization) is documented in **`docs/android/00-architecture.md`** — read that before touching `isAppEnabled()`, `settingsStore`'s theme default, or anything platform-detection-related. `docs/android/` holds the full phased build plan; see "Android build — implementation status" below (near the end of this file) for exactly what's built vs. still planned, and the full list of new/modified files. It supersedes BACKLOG.md's older "Android App — Capacitor" section for architecture decisions (that section's notification detail is still valid until `docs/android/05-notifications.md` exists).

---

## Documentation Protocol (Critical)

**This CLAUDE.md is the source of truth.** Any Claude agent should be able to rebuild this entire app from scratch using only this file + BACKLOG.md. When making ANY change:

### Every Feature Change Requires:

1. **Update this file** with:
   - What was added/changed (section + subsection)
   - Why (problem solved, requirement met)
   - File paths affected (not line numbers — those rot)
   - Component names, store actions, hotkeys, entity types added
   - Integration points (which stores/sections talk to which)

2. **Log in BACKLOG.md** if adding a new unimplemented feature or changing scope

3. **Update config/labels.ts** if user-facing strings changed

4. **Update src/types/index.ts** if new entity types or unions added

### Example: After Adding Notes Section

You should document:
- **Architecture:** Notes is a main app section, above Portfolio in nav
- **Hotkey:** `5` / `Ctrl+5` switches to notes
- **New entities:** NoteId, Note, NoteTag, NoteTagId (in src/types/notes.ts, re-exported from index.ts)
- **New store:** noteStore (Zustand, persisted to `notes-storage`, v1)
- **New components:** NotesSection (wrapper), ChronicleView (landing), NoteList (sidebar), AddNoteModal, NoteEditorPane
- **Supabase:** 008_notes_initial.sql creates notes, note_tags, cross_app_links tables
- **AddTaskButton:** now section-aware for notes (shows Add Note + Add Tag options)
- **NavSidebar:** Notes icon added to CORE_NAV_ITEMS, above Portfolio separator
- **Sync:** Phase 2 (localStorage only for MVP)
- **Known gaps:** export/import wired through suite-level button (location TBD), to be documented

### Checklist Before "Done":

- [ ] This file updated with all changes, file paths, and integration points
- [ ] BACKLOG.md updated if requirements changed
- [ ] config/labels.ts updated if new user-facing strings
- [ ] src/types/index.ts updated if new types
- [ ] Build passes (`npm run build`)
- [ ] Feature tested end-to-end
- [ ] If a future Claude reads just this file + BACKLOG.md, they understand: what exists, where code lives, how it connects, what's not done yet

---

## Tech stack

- **React 19** + **Vite 8** + **TypeScript** (strict)
- **Zustand 5** for state (`persist` middleware, localStorage)
- **CSS Modules** — no Tailwind, no inline styles except dynamic values
- **Supabase** for auth + optional cloud sync
- `nanoid` for ID generation; branded ID types for all entities
- Path alias `@/` → `src/`

---

## Sections & navigation

Nav order matches hotkey order (top to bottom in sidebar):

| Section | Key | Nav hotkey | App |
|---------|-----|------------|-----|
| Tasks | `'tasks'` | `1` / `Ctrl+1` | Organizer |
| Calendar | `'calendar'` | `2` / `Ctrl+2` | Organizer |
| Records | `'records'` | `3` / `Ctrl+3` | Organizer |
| Lists | `'lists'` | `4` / `Ctrl+4` | Organizer |
| Notes | `'notes'` | `5` / `Ctrl+5` | Notes app |
| Portfolio | `'portfolio'` | `6` / `Ctrl+6` | Portfolio app |
| Fitness | `'fitness'` | `7` / `Ctrl+7` | Fitness app |

Portfolio and Fitness appear below the `<hr>` divider in the NavSidebar (the "extras" group); all others are in `CORE_NAV_ITEMS`.

---

## Type system — key interfaces

All types live in `src/types/index.ts`.

### Branded ID types

```typescript
TaskId, TagId, CollectionId, PurposeId,
CalendarEventId, CalendarReminderId, TrackerEntryId
// pattern: string & { readonly _brand: 'X' }
```

Always cast when crossing boundaries: `id as CollectionId`.

### CollectionKind

`Collection` is the internal type; the UI calls it "Endeavour" (see `src/config/labels.ts`).

| kind | Purpose | Extra fields |
|------|---------|-------------|
| `'project'` | Completable, has deadline | `deadline`, `completed`, `completedAt` |
| `'list'` | Ongoing, never completes | — |
| `'tracker'` | Records tracker | `fieldSchema: FieldSchema[]` |
| `'routine'` | Repeating checklist | `routineTasks: RoutineTask[]`, `repeatConfig: RepeatConfig \| null` |

All collections also carry `collectionId: CollectionId | null` — meaningful for `kind='tracker'\|'routine'`, lets a tracker/routine be filed under a project/list Endeavour (same `collectionId` pattern as `Task`/`CalendarEvent`/`CalendarReminder`). `project`/`list` kind collections don't nest under another Endeavour; the field stays `null` for them in practice because `CollectionPicker` only ever offers `project`/`list` kind collections as options.

**Archiving:** `Collection.archivedAt: string | null` and `Purpose.archivedAt: string | null` — sunsetting, not deleting. Set via the Archive/Restore button in `AddCollectionModal`/`AddPurposeModal`'s edit mode, or directly from the `ManagePane` row actions. Archived items are excluded from every *selection* surface (`CollectionPicker`, `CollectionFilterPicker`/`getOrderedEndeavours`, `Sidebar`'s active lists, the purpose chip pickers in `AddTaskModal`/`AddCollectionModal`/`AddTrackerModal`/`EditTrackerPane`/`AddRoutineModal`/`EditRoutinePane`) but never deleted — existing references (a task's `collectionId`, a note's inherited Endeavour, etc.) keep working. `CollectionPicker` specifically keeps showing an already-selected archived value (`!c.archivedAt || c.id === value`) rather than hiding it outright. Hard delete (`deleteCollection`/`deletePurpose`) still exists as a separate, more destructive action, available from `Sidebar` and `ManagePane`.

### Task

Key fields beyond the obvious: `kind: TaskKind` (`'action' | 'waiting' | 'milestone'`), `timeIntensity: TimeIntensity | null` (`'low' | 'medium' | 'high'`), `parentId: TaskId | null`, `subtaskIds: TaskId[]`, `links: string[]`, `completedAt: string | null`, `scheduledAt: string | null` (YYYY-MM-DD day user plans to work on it — distinct from deadline), `scheduledTime: string | null` (HH:MM 24-hour), `calendarEventId: CalendarEventId | null` (auto-created CalendarEvent when scheduledAt is set; kept in sync on edits; deleted when task is deleted or scheduledAt cleared).

### RoutineTask (lightweight template, NOT a full Task)

```typescript
interface RoutineTask { id: string; title: string; order: number; }
```

### RoutineInstance (UI-only, never Supabase)

```typescript
interface RoutineInstance {
  routineId: CollectionId;
  date:      string;        // YYYY-MM-DD
  checked:   string[];      // RoutineTask IDs ticked
  completed: boolean;
  entryId:   TrackerEntryId | null;
}
```

Keyed by `${routineId}_${date}` in routineStore.

### FieldSchema (tracker columns)

```typescript
interface FieldSchema {
  id:       string;      // nanoid(8) — stable key in entry.data
  name:     string;
  type:     FieldType;   // 'text'|'number'|'date'|'rating'|'select'|'boolean'|'url'|'duration'
  required?: boolean;
  options?:  string[];   // for select
  unit?:     string;     // for number (e.g. "kg")
  max?:      number;     // for rating (default 5)
}
```

`duration` stores total seconds as an integer. The entry form shows h / m / s inputs.

### TrackerEntry

```typescript
interface TrackerEntry {
  id:        TrackerEntryId;
  trackerId: CollectionId;
  date:      string;                   // YYYY-MM-DD
  data:      Record<string, unknown>;  // keyed by FieldSchema.id
  notes:     string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Tag

```typescript
interface Tag { id: TagId; name: string; color: string | null; notes: string | null; }
```

### RepeatConfig

```typescript
interface RepeatConfig {
  freq:        'daily' | 'weekly' | 'monthly' | 'yearly';
  interval:    number;
  endKind:     'forever' | 'count' | 'until';
  count:       number | null;
  until:       string | null;   // YYYY-MM-DD
  daysOfWeek?: number[];        // 0=Sun…6=Sat — used by routines
}
```

---

## Stores

| Store | Persist key | Version | Persisted to | Purpose |
|-------|------------|---------|-------------|---------|
| `taskStore` | `todo-app-storage` | **v8** | localStorage + Supabase | tasks, collections, tags, purposes |
| `trackerStore` | `todo-tracker` | **v1** | localStorage + Supabase | tracker entries |
| `routineStore` | `todo-routines` | **v1** | localStorage only | daily routine instances (transient) |
| `noteStore` | `notes-storage` | **v9** | localStorage only | notes, note tags |
| `listStore` | `lists-storage` | **v4** | localStorage + Supabase | lists, list items, list types (custom types only) |
| `fitnessStore` | `fitness-storage` | **v3** | localStorage only | activities + activity types (Fitness app) |
| `scheduleStore` | `todo-schedules` | — | localStorage + Supabase | Schedule templates (recurring weekly timetables, Calendar section) |
| `uiStore` | — | — | memory only | all UI state (modals, panes, active section) |
| `settingsStore` | `todo-settings` | **v1** | localStorage | user preferences |
| `authStore` | — | — | memory only | Supabase session |

### Zustand migration rule

When adding fields to a persisted store's shape: **bump `version`** and write a **cumulative `migrate` function** that backfills defaults for every prior version. Never write non-cumulative migrations.

Current taskStore v8 migrate backfills: `routineTasks: []`, `repeatConfig: null`, `fieldSchema: []`, `tagIds: []` on collections (v5); `scheduledAt: null`, `scheduledTime: null`, `calendarEventId: null` on tasks (v6); `collectionId: null` on collections (v7); `archivedAt: null` on both collections and purposes (v8).

**Also:** when adding a brand-new persisted store (not just a field on an existing one), add its `persist` `name` to `PERSISTED_STORAGE_KEYS` in `src/config/backup.ts` — that's the one list both full-app Export/Restore implementations (`AccountPane`, `IntegrationsPane`) read from. This list drifted out of sync with reality once already (Records/Routines/Notes/Lists/Portfolio/Fitness were all silently missing from backups for a while), so treat it the same as a migration: part of shipping the store, not a follow-up.

### uiStore — key state and actions

```typescript
// Active section (pending rename: activeView→activeSection, AppView→AppSection, setActiveView→setActiveSection)
activeView: AppView               // 'tasks' | 'calendar' | 'records'
setActiveView(view)

// Endeavour focus filter (CollectionFilterPicker, header) — keyed per section so each
// of Tasks/Calendar/Records/Notes remembers its own focused Endeavour independently;
// switching sections and back preserves it. Lists/Portfolio never populate an entry
// (picker isn't shown there). Default per section is null ("All Endeavours").
activeCollectionIdByView: Partial<Record<AppView, string | null>>
setActiveCollection(id)           // writes to activeCollectionIdByView[current activeView]
selectActiveCollectionId(state)   // plain selector fn (not a hook) — reads the current section's value; use as useUIStore(selectActiveCollectionId)
endeavourPickerOpen: boolean      // CollectionFilterPicker dropdown open state (E / Ctrl+E)
openEndeavourPicker(), closeEndeavourPicker(), toggleEndeavourPicker()

// Purpose filter (PurposeFilterPicker, header, Tasks section only) — multi-select;
// reuses the pre-existing activePurposeIds/togglePurposeFilter (unchanged). Open state:
purposePickerOpen: boolean        // P / Ctrl+P
openPurposePicker(), closePurposePicker(), togglePurposePicker()

// Both picker open-states are force-closed on any setActiveView() call, so switching
// sections never leaves one stuck open in the background.

// Manage view (library administration — Endeavours/Purposes/Tags), opened by clicking
// (not hovering) the header hamburger button. Left-nav tabs, extensible — see ManageSection.
manageOpen: boolean
manageSection: ManageSection      // 'endeavours' | 'purposes' | 'tags'
openManage(section?), closeManage(), setManageSection(section)

// Modals (openModal: ModalType)
// ModalType = 'add-task'|'add-collection'|'add-purpose'|'add-tag'|
//             'add-calendar-item'|'add-tracker'|'add-entry'|'add-routine'|null
showAddTask(), showAddSubtask(parentId?), showAddCollection()
showAddPurpose(), showAddTag()
showAddCalendarItem(date?, kind?)
showAddTracker(), showAddEntry(trackerId), showAddRoutine()
closeModal()

// Task pane
openTaskPane(id), closeTaskPane()
editingTaskId: string | null

// Settings / account / integrations (slide-in panes)
settingsOpen, openSettings(), closeSettings()
accountOpen, openAccount(), closeAccount()
integrationsOpen, openIntegrations(), closeIntegrations()

// Edit panes (slide-in from right)
editTrackerOpen, editingTrackerId, openEditTracker(id), closeEditTracker()
editingEntryId, openEditEntry(id), closeEditEntry()
editingCalendarEventId, openCalendarEventPane(id), closeCalendarEventPane()
editingCalendarReminderId, openCalendarReminderPane(id), closeCalendarReminderPane()

// Records
activeTrackerId: string | null
setActiveTracker(id)
pendingTrackerId: string | null  // passed to AddEntryModal
```

---

## Supabase sync

Mappers live in `src/services/sync/mappers.ts` — `xToRow` + `rowToX` pattern.

Every new column on a persisted type needs:
1. A mapper update in `mappers.ts`
2. A migration in `supabase/migrations/NNN_description.sql`

### Migration history

| File | What it does |
|------|-------------|
| `001_initial.sql` | Base tables: tasks, collections, tags, purposes, calendar_events, calendar_reminders |
| `002_grants.sql` | RLS + grants |
| `003_tracker_entries.sql` | `tracker_entries` table |
| `004_collection_tags.sql` | `tag_ids jsonb` column on collections |
| `005_routine_fields.sql` | `routine_tasks jsonb`, `repeat_config jsonb` on collections |
| `006_tag_notes.sql` | `notes text` on tags |
| `007_event_end_date.sql` | `end_date text` on calendar_events |
| `008_notes_initial.sql` | notes, note_tags, cross_app_links tables |
| `009_task_scheduled.sql` | `scheduled_at text`, `scheduled_time text`, `calendar_event_id text` on tasks |
| `010_collection_endeavour.sql` | `collection_id text` on collections (trackers/routines → Endeavour) |
| `011_archiving.sql` | `archived_at timestamptz` on collections and purposes |
| `012_fitness_strava.sql` | `fitness_strava_connection` table (Strava OAuth tokens) — **written, not yet run against the live project** |
| `013_soft_delete.sql` | `deleted_at timestamptz` on all 7 synced tables — soft-delete tombstones so deletions propagate across devices — **written, not yet run against the live project** |
| `014_schedules_and_lists.sql` | First-ever Supabase tables for Schedules and Lists: `schedules`, `lists`, `list_items`, `list_types` (custom types only — built-ins never sync) — **written, not yet run against the live project** |
| `015_task_calendar_layers.sql` | `calendar_reminder_id text` on `tasks`; `reminder_type text not null default 'default'` on `calendar_reminders` — see "Task Calendar Items — layers" — **written, not yet run against the live project** |

### Supabase tables (summary)

- **tasks** — mirrors Task interface
- **collections** — mirrors Collection; includes `field_schema jsonb`, `routine_tasks jsonb`, `repeat_config jsonb`, `collection_id text`, `archived_at timestamptz`
- **tags** — mirrors Tag; includes `notes text`
- **purposes** — mirrors Purpose; includes `archived_at timestamptz`
- **calendar_events** / **calendar_reminders** — CalendarEvent / CalendarReminder; `calendar_reminders` includes `reminder_type text` (`'default' | 'task'` — see "Task Calendar Items — layers")
- **tracker_entries** — TrackerEntry; `data jsonb`, RLS on `user_id`
- **fitness_strava_connection** — one row per user: `athlete_id`, `access_token`, `refresh_token`, `expires_at`, `scope`; RLS on `user_id`; never read client-side directly, only through `api/strava-status.ts` / `api/strava-sync.ts`
- **schedules** — mirrors `ScheduleTemplate`; `blocks jsonb` (the full `ScheduleBlock[]`, same "commit the whole array on save" pattern as `collections.field_schema`)
- **lists** — mirrors `List`; `field_schema jsonb`, `tabs jsonb`
- **list_items** — mirrors `ListItem`; `data jsonb`, `sort_order integer` (the domain field is named `order`, renamed at the DB boundary only — `order` is a SQL reserved word)
- **list_types** — mirrors `ListType`, but **only rows for custom (non-built-in) types are ever written here** — built-ins have fixed ids (`lt-movies`, `lt-credentials`, …) and are always re-seeded locally by `listStore.ts`, same as Fitness's `BUILTIN_ACTIVITY_TYPE_SEEDS`. No `created_at`/`updated_at` (the domain `ListType` interface has neither, same as `Tag`) — merges fall back to remote-wins, tombstone-aware, same as `tags`

---

## File structure

```
src/
  App.tsx                    — root: hotkey handler, modal routing, section switcher
  types/index.ts             — all TypeScript interfaces and unions
  config/
    hotkeys.ts               — HOTKEYS[] + HOTKEY_GROUPS (single source of truth)
    labels.ts                — all user-facing strings; rename concepts here
    trackerTemplates.ts      — FieldSchema[] presets for habit/books/movies/custom
    noteTagPresets.ts        — TagPresetDef[] curated annotation tag packs (Academic preset)
    noteTemplates.ts         — NoteTemplateDef[] content-prefill templates for AddNoteModal (Blank, Meeting Minutes, Daily Journal, Book/Article Notes, Project Brief, Cornell Notes)
    activityTypes.ts         — BUILTIN_ACTIVITY_TYPE_SEEDS (Run/Hike/Walk/Ride/Swim/Strength/Yoga/Other, fixed ids) used once by fitnessStore to seed activityTypes; DEFAULT_TOP_TYPE_IDS fallback for the pill row before any activities exist
    apps.ts                  — APP_TIERS (core vs addon nav sections) + isAppEnabled(view): single gating point for add-on app availability (Portfolio, Fitness today; no real entitlement backend yet — always returns true)
    backup.ts                — PERSISTED_STORAGE_KEYS: every localStorage key any store persists to (single source of truth for full-app Export/Restore in AccountPane and IntegrationsPane — add a key here when a new persisted store is added, nowhere else)
  store/
    taskStore.ts             — tasks, collections, tags, purposes
    trackerStore.ts          — tracker entries
    routineStore.ts          — routine instances (localStorage only)
    noteStore.ts             — notes + note tags (localStorage only)
    listStore.ts             — lists + list items + list types (localStorage only)
    fitnessStore.ts          — activities (Fitness app, localStorage only)
    scheduleStore.ts         — Schedule templates (recurring weekly timetables, Calendar section, localStorage only)
    uiStore.ts               — all UI state
    settingsStore.ts         — user preferences
    authStore.ts             — Supabase session
  services/sync/
    syncService.ts           — Supabase push/pull
    mappers.ts               — xToRow / rowToX for every entity
  services/strava.ts         — client-side Strava wrapper: getStravaConnectUrl(), checkStravaStatus(), syncStrava() (calls api/strava-* edge functions, upserts results into fitnessStore)
  utils/
    date.ts                  — todayIso(), formatDate(), timeAddMinutes(), addDaysToIso(), computeLinkedEndTime() (auto-derives a linked end time from a start time — see Timepicker rebuild in Implemented features), etc.
    id.ts                    — typed nanoid wrappers
    notes.ts                 — Note/NoteTag Endeavour resolution: getEffectiveCollectionId, resolveNoteInheritedCollectionId, getNoteEffectiveCollectionId, getVisibleNoteTagIds
    collections.ts           — getOrderedEndeavours(collectionsRecord): Projects then Lists, in CollectionFilterPicker's render order; shared by the picker and the Ctrl+E digit-select hotkey
    fitnessFormat.ts         — Fitness display formatting (metric only, Phase 1): formatDistance, formatDuration, formatSpeed, computeAverageSpeedMps. Stored data is always SI (meters/seconds/m·s⁻¹); conversion happens only here, at render time
    fitnessActivityTypes.ts  — getActivityType() (graceful fallback if a type was deleted) and getTopActivityTypes() (usage-ranked, for the AddActivityModal pill row)
    links.ts                 — openExternalLink(url) (Tauri-aware: routes through @tauri-apps/plugin-opener under Tauri, @capacitor/browser under Android, window.open() in the browser/PWA) and normalizeLinkUrl(raw) (prefixes bare domains with https://); shared by TaskItem/TaskPane/Notes link UI and App.tsx's global external-link click interceptor
    haptics.ts               — Android-only guarded haptic wrappers (hapticLight/Medium/Success/Warning), no-op via Capacitor.isNativePlatform() elsewhere
    timeGrid.ts              — shared hourly time-grid layout math (buildHourLayout, minutesToY, layoutDayTimeGrid, markActiveHours), generic over item type; used by CalendarView's week/day views and ManageSchedulesPane's overlay-preview grid
    scheduleOccurrences.ts   — expandScheduleBlock() (turns one ScheduleBlock into concrete occurrence dates, honouring interval/anchor/exceptions), blocksMayConflict() + countTemplateConflicts() (the schedule manager's "N potential conflicts" hint)
    timezone.ts              — account-wide timezone: resolveTimezone, zonedTimeToUtc, utcToZonedTime, rezoneWallClock, todayIsoInZone, listTimezones
  services/timezoneMigration.ts — rezoneAllCalendarData(fromZone, toZone): re-stamps every stored wall-clock date+time when the timezone setting changes
  components/
    NavSidebar/              — left nav: section switcher, settings, account icons (desktop/web only — hidden on Android in favour of MobileNav)
    MobileNav/               — Android-only bottom tab bar: Tasks/Calendar/Records/Lists/More
    MobileMoreSheet/         — Android-only overflow sheet for MobileNav's More tab: Notes/Portfolio/Fitness/Manage Library/Settings/Account
    MobileQuickAddBar/       — Android-only bottom-anchored task quick-add (title + Due/Priority/Endeavour chips), replaces QuickAddInput on Android
    MobileCalendarQuickAdd/  — Android-only bottom-sheet quick-add for calendar events/reminders
    Sidebar/                 — hover panel (from the header hamburger, left-hand side): pinned "Manage Library" button (M/Ctrl+M) at top, then active endeavours (collections), purposes, tags — quick glance + filter/edit, not administration (see ManagePane)
    TaskList/                — main task list + collapsible Routines section
    TaskItem/                — single task row; shows subtask progress pill
    TaskPane/                — slide-in task detail/edit pane
    AddTaskModal/            — create task (basic + advanced sections)
    AddTaskButton/           — speed-dial FAB (view-aware)
    AddCollectionModal/      — create endeavour (project/list/tracker/routine)
    AddTrackerModal/         — create tracker (template picker + field config)
    AddRoutineModal/         — create routine (steps + day-of-week picker)
    AddEntryModal/           — add/edit tracker entry (dynamic fields)
    AddTagModal/             — create/edit tag (has notes textarea)
    AddPurposeModal/         — create/edit purpose
    AddCalendarItemModal/    — create calendar event or reminder
    EditTrackerPane/         — slide-in: edit tracker name/color/fields
    RecordsView/             — Records section: tracker sidebar + tracker detail + routines
    RoutineChecklist/        — routine card (steps, progress, complete button)
    CalendarView/            — month/week/day calendar; week/day use an hourly time grid (src/utils/timeGrid.ts)
    CalendarEventPane/       — slide-in: edit calendar event
    CalendarReminderPane/    — slide-in: edit calendar reminder
    AddScheduleModal/        — create/edit a Schedule (recurring weekly timetable) and its blocks
    ManageSchedulesPane/     — Schedule list/manager: active toggle, conflict hint, overlay-preview grid
    ScheduleOccurrencePopover/ — click a Schedule occurrence on the calendar: skip this date, or jump to editing the Schedule
    TimeInput/               — segmented hour/minute/AM-PM combobox respecting settingsStore.clockFormat (not a native <input type="time">, see Clock format setting below and the Timepicker rebuild entry in Implemented features), plus a quick-pick dropdown of half-hour times
    LinkHoverPreview/        — app-wide: shows a hovered link's URL bottom-left (see "Link hover preview" pattern below)
    TruncatedText/           — wraps a CSS-ellipsis-truncated name/title; shows the full text in a floating tooltip below the row on hover, only when actually truncated. Used by ChronicleView's tree node names and NoteList's note titles
    SettingsPane/            — settings slide-in; reads HOTKEYS[] dynamically
    ManagePane/              — library admin (Endeavours/Purposes/Tags): left-nav tabs + content, opened by clicking (not hovering) the header hamburger; archive/restore/delete rows. MANAGE_SECTIONS array in the file is the extension point for future tabs
    AccountPane/             — Supabase auth + account info
    IntegrationsPane/        — (stub) future integrations
    ColorPicker/             — reusable colour swatch picker
    CollectionPicker/        — CollectionPicker.tsx (single-select dropdown, used in create/edit forms) + CollectionFilterPicker.tsx (header Endeavour-focus picker, numbered for the E/Ctrl+E hotkey)
    PurposeFilterPicker/     — header Purpose-focus picker (multi-select checkboxes), Tasks section only; P/Ctrl+P hotkey
    SortBar/                 — sort controls for task list
    NoteEditor/              — Tiptap v3 rich-text editor with toolbar, zoom, table support, abstract, attributes panel
      extensions/ResizableImage.ts   — custom NodeView: resizable image with drag handle
      extensions/HeadingNumbering.ts — ProseMirror plugin: computes hierarchical heading numbers, sets data-heading-number
      extensions/Section.ts          — custom Document (content: 'section+') + Section node (content: 'block+', columns/locked attrs) + ColumnBlock/Column nodes (locked-columns layout); commands setSectionColumns / insertSectionBreak / toggleSectionLocked
      builtinTags.ts         — 6 built-in annotation tag definitions (Important/Concept/Definition/Example/Question/Reference)
    NoteEditorPane/          — slide-in pane wrapping NoteEditor for non-Notes sections
    AddNoteModal/            — quick-add note (Ctrl+Space) with hierarchical tag picker
    AddNoteTagModal/         — create notebook (area) or custom annotation tag
    EditNoteTagModal/        — edit notebook/tag name, icon, color; field schema editor for annotation tags
    EditNoteMetaModal/       — edit note metadata: tagIds (notebooks + annotation tags), accent color, pinned
    NoteTagPresetModal/      — install curated annotation tag packs; detects already-installed via presetKey
    ChronicleView/           — Notes section layout: notebook tree, note list, editor; hover-expand on notebooks
    NotesSection/            — Notes section wrapper
    ListsSection/            — Lists section: sidebar (Watchlists/Reference dividers) + card grid (watchlist) or table (reference) + tab bar
    AddListModal/            — two-step create/edit list (type picker grouped by kind → form with field schema editor + tabs editor)
    AddListItemModal/        — add/edit list item (tab picker, status picker for watchlists, dynamic fields, notes, links)
    FitnessSection/          — Fitness app: activity list (type icon, title, date, distance, moving time, avg speed) + empty state
    AddActivityModal/        — create/edit Activity: top-3-usage type pills + "More…" dropdown of all types + Customise (⚙), title, date, distance, moving time h/m → avg speed computed live, selected type's custom fields, notes, purpose chips; Escape-safe from the start
    EditActivityTypeModal/   — create/edit an ActivityType: name, icon, color, field-schema editor (mirrors EditTrackerPane); built-ins editable but not deletable
  supabase/migrations/       — SQL migration files (run in order)
```

---

## Component patterns

### Modals

All new modals: overlay div + bottom-sheet on mobile / centred card at ≥520px. Follow `AddTaskModal` / `AddTrackerModal` as reference.

**Structural rule, not just visual:** the centred/bottom-sheet card (`styles.modal`) must be rendered as a DOM **child** of the overlay div (`<div className={styles.overlay}><div className={styles.modal}>…`), never a sibling. The centring is real flexbox (`.overlay { display:flex; align-items:center; justify-content:center }`), which only positions the overlay's own children — a sibling `.modal` gets no centring at all and instead renders whatever `position` its own CSS gives it in ordinary document flow whenever that happens to be `static`. **Caught as a real bug**: `CalendarImportReviewModal` was first built with `.overlay`/`.modal` as siblings inside a fragment; it worked by accident while nested inside `IntegrationsPane`'s narrow slide-in panel (looked like "the import pane is trapped in the sidebar, too small" — the actual reported symptom) and broke a different way once portaled to `document.body` (rendered at the bottom of the full page, not centred) — both symptoms were downstream of the same structural mistake, not two different bugs. Fixed by nesting `.modal` inside `.overlay` like every other modal in the codebase, and switching the overlay's backdrop-click-to-close handler from `onClick` to `onMouseDown` with an `e.target === e.currentTarget` guard (matching `AddCalendarItemModal`'s established pattern) — necessary once `.modal` is a real child, since a click on the modal content now bubbles up through the overlay and would otherwise incorrectly close it.

**Escaping an ancestor's `transform`:** a modal that needs to render centred in the full viewport, but whose trigger lives inside a component with its own CSS `transform` (including an *identity* `transform` left behind by a slide-in `@keyframes` animation, e.g. `IntegrationsPane`'s `.pane`) — cannot just use `position: fixed`. Per the CSS Transforms spec, any ancestor with a `transform` becomes the **containing block** for `position: fixed` descendants, so the "viewport-fixed" modal ends up sized/positioned relative to that transformed ancestor's box instead of the real viewport (this looks exactly like "the modal is stuck inside the sidebar, too small/narrow" — which is genuinely a distinct problem from the sibling/child structural bug above, both of which hit `CalendarImportReviewModal` at once). Fix: render the modal via `createPortal(<...>, document.body)` from `react-dom` (already an established pattern in this codebase — see the Notes table-hover-controls in `NoteEditor.tsx`) so its DOM position is a direct child of `<body>`, immune to any ancestor's transform. Z-index still applies normally after a portal — pick a value higher than whatever it needs to render above (see the z-index tier notes elsewhere in this file for precedent; `CalendarImportReviewModal` uses `110`/mounted-under-`.overlay`, one tier above `IntegrationsPane`'s own `100`/`101`).

### Edit panes (slide-in from right)

Follow `EditTrackerPane`. Rendered at the App root level alongside the main content. Triggered by `openEditTracker(id)` / `openEditEntry(id)` etc. in uiStore.

### Escape key — universal close rule

**Every modal and slide-in pane must be closable with the Escape key.** Add a `keydown` listener in a `useEffect` that calls the close action when `e.key === 'Escape'`. This applies to: all Add*/Create modals, all Edit panes, the task pane, the day-overflow pane, and any future interactive overlay. No exceptions.

### Ctrl+Enter — universal submit rule for creation panes

**Every Add*/Create modal with a primary save action must submit on Ctrl+Enter (and Cmd+Enter on Mac).** This matters specifically because a plain `Enter` inside a `<textarea>` (e.g. a Notes field) always inserts a newline and never submits the surrounding `<form>` — without an explicit Ctrl+Enter binding, there's no keyboard-only way to save while focus is in a multi-line field. The established pattern (already in `AddTaskModal`, `AddCalendarItemModal`, `AddTrackerModal`, `AddWatchlistItemModal`, `AddRoutineModal`, `AddEntryModal`, `AddInvestmentPurposeModal`, `AddPortfolioTagModal`, `AddNoteModal`, `AddNoteTagModal`, `AddListModal`, `AddListItemModal`, and added to `AddCollectionModal`/`AddPurposeModal`/`AddTagModal` in this pass):

```tsx
const formRef = useRef<HTMLFormElement>(null);
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { /* close */ }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [/* close-action deps */]);
// ...
<form ref={formRef} onSubmit={handleSubmit}>
```

`requestSubmit()` (not calling `handleSubmit` directly) is the important detail — it goes through the DOM form submission machinery, so it always invokes whatever `onSubmit` is bound in the **current** render, respects `disabled`/native validation the same way clicking the visible submit button would, and can never fire a stale closure over old form state. For a component with no `<form>` at all (`BulkUploadWatchlistModal`, `EditActivityTypeModal` — a plain "click this button" primary action instead of a submit), call the save function directly instead, but then either list every piece of state that function reads in the effect's dependency array, or drop the dependency array entirely so the effect re-subscribes every render — a form-less handler captured in a stale-dependency effect will silently call an old closure with outdated field values on Ctrl+Enter (a real subtlety, not a hypothetical one — caught and fixed in `EditActivityTypeModal` during this work).

**Deliberately not wired**: `NoteTagPresetModal` (a picker of many independent "Install" actions, no single primary save target) and `CalendarImportReviewModal` (a multi-row review/import step, same reasoning) — Ctrl+Enter has no unambiguous meaning in either.

### Speed-dial FAB (`AddTaskButton`)

Section-aware. In the Records section it shows options: Tracker, Entry (only when a tracker is selected), Routine. Clicking each calls the corresponding `showAdd*()` uiStore action.

### RoutineChecklist

- Calls `getOrCreateInstance(routineId, todayIso())` on render — creates a blank instance if none exists for today.
- `handleComplete`: calls `addEntry()` (trackerStore) to create a TrackerEntry, then reads it back from `trackerStore.getState().entries`, passes `entryId` to `completeRoutine()`.
- Complete button is disabled when total > 0 and not all steps checked.

### TaskItem subtask pill

Shows `{subtaskDone}/{subtaskTotal}` as a styled pill (border-radius: 99px) when `subtaskIds.length > 0`.

---

## Hotkeys rule

**Whenever a hotkey is added or changed**, make exactly two edits:

1. **`src/config/hotkeys.ts`** — add/update the `HotkeyDef` entry. SettingsPane reads this file dynamically; no third edit needed.
2. **The handler** — add/update it in **`src/App.tsx`'s central `keydown` useEffect** for anything global or cross-section (nav digits, `N`/`Space`, `S`, `Esc`, `E`/`Ctrl+E`, etc.). But if the hotkey only makes sense while one specific section/component is mounted (arrow-key navigation inside Notes' Chronicle tree, Calendar's `←/→`/`PgUp/PgDn`/`Tab` period-and-view navigation, a note's `Ctrl+PgUp/PgDn` tab cycling, a list's `Ctrl+PgUp/PgDn` tab cycling), put the listener **in that component's own `useEffect`** instead — it naturally only exists while the component is mounted, so there's no `activeView` check to remember or forget. Register it in `hotkeys.ts` either way; only the handler's location differs.

Do **not** hardcode hotkey labels in `SettingsPane.tsx` or anywhere else.

**Adding a new hotkey handled centrally in `App.tsx`** (i.e. anything that belongs in step 2's first case above): give its `HotkeyDef` a unique, permanent `id` and `customizable: true` if it's a plain global toggle/navigation-style action reassignable without side effects, then dispatch it via `matchesHotkeyId(e, 'your-id')` (`src/store/hotkeyOverridesStore.ts`) instead of a hardcoded `e.key === '...'` check — this is what makes it show up with a click-to-rebind affordance in Settings. A component-local hotkey (step 2's second case) is currently **not** wired to read overrides at all — see "Customizable hotkeys" in the Implemented features list for why that's a deliberate scope decision, not an oversight. Mark a hotkey `protected: true` (no `customizable`) instead if it must never be reassigned (only `Esc` today).

### Current hotkeys

| Primary | Secondary | Action |
|---------|-----------|--------|
| `1` | `Ctrl+1` | Tasks section |
| `2` | `Ctrl+2` | Calendar section |
| `3` | `Ctrl+3` | Records section |
| `4` | `Ctrl+4` | Lists section |
| `5` | `Ctrl+5` | Notes section |
| `6` | `Ctrl+6` | Portfolio section |
| `7` | `Ctrl+7` | Fitness section |
| `N` | `Space` | New item (section-aware, see below) — `Ctrl+N` also works |
| `S` | — | Toggle settings |
| `Esc` | — | Close panel / modal |
| `E` | `Ctrl+E` | Expand the Endeavour filter (header) — Tasks/Calendar/Records/Notes only |
| `0`-`9` | — | While the Endeavour filter is expanded: select an Endeavour by its position (0 = All) |
| `P` | `Ctrl+P` | Expand the Purpose filter (header) — Tasks section only |
| `M` | `Ctrl+M` | Open/close the Manage view (Endeavours / Purposes / Tags) |
| `Backspace` | — | Go back to the previous app section (up to 6 deep) — `uiStore.sectionHistory`/`navigateBack()` |
| `←`/`→` | `PgUp`/`PgDn` | Previous/next period — month, week, or day, matching the current view (Calendar section only, local to `CalendarView.tsx`) |
| `Tab` | `Shift+Tab` | Cycle Month → Week → Day view; Shift+Tab cycles in reverse (Calendar section only, local to `CalendarView.tsx`; suppressed while any calendar modal/pane is open so normal focus-tabbing still works there) |
| `→` | — | Expand selected notebook (Notes section only) |
| `←` | — | Collapse selected notebook (Notes section only) |
| `PgUp`/`PgDn` | — | Navigate the tree/list column, same as ↑/↓ (Notes section only) |
| `Ctrl+Tab` | `Ctrl+PgUp`/`Ctrl+PgDn` | Cycle between the open note's tabs, `Ctrl+Shift+Tab`/`Ctrl+PgUp` reverses (Notes editor focused, local to `NoteEditor.tsx`) |
| `Ctrl+T` | — | New tab, prompting for a name (Notes editor focused, local to `NoteEditor.tsx`) |
| `` Ctrl+` `` | — | Move keyboard focus between the tree/list nav columns and the editor (Notes section only; previously `Ctrl+Tab`, moved once `Ctrl+Tab` became the tab-cycle key above — see "Notes/Lists keyboard nav" below) |
| `Ctrl+L` | — | Turn the selection into a link (opens a URL popover); with no selection, opens a "New link" pane (text + URL) instead (Notes editor) |
| `Ctrl+click` | — | On a link in the Notes editor: select its text instead of opening it (plain click opens) |
| `Ctrl+−` | — | Zoom out in Notes editor (without Shift) |
| `Ctrl+=` | — | Zoom in in Notes editor (without Shift; Ctrl+Shift+= is superscript) |
| `Ctrl+scroll` | — | Zoom in/out in Notes editor (non-passive wheel listener) |
| `↑`/`↓` | — | Navigate between lists (Lists section only, local to `ListsSection.tsx`; only when the sidebar nav area has focus — see "Notes/Lists keyboard nav" below) |
| `` Ctrl+` `` | — | Move focus between the lists sidebar and the list's content area (Lists section only, local to `ListsSection.tsx`) |
| `Ctrl+Tab` | `Ctrl+PgUp`/`Ctrl+PgDn` | Cycle between the current list's tabs, `Ctrl+Shift+Tab`/`Ctrl+PgUp` reverses (Lists section only, local to `ListsSection.tsx`; only when the selected list actually has tabs) |
| `Ctrl+T` | — | New tab, prompting for a name (Lists section only, local to `ListsSection.tsx`; the only runtime way to add a list's very first tab, so unlike the cycle hotkey above this one does NOT require the list to already have tabs) |

### New-item hotkey (N / Space / Ctrl+N) — section-aware behaviour

- Tasks section → `showAddTask()`
- Calendar section → `showAddCalendarItem()`
- Records section + tracker selected → `showAddEntry(activeTrackerId)`
- Records section + no tracker → `showAddTracker()`
- Lists section → `showAddList()`
- Fitness section → `showAddActivity()`

---

## Labels / terminology

All user-facing strings that might be renamed are in `src/config/labels.ts`. "Collection" is the internal name; the UI shows "Endeavour". Don't hardcode these strings elsewhere.

---

## Coding conventions

- **No comments** unless the *why* is non-obvious (hidden constraint, workaround, subtle invariant).
- **No abstractions** beyond what the task requires. Three similar lines beats a premature helper.
- **No error handling** for scenarios that can't happen. Trust Zustand and framework guarantees.
- Prefer editing existing files to creating new ones.
- CSS: all styles in `.module.css` files. Class names in camelCase.
- Dynamic values (e.g. `style={{ background: color }}`) are the only acceptable inline styles.

---

## Things that must be consistent across the app

- **Tags, purposes, and collections can always be associated with each other.** When adding a new entity type that can be filtered or grouped, wire it to the existing tag/purpose system.
- **Trackers and routines** both live under the Records section.
- **Routines** live in the Records section only (RecordsView sidebar + RoutineChecklist cards) — deliberately not surfaced in the Tasks section. (They used to appear in a collapsible "Routines" section at the top of the Tasks list; that was removed as unintended — see BACKLOG.md for proposed ways to bring routines into the Tasks section deliberately.)
- **All new modals** follow the overlay + bottom-sheet (mobile) / centred (≥520px) pattern.
- **Edit panes** (slide-in from right) follow the `EditTrackerPane` pattern.
- **Trackers, routines, projects, and lists** can all be associated with tags and purposes. Trackers and routines can additionally be filed under an Endeavour (`Collection.collectionId`).
- **Notes and notebooks can be associated with an Endeavour.** `Note.collectionId` and `NoteTag.collectionId` (notebooks only, `kind='area'`) follow the same `CollectionId | null` pattern as `Task.collectionId` / `CalendarEvent.collectionId`; a note tagged into a notebook inherits that notebook's Endeavour by default (see `resolveInheritedCollectionId` in `noteStore.ts`). Annotation tags (`kind='tag'`) do not get a `collectionId` — like the app-wide `Tag` entity, they're cross-cutting labels, not containers.
- **Endeavours and Purposes can be archived (sunset), not just deleted.** `archivedAt: string | null`. When adding a new entity type that gets its own edit modal and can meaningfully go stale (as opposed to cross-cutting labels like Tags), consider whether it needs the same Archive/Restore treatment rather than only hard delete. Any new "pick one of these" selector for Endeavours/Purposes must filter archived ones out (existing ones already do — see `CollectionPicker`, `getOrderedEndeavours`).
- **Every modal and slide-in pane closes on Escape — verified, not assumed.** An audit (see Implemented features) found five that silently didn't. When adding a new one, copy the `useEffect` keydown pattern from a component that already has it rather than skipping it "for now."

---

## Notes App — Architecture & Data Model

### Vision

Notes is a flexible, intelligent knowledge base that serves as the central hub for detailed notes on everything (courses, research, work, ideas) while seamlessly linking to all other apps (Tasks, Calendar, Portfolio, Records). Core differentiator: **effortless organization and discoverability** — users find anything related to a topic without rigid folder structures.

**Key insight:** Hierarchical AREAS (University > Subject > Topic) + cross-cutting TAGS (major-impact, important-concept, reference) solve the fundamental tension between organization and flexibility. Areas are mutually-exclusive containers; tags cut across them.

### Data Model

**Core entities** (see BACKLOG.md for full TypeScript interfaces):

| Entity | Purpose | Key fields |
|--------|---------|-----------|
| **Note** | Content unit | id, title, content (rich-json), tagIds[], noteTypeId?, version, description |
| **Tag** | Hierarchical cross-cutting label | id, name, parentTagId, tagTypeId, color, icon, order |
| **TagType** | Metadata for tag categories | id, name, isBuiltIn (e.g., "definition", "reference") |
| **NoteType** | Schema for structured notes | id, name, schema (fields array, for "definition" type: term required, definition optional) |
| **cross_app_links** | Single source of truth for all linking | source_type/id, target_type/id, link_type (normalized, no denormalized arrays on entities) |

**Key design decisions:**

- **Content format:** Rich text JSON (not Markdown) — supports images, tables, formatted text, inline metadata; tags move with text on edits
- **Links:** Normalized `cross_app_links` table (not denormalized arrays) — single source of truth, clean cascades, no sync conflicts
- **Tagging:** Automatic parent tag propagation — create a note in "University > Subject X" and it auto-gets both tags
- **Versions:** Every Note has `version: 1` for future schema migrations
- **Purposes:** Notes integrate with shared suite Purposes (like Tasks do) for cross-app filtering

### Architecture

**Package structure:** `packages/notes/` (separate package, like Portfolio)

**State management:**
- Zustand store (`noteStore`) + localStorage + Supabase sync
- Mappers in `services/sync/mappers.ts`: `noteToRow`, `rowToNote`, `tagToRow`, etc.
- **Sync strategy:** Event bus (best-effort, in-process); reconciliation service runs on app load to repair stale links

**Cross-app integration:**
- Event bus: `emit('note:linked-to-task')`, Organizer listens and updates Task
- `cross_app_links` table: source of truth for all linking (Notes queries it to show backlinks, etc.)
- **Delete cascade:** When a Task is deleted, `cross_app_links` rows referencing it are deleted (Supabase cascading FK)
- **Offline/Online:** For Phase 1, simple approach (sync on app load). Phase 2+ may add queued operations if needed.

**Search strategy:**
- Full-text search on `Note.content` using Supabase PostgreSQL FTS
- Can upgrade to Meilisearch/Elasticsearch in Phase 2 if performance needs it
- Search + tag filters use AND logic (show notes matching search AND all selected tags)
- Multiple search terms use OR logic within the search box (e.g., "python OR javascript")

### UI / UX

**Landing page:**
- Grid of favorite/pinned areas (root tags)
- Recent notes list
- Quick-add button (or Ctrl+Space)
- Search bar

**Main notes view (after clicking an area):**
- Left sidebar: tag tree (collapsible, shows all children)
- Center: note list filtered by selected tags
- Right panel: note editor (slides in on selection)
- **Filter logic:** Click a tag → adds it to filter. Clicking a parent tag shows notes tagged with parent OR any child (OR logic on hierarchy).

**Quick-add modal (Ctrl+Space):**
- Text input for title/content
- Tag picker (searchable autocomplete; for now assuming small tag count)
- "Save & close" / "Save & edit" / "Save & continue" options
- Automatically applies parent tags (if quick-adding from a specific area)

**Inline tagging (Phase 2+):**
- User selects text in note editor, hits Ctrl+Space
- Popover appears with tag autocomplete
- Selected text is highlighted with a subtle color (user-configurable in settings, per tag type)
- Multiple tags per passage: each tag is a separate highlight color (or combined indicator)
- Tags move with text during subsequent edits (stored in rich-json TextNode structure)

**Per-level visual design (Phase 2+):**
- Subsections have parent-child relationships (unlimited depth, sensible ~20 level limit)
- Each level can have custom visual design (tab, collapsible section, visual divider, etc.)
- User can customize how each level looks

### Terminology

When working on Notes:
- **Area** = root-level tag (e.g., "University", "Research Project") — user's top-level organizational container
- **Subject** = mid-level tag (e.g., "Computer Science") — child of area
- **Topic** = leaf-level tag or specific note (e.g., "Polymorphism") — child of subject
- **Tag** = cross-cutting label (e.g., "major-impact", "important-concept", "definition") — cuts across multiple areas
- **Note** = content unit (text + metadata)
- **Backlink** = reverse reference (this note is linked FROM 3 other notes)
- **Inline tagging** = tagging specific passages/text within a note (Phase 2+)

### Hotkeys (planned for Phase 1+)

- `Ctrl+Space` (or `Cmd+Space` on Mac) — quick-add note or inline-tag text in editor
- `S` — settings (shared suite hotkey)
- `Esc` — close modals/inline editors

### Known non-decisions for future (documented in BACKLOG.md)

- **Reminders:** Create reminders in Notes app, handle in Calendar app via event bus
- **Attachments:** Reserve space in data model; S3 or Supabase Storage integration in Phase 2+
- **Export formats:** PDF/Markdown/HTML export in Phase 4; for now, just display
- **Mobile:** Can read notes on mobile; editing is desktop-first for Phase 1
- **Audit trail:** Not needed for MVP; versioning is in place for future
- **Voice notes:** Phase 4+ feature
- **Collaborative editing:** Future; currently single-user focus

---

## Implemented features (as of last commit)

- [x] Task CRUD with subtasks, priority, deadline, kind, timeIntensity, links, notes
- [x] **Task "Scheduled" date**: `scheduledAt` (YYYY-MM-DD) + `scheduledTime` (HH:MM) fields on Task — distinct from deadline; auto-creates a CalendarEvent when set; event kept in sync on edits (title, date, time); event deleted when task is deleted or scheduledAt cleared; field visible in AddTaskModal (below Due date row) and TaskPane; taskStore bumped to v6 with cumulative migration; Supabase migration 009_task_scheduled.sql adds three columns
- [x] **Calendar entry kinds, clarified — deadline (`kind:'task'`) vs scheduled (`kind:'event'`) are intentionally different, now made visually legible**: an audit found that `Task.deadline` renders as a first-class `kind:'task'` calendar item (opens `TaskPane`, gets completion styling) while `Task.scheduledAt` renders as a `kind:'event'` via its auto-created shadow `CalendarEvent` (opens `CalendarEventPane`, no completion styling) — raising the question of whether this was a bug. **Resolved as intentional, not a bug**: a scheduled task genuinely blocks calendar time the way a real event does (that's the whole point of giving it a time), so it correctly stays a `CalendarEvent`, not a same-shaped `task` item. What *was* missing was any visible sign that a given event is task-derived. Fixed two ways: (1) `CalendarView.tsx`'s `itemsByDate` builder now sets an event's `typeIcon` to `🕐` whenever any task's `calendarEventId` points at it (a `Set<CalendarEventId>` built once per render from `Object.values(tasks)`, checked after the pre-existing birthday-🎉 check) — reuses `typeIcon`, the same generic field already driving the birthday icon and the Schedule 🗓, so every view (month/week/day/day-pane) picks it up for free with no per-view code; (2) `CalendarEventPane.tsx` looks up `Object.values(tasksRecord).find(t => t.calendarEventId === event.id)` and, when found, renders a `🕐 Linked task: <title>` chip (`.linkedTaskChip`) above the title input — clicking it calls `closePane()` then `openTaskPane(task.id)`, a clean swap (not a stacked pane) straight to the real task. The emoji scheme (❗ deadline, 🕐 scheduled, ⏳ waiting) deliberately reuses `TaskItem.tsx`'s existing pill icons rather than inventing new ones, so the task list and the calendar read consistently. `kind:'waiting'` tasks have no dedicated date field yet — they use the same `deadline`/`scheduledAt` as any other task kind, so a distinct "waiting since" calendar indicator is a future schema addition, not something wired up now.
- [x] Collections (Endeavours): project, list, tracker, routine
- [x] Tags (with notes field) and Purposes — filter sidebar
- [x] Calendar section (month/week/day views) with events and reminders, repeat config
- [x] Records section: custom trackers with dynamic field schema
- [x] Tracker templates: habit, books, movies, custom
- [x] Tracker entry add/edit/delete with dynamic form
- [x] EditTrackerPane: edit tracker name, color, purposes, tags, field schema
- [x] EditRoutinePane: edit routine name, color, purposes, tags, steps, schedule; delete with confirmation
- [x] Routines: create with step list and day-of-week schedule
- [x] RoutineChecklist: step toggling, completion → TrackerEntry creation
- [x] Routine history: clicking a routine in the Records section sidebar shows today's checklist + past instance history table
- [x] Speed-dial FAB (AddTaskButton): section-aware, shows tracker/entry/routine options in Records section
- [x] **Trackers/routines can belong to an Endeavour**: `Collection.collectionId: CollectionId | null` (meaningful for `kind='tracker'|'routine'`; `project`/`list` kind collections don't use it); `CollectionPicker` field added to `AddTrackerModal`/`EditTrackerPane` and `AddRoutineModal`/`EditRoutinePane` (placed after Color, before Purposes, matching the other widgets); defaults to the Records section's currently focused Endeavour on create (same pattern as `AddTaskModal`); `RecordsView` filters both sidebar lists (trackers, routines) to the focused Endeavour, with "No trackers/routines in this Endeavour" empty-state copy; taskStore bumped to v7 for this (superseded by v8, see Archiving below), Supabase migration `010_collection_endeavour.sql` adds `collection_id text`
- [x] **Endeavour focus is per-section**: `uiStore.activeCollectionIdByView: Partial<Record<AppView, string | null>>` replaces the old single `activeCollectionId` — Tasks/Calendar/Records/Notes each remember their own focused Endeavour independently; switching sections and back preserves it (in-memory only, like the rest of `uiStore` — does not survive a page reload; see BACKLOG.md "uiStore persistence" for the deferred plan). Read via the exported selector `selectActiveCollectionId(state)` (a plain function, not a hook — call as `useUIStore(selectActiveCollectionId)`, or `selectActiveCollectionId(useUIStore.getState())` inside non-reactive code); write via `setActiveCollection(id)`, unchanged. Lists/Portfolio never populate an entry since `CollectionFilterPicker` isn't shown there
- [x] **E / Ctrl+E — expand Endeavour filter, then 0-9 to pick**: `CollectionFilterPicker` (header) is now a controlled dropdown (`uiStore.endeavourPickerOpen` + `open/close/toggleEndeavourPicker()`) instead of pure CSS `:hover` — click-to-toggle and hover-to-preview both still work, but the open state is now programmable so a hotkey can drive it. `E` (primary) / `Ctrl+E` (secondary — both resolve to the same `e.key`, so one check handles both) toggles it open, guarded by the same `isTyping`/`activeView !== 'portfolio' && activeView !== 'lists'` conditions as the picker's visibility; while open, digit keys `0`-`9` are intercepted centrally in `App.tsx`'s keydown handler (before the section-switch hotkeys, since both live on plain digit keys) — `0` clears to "All Endeavours", `1`-`9` pick the Nth Endeavour in `getOrderedEndeavours()` order (Projects then Lists — `src/utils/collections.ts`, shared by the picker's numbered badges and this handler so the number on screen always matches what pressing it does), then closes the picker. `Escape` closes it (handled locally in `CollectionFilterPicker`, not centrally, since nothing else currently binds Escape at the App level). While the picker is open, all other keys are swallowed by the App-level handler to avoid it and the section-switch hotkeys racing on the same digit keys
- [x] **P / Ctrl+P — Purpose filter, multi-select**: replaces the old always-visible `PurposeFilterBar` (horizontal chip row below the Tasks heading, now deleted) with `PurposeFilterPicker` — a header dropdown next to `CollectionFilterPicker`, Tasks section only (matches where `activePurposeIds` actually has an effect — only `TaskList` reads it). Same controlled-dropdown pattern as the Endeavour picker (`uiStore.purposePickerOpen` + `open/close/togglePurposePicker()`), but multi-select: clicking a purpose toggles it via the pre-existing `togglePurposeFilter` action and the dropdown stays open (checkboxes, not a picklist) so several can be toggled in one visit; closes via outside-click or Escape (handled locally), not on each selection. Trigger label reads "All Purposes" / the one selected name / "N Purposes". No digit-select (not requested — P/Ctrl+P only opens/closes it)
- [x] **Both filter dropdowns close on section switch**: `uiStore.setActiveView()` now force-resets `endeavourPickerOpen`/`purposePickerOpen` to `false` on every call, since they're transient UI state, not section-scoped state — without this, opening a picker then switching sections via a hotkey would leave it stuck open in the background and it would reappear pre-opened when the user returned to a section where it's shown
- [x] **Archiving (sunset, not delete) for Endeavours and Purposes**: `Collection.archivedAt: string | null` and `Purpose.archivedAt: string | null`; Archive/Restore button added to `AddCollectionModal` and `AddPurposeModal`'s edit mode (footer, left of Cancel/Save, with an "Archived" badge next to the modal title when applicable); archived items are filtered out of every selection surface (`CollectionPicker`, `getOrderedEndeavours`, `Sidebar`'s active lists, the purpose chip pickers across `AddTaskModal`/`AddCollectionModal`/`AddTrackerModal`/`EditTrackerPane`/`AddRoutineModal`/`EditRoutinePane`) but kept fully intact — nothing referencing an archived item breaks, and `CollectionPicker` specifically still shows an already-selected archived value rather than blanking it. taskStore bumped to **v8**; Supabase migration `011_archiving.sql` adds `archived_at timestamptz` to both tables. Tags were deliberately not given archiving — only Endeavours and Purposes, per the request that introduced this
- [x] **ManagePane — library administration view**: opened via `M`/`Ctrl+M` (toggles), or the **"Manage Library" button pinned at the top of the hover `Sidebar`** — left-nav tabs (`MANAGE_SECTIONS` array: Endeavours / Purposes / Tags, each just `{id, label, icon}` — add an entry + a render branch to extend) and a content area listing that tab's items with Edit/Archive/Delete row actions (`ManageRow`, shared across all three tabs); Endeavours and Purposes additionally get a collapsed-by-default "Archived (N)" group with Restore in place of Archive. Edit still opens the existing `AddCollectionModal`/`AddPurposeModal`/`AddTagModal` in edit mode (via the pre-existing `openEditCollection`/`openEditPurpose`/`openEditTag` actions) rather than duplicating form UI. Explicitly scoped small for now but built to extend: adding a new administrable entity later means one `MANAGE_SECTIONS` entry, one new section component, and one render branch — no layout rework. `ManagePane`'s overlay uses `z-index: 100` (the "major overlay" tier shared with `SettingsPane`/`TaskPane`/`IntegrationsPane`) specifically so it always sits above the `Sidebar` (`z-index: 50`)
  - **Fixed while building this:** the header hamburger button was originally also wired with `onClick={openManage}`, but hovering it opens `Sidebar` (`onMouseEnter`), which visually and pointer-wise covers the hamburger before a click can land — so clicking it to open Manage didn't reliably work. Removed that `onClick` entirely (hamburger now only opens the hover `Sidebar`, as before) and replaced it with the in-sidebar button + hotkey, both unaffected by the hover-cover problem
- [x] **Escape-key audit**: found and fixed five modals/panes that silently violated the "every modal closes on Escape" rule (see Coding conventions) because they were missing the listener entirely: `AddCollectionModal`, `AddPurposeModal`, `AddTagModal`, `EditTrackerPane`, `EditRoutinePane`. All now follow the standard pattern used everywhere else
- [x] Tag notes textarea
- [x] Task links field (in AddTaskModal advanced section)
- [x] Subtask progress pill on TaskItem
- [x] Settings pane: per-section display toggles + dynamic hotkey table
- [x] Hotkeys: 1/2/3 (+ Ctrl variants), Space/Ctrl+N (new item), S (settings), Esc
- [x] Multi-day calendar events: end date picker in AddCalendarItemModal + CalendarEventPane; spanning pills in month view (week-block layout with spanRow above day cells) and week view (weekSpanRow above columns); multi-day events appear normally in day/mobile views
- [x] **Desktop week view — real hourly time grid** (`CalendarView.tsx`): replaced the old agenda-list week view (items just stacked as pills per day column, no time-of-day positioning at all) with an actual time grid, matching how Google/Outlook/Apple Calendar look — items are vertically positioned and sized by their actual start/end time, with side-by-side layout for overlapping items.
  - **Hour compression, the actual "elegant" ask**: hours with nothing scheduled *anywhere in the visible week* collapse to a thin row (`HOUR_HEIGHT_EMPTY = 18px`); hours with content anywhere expand to full height (`HOUR_HEIGHT_ACTIVE = 60px`). This is a **shared row template across all 7 day columns** — computed from the union of activity across the whole week, not per-day — so the columns stay vertically aligned (a day with nothing at 9am still gets a full-height 9am row if some *other* day in the same week has something then). `buildHourLayout(activeHours)` returns per-hour pixel offsets/heights; `minutesToY()` interpolates any minute-of-day into a pixel position against that layout, including fractional positions within a compressed hour for an event spanning through otherwise-empty time.
  - **Overlap layout**: `layoutDayTimeGrid()` is a small greedy interval-graph-colouring pass — overlapping items within a day split into side-by-side columns (each `100/totalCols`% wide) instead of fully overlapping each other, the same visual language every mainstream calendar app uses for double-booked time.
  - **Duration handling**: `CalDisplayItem` still only carries a single `time` field (shared across tasks/events/reminders), so the grid looks up the full `CalendarEvent` from the raw `events` record by id when it needs `endTime`. An event with no `endTime` defaults to a 60-minute visual block; a task/reminder (point-in-time, no real duration) defaults to 30 minutes — both are display-only assumptions, no data model change.
  - **Untimed items row**: tasks/reminders with no time-of-day get their own small row (`weekUntimedRow`) above the hourly grid, same idea as an "all-day" strip in other calendar apps — kept structurally separate from the pre-existing multi-day-event `weekSpanRow` above it (different data source — `getWeekSpanSlots` vs. plain per-day untimed filtering — deliberately not unified, to avoid touching the already-working span-row logic).
  - **"Now" line**: a red line + dot across today's column at the current time, recomputed via a `setInterval` every 60s while week view is active (`nowTick` state) so it drifts correctly without needing every unrelated store update to trigger a re-render. Uses the account's effective timezone (`resolveTimezone`/`utcToZonedTime`), consistent with the rest of the timezone feature.
  - **Auto-scroll**: on entering week view (or changing the selected week), the scroll container jumps to just above the first active hour, so a day that only has evening events doesn't open scrolled to a wall of empty morning.
  - **Hour labels respect `clockFormat`**: reuses `formatTime()`, so 24h/12h/system all render correctly (verified live in both modes).
  - Not built (deliberately out of scope for this pass): click-and-drag to create an event at a specific time (clicking a day column still just opens `AddCalendarItemModal` for that date, unprefilled with a time, matching the pre-existing month-view click-to-add behaviour), and drag-to-resize/reschedule an existing block.
- [x] Supabase auth + cloud sync (tasks, collections, tags, purposes, tracker entries)
- [x] Vercel deployment (auto-deploy from main branch)
- [x] **Lists section**: Organizer section for life-admin and curated discovery lists; two kinds: `'watchlist'` (card grid + status) and `'reference'` (table view, no status)
- [x] Lists: create/edit/delete lists with type templates, custom field schema, color, emoji icon; all fields fully user-customisable (add/remove/edit)
- [x] **ListKind**: `'watchlist' | 'reference'` discriminates rendering and whether status (want/in-progress/done) applies; status picker only shown for watchlist-kind lists
- [x] **List types** (12 built-in): Watchlist — Movies🎬, TV Shows📺, Books📚, Music🎵, Games🎮, Places📍; Reference — Credentials🔑, Memberships🪪, Subscriptions💳, Contacts👤, Research🔬, Custom📋
- [x] **ListTab**: optional sub-grouping within a list (`tabs: ListTab[]` on List, `tabId: string | null` on ListItem); "All" tab always shown; no tabs = flat list (unchanged behaviour)
- [x] ListsSection sidebar: grouped "Watchlists" / "Reference" divider sections
- [x] ListsSection tab bar: appears above content when list has tabs; "All" + named tabs with item counts; active tab colored
- [x] **List tab drag-and-drop reordering**: drag a named tab left/right past a neighbour to reorder `List.tabs` — same left/right-side-drop convention as NoteEditor's note-tab drag-and-drop (drop side is computed from cursor X relative to the target tab's midpoint; drag state mirrored into a ref so `onDrop` never reads a stale value). The pinned "All" pseudo-tab (not a real `ListTab`, always first) is never draggable and never a drop target — only entries in `selectedList.tabs` participate. `handleTabDrop()` in `ListsSection.tsx` splices the dragged tab into its new position and commits the whole array via `updateList(id, { tabs })` (the same "commit the whole array on save" pattern used everywhere else in this codebase, e.g. `EditTrackerPane`'s `fieldSchema`). `.listTabDragging`/`.listTabDragBefore`/`.listTabDragAfter` CSS classes in `ListsSection.module.css`, same visual language (dim while dragging, a left/right box-shadow edge indicating drop side) as `NoteEditor.module.css`'s `.tabDragging`/`.tabDragBefore`/`.tabDragAfter`. Verified live via a headless-browser round-trip (Playwright): dragging the first of three tabs past the last one correctly reordered the stored array.
- [x] ListsSection rendering fork: watchlist → card grid with status + tab filter; reference → `<table>` with per-field columns
- [x] `removeListTab(listId, tabId)` store action: atomically removes tab + reassigns affected items' `tabId` to `null`
- [x] List entities: ListId, ListItemId, ListTypeId, List, ListItem, ListType, ListFieldSchema, **ListKind**, **ListTab** (src/types/lists.ts, re-exported from index.ts)
- [x] List store: Zustand store (useListStore) persisted to `lists-storage` **v4** (localStorage + Supabase — see "Supabase sync for Schedules and Lists" below); v2 migration backfills `kind` on lists; v3 migration backfills `tabs: []` on lists + `tabId: null` on items; v4 backfills tab `fieldSchema: []`
- [x] AddListModal: two-step create flow (type picker grouped by kind → form); field schema editor; tabs editor (color + name per tab)
- [x] AddListItemModal: status picker (watchlist-kind only), tab picker (when list has tabs), dynamic field inputs, notes textarea, links list
- [x] AddTaskButton: Lists FAB — "New list" always; "Add item" only when a list is selected (hides otherwise)
- [x] Nav hotkeys: Tasks=1, Calendar=2, Records=3, **Lists=4**, Notes=5, **Portfolio=6**
- [x] **Notes section** (MVP): Chronicle view landing page with hierarchical navigation (areas > subjects > topics)
- [x] Notes CRUD: Create note with hierarchical tag selection, edit title+content with auto-save (2s debounce + blur), delete
- [x] Note entities: NoteId, Note (with tagData, parentId, tabs fields), NoteTab, NoteTag (with kind + fieldSchema fields), NoteTagId, NoteTagFieldDef, NoteTagFieldType (src/types/notes.ts, re-exported from index.ts)
- [x] Note store: Zustand store (noteStore) persisted to `notes-storage` **v9** (localStorage only, Phase 2 = Supabase sync); cumulative migrations: v2 added kind='area', v3 added fieldSchema=[] and tagData={}, v4 added abstract=null, v5 added parentId=null and tabs=[], v6 added mainTabName='Main', v7 added tabOrder=[], v8 added templateId=null, v9 added collectionId=null (to both notes and note tags); `touchNote(id)` updates lastViewedAt without changing updatedAt
- [x] **Note/notebook Endeavour association**: `Note.collectionId: CollectionId | null` and `NoteTag.collectionId: CollectionId | null` (src/types/notes.ts) — notes and notebooks (`NoteTag` where `kind='area'`) can now belong to an Endeavour, same as Task/CalendarEvent/CalendarReminder; annotation tags (`kind='tag'`) never carry a `collectionId` (cross-cutting labels don't have Endeavours, matching how the app-wide `Tag` entity works). Uses the existing `CollectionPicker` component (`src/components/CollectionPicker/CollectionPicker.tsx`), same pattern as `AddCalendarItemModal`
  - **Inheritance:** `noteStore.addNote()` defaults a new note's `collectionId` to its selected notebook's Endeavour (walking up the notebook's ancestor chain via `parentTagId` until one with a `collectionId` is found) when the caller doesn't pass `collectionId` explicitly, via `resolveNoteInheritedCollectionId()` in `src/utils/notes.ts`. `AddNoteModal` calls the same shared helper to live-update its Endeavour picker as the user changes notebook selection, tracking a `collectionManuallySet` ref so an explicit user pick isn't clobbered by the auto-suggestion. `AddNoteTagModal` seeds a new sub-notebook's Endeavour from its parent notebook's Endeavour the same way, one level up.
  - **UI:** Endeavour picker added to `AddNoteModal` (create widget for notes), `EditNoteMetaModal` (edit widget for notes, opened via the ✎ pencil), `AddNoteTagModal` (create widget for notebooks — hidden when creating an annotation tag), and `EditNoteTagModal` (edit widget for notebooks — hidden for annotation tags)
- [x] **Notes wired into the header Endeavour-focus filter**: the header's `CollectionFilterPicker` (`activeCollectionId` in `uiStore`) already filtered Tasks/Calendar to one Endeavour at a time; `ChronicleView` and `NoteList` now respect it too. When an Endeavour is focused: the notebook tree (`ChronicleView`) shows only notebooks whose *effective* Endeavour (own `collectionId`, or nearest ancestor's) matches — plus their ancestors, so the tree stays navigable down to a nested match — via `getVisibleNoteTagIds()` in `src/utils/notes.ts`; the note list (`NoteList`) shows only notes whose *effective* Endeavour (own `collectionId`, or what they'd inherit from their notebook tags today) matches, via `getNoteEffectiveCollectionId()` — the "or would inherit" fallback matters because the `notes-storage` v9 migration backfilled every pre-existing note's `collectionId` to `null`, so without it no legacy note would ever match a focused Endeavour. Keyboard navigation (arrow keys) in `ChronicleView` respects the same filtering. Empty states read "No notebooks/notes in this Endeavour" instead of the generic empty copy when a filter is active. Selecting a note/notebook that a filter subsequently hides is not auto-cleared, matching how `activeCollectionId` already behaves for Tasks/Calendar.
- [x] NoteTag.kind discriminator: `'area'` = notebook/hierarchy node (shown in Chronicle tree); `'tag'` = cross-cutting annotation label (hidden from tree, appears in tag attribute UI and note tag picker)
- [x] NoteTag.fieldSchema: Array of `NoteTagFieldDef` — user-defined attributes for annotation tags (e.g. Source tag with URL, Author, Date fields); edited via EditNoteTagModal field schema editor
- [x] NoteTag.presetKey: optional string — marks tags installed from a preset pack (e.g. `'academic'`); used by NoteTagPresetModal to detect already-installed packs
- [x] Note.tagData: `Record<NoteTagId, Record<FieldId, unknown>>` — per-note attribute values for tagged annotation tags; shown as inline inputs in NoteEditor (above the content)
- [x] Note.abstract: `string | null` — optional collapsible summary at top of note (below title bar, above tag attributes); null = not present; added/removed via "Note ▾" toolbar menu
- [x] Chronicle tree hover-expand: hovering a notebook briefly expands it to show children (collapses on mouse leave); clicking the node permanently expands it (via existing toggle mechanism); mouse handlers live on the outer `treeNodeGroup` div so moving to child nodes doesn't collapse prematurely
- [x] Chronicle tree hotkeys: `→` expand selected notebook, `←` collapse selected notebook (fires in Notes section, registered in hotkeys.ts under 'Notes' group)
- [x] AddTaskButton Notes FAB: Notebook → showAddNoteTag(null, 'area'), Custom tag → showAddNoteTag(null, 'tag'), Tag presets → showTagPresets()
- [x] Chronicle view UI: Breadcrumb navigation, stacked notebook cards (child tags), note list sidebar by current tag
- [x] AddNoteModal: Quick-add (Ctrl+Space / Space in notes) with hierarchical tag picker, Save & Close / Save & Edit options
- [x] NoteEditorPane: Slide-in pane from right, title + textarea content, auto-save debounced 2s on keystroke + immediate on blur, Escape closes
- [x] Notes hotkeys: `5` / `Ctrl+5` to switch to Notes section, Space/Ctrl+N for new item, Esc to close
- [x] AddTaskButton: Section-aware, shows Add Note + Add Tag options when activeView === 'notes'
- [x] NavSidebar: Notes icon (📝-style) added to CORE_NAV_ITEMS, above Portfolio separator
- [x] Supabase schema: 008_notes_initial.sql creates notes table, note_tags table (hierarchical), cross_app_links table (source of truth for all entity linking)
- [x] **Rich-text editor** (Tiptap v3): Full WYSIWYG editor in NoteEditor; extensions: StarterKit, Placeholder, Image (resizable), Table+TableRow+TableCell+TableHeader; replaces textarea MVP
- [x] NoteEditor toolbar: bold, italic, underline, strikethrough, code, heading dropdown (H1–H5), bullet/ordered list, blockquote, horizontal rule, table insert button; active-state highlighting
- [x] NoteEditor heading styles: two display modes — "Classic" (auto-numbered hierarchical headings H1–H5) and "Highlight" (decorative accent-bordered headings); toggle button in toolbar
- [x] NoteEditor table support: insert via toolbar button (row×col picker popover, default 3×3); paste detection converts TSV (tab-separated) and Markdown pipe tables automatically; table styles with header row + alternating rows + selectedCell highlight; hover controls: red ×-button (top-right, delete table), +row/−row (right of hovered row), +col/−col (below hovered column); controls rendered in a React portal (position:fixed) with 180ms hide delay so moving mouse between editor and controls doesn't flash
- [x] NoteEditor resizable images: paste/drag images into editor; drag handle on bottom-right corner resizes image width; `ResizableImage` custom Tiptap NodeView (`src/components/NoteEditor/extensions/ResizableImage.ts`); `HeadingNumbering` custom extension (`src/components/NoteEditor/extensions/HeadingNumbering.ts`) computes heading numbers via ProseMirror decorations
- [x] NoteEditor zoom: `Ctrl+−` / `Ctrl+=` change font scale (0.7×–2.0×, step 0.1); `Ctrl+scroll` also adjusts zoom; persisted to `settingsStore.noteEditorZoom`; implemented with CSS `zoom` property on editorArea div; zoom keys handled BEFORE isTyping guard in App.tsx; `!e.shiftKey` guard prevents Ctrl+Shift+= (superscript) from also triggering zoom
- [x] Built-in annotation tags: 7 tags — Important ⭐, Concept 💡, Definition 📖, Example 📋, Question ❓, Reference 📚, Learn Later 🔖; defined in `src/components/NoteEditor/builtinTags.ts`; inline `::before` CSS icons in editor CSS; `BuiltinTag.actions?: BuiltinTagAction[]` extensibility field added (not yet wired) — Learn Later carries `actions: [{ type: 'create-task' }]` for future task-app integration via the shared event bus
- [x] Superscript / subscript: `@tiptap/extension-superscript` + `@tiptap/extension-subscript`; toolbar buttons (x²/x₂); hotkeys `Ctrl+Shift+=` (superscript) and `Ctrl+Shift+-` (subscript), handled in NoteEditor editor-focused keydown handler (gated on `editor.isFocused`); documented in hotkeys.ts under Notes group
- [x] Note metadata edit modal (`EditNoteMetaModal`): the ✎ pencil in the Notes column now opens this modal; lets user edit `tagIds` (notebooks + annotation tags, shown in hierarchical tree), `color` (accent swatch picker), `pinned`; triggered via `showEditNoteMeta(noteId)` → `'edit-note-meta'` modal type in uiStore; shows `createdAt` and `lastViewedAt` as read-only date fields
- [x] Note abstract field: `Note.abstract: string | null`; added via "Note ▾" dropdown menu in NoteEditor toolbar (toolbar extensibility point for future note-level options); collapsible section between title bar and tag attributes; auto-saves on change (1.5s debounce) and on blur; hidden when null; toggle removes/restores field
- [x] Note heading numbering: JS-based via `HeadingNumbering` Tiptap extension (`src/components/NoteEditor/extensions/HeadingNumbering.ts`); uses ProseMirror `Plugin.decorations` to compute hierarchical numbers (1, 1.1, 1.1.2…) and set `data-heading-number` on each heading DOM node; CSS `::before { content: attr(data-heading-number) }` renders numbers; replaces unreliable CSS counter-reset approach (which had a browser bug where h2 counters didn't reset across h1 siblings)
- [x] `lastViewedAt` updated on note open: `touchNote(id)` called in NoteEditor's note-loading useEffect; `touchNote` updates only `lastViewedAt` (not `updatedAt`)
- [x] Note options toolbar menu ("Note ▾"): positioned right of the TOC toggle in NoteEditor toolbar; dropdown pattern matching tablePickerOpen; extensibility point for future note-level actions
- [x] Tag Presets system: `src/config/noteTagPresets.ts` defines `TagPresetDef` and `NOTE_TAG_PRESETS`; "Academic" preset ships with 6 tags (Argument ⚖️, Evidence 🔬, Critique 🔺, Methodology 📐, Gap 🔍, Assumption 💭) each with pre-built fieldSchema; NoteTagPresetModal shows installed/uninstalled state, installs all tags with presetKey marker
- [x] **Chronicle keyboard navigation**: Arrow keys navigate between Chronicle's three columns (tree→list→editor); `→`/`←` move focus between columns (`→` on a collapsed tree node expands it first; `←` on an expanded tree node collapses it); `↑`/`↓` move selection within the focused column and auto-update adjacent panel (moving in tree updates note list; moving in list updates editor); active column highlighted via `panelFocused` CSS class on its header; keydown listener attached in ChronicleView useEffect, skipped when typing in inputs/contenteditable; App.tsx Notes ArrowLeft/ArrowRight handlers removed (logic now lives entirely in ChronicleView)
- [x] **Notebook indent/outdent**: `↳` button in tree node hover actions makes a notebook a child of the sibling above it (indent); `↰` button appears when notebook has a parent and moves it up one level (outdent); implemented via `indentNoteTag(id)` and `outdentNoteTag(id)` store actions; buttons show/hide based on whether a previous sibling or parent exists
- [x] **Notes nav-column polish — full-width titles, content-aware folder icons, clearer color-picker icon**: three small usability fixes.
  - **Full-width titles in the tree and note list**: the `.nodeActions`/`.noteActions` hover-action button rows (`ChronicleView.module.css`, `NoteList.module.css`) used to reserve their full width permanently via `opacity: 0` (invisible but still occupying flex layout space), so a notebook/note title never had the full row to itself. Switched to `max-width: 0; overflow: hidden` by default, expanding to a fixed `max-width` (with `opacity`) only on row-hover — the title (`flex: 1`) now fills the whole row when idle and only narrows to make room for the edit/delete buttons on hover.
  - **Content-aware notebook icons**: `getNotebookIcon(tag, noteTags, notes)` (`src/utils/notes.ts`) replaces the old hardcoded `📁` default — an explicit user-chosen `tag.icon` still always wins, but the computed default now reflects what the notebook actually contains: `📁` empty, `🗂️` sub-notebooks only, `📓` notes only, `📚` both. Wired into `ChronicleView.tsx`'s tree node rendering.
  - **Text-color button no longer looks like an underline toggle**: `FloatingToolbar.tsx`'s "A with a colored bottom border" icon (which read as an underline button at a glance) was replaced with a small rounded square filled with a conic rainbow gradient (`.colorBtnIcon` in `FloatingToolbar.module.css`) — unambiguously reads as a color-palette picker.
- [x] **Chronicle tree drag-and-drop — nest or reorder, Explorer/VS-Code-sidebar-style**: drag one notebook onto another in the Chronicle tree (`ChronicleView.tsx`); where it lands within the target row's height decides the outcome — top quarter = insert as a sibling **before** the target, bottom quarter = **after** it (in both cases reparented to whatever parent the target itself belongs to, possibly a different branch than where the drag started), middle half = **nest inside** it as a sub-notebook. This is the same three-zone convention desktop file explorers and VS Code's own sidebar use, and complements rather than replaces the existing ↳/↰ indent/outdent buttons (which only handle one specific case — "become a child of the sibling directly above").
  - `zoneForOffset(offsetY, height)` computes the zone from `e.clientY - rect.top` against the target row's live `getBoundingClientRect()`; `newParentForZone()` resolves what the new `parentTagId` would be for a given zone; `canAcceptZone()` refuses a drop that's a no-op-parent or would create a cycle (`isDescendantOf()` walks the candidate's `parentTagId` chain); `computeInsertOrder()` (before/after only) picks the midpoint `order` between the target and its neighbouring sibling on that side — the same "don't renumber everyone, just pick a value in between" convention `indentNoteTag`/`outdentNoteTag` already use elsewhere (`order: 999`, `order: parent.order + 0.5`).
  - Drag state (`draggingTagId` + `dragOverInfo: { tagId, zone }`, each mirrored into a ref — `draggingTagIdRef`/`dragOverZoneRef` — read by drop handlers so they never see a stale value, same convention as the note-tab drag-and-drop below) is lifted to `ChronicleView` and threaded down through `TreeNodeProps`, since a drag can cross between completely different branches of the recursive tree.
  - CSS in `ChronicleView.module.css`: `.treeNodeDragging` (dimmed source row), `.treeNodeDropTarget` (dashed outline + tinted background — "inside" zone), `.treeNodeDropBefore`/`.treeNodeDropAfter` (a top/bottom edge highlight bar — "before"/"after" zones, same left/right-edge visual language the note-tab reorder below uses, just rotated 90°).
  - Verified live via headless-browser round-trips (Playwright, three separate drags on a flat 3-notebook root list): dropped near a target's top edge correctly reordered as a sibling before it (`order` below the target's), dropped at a target's vertical center correctly nested inside it (`parentTagId` set, `order: 999`), dropped near a target's bottom edge correctly reordered as a sibling after it. One early round of this testing produced a false failure — traced to the test script itself measuring the inner text span's (vertically centered, shorter) bounding box instead of the full `.treeNode` row's, not an application bug; re-verified against the row's real `getBoundingClientRect()` and all three zones passed.
- [x] **Note indent/outdent (sub-notes)**: `Note.parentId: NoteId | null` field (added in noteStore v5); `↳` and `↰` hover buttons in NoteList for top-level notes; `indentNote(id, newParentId)` and `outdentNote(id)` store actions; NoteList renders children indented under their parent (one level visible per render pass, recursive for deeper nesting); orphaned children automatically become top-level when parent is deleted
- [x] **Note tabs**: `NoteTab { id, name, content }` interface in types/notes.ts; `Note.tabs: NoteTab[]` field (empty = no extra tabs); tab bar rendered in NoteEditor below the title/toolbar strip — always shows "Main" tab + any named tabs + `+` button; clicking a tab flushes the current tab's content then loads the new tab; double-click a tab name to rename inline; `×` closes a tab; `Main` tab maps to `Note.content`; additional tabs use `updateNoteTabContent` store action; `activeTabId` state + ref tracks current tab (null = Main); store actions: `addNoteTab`, `removeNoteTab`, `renameNoteTab`, `updateNoteTabContent`
- [x] **Dark mode**: CSS variable-based theming (light / dark / system); FOUC prevention; Settings UI
- [x] **Clock format setting**: `settingsStore.clockFormat: '24h' | '12h' | 'system'` (default `'24h'`, matching the app's pre-existing behaviour so nobody's display silently changes on upgrade); SettingsPane → Appearance section, segmented control identical in style to the Theme control, right below it. `formatTime(time, clockFormat)` (`src/utils/date.ts`) takes the setting as an optional second parameter — `'system'`/omitted passes `hour12: undefined` to `toLocaleTimeString` (locale/OS default, the old behaviour), `'12h'`/`'24h'` force `hour12: true`/`false` explicitly. `formatDeadline(date, time, clockFormat)` threads it through the same way. Every display call site reads `useSettingsStore((s) => s.clockFormat)` and passes it in: `CalendarView` (all 5 `formatTime(item.time)` call sites), `TaskItem` (both `formatDeadline` deadline/scheduled pills), `useNotificationChecker` (all 3 notification-body strings — `clockFormat` added to that hook's check-effect dependency array so a setting change is picked up without waiting for the next tick). **Time-picker inputs respect the setting too**, via a shared `src/components/TimeInput/TimeInput.tsx` — **not** a wrapped native `<input type="time">` (see below for why), a fully custom control: separate hour/minute `<input type="number">` segments plus an AM/PM toggle rendered only in 12h mode, styled to read as one cohesive bordered field (`TimeInput.module.css`). Its `onChange` contract is `(value: string) => void` (a plain `"HH:MM"` string, always 24-hour canonical — not a DOM `ChangeEvent`, since there's no longer a single underlying native input to read `.target.value` from); every call site was updated from `onChange={(e) => setX(e.target.value)}` to `onChange={setX}` accordingly. `'system'` resolves to a concrete 12h/24h choice via `Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle` (`'h11'`/`'h12'` → 12h, `'h23'`/`'h24'` → 24h) rather than staying ambiguous the way the read-only formatter's `hour12: undefined` can. Replaces all 12 raw `type="time"` call sites across `AddCalendarItemModal`, `CalendarEventPane`, `CalendarReminderPane`, `AddTaskModal`, `TaskPane`, `NotificationCenter`. Any *new* time input should use `<TimeInput>`, not a raw `<input type="time">`, to stay covered by this setting.
  - **Bug caught by the user, fixed, then verified live (not just built)**: the first implementation kept the native `<input type="time">` and tried to force its displayed format via the element's `lang` attribute (`lang="en-GB"` for 24h, `lang="en-US"` for 12h) — a commonly-cited trick that turned out not to actually control Chromium/Edge's picker display in current browser versions (it may be outdated folklore, or Firefox-specific). The user tested it directly and reported it silently did nothing — the setting had no effect on any input, only on read-only display. Rebuilt as the fully custom control described above, which can't be subject to any browser-specific quirk since the app renders every digit itself. **Verified with a real headless-browser round-trip** (Playwright, driven from an isolated scratch npm project so the app's own `package.json`/lockfile were never touched): typed "2:30 PM" into a 12h-mode `TimeInput`, saved the event, and confirmed the month-grid cell rendered "2:30 pm" — proving the 12h-entered value round-trips correctly through the 24-hour canonical storage format and back out through the (already-correct) read-only formatter. Also caught and fixed a layout bug in the same pass: the AM/PM toggle overflowed the fixed `width: 7.5rem` inherited from callers' CSS (written for a single native input) — `TimeInput.module.css`'s `.wrapper` now forces `width: fit-content !important` since every caller's passed-in width assumption predates the multi-segment control.
- [x] **Dark-mode native form control fix**: date/calendar and time/clock picker icons on `<input type="date">`/`<input type="time">` rendered black-on-dark (unreadable) because nothing in the app ever told the browser dark mode applied to native form chrome — Chromium/Safari/Firefox all draw native control affordances (picker icons, spinner buttons, default scrollbars) using the `color-scheme` CSS property, which defaults to `light` if unset regardless of the page's own dark palette. Fixed with two one-line additions to `src/index.css`: `color-scheme: light` on `:root`, `color-scheme: dark` on `[data-theme="dark"]` — safe because `data-theme` is always explicitly set to `light`/`dark` (never left absent) by both the FOUC-prevention inline script in `index.html` and the theme effect in `App.tsx`, even for `theme: 'system'`. Pre-existing bug, unrelated to any other change — there was never a `color-scheme` declaration anywhere in the codebase before this
- [x] **Timezone setting** (account-wide, single zone): `settingsStore.timezone: string` — either the literal `'system'` (default; auto-detects from the host machine via `Intl.DateTimeFormat().resolvedOptions().timeZone`, matching the app's original implicit behaviour) or an explicit IANA zone name (e.g. `'America/Los_Angeles'`). **Scoped decision (confirmed with the user):** one zone for the whole account, not a per-event override like Google Calendar's — every task deadline, scheduled time, calendar event, and reminder is interpreted in this single zone. Per-event zones were explicitly ruled out as unnecessary complexity for this use case.
  - **Core utility** (`src/utils/timezone.ts`, no new dependency — uses only built-in `Intl`): `resolveTimezone(tz)` resolves `'system'` to the concrete detected zone; `listTimezones()` returns every IANA zone name via `Intl.supportedValuesOf('timeZone')` (with a small hardcoded fallback list in case an embedded webview lacks it) for the Settings picker; `zonedTimeToUtc(date, time, zone)` converts a wall-clock date+time *as understood in `zone`* into the real UTC instant it represents, via the standard two-pass `Intl.formatToParts` round-trip (guess an instant, see what wall-clock it renders as in the target zone, correct by the difference **against the original fixed target, not the evolving guess** — diffing against the evolving guess is a subtle bug that overshoots on the second pass, caught and fixed during implementation via a round-trip stress test across 10 zones × 6 dates including both DST transition boundaries, 0 failures); `utcToZonedTime(instant, zone)` is the inverse; `rezoneWallClock(date, time, fromZone, toZone)` composes both to re-express a wall-clock pair from one zone's frame into another's; `todayIsoInZone(zone)` gives "today" per that zone rather than the host machine's raw clock.
  - **Re-stamping semantics on zone change (confirmed with the user):** when the effective zone changes, existing data is rewritten so each item keeps naming the **same real-world instant** — a "2:00 PM New York" event becomes "11:00 AM" once the zone is switched to Los Angeles — rather than keeping the same digits under a new meaning. This is the more work-intensive of the two options that were on the table (the cheaper alternative was leaving digits unchanged and only having new "now" comparisons use the new zone going forward) but is what the user asked for as more correct for travel/relocation scenarios. **All-day items are deliberately exempt** — a birthday or all-day event's date never shifts, matching how Google Calendar treats all-day events. Implemented in `src/services/timezoneMigration.ts`'s `rezoneAllCalendarData(fromZone, toZone)`, which walks `taskStore` (deadline+deadlineTime, scheduledAt+scheduledTime pairs) and `calendarStore` (event date/startTime, endDate/endTime as two independently-rezoned pairs since each needs its own DST-correct offset lookup, birthday `notifyAtTime` re-stamped as time-of-day-only against its own date without letting the date itself shift; reminder date+time), calling each store's existing `updateTask`/`updateEvent`/`updateReminder` actions. **Must be called with the OLD zone before committing the new one to settingsStore** — `SettingsPane.tsx`'s `handleTimezoneChange` does exactly this, gated behind a `window.confirm()` describing the impact (this is a bulk, one-shot data rewrite with no dedicated undo). Already-absolute `remindAt` fields (from the "snooze"/postpone notification actions) are untouched by the migration — they're real ISO instants already, not wall-clock strings, so they don't need re-interpretation.
  - **`'system'` mode never triggers this migration on its own** — the re-stamp only runs as a direct consequence of an explicit choice in the Settings dropdown. If a user's OS zone happens to change (e.g. actually traveling with a laptop set to auto-adjust), that must NOT silently rewrite historical data on next load; it only changes what `resolveTimezone('system')` returns for new "now" comparisons going forward. This is a deliberate design boundary, not an oversight — worth preserving if this code is touched again.
  - **Wired into "now"/"today" comparisons** (the actual behavioural point of the feature, not just storage): `date.ts`'s `isOverdue(date, time, timezone)` now takes the zone and uses `zonedTimeToUtc` (also incidentally fixes a latent pre-existing quirk where a date-only deadline compared against `new Date(dateStr)`, which the JS spec parses as **UTC** midnight, not local — now consistently zone-aware); `useNotificationChecker.ts`'s three trigger functions (`taskTrigger`/`eventTrigger`/`reminderTrigger`) all take the resolved zone and use `zonedTimeToUtc` instead of the naive `new Date(\`${date}T${time}\`)` (which always meant "the host machine's current zone", now means "the app's configured zone"); `NotificationCenter.tsx`'s postpone/snooze `iso` computation likewise; `CalendarView.tsx`'s "today" (`todayIsoInZone`, replacing a `new Date()` read at component scope), the "go to today" button, and `isPastItem`'s same-day hour/minute comparison (`utcToZonedTime(new Date(), zone).time` instead of `Date.getHours()/getMinutes()`); `AddCalendarItemModal`'s default date field.
  - **Deliberately out of scope**: `todayIso()` (`src/utils/date.ts`) itself was left machine-local and NOT made zone-aware, since its callers are all outside Tasks/Calendar — Records/tracker entries, Fitness activities, Portfolio watchlist "date added" — logging-in-the-moment use cases where "wherever your machine physically is right now" is arguably the more correct interpretation anyway, and the user's ask was specifically scoped to calendar/task entries. If Records/Fitness ever want the same treatment, call `todayIsoInZone(resolveTimezone(settingsStore.getState().timezone))` directly at that call site rather than changing the shared `todayIso()` (which has callers that should stay machine-local).
  - **Settings UI**: `SettingsPane.tsx` → Appearance section, below Clock format — a `<select>` (`.timezoneSelect` in `SettingsPane.module.css`, styled to match the existing `.select` input pattern used elsewhere) listing "System (auto-detect)" plus every `listTimezones()` result; description line shows the currently-resolved zone when on System.
  - **Noted but not touched**: `CalendarEventPane`/birthday `notifyAtTime` is stored and now correctly re-stamped by the migration, but was already — independently of this feature — never actually read by `useNotificationChecker.ts`'s `eventTrigger` (which only fires off `startTime` + `notifyBeforeValue/Unit`, not `notifyAtTime`). Birthday notifications are effectively inert today; this is a pre-existing gap, not something introduced or fixed here.
- [x] **ICS calendar import — location, TZID/UTC awareness, EXDATE, birthday detection, and a review-before-import step**: previously `IntegrationsPane`'s `CalendarImportCard` parsed a `.ics` file and immediately, silently wrote every event straight into `calendarStore` as a plain `'default'` event with no location, no timezone awareness, and no way to exclude or reclassify anything before it landed on the calendar. Reworked into a two-step flow:
  - **`src/utils/icsParser.ts`** — `ICSEvent` gained `location: string | null` (new `LOCATION:` field parsing) and `tzid: string | null` (`'UTC'` if `DTSTART`'s value ends in `Z`, the literal IANA name if `TZID=...` is present, `null` for RFC 5545 "floating time" — a wall-clock with no zone attached at all — or an all-day value). `EXDATE` is now parsed into a per-event exclusion set and honoured by `expandRecurrences()`, so a single skipped occurrence in a recurring series is no longer silently re-added on import. New exported `looksLikeBirthday(title)` matches `/\bbirthday\b/i` — covers the common Google/Outlook/Apple "Contacts" birthday export shape (e.g. "Jane Doe's Birthday"). **Bug caught and fixed during implementation**: the parser uppercases ICS parameter keys for case-insensitive matching (`TZID` vs `tzid`), but was applying that same uppercasing to the *parameter value* too — silently mangling `TZID=America/New_York` into `AMERICA/NEW_YORK`, an invalid `Intl` timezone name that would have thrown at conversion time. Fixed by keeping the parameter substring in its original case and only uppercasing an ad-hoc copy for the `VALUE=DATE` substring check; caught by an esbuild-transpiled smoke test against a synthetic `.ics` fixture covering all four cases (all-day+RRULE, `TZID=`, trailing `Z`, and `EXDATE`) before it ever reached the UI.
  - **`src/components/CalendarImportReviewModal/`** (new) — after parsing, instead of importing immediately, a wide centred modal (720px, follows the overlay+centred≥640px pattern, `z-index: 110/111` — one tier above the `IntegrationsPane`'s own 100/101 since the pane stays open behind it) lists every parsed event in a scrollable table: a checkbox (pre-unchecked for anything that duplicate-matches an existing event by `title|date|startTime`, matching the prior silent-skip behaviour but now visible and overridable), title (with a location hint line and an "already in calendar" badge when a duplicate), date, time, and a per-row Type dropdown (Event/Birthday) defaulted via `looksLikeBirthday()` but editable — this is the "flexibly map birthdays automatically, but let me fix misses" the user asked for. One `CollectionPicker` at the top applies a single chosen Endeavour to the whole batch (not per-row — a deliberate simplification; per-row Endeavour assignment would be straightforward to add later on the same component if wanted). Escape-safe, follows the standing rule.
  - **`IntegrationsPane.tsx`'s `CalendarImportCard`** — `handleFile` now only parses and opens the review modal (`reviewRows`/`pendingEvents` state, the latter a `Map<rowKey, ICSEvent>` keeping full parse data, including `notes`/`tzid`, off the trimmed-down `ReviewRow` the table renders); `handleReviewConfirm(selected, collectionId)` does the actual `addEvent()` calls. **Timezone re-projection on import**: if a source event's `tzid` is set and differs from the app's resolved effective zone (`resolveTimezone(settingsStore.timezone)`), its date/time is re-expressed into the app's zone via `rezoneWallClock()` (the same utility the account-wide timezone feature above introduced) before being stored — so a `TZID=America/New_York` event imported by a user whose app zone is set to Tokyo lands on the calendar at the correct Tokyo wall-clock time, not the raw New York digits. Floating times (`tzid === null`) are left as-is by design — RFC 5545 defines them as meaning "whatever zone reads this," which is exactly the app's zone already.
  - **Known limitation, unchanged from before this work**: `ICSEvent`/the import path still don't carry a separate end-*date* — only `endTime` — so a genuinely multi-day source event (crossing midnight) imports as a single-day event with a same-day end time. Not introduced by this change and not fixed here; flagged in case multi-day ICS import is wanted later (`CalendarEvent.endDate` already exists in the data model for exactly this, just not populated by this import path yet).
  - **Not built (flagged as future work, discussed with the user as a separate architectural question)**: turning free-text `location` into an actual address/map integration (autocomplete, geocoding, an embedded map, "open in Google Maps") — see the Location Integration section below for the options considered.

### Location integration — options considered, not yet built

The user asked, as a planning question (not yet scoped for implementation): the app's `CalendarEvent.location` is (and after the ICS import work above, will keep being) a plain free-text field — no autocomplete, no geocoding, no map. What would it take to get something like Google Calendar's location handling (which itself is backed by Google Places)?

Three tiers were identified, cheapest first:

1. **"Open in Maps" link only, no API/key needed** — wrap whatever free-text `location` string already exists into a Google Maps search URL (`https://www.google.com/maps/search/?api=1&query=<url-encoded text>`). Zero setup, no billing, no new dependency — extends the exact pattern `CalendarEventPane.tsx`'s existing `isLocationUrl()` special-case already uses (a location that "looks like a URL" gets rendered as a clickable link today; this would add "or just always offer a maps-search link regardless of what the text looks like"). No autocomplete, no map preview, no normalized/validated address — but real and shippable in a small change to `CalendarEventPane`/`AddCalendarItemModal`, no new integration credentials.
2. **Geocode + static map preview on blur** — one-shot lookup (Google's Geocoding API, or an alternative like the free/keyless OpenStreetMap Nominatim for a lower-fidelity option) turns the typed text into a normalized address + lat/lng once the field loses focus; a small embedded map preview via the Maps **Embed** API (a plain `<iframe src="https://www.google.com/maps/embed/v1/place?...">`, no JS SDK) shown in `CalendarEventPane`. Needs a Google Cloud project + a Maps Platform API key (Google's Maps Platform has a recurring free monthly credit, but does require a credit card on file — same category of setup as the existing Strava integration, though Places/Maps keys are safe to expose client-side when restricted by HTTP referrer in the Cloud Console, unlike Strava's server-only client secret).
3. **Full Places Autocomplete-while-typing** (closest to actual Google Calendar behaviour) — Google's Places Autocomplete Element suggests real places as the user types, returning a `place_id` resolved via Place Details into a normalized address + coordinates. This is the option with real data-model impact: `CalendarEvent.location` would need to become a structured value (`{ formattedAddress, placeId, lat, lng }` alongside — or instead of — the current plain string), which is a schema/migration change in the same category as the archiving/`collectionId` additions this app has done before, plus a Supabase migration and mapper update. Google's Autocomplete pricing bills per session (bundling the keystroke suggestions and the follow-up details fetch together) rather than per keystroke, which keeps cost bounded but still real.

**Tier 1 implemented** (recommended as the pragmatic "ship the basic layer now" starting point — genuinely a ~15-minute, zero-dependency, zero-credential change, and nothing about it needs to be un-done to later add Tier 2/3, since those both still start from the same plain-text address the user types today): `CalendarEventPane.tsx`'s Location field now always shows a link icon next to the text input whenever `location` is non-empty — 🗺 wrapping the typed address into a Google Maps search URL (`https://www.google.com/maps/search/?api=1&query=<encoded>`) via a new `locationMapsUrl()` helper, or ↗ (unchanged) when the stored value already looks like a URL (`isLocationUrl()`, pre-existing). No API key, no new dependency, no schema change — purely a URL-construction addition, so Tier 2/3 later (an actual Places integration) simply replaces this link with something richer rather than needing to remove anything. Deliberately not added to `AddCalendarItemModal` (a creation pane) — matches the pre-existing rule that creation panes render links-in-progress as plain text inputs, not live clickable links, until the item is saved.
- [x] **Notes editor hyperlink click bugs fixed** (`NoteEditor.tsx`): two bugs reported against the hyperlink click handling documented earlier in this file — (1) Ctrl/Cmd+click was supposed to only select a link's text (so it can be edited, e.g. with Ctrl+L) but was also navigating the link; (2) a plain click was opening the link twice. Root cause for both: the anchor click logic lived in Tiptap's `editorProps.handleClick`, which ProseMirror derives from its own internal `mousedown`/`mouseup` click-vs-drag disambiguation — calling `event.preventDefault()` on that synthesized event does not reliably suppress Chromium/WebKit's separate, native "Ctrl/Cmd+click follows a link inside `contenteditable`" default behaviour, which fires on its own later native `click` event. Fixed by moving the anchor-click handling out of `handleClick` and into `editorProps.handleDOMEvents` — a genuine `mousedown` listener now calls `event.preventDefault()` the moment a link is pressed (before the browser can ever establish its native "this is a link-follow gesture" state), and a genuine `click` listener does the actual logic (open on plain click via `openExternalLink()`, select the link's text range via `getMarkRange`+`TextSelection` on Ctrl/Cmd+click) using `view.posAtCoords()` to resolve the document position from the raw mouse event (the `pos` argument `handleClick` used to supply for free). **Verified live, not just built**: a headless-browser test (Playwright, from an isolated scratch npm project, app's own `package.json` untouched) monkey-patched `window.open` to count calls — confirmed exactly 0 calls on Ctrl+click (with the link's text correctly selected instead) and exactly 1 call on a plain click, both via direct interaction with a real inserted hyperlink in a real note, not a unit test of the handler in isolation.
- [x] **Link hover preview — cross-app pattern** (`src/components/LinkHoverPreview/LinkHoverPreview.tsx`, mounted once at the bottom of `App.tsx`'s root JSX): hovering any link anywhere in the app shows its URL in a small fixed box, bottom-left corner (`z-index: 10000`, the top overlay tier — see z-index table note below), replicating the browser-native status-bar link preview that Tauri's bare webview has no equivalent of and that SPA-rendered pills never trigger in the browser build either. Disappears the instant the pointer leaves the link.
  - **This is a global mechanism, not a per-component pattern — deliberately, so it needs no dedicated "process" the way hotkeys do.** One delegated `mouseover`/`mouseout` listener pair on `document`, added once, finds `closest('a[href]')` on whatever's hovered and reads its `href`. Because it's delegation-based rather than something each component opts into, **every existing real `<a href>` in the app was covered for free, with zero changes to any of the 8+ existing link render sites** (task link pills, TaskPane, CalendarEventPane's location link, ListsSection, WatchlistView, Notes hyperlinks, etc.) — and every *future* one will be too, automatically, as long as it renders as a real anchor tag.
  - **The one rule this does create, worth remembering**: the mechanism only sees real `<a href="...">` elements. A future "link-like" affordance built as a plain `<div>`/`<span>`/`<button>` with an `onClick` that calls `openExternalLink()` directly (rather than rendering a real anchor) will silently NOT get a hover preview. Prefer a real `<a href>` for anything link-like for exactly this reason. For the rare case where a real anchor genuinely can't be used, the listener also recognizes an escape-hatch attribute: `data-link-preview="<url>"` on any element triggers the same preview using that URL instead of `href` — reach for this before building a second hover mechanism.
  - **Deliberately excluded, matching the request**: nothing changed in any *creation* modal (`Add*Modal` components) — none of them render finished links as real anchors in the first place (a URL being composed shows in a plain text `<input>`, not a rendered `<a>`, until the item is saved and later viewed/edited), so they were never going to trigger this and needed no special-casing to exclude.
  - **z-index note**: `10000` was chosen by finding the highest `z-index` already in use anywhere in the app (`NoteEditor.module.css`'s floating table/section controls top out at `9999`) and going one higher, so the preview box is guaranteed to render above every existing overlay/modal/pane, including ones opened on top of each other (e.g. `EditActivityTypeModal` opened from inside `AddActivityModal`).
- [x] **Chronicle resizable columns**: notebook-tree and note-list panels are drag-resizable via a `.divider` element between each pair of panels (`src/components/ChronicleView/ChronicleView.tsx`); drag state tracked in a ref (`dragStateRef`) + live-preview React state so width updates smoothly without re-subscribing listeners per mousemove; final width committed to `settingsStore.chronicleTreeWidth` / `chronicleListWidth` (px, clamped 160–480) only on mouseup, avoiding excessive localStorage writes during drag; panel widths are now inline `style={{ width }}` (no longer fixed in CSS) — `.panelCollapsed`'s `!important` still wins when a panel is collapsed; dividers hidden below 560px (mobile column-stack layout)
- [x] **Note templates**: `AddNoteModal` has a template picker grid (`src/config/noteTemplates.ts` — `NOTE_TEMPLATES: NoteTemplateDef[]`); "Blank" (default, unchanged behaviour) plus five content-prefill templates — Meeting Minutes, Daily Journal, Book/Article Notes, Project Brief, Cornell Notes (uses a 2-col Tiptap table for Cues/Notes); templates prefill `content` (stringified Tiptap doc JSON built with local `heading`/`paragraph`/`bulletList`/`doc` helpers); template section headings use heading level 1 to number cleanly under the existing `HeadingNumbering` extension (which numbers by raw level depth, so level-2-only content would render as "0.1, 0.2…")
- [x] **Note type icon in note list**: `Note.templateId: string | null` (added in noteStore **v8**) records which `NOTE_TEMPLATES` entry a note was created from (`'blank'`, `null`, or an unrecognised id all render no icon); `AddNoteModal` passes the selected `templateId` into `addNote()`; `NoteList.tsx`'s `NoteRow` looks up the template by id and renders its icon (`.noteTypeIcon`, always visible — not hover-gated like `.noteActions`) on the right side of the row, before the hover action buttons
- [x] **Note editor sections & columns** (Word-style): `src/components/NoteEditor/extensions/Section.ts` defines `SectionDocument` (`Document.extend({ content: 'section+' })`, replacing StarterKit's default document via `StarterKit.configure({ document: false })`) and `Section` (a node with `content: 'block+'` and a `columns` attribute, 1–4, rendered as `<div data-type="section" data-columns="N">`); every note's document is now a sequence of ≥1 sections rather than a flat block list — this gives future per-section settings (margins, page breaks, etc.) a container without another schema change
  - Toolbar: **Columns** button (`ColumnsIcon`) opens a 1/2/3/4 picker (`.columnsPicker`/`.columnsOption` styles, mirrors the table-insert picker) calling `editor.chain().focus().setSectionColumns(n, editor.state.selection.from).run()`, which finds the ancestor section at the given position and updates its `columns` attr via `tr.setNodeMarkup` (merging into existing attrs — a plain `{ columns }` object would have clobbered `locked`); active option highlighted via `editor.isActive('section', { columns: n })`
  - **Section break** button (`SectionBreakIcon`) calls `insertSectionBreak()`, a custom command that locates the ancestor section depth and uses `prosemirror-transform`'s `split(pos, depth, typesAfter)` to split through both the innermost node and the section itself in one step, creating a new section (default 1 column, unlocked) after the break — the new section's `typesAfter` entry sits at index 0 (outermost split level), all deeper levels pass `null` to keep their original type. Refuses to run (returns `false`) if a `columnBlock` sits between the cursor and the section — splitting through a locked columns block isn't well-defined
  - **Important:** `Section` must NOT set `isolating: true` — ProseMirror's `canSplit` refuses to split through an isolating ancestor, which silently no-ops `insertSectionBreak`. Omitting it also matches Word's UX: backspacing at a section boundary merges the two sections back together (undoes the break)
  - CSS multi-column rendering (unlocked only): `.editorContent [data-type="section"][data-columns="2|3|4"][data-locked="false"] { column-count; column-gap }` in `NoteEditor.module.css`, with `break-inside: avoid` on direct children and a dashed top border between consecutive sections
  - **Backward compatibility (no store/migration changes):** `parseContent()` in `NoteEditor.tsx` normalizes on load — if a note's top-level content isn't already all `section` nodes (i.e. it predates this feature, or is a legacy plain-text note), it's transparently wrapped in one default single-column section; content that's already sectioned round-trips unchanged. `Note.content` stays an opaque string; no `noteStore` version bump
  - **Fixed a latent bug while adding this:** `NoteTOC.tsx`'s `extractItems` used `doc.forEach()` (direct children only) to find headings; now that headings sit one level deeper (inside a section), this is switched to `doc.descendants()` (recursive), matching the traversal `HeadingNumbering` already used — otherwise the table-of-contents panel would have silently stopped finding any headings
- [x] **Lock columns** (fixed per-column content, vs. CSS-flowed columns): CSS `column-count` (the default) redistributes text across columns as it grows — "unlocked". Checking **Lock columns** converts a section to independently-editable columns where content typed into one column never reflows into another
  - New nodes in `Section.ts`: `ColumnBlock` (`content: 'column+'`, `group: 'block'` — so it's one valid child of a section's `content: 'block+'`) and `Column` (`content: 'block+'`); rendered as `<div data-type="column-block">`/`<div data-type="column">`, laid out via CSS flexbox (`display:flex` / `flex:1 1 0`) — not CSS columns, since the whole point is that each column is its own independent flow
  - `Section.locked: boolean` attr (default `false`, `data-locked` on the DOM node); `toggleSectionLocked(pos)` command: locking flattens the section's current content into one block list then redistributes it contiguously across `columns` count via `chunkEvenly()` (front-loaded remainder, e.g. 5 blocks/2 cols → [3, 2]) wrapped in one `columnBlock`; unlocking reverses this — walks the `columnBlock`'s columns in order and concatenates their content back into the section as a flat list. `setSectionColumns()` also re-flattens/re-splits when called on an already-locked section (so changing 2→3 columns while locked redistributes existing text into 3, instead of just relabelling)
  - UI: hovering a section with `columns >= 2` reveals a **Lock columns** checkbox top-right (`.sectionLockToggle`, rendered via `createPortal` at `position:fixed`, mirroring the existing table-hover-controls pattern) with a tooltip explaining the two modes; hover detection lives in the same `handleEditorMouseOver` handler that already tracked table hover, extended rather than duplicated
  - **Bug hit while building this:** the checkbox's `checked` value was first read directly off the hovered section's live `data-locked` DOM attribute at render time — but nothing forces `NoteEditor` to re-render when a ProseMirror transaction changes an attribute on an already-mounted node, so the checkbox visually lagged one render behind after clicking it. Fixed by tracking `{ el, locked }` in React state (`sectionHover`) and optimistically flipping `locked` in the `onChange` handler itself, instead of re-deriving it from the DOM
  - `insertSectionBreak` refuses to split through a `columnBlock` (see above) — locking/unlocking and column-count changes are otherwise unaffected by cursor depth
- [x] **Hyperlinks in the note editor**: `@tiptap/starter-kit` v3 bundles `@tiptap/extension-link` by default (same as `Underline`, already used for the floating toolbar's U button) — it was already active with no explicit config, so pasting rich text with an embedded `<a href>` already produced a real `link` mark via the browser clipboard's `text/html` data and Tiptap's default `a[href]` paste rule; the only thing missing was visible styling, which made both "the link doesn't look like a link" and "dark mode link color is unreadable" read as the same bug. Now explicitly configured via `StarterKit.configure({ document: false, link: { HTMLAttributes: { class: styles.link } } })` (`src/components/NoteEditor/NoteEditor.tsx`) and styled in `NoteEditor.module.css` (`.editorContent .link`) with `color: var(--color-primary)` / hover `var(--color-primary-hover)` — both dark-mode-aware since they reuse the same tokens as everywhere else, instead of the browser's unthemed default link blue. Clicking a link still opens it in a new tab (`target: "_blank"`, Link's own default click handler) — unchanged, already worked
- [x] **Manual link creation** (`FloatingToolbar.tsx`): selecting text and clicking the new 🔗 button in the selection toolbar opens an inline URL input (`showLinkInput`/`linkUrl` state, same popover pattern as the `#Tag` picker); Enter/✓ applies via `extendMarkRange('link').setLink({ href })` (bare `example.com`-style input is normalized to `https://…` first), ✕ removes the link via `unsetLink()`; re-opening the picker on already-linked text pre-fills the existing URL for editing
- [x] **Notes editor keyboard focus — Ctrl+Tab replaces Ctrl+Left**: `Ctrl+Left` inside the editor used to jump focus back to the Chronicle nav columns, which meant it couldn't do the normal browser word-jump-left users expect from a text editor. That binding moved to `Ctrl+Tab` (`NoteEditor.tsx`'s capture-phase handler) so `Ctrl+Left`/`Ctrl+Right` are now left alone and behave normally inside the editor; `Ctrl+Tab` pressed from a nav column (tree/list) now also does the reverse — hands focus into the editor (added to `ChronicleView.tsx`'s keydown handler, mirroring the existing Right-arrow-into-editor logic) — so it's a single bidirectional toggle between "the nav columns" and "the editor", not just one direction
- [x] **PgUp/PgDn as alternates for ↑/↓ in Chronicle nav**: `ChronicleView.tsx`'s tree/list column navigation now treats `PageUp`/`PageDown` identically to `ArrowUp`/`ArrowDown` (same single-step move, no larger page-jump) — purely an additional key binding, no behaviour change for the existing arrow keys
- [x] **Fixed: HTML5 drag-and-drop (note tabs, list tabs, Chronicle tree nesting) silently did nothing in the Tauri desktop build.** Root cause: Tauri v2's window config defaults `dragDropEnabled` to `true`, which makes the OS/WebView2 (Windows) capture drag gestures at the native level for its own file-drop handling — when that's on, the DOM's `dragstart`/`dragover`/`drop` events never fire in the webview at all, so every `draggable` element in the app (already correctly implemented in JS/React) was inert specifically in the desktop build, while working fine in the PWA/browser build the whole time. This is a well-known Tauri gotcha, not a logic bug — confirmed by reproducing the note-tab drag-and-drop in a plain headless browser (Playwright, no Tauri involved) and seeing it work correctly there, which is what pointed at the webview layer rather than the React code. Fixed with one line in `src-tauri/tauri.conf.json`: `"dragDropEnabled": false` on the window config. Worth remembering for any future drag-and-drop feature in this app — it only needs to work in JS, this setting is what makes that possible on desktop.
- [x] **External links now open under Tauri** (`src/utils/links.ts`, `openExternalLink()`): Tauri's webview doesn't act on `window.open()`/`<a target="_blank">` for external URLs without the opener plugin — every link across the app (task link pills, list items, calendar events, note hyperlinks) silently did nothing in the desktop build even though the exact same code worked fine in the PWA/browser. Added `@tauri-apps/plugin-opener` (npm) + `tauri-plugin-opener` (`src-tauri/Cargo.toml`, registered in `src-tauri/lib.rs`, `"opener:default"` permission in `src-tauri/capabilities/default.json`); `openExternalLink(url)` checks `'__TAURI_INTERNALS__' in window` (same pattern as `notificationService.ts`) and calls the plugin's `openUrl()` there, else falls back to plain `window.open()`. One capture-phase `click` listener in `App.tsx` (Tauri-only, no-ops entirely in the browser) intercepts every `a[target="_blank"]` click app-wide, so the 8 existing raw `<a target="_blank">` render sites (TaskItem, TaskPane, ListsSection ×2, WatchlistView, AddListItemModal, AddWatchlistItemModal, CalendarEventPane) all got fixed without touching each one individually. The Notes editor's Tiptap `Link` mark is excluded from this listener (matches `.closest('.ProseMirror')`) and handles its own opening instead — see the double-open fix below for why
- [x] **Notes editor hyperlinks — color, click behaviour, and creation** (`NoteEditor.tsx`, `FloatingToolbar.tsx`):
  - `@tiptap/starter-kit` v3 bundles `@tiptap/extension-link` by default (same as `Underline`) — it was already active with no explicit config, so pasting rich text with an embedded `<a href>` already produced a real `link` mark; the only thing missing was visible styling, which made "the link doesn't look like a link" and "dark mode link color is unreadable" the same underlying bug. Now explicitly configured via `StarterKit.configure({ document: false, link: { openOnClick: false, HTMLAttributes: { class: styles.link } } })` and styled in `NoteEditor.module.css` (`.editorContent .link`) with `color: var(--color-primary)` — dark-mode-aware since it reuses the same token as everywhere else
  - **Click behaviour**: Link's built-in `openOnClick` is now disabled; a plain click on a link is handled in `editorProps.handleClick` (`NoteEditor.tsx`) via `openExternalLink()` (so it also works under Tauri, see above); **Ctrl/Cmd+click instead selects the link's full text range** (`getMarkRange` + `TextSelection`) rather than opening it, so a link can be edited (e.g. with Ctrl+L) without navigating away first
  - **Fixed: links opened twice.** Clicking an anchor inside `contenteditable` never triggers the browser's native navigation (by design — otherwise you could never click into link text to edit it), so `NoteEditor` has to open it explicitly itself, in `handleClick`, for every environment — not just Tauri. That explicit call collided with App.tsx's app-wide Tauri click interceptor (see above): ProseMirror detects "click" from its own internal `mousedown`/`mouseup` tracking, which resolves and calls `handleClick` (and our `openExternalLink()`) *before* the browser's separate, later native `click` DOM event is even dispatched — and that later native event is exactly what App.tsx's `document`-level capture listener also matches, firing `openExternalLink()` a second time. Fixed by excluding anything inside `.ProseMirror` (Tiptap's stable, non-CSS-Modules root class) from App.tsx's listener — confirmed via a `window.open` call-count check that a plain click now triggers exactly one call, and Ctrl+click triggers zero
  - **Manual link creation, two paths depending on selection**:
    - Text selected → **Ctrl+L** or the new 🔗 button in `FloatingToolbar` opens an inline URL-only popover (`showLinkInput`/`linkUrl` state, same pattern as the `#Tag` picker); Enter/✓ applies via `extendMarkRange('link').setLink({ href })` (normalizes a bare `example.com`-style input to `https://…` first), ✕ removes the link via `unsetLink()`; re-opening on already-linked text pre-fills the existing URL
    - No selection → **Ctrl+L** opens a small floating "New link" pane in `NoteEditor.tsx` (`newLinkPane` state, portal-rendered at the caret position via `editor.view.coordsAtPos`) with two editable fields — display text and URL — since there's no existing text run to turn into a link; inserts a new text node carrying the `link` mark via `insertContent`. `normalizeLinkUrl()` is shared between both paths (`src/utils/links.ts`)
  - **Font color**: added `@tiptap/extension-text-style` (`TextStyle` + `Color`, the latter re-exported from the same package in Tiptap v3) to the extensions list. `FloatingToolbar` gets a compact 10-swatch picker (`BASIC_COLORS`) behind an "A" button for quick picks on a selection; the main ribbon toolbar in `NoteEditor.tsx` gets a fuller picker reusing the shared `ColorPicker` component (both its `standard` and `light` palettes, 32 colors total) plus a "Default color" button that calls `unsetColor()` — same shared primitive used for Endeavours/Purposes/Tags/Fitness types elsewhere, per the "one design-system component" precedent
- [x] **Notes section session memory**: switching to another app/section and back used to always drop you at the Notes root with no note open, because `uiStore.editingNoteId` was unconditionally cleared on leaving the Notes section (`setActiveView`) — cleared deliberately, since `editingNoteId` doubles as the trigger for `NoteEditorPane`'s cross-app quick-view of a note from *other* sections (`App.tsx`: `{editingNoteId && activeView !== 'notes' && <NoteEditorPane />}`), so it genuinely can't just be left set when leaving Notes without a stray pane popping up elsewhere. Fixed by adding `uiStore.notesLastEditingNoteId`: `setActiveView` now snapshots `editingNoteId` into it whenever *actually leaving* the Notes section (`s.activeView === 'notes'`), and restores `editingNoteId` from it whenever *entering* Notes from elsewhere — `editingNoteId` itself is still cleared on every other section for `NoteEditorPane`'s sake, so a cross-app quick-view opened from Tasks/Calendar/etc. can never leak into or corrupt the remembered Notes position. `selectedNoteTagId` (which notebook is selected) was never cleared on section switch and already survived — only the open note needed this treatment
  - **Architecture decision (asked for explicitly):** this lives in `uiStore` — the layer already shared across every section/app in this single-package codebase — rather than inside `noteStore` or a brand-new store. `uiStore` already holds the one precedent for exactly this shape of problem (`activeCollectionIdByView`, a per-section-keyed map for the Endeavour filter), and `notesLastEditingNoteId` follows the same idea. A separate "session store" would just fragment cross-cutting UI state across two places for no benefit; if/when `uiStore` persistence is eventually built (see "uiStore persistence" in BACKLOG.md), this field starts surviving reloads too, for free, via the same generic mechanism — no separate migration needed later
- [x] **Supabase auth-refresh retry spam**: `GoTrueClient`'s `autoRefreshToken` doesn't stop retrying on its own when offline — it kept firing every few seconds regardless of connectivity, spamming the console with `ERR_NAME_NOT_RESOLVED` / "Failed to fetch". `src/services/supabase.ts` calls `supabase.auth.stopAutoRefresh()`/`startAutoRefresh()` on the browser's `offline`/`online` events (Supabase's own documented pattern, normally used for React Native's `AppState`) — but that alone doesn't cover the case actually diagnosed here: `navigator.onLine` stays `true` (the rest of the internet works fine) while one specific project host never resolves, so the `online`/`offline` listener never fires either way. At the time this was written, an independent DNS lookup found the configured project host (`zwbyvspbamovlqfxpjft.supabase.co`, matching `.env.local`) non-existent — **re-checked 2026-09-16 and the same host now resolves and responds correctly (confirmed via a direct authenticated REST call returning the expected RLS-permission-denied response for the anon role)**, so that finding no longer holds; leaving this note as a reminder that project reachability can change and is worth re-verifying rather than trusting this entry at face value. Added a circuit breaker regardless, as general robustness for this class of problem: `supabase.ts` passes a custom `fetch` via `createClient(url, key, { global: { fetch: circuitBreakerFetch } })` that counts consecutive network-level failures (not HTTP error responses — outright fetch failures) against `/auth/v1/*`; after 3 in a row it calls `stopAutoRefresh()` and waits 5 minutes before calling `startAutoRefresh()` again, instead of retrying every few seconds forever
- [x] **Task Pane Notes field — dynamic height** (`TaskPane.tsx`/`.module.css`): the Notes textarea used to be a fixed ~2-row box, unreadable for anything longer. `notesRef` + a `useEffect` keyed on `[notes]` now auto-grows it to fit content (`el.style.height = 'auto'` then `Math.min(scrollHeight, window.innerHeight * 0.4)`), capped at 40% of the window height and scrollable beyond that (`max-height: 40vh; overflow-y: auto` as a CSS backstop matching the same cap); a `resize` listener keeps the cap correct if the window is resized. `resize: vertical` (manual drag-resize) was removed since it would otherwise fight with the auto-grow on the next keystroke. **Bug hit while building this:** the JS-computed height was being silently overridden back down to `min-height` by the flexbox layout — the textarea's parent (`.body`) is a flex container and, without `flex-shrink: 0`, a flex item's explicit/JS-set height can get shrunk back down by the flex algorithm even when there's plenty of room. Added `flex-shrink: 0` to `.notesInput` to fix it; confirmed via direct DOM measurement (`offsetHeight` matching the intended computed height, not the collapsed one) since the visual symptom alone (a small scrollable box) looked *plausibly* correct at a glance
- [x] **Focused task view — was missing the waiting emoji and scheduled dates** (`TaskItem.tsx`/`.module.css`): the ⏳ "waiting" indicator was styled `opacity: 0` by default with visibility driven purely by CSS `:hover` (`.item:hover .indicator`) — Focused mode's forced-expand is a *React* state (`expanded`/`forceDueDate`), which never satisfies a CSS `:hover` selector, so the emoji stayed invisible there even though tags/notes/links (which use the `hoverDetailsOpen` class, not raw `:hover`) already correctly force-showed. Fixed by giving `.indicator` the same `style={showDueDate ? { opacity: 1 } : undefined}` treatment the `.deadline` pill already had. Also added a scheduled-date pill (`task.scheduledAt`/`scheduledTime`, reusing `formatDeadline()` — genuinely generic despite the name) next to the existing deadline pill, under the same `showDueDate` visibility rule and a new `.scheduled` CSS class (identical hover-opacity pattern to `.deadline`). Both pills are now prefixed with a distinguishing emoji: ❗ for deadline, 🕐 for scheduled
- [x] **Full-app backup/restore, unified** (`src/config/backup.ts`, `PERSISTED_STORAGE_KEYS`): there were two independent Export/Restore implementations — `AccountPane.tsx` (tied to sign-in, pulled from live store state: `tasks, collections, tags, purposes, events, reminders` only) and `IntegrationsPane.tsx`'s "Data & Integrations" panel (raw-localStorage-key based, but its own hand-maintained `BACKUP_KEYS` list only covered `todo-app-storage`/`todo-calendar`/`todo-settings`/`todo-notifications`). Both had silently drifted as new apps were added — **Records/tracker, Routines, Notes, Lists, Portfolio, and Fitness were missing from both**, and the two used incompatible JSON shapes (one flattened store state, the other raw persisted-key blobs), so a file exported from one couldn't be restored via the other. `PERSISTED_STORAGE_KEYS` is now the one list of every localStorage key any store persists to (`todo-app-storage`, `todo-calendar`, `todo-tracker`, `todo-routines`, `notes-storage`, `lists-storage`, `fitness-storage`, `todo-portfolio`, `todo-settings`, `todo-notifications`) — add a key here when a new persisted store is added, nowhere else. Both panes now read/write raw localStorage values keyed off this same list, so their backup files are interchangeable and both are complete. `AccountPane`'s restore now also calls `.persist.rehydrate()` on `taskStore`/`calendarStore`/`trackerStore` (the three Supabase-backed stores) before `forceUpload()`, since writing straight to localStorage doesn't reactively update an already-mounted Zustand store's in-memory state — without the rehydrate, `forceUpload` would've pushed the pre-restore data to Supabase instead of the just-restored data — then reloads the page (matching `IntegrationsPane`'s existing restore behavior) so every other store re-hydrates cleanly from the newly-written localStorage
- [x] **Cross-device sync — fixed two real data-integrity bugs, found via a live incident (2026-09-16)**: a user who'd used desktop signed-out for months, then signed in, found (a) an already-synced Endeavour they'd archived while offline came back un-archived, and (b) a task deleted on desktop stayed visible on their phone indefinitely, even after repeated refreshes. Root-caused to two related defects in `src/services/sync/syncService.ts`:
  - **No deletion propagation, at all, ever.** `syncDiff()` issued a real Postgres `DELETE` on removal. `hydrateStores()` (the only pull path — runs on every `initSync()`, which itself fires on every app load per `App.tsx`'s `getSession().then(...)`, not just first sign-in) can only *add or overwrite* entries present in the fetched remote rows; it has no way to distinguish "this ID is missing from remote because it was deleted elsewhere" from "this ID is missing from remote because it was created locally and never uploaded yet" — hard deletes leave no trace to reconcile against, so a second device's cached copy of a deleted item was never removable by any pull.
  - **Remote silently overwrote local edits with no recency check.** The old merge was `{...local, ...remote}` per entity — for any ID existing in both, remote *always* won, unconditionally. An item edited locally while offline (archived, re-titled, whatever) but already present in Supabase from a prior sync would get reverted back to its stale remote copy on the next login/refresh.
  - **Fix**: switched to soft-delete tombstones. New migration `supabase/migrations/013_soft_delete.sql` adds `deleted_at timestamptz` to all 7 synced tables (`tasks`, `collections`, `tags`, `purposes`, `calendar_events`, `calendar_reminders`, `tracker_entries`) — **written but not yet run against the live project**, same "migration file exists, needs manual execution" pattern already used for `012_fitness_strava.sql`. `syncDiff()`'s delete path now does `.update({ deleted_at: now })` instead of `.delete()`. `hydrateStores()` was rewritten around a new `mergeRecords()` helper (per entity type, generic over the row shape): a remote row with `deleted_at` set removes the local entry outright; otherwise, local and remote are compared by `updatedAt` and the newer one wins (a local-only entry with no remote row at all — the "created offline, not yet uploaded" case — is left untouched either way, since it matches neither branch). `Tag` has no `updatedAt` field in the domain model, so it deliberately keeps the old "remote wins" behavior for edits (still tombstone-aware for deletes) rather than adding a field this fix didn't otherwise need. `runInitSync`'s `isEmpty` check (which decides whether to push local→cloud on a fresh account vs. pull cloud→local) was also updated to only count *live* rows, so an account containing nothing but tombstones is still correctly treated as empty.
  - **Also fixed, same incident**: `initSync` and `forceUpload` could previously run concurrently and interleave (e.g. the page-load-triggered `initSync` still in flight while a manual restore-triggered `forceUpload` runs), each reading/writing store state out of order — plausibly why a prior force-upload attempt appeared to succeed with no error but didn't actually push the expected rows. Both now funnel through a shared `enqueue()` promise-chain mutex in `syncService.ts`, so one always fully completes before the other starts.
  - **New: a direct "Force upload this device's data to cloud" button** in `AccountPane.tsx` (signed-in state, above Export/Restore) — calls `forceUpload()` on live in-memory state directly, no localStorage round-trip and no page reload required (the old recovery path was Export → Restore-from-that-same-file → reload, which is exactly the sequence that could race against a concurrent `initSync`). Reports back exact per-table counts (`UploadCounts`, now returned by `forceUpload()` instead of `void`) so the result is verifiable without opening Supabase directly.
  - **Known gap, not addressed here**: no purge/cleanup of old tombstones — `deleted_at` rows are kept indefinitely. Fine at current data scale; worth revisiting if these tables grow large enough to matter.
- [x] **Supabase sync for Schedules and Lists** — both stores had been localStorage-only since they shipped (no migration ever existed for either); `014_schedules_and_lists.sql` adds `schedules`, `lists`, `list_items`, `list_types` and wires all four into the exact same `syncService.ts` pipeline as every other synced store (soft-delete tombstones, `updatedAt`-aware merge, the `enqueue()` mutex — see "Cross-device sync" above) rather than a parallel mechanism.
  - **`schedules`** mirrors `ScheduleTemplate` 1:1, `blocks jsonb` holding the full `ScheduleBlock[]` (same "commit the whole array on save" shape `collections.field_schema` already uses).
  - **`lists`** / **`list_items`** mirror `List`/`ListItem` 1:1 (`field_schema jsonb`, `tabs jsonb` on lists; `data jsonb` on items). `ListItem.order` is stored as `sort_order` — `order` is a SQL reserved word — renamed only at the mapper/DB boundary, the domain field name is untouched.
  - **`list_types` — custom types only.** Built-in list types (`lt-movies`, `lt-credentials`, … fixed ids, `isBuiltIn: true`) are always re-seeded locally by `listStore.ts` and are **never** uploaded or merged from remote — a new `customListTypes()` filter in `syncService.ts` is applied before every upload and every subscription diff, so a built-in type changing identity on store init can never look like a spurious create/delete. `ListType` has no `createdAt`/`updatedAt` in the domain model (same as `Tag`) — `mergeRecords()`'s existing fallback for timestamp-less entities (remote wins, still tombstone-aware) applies unchanged, no new field added.
  - **Cross-entity ID columns stay untyped `text`, no FK** (`collection_id`, `list_id`, `type_id`, `tab_id`) — matches the established pattern for every other such column in this schema (`tasks.collection_id`, `calendar_events.collection_id`, etc.); only `user_id → auth.users` is a real foreign key anywhere in this schema.
  - `runInitSync`'s `isEmpty` push-vs-pull gate now also checks `schedules`/`lists` live-row counts (alongside the pre-existing `tasks`/`collections`/`calendar_events` check) — an account with schedules/lists already synced, but nothing yet in the three original tables, is correctly treated as non-empty and pulled rather than overwritten.
  - `AccountPane`'s "Force upload this device's data to cloud" button and its `UploadCounts` result now also report schedule/list/list-item/custom-list-type counts.
  - **Not yet run against the live Supabase project** — same "migration file exists, needs manual execution via the Supabase SQL editor" state as `012`/`013` above.
- [x] **Calendar: bold titles, inline notes preview in day/week view, Shift+Tab reverses the view cycle**:
  - `.calItemTitle`/`.weekTimeBlockTitle` (`CalendarView.module.css`) now render `font-weight: 600` — covers every view (month pills, week/day untimed rows, week/day hourly-grid blocks), since both classes are shared across all of them.
  - Day/week's hourly-grid blocks (the two `.weekTimeBlock` render sites in `CalendarView.tsx`, week and day view) now also render `item.notes` inline, in a new `.weekTimeBlockNotes` span below the title — unbolded, smaller font than the title, `overflow: hidden` (the parent block already clips to its fixed pixel height from start/end time, so a long note is clipped, never grows the row). The existing hover tooltip is unchanged and still fires from the same `item.notes` data — this is additive, not a replacement.
  - `Tab` in `CalendarView.tsx`'s keydown handler now also checks `e.shiftKey`: plain `Tab` still cycles Month → Week → Day, `Shift+Tab` cycles the same three in reverse (Day → Week → Month). One handler, one `e.shiftKey` branch — see `hotkeys.ts`.
- [x] **State preservation: Calendar view mode, Notes tab, Lists selection — all now survive switching to another app and back.** An audit found these three cases where a section's own local `useState` reset on remount (every app-switch unmounts the previous section), unlike `activeCollectionIdByView`/`notesLastEditingNoteId`, which already lived in `uiStore` and therefore already survived:
  - **Calendar view mode**: `CalendarView.tsx`'s `desktopMode` local state moved to `uiStore.calendarViewMode` (`'month' | 'week' | 'day'`, default `'month'`) + `setCalendarViewMode`. Every existing read/write site in `CalendarView.tsx` was a drop-in swap except the one functional-update call site (`Tab` handler), which now computes the next mode directly off the store value instead (safe — `desktopMode` is already in that effect's dependency array, so the closure is always current).
  - **Notes tab**: `uiStore.notesLastActiveTabId` (+ `setNotesLastActiveTab`) mirrors `NoteEditor.tsx`'s `activeTabId` on every change, same "continuously mirror the live value" pattern as everything else in this batch. A new `hasRestoredTabRef` + one-time-captured `initialTabRestore` (`{ noteId, tabId }`, read from `uiStore.getState()` once at mount) makes the note-load effect restore that tab — instead of resetting to Main, its normal behaviour — exactly once, and only when the note being loaded is the same note `notesLastEditingNoteId` already pointed at (i.e., this is a genuine "returning to Notes" restore, not a later in-session switch to a different note, which still resets to Main as before). A stale/deleted tab id falls back to Main via a `note.tabs?.some(...)` existence check.
  - **Lists selection**: `ListsSection.tsx`'s `selectedListId`/`selectedTabId` were pure local state with no persistence at all — `uiStore.activeListId` already existed but is write-only-during-use (cleared to `null` on unmount, since `AddTaskButton` and the `N`/`Space` hotkey read it live to decide whether "Add item" is offered, so it can't just be left populated). Added a **separate** pair, `listsLastActiveListId`/`listsLastActiveTabId` (+ `setListsLastActive`), mirrored on every list/tab change via a dedicated effect's cleanup closure (fires on both change and unmount) — same "keep the live-use field and the remembered-last field separate" split `notesLastEditingNoteId` already established for Notes. Both `useState` initializers now seed from these instead of hardcoded `null`/`'all'`; the pre-existing "remembered list no longer exists → fall back to the first list" effect needed no changes (it already generically handles a stale id, it just previously never received anything but `null` to be stale). A new small effect resets a stale/deleted remembered tab to `'all'`.
- [x] **Ctrl+T — new tab, prompting for a name — in both places tabs exist (Notes, Lists)**: NoteEditor's pre-existing `handleAddTab` (the toolbar `+` button) silently created a tab named "Tab N" with no rename step; both it and the new `Ctrl+T` binding now immediately enter the same rename-input state a double-click-the-active-tab already used (pre-filled with the default name, auto-selected on focus via the existing `onFocus` handler — Enter or clicking outside accepts it, Escape cancels), so "prompts for a name" is true for both entry points, not just the hotkey. Registered alongside the existing Ctrl+PageUp/PageDown tab-cycle handler in each component (`NoteEditor.tsx`'s editor-focused capture-phase handler; `ListsSection.tsx`'s document-level handler) — for Lists specifically, the cycle branch still requires `hasTabs`, but the new Ctrl+T branch only requires a list being selected, since it's the only runtime way to add a *list's very first* tab (mirrors exactly what the header's always-visible `+` button already does for that same bootstrap case).
  - **Known caveat, not fixed here**: in a plain browser tab (the Vercel PWA build, not Tauri/Android), `Ctrl+T` is typically intercepted by the browser chrome itself to open a new browser tab, before JavaScript ever sees the keystroke — `e.preventDefault()` in our handler can't stop that. Not verified either way in a real browser session; flagged as a risk specific to the web deployment, not Tauri/Android.
- [x] **Task Calendar Items — deadlines and scheduled tasks are now both real, synced calendar entities, with a layer toggle to show/hide each category.** Previously only `Task.scheduledAt` created a real, syncable `CalendarEvent` (via `Task.calendarEventId`); `Task.deadline` was purely a display-time synthesis in `CalendarView.tsx` with no backing row at all — confirmed by investigation, not assumed, when a user noticed deadline-derived items never appeared in the `calendar_events` Supabase table. Resolved by giving deadlines the same real-entity treatment scheduled tasks already had, extended to a full "layers" feature:
  - **New field, mirroring `calendarEventId` exactly**: `Task.calendarReminderId: CalendarReminderId | null` — an auto-created, auto-kept-in-sync `CalendarReminder` (not `CalendarEvent`; a deadline is a reminder, not a duration-based event). Wired in `AddTaskModal.tsx` (create path: `addReminder({..., reminderType: 'task'})` alongside the pre-existing `addEvent` call for `scheduledAt`) and `TaskPane.tsx` (`handleDeadlineChange`/`handleDeadlineTimeChange`, a line-for-line mirror of the pre-existing `handleScheduledAtChange`/`handleScheduledTimeChange` — same create-if-absent/update-if-present/delete-if-cleared shape). `TaskPane.handleDelete` and `TaskItem`'s Android swipe-to-delete now both clean up `calendarReminderId` (the swipe-delete path previously didn't even clean up `calendarEventId` either — a pre-existing orphan-row gap, fixed in the same pass since it's the same category of bug applied to the field being added).
  - **New type fields driving the layer filter**: `CalendarEventType` gained `'task'` (alongside `'default'`/`'birthday'`) — set on a scheduled task's shadow event. `CalendarReminder` gained `reminderType: CalendarReminderType` (`'default' | 'task'`) — set on a deadline's shadow reminder. `calendar_reminders` gets a new `reminder_type` column (`015_task_calendar_layers.sql`, **written, not yet run against the live project**); `event_type` needed no schema change (already a free-text column with no CHECK constraint) and `tasks.calendar_reminder_id text` was added in the same migration.
  - **Rendering — deliberately asymmetric with scheduled events, on purpose**: the deadline pill's render path in `CalendarView.tsx` (`kind: 'task'`, synthesized directly from `Object.values(tasks)`, ❗ icon, milestone diamond styling, opens `TaskPane` in one click) is **completely unchanged** — the new `CalendarReminder` row is deliberately never rendered a second time (`itemsByDate`'s reminders loop unconditionally skips any `reminderType === 'task'` row). This preserves the existing, well-liked deadline UX exactly; the shadow reminder exists purely for sync, layer-filtering, and notifications. Confirmed with the user as the desired click-target (vs. matching the scheduled-event precedent of opening a pane with a "linked task" chip) specifically because a deadline is task metadata first, not an independently-managed item.
  - **One-time backfill, idempotent, runs on every app mount** (`src/services/taskCalendarBackfill.ts`, called from `App.tsx`): for every pre-existing task with a `deadline` but no `calendarReminderId`, creates the shadow reminder; for every pre-existing scheduled task whose shadow event's `eventType` isn't yet `'task'`, retags it. No "have I ever run this" flag needed — each check is a plain per-task existence test, so re-running is always a no-op for anything already linked, and it self-heals a cross-device sync edge case for free (a task pulled in from another device that hasn't backfilled yet just gets caught here on this device's next reload).
  - **Task notification triggering deleted entirely, moved onto the reminder it now always has**: `useNotificationChecker.ts`'s `taskTrigger()` function and the whole "Tasks" notification loop are gone — every task capable of firing a deadline notification now always has a linked `CalendarReminder`, so the pre-existing Reminders loop (`reminderTrigger`) is the sole trigger path for both plain reminders and deadline notifications. **The one real risk this raised** (flagged and confirmed before deleting, not assumed safe): a task-linked reminder needed a guard the plain Reminders loop never had — a completed/archived task's shadow reminder must stop notifying without the reminder row itself being deleted (the deadline pill stays visible with completed-styling after completion, unchanged; only its notification needs to stop). Added a `taskByDeadlineReminderId` lookup map, checked before computing a `reminderType: 'task'` reminder's trigger. `NotificationCenter.tsx`'s Done/Archive actions (previously task-kind-only) now also work for a task-linked reminder notification (`Object.values(tasks).find(t => t.calendarReminderId === n.itemId)`), so no functionality was lost in the move — clicking Done/Archive on a deadline notification still completes/archives the *task*, not just dismisses the reminder. `NotificationKind`'s `'task-timed'/'task-untimed'` variants and their handling in `NotificationCenter` were deliberately left in place (not deleted) purely as graceful handling for any notification already pending in a user's `todo-notifications` localStorage from before this change — nothing produces them anymore, but stale ones won't crash.
  - **Layer toggle**: `src/components/CalendarLayersPicker/` — a small header dropdown (styled to match `PurposeFilterPicker`'s pattern; deliberately kept as a simple, easily-relocatable component per the request to keep its location/style flexible for later) with 4 checkboxes: Events, Reminders, Task scheduled, Task deadlines. Filter state lives in `settingsStore.calendarLayerVisibility` (persisted — a hidden layer stays hidden across reloads), not `uiStore`, since it's a durable preference, not transient UI; only the dropdown's open/closed state (`uiStore.calendarLayersOpen`) is ephemeral. `CalendarView.tsx`'s `itemsByDate` builder gates each of its four push sites behind the corresponding flag (events split into task vs. non-task by `eventType`; birthdays fall under the plain "Events" layer, no separate toggle). **Deliberately separate from the pre-existing per-`Schedule` `active` toggle** (`ManageSchedulesPane`) — the request named exactly these four categories, not the recurring-timetable feature, which keeps its own established toggle mechanism unchanged.
  - **Not done**: an Android/mobile-specific layout for the layers dropdown (desktop-only for this pass, same "accessible but not optimised" carve-out already used for Schedule's own header row).
- [x] **Backspace — go back to the previous app section, browser-back-style.** `uiStore.sectionHistory: SectionHistoryEntry[]` (most-recent-first, capped at `MAX_SECTION_HISTORY = 6`) — an object shape (`{ view: AppView }`), not a bare `AppView[]`, specifically so a future entry could carry more than "which section" (e.g. which note/list was open) without a breaking change to the stack's element type; scoped to app-switching only for this pass, per the request. `setActiveView(view, opts?: { skipHistory? })` pushes the *previous* view onto the stack on every real switch (a no-op switch to the already-active view pushes nothing); `navigateBack()` pops the top entry and calls `setActiveView(prev, { skipHistory: true })` — skipping the history push on the way back is what lets repeated Backspace presses walk further back through the stack instead of bouncing between the same two sections (a naive "always push" would never let you get further than one step back). `Backspace` (no modifiers) is global, registered in `App.tsx`'s central keydown handler, guarded by the same `isTyping` check as every other global hotkey there.
- [x] **Customizable hotkeys — first version, scoped to the hotkeys App.tsx itself dispatches.** Clicking a Primary/Secondary cell in Settings → Keyboard shortcuts now lets you capture a new key combination for it; conflicts prompt a yes/no confirm (reassigning steals the binding from whatever else had it); a per-row ↺ resets just that hotkey, a header button resets everything.
  - **Scope decision, flagged and confirmed before building**: `hotkeys.ts`'s own header comment has always said the actual keydown handling lives scattered across `App.tsx` *and* several components with their own local listeners (Calendar's Tab/arrows, Notes' Ctrl+L/Ctrl+T/Ctrl+PgUp, Lists' Ctrl+PgUp/Ctrl+T, Portfolio's Ctrl+±) — see "Hotkeys rule" above. Making every one of those dynamically read a user override would mean touching a keydown handler in nearly every interactive component in the app — a much bigger, riskier change than what was asked for. This first version wires up only the hotkeys `App.tsx` itself handles (`Navigation` 1–7 and `Actions`' N/Space, S, E, P, M, Backspace — 12 entries total) via a new `customizable: true` flag on `HotkeyDef`; component-local hotkeys still render in the Settings table (for reference) but have no click-to-rebind affordance. `Esc` is `protected: true` (no rebind UI at all) since it's a near-universal "close" convention used almost everywhere in the app (see the Escape-key audit above) — reassigning it would be surprising nearly everywhere at once.
  - **`HotkeyDef` gained a required `id`** (e.g. `'nav-tasks'`, `'action-settings'`) — the stable key overrides are stored against; renaming an `id` after it ships would silently orphan any existing user override for that hotkey, so treat `id`s as permanent once shipped, same care as a Supabase column name.
  - **`src/utils/hotkeyBinding.ts`** — pure parse/format/match functions for the binding-string format hotkeys.ts already used for its display strings (`'1'`, `'Ctrl+1'`, `'Space'`, `'Backspace'`, …), so existing defaults parse with zero data migration. `matchesBinding(e, binding)` requires an **exact** modifier match (all of Ctrl/Shift/Alt/Meta, not just "at least these") — slightly stricter than a couple of the old hardcoded `App.tsx` conditions, which for a few letter-key hotkeys (E, P, M) matched both the plain letter and its Shift-shifted form as an accidental side effect of checking `e.key === 'e' || e.key === 'E'`. That undocumented Shift-alias is gone; exact matching is required for conflict detection to mean anything, and nobody was relying on Ctrl+Shift+1-style presses intentionally.
  - **`src/store/hotkeyOverridesStore.ts`** — persisted (`todo-hotkey-overrides`) `Record<id, {primary?, secondary?}>`; `getEffectiveBinding(id)` (override, else default) and `matchesHotkeyId(e, id)` are plain functions (not hooks) for `App.tsx`'s keydown handler, which needs the current value on every keystroke rather than a subscription; `findConflicts(binding, excludeId)` scans every *customizable* hotkey's effective bindings for a collision.
  - **`App.tsx`'s central keydown handler** — every customizable hotkey's hardcoded `e.key === '1'`-style condition became `matchesHotkeyId(e, 'nav-tasks')` etc.; behaviour is identical to before as long as nothing has been rebound (verified via a clean `tsc -b`, and by construction — the binding parser round-trips the exact default strings already in `hotkeys.ts`). **Ctrl+N stays a permanent, non-customizable bonus alias** for "New item" (hotkeys.ts has only ever documented it as "N / Space — Ctrl+N also works", never a real third binding slot) — hardcoded inline rather than routed through the override system.
  - **Conflict resolution semantics**: reassigning a key that's already used elsewhere **steals** it — the confirm dialog says so explicitly, and on confirm every other customizable hotkey whose effective primary/secondary matches the new binding gets that one slot cleared (`setOverride(id, slot, null)`), leaving its other slot (if any) untouched.
  - **Not done (explicitly out of scope for this first version, not overlooked)**: rebinding any component-local hotkey (Calendar/Notes/Lists/Portfolio's own listeners); a "which hotkeys are customizable" filter/search in the Settings table; per-slot (vs. whole-row) reset.
- [x] **Fixed: day view's timed grid silently ignored Schedule block durations.** `CalendarView.tsx`'s two per-view time-grid builders (`weekTimeGrid`/`dayTimeGrid` useMemos) each independently computed an item's end-of-block minute — week view's copy correctly special-cased `kind: 'schedule'` (reading the block's own `endTime`), but day view's copy never had that branch at all, so every Schedule occurrence (a recurring class/timetable block) silently fell back to the generic 30-minute default in day view regardless of its real length, while the exact same block sized correctly in week view. Fixed by extracting the shared logic into one `getItemEndMinutes(item, startMin)` closure (defined once, used by both `weekTimeGrid` and `dayTimeGrid`) — this is now the single source of truth for "how long does this block visually span," so the two views can't drift apart on this again the way they just did.
- [x] **Restored start/end time display on week/day time-grid blocks** (`.weekTimeBlockTime`, `CalendarView.tsx`/`.module.css`) — a prior pass had deliberately removed the single start-time label from these blocks (reasoning: the hour gutter already shows the time — see "Week/day time-grid polish" above), but on reflection the explicit range reads better at a glance than cross-referencing the gutter, especially for irregular-length blocks. Re-added as a real **range**, not just the old single start-time label: `{start}–{end}`, computed via the same `getItemEndMinutes()` used for the block's own height, so the displayed range always exactly matches what the block's size implies. Shown for every timed kind (task/event/reminder/schedule) in both week and day view.
- [x] **Location now shown directly on week/day calendar blocks** (`.weekTimeBlockLocation`, 📍 icon — same pin emoji already used in `ScheduleOccurrencePopover`, reused rather than inventing a new icon): a shared `getItemLocation(item)` closure in `CalendarView.tsx` resolves an event's location via `events[item.id]?.location` (schedule blocks carry `location` directly on the `CalDisplayItem` already). Rendered as a small muted line between the title and notes, ellipsis-truncated at the block's width. Deliberately scoped to week/day's hourly grid only (not month view's cramped pills, not the untimed/all-day rows) — this is where there's actually room for it and where the user asked for it.
- [x] **Timepicker rebuilt as a segmented-input-plus-quick-pick combobox** (`src/components/TimeInput/TimeInput.tsx`/`.module.css`) — confirmed first that every time-input surface in the app already goes through this one shared component (the only literal `<input type="time">` left in the codebase is inside `TimeInput` itself), so "are we reusing a timepicker" was already true; what needed fixing was the interaction design. Kept the existing hour/minute-segment-plus-AM/PM-toggle shape (still the right bones — respects `settingsStore.clockFormat`, which a native `<input type="time">` can't) but reworked how typing behaves, and added a click-to-pick dropdown:
  - **Segments always resolve to a definite two-digit value before advancing, and reject impossible entries immediately with visible feedback** instead of the old plain `<input type="number">`'s silent keystroke-swallowing (which read as "my keypress didn't register"). Rules, confirmed with the user before building: 24h hour's first digit must be 0/1/2 (no valid HH starts higher) — anything else is an immediate mistake; 12h hour's first digit 2-9 auto-finalizes as that single-digit value (no valid 12h hour continues past it) while `0`/`1` wait for a possible second digit; minutes always require a first digit 0-5. An invalid entry triggers a brief red flash (`.segmentError`, a `color-mix(in srgb, var(--color-danger) 35%, transparent)` keyframe pulse) and wipes just that segment back to blank — it does not clear the other segment. Clicking into an empty hour segment defaults the minute segment to `:00` so a bare hour can be committed with one fewer keystroke.
  - **Quick-pick dropdown** (▾ button, or opens automatically on segment focus): every half hour across the day, formatted via the same `formatTime()`/`clockFormat` every other display call site uses, auto-scrolled to the current/nearest value on open, plus a "Clear" row when a value is set. Not portaled (plain `position: absolute` within the component's own `position: relative` wrapper) — matches the precedent of the app's other small in-context dropdowns (`CalendarLayersPicker`, `PurposeFilterPicker`).
  - **Two real bugs caught and fixed during implementation, both found via headless-browser round-trips, not just eyeballing the code:** (1) auto-advancing focus from the hour segment to the minute segment on hour-complete synchronously triggered a native `blur` on the hour input *before* React had flushed that keystroke's `setHourStr`/`onChange`, so the blur handler's stale closure re-committed the pre-keystroke value and silently reverted what was just typed — fixed with a `skipHourBlurCommitRef` flag set right before the auto-advance focus shift, checked (and cleared) at the top of the blur handler, rather than trying to out-race the timing with a `setTimeout`. (2) that same blur-triggered re-commit, even once value-identical, was not actually harmless: a linked start→end auto-computation one level up (see below) has real side effects on every `onChange`, so a redundant call could re-derive the end time from whatever the end time had *already become* rather than what it originally was, silently overwriting a just-computed-correct result. Both bugs only ever showed up across a full multi-keystroke typing sequence, never in a single isolated keystroke — worth remembering if this component is touched again: test a full realistic typing sequence, not just one key at a time.
  - **Linked start/end times**, per the user's explicit spec (confirmed before building): typing a start time that would leave the end time not-after it auto-adjusts the end — to `start + 60min` if no end was set yet, or (if an end time already exists) by nudging only its *hour* forward by 0 or 1 while preserving its already-chosen minutes, so a deliberately-set end doesn't get its minute-of-hour clobbered. Wraps correctly past midnight (`dayOffset` in the return value bumps a paired end-*date* field when the caller has one). Implemented as one pure, reusable function, `computeLinkedEndTime(startTime, currentEndTime)` in `src/utils/date.ts` (alongside a new `addDaysToIso()` helper), wired into every start/end time pair in the app: `AddCalendarItemModal`, `CalendarEventPane` (both also bump `endDate` on rollover), and `AddScheduleModal`'s block editor (both the "+ Add block" form and existing block rows — no rollover concept there, since a weekly recurring block has no date to bump).
    - **A third bug, one level up from TimeInput itself, also caught and fixed**: because the hour segment commits (and triggers the linked-end computation) *before* the minute is even typed, naively re-deriving "is the end time already set" from the live `endTime` state on every keystroke made the auto-link stick to its own most recent guess instead of continuing to track "no real end chosen yet" — e.g. typing "23" then "59" into the start hour/minute would compute the correct `+60min` after "23:00" commits, then immediately re-derive from *that* stale guess once "23:59" commits, landing on the wrong final answer. Fixed with an `endAutoRef` boolean in each caller (`AddCalendarItemModal`, `CalendarEventPane`) that tracks whether the current end time is still just an auto-guess (treated as unset for re-linking purposes) versus something the user directly typed into the End field (`handleEndTimeChange` flips it to `false`) — `AddScheduleModal`'s block editor doesn't need this, since its start/end always default to a real non-empty 09:00–10:00 pair, so the "no end set yet" branch never triggers there in the first place.
- [x] **Notes/Lists keyboard nav — Ctrl+Tab repurposed as the tab-cycle key, Ctrl+` takes over pane-focus-toggle, and Lists gained a Chronicle-style nav area.** Two related changes, done together because the second borrows the first's freed-up key:
  - **Notes**: the nav-columns↔editor focus toggle (`ChronicleView.tsx`/`NoteEditor.tsx`) moved from `Ctrl+Tab` to `` Ctrl+` `` (the backtick), and `Ctrl+Tab`/`Ctrl+Shift+Tab` became a second, additional binding for the existing tab-cycle action (alongside the untouched `Ctrl+PgUp`/`Ctrl+PgDn`) — `Ctrl+Tab`-cycles-things is the near-universal convention (browsers, IDEs) and freeing it up for that is more intuitive than using it for pane-switching. `NoteEditor.tsx`'s capture-phase handler: the old `e.key === 'Tab'` check on the nav-return branch became `e.key === '\`'`; the tab-cycle branch's key check grew an `e.key === 'Tab'` alternative alongside `PageUp`/`PageDown`, with direction now derived from `e.shiftKey` when the key is `Tab` (`Ctrl+Shift+Tab` reverses, matching `PageUp`).
  - **Lists**: previously had zero keyboard navigation for the sidebar list-of-lists at all. Added a two-area focus model (`ListsSection.tsx`'s new `focusedArea: 'nav' | 'content'` state) — deliberately simpler than Chronicle's three-column model since Lists has no drill-down hierarchy, just "the sidebar" vs. "everything else." `` Ctrl+` `` toggles which area responds to plain `↑`/`↓`; when `nav` is focused, `↑`/`↓` move the selected list through `navOrder` (a visual-order array — watchlists group then reference group, matching the sidebar's actual on-screen grouping, not raw creation order) via the existing `handleSelectList()`. The sidebar gets a `.navAreaFocused` class (accent color on the "MY LISTS" header, mirroring Chronicle's `.panelFocused` treatment) so the active area is visible, not just functional. The existing tab-cycle handler (`Ctrl+PgUp`/`Ctrl+PgDn`) gained the identical `Ctrl+Tab`/`Ctrl+Shift+Tab` alternative bindings as Notes, for the same "match the universal convention" reasoning — one `isTabCycleKey` check shared between the `Tab` and `PageUp`/`PageDown` cases.
  - Both `src/config/hotkeys.ts` entries updated to match (`notes-focus-toggle`, `notes-cycle-tabs`, plus new `lists-nav`/`lists-focus-toggle`/updated `lists-cycle-tabs`) — all still component-local, non-customizable hotkeys per the existing "Hotkeys rule" scope (see "Customizable hotkeys" above for why component-local hotkeys aren't wired to the override system yet).
- [x] **Full name on hover for truncated names in the Notes nav columns** (`src/components/TruncatedText/TruncatedText.tsx`, new shared component): the Chronicle notebook tree (`.nodeName`) and the note list (`.noteTitle`) both CSS-ellipsis-truncate long names, with no way to see the full name short of opening the item. `TruncatedText` wraps the existing title/name span, checks `scrollWidth > clientWidth` on hover (so it's a no-op when the text isn't actually truncated), and — only then — renders a small floating tooltip via `createPortal(..., document.body)` positioned **below the row** (`rect.bottom + 4`, clamped so it never runs off the right edge of the viewport), not at the cursor and not overlapping the row. This is deliberate: both rows reveal hover-action buttons (Chronicle's ↳/✎/✕, NoteList's equivalents) inline in the same row, so a tooltip that covered the row or appeared near the cursor risked hiding the very buttons a user might reach for next. Styled to match `LinkHoverPreview`'s existing hover-box look (surface background, border, `--shadow-md`) but positioned per-row rather than in a fixed screen corner, since (unlike a single global link preview) there can be many truncatable rows on screen and each needs its own tooltip anchored to itself. Swapped in as a drop-in replacement for the plain text nodes in `ChronicleView.tsx` (tree node name) and `NoteList.tsx` (note title) — no CSS changes needed at either call site, since `TruncatedText` renders the same element type/class the row's existing CSS already expects (a `<span>` inside a `display:flex` container lays out identically to a `<div>` there, flex blockifies either).

## Dark mode — implementation details

### How it works

- **CSS variables**: All colors live as `--color-*` custom properties in `src/index.css`. The `:root` block defines light mode values; `[data-theme="dark"]` on `<html>` overrides them with dark equivalents.
- **New semantic variables added**: `--color-surface-alt`, `--color-primary-subtle`, `--color-primary-border`, `--color-danger`, `--color-danger-muted`, `--color-warning`, `--color-warning-muted`, `--color-success-muted`, `--color-success-text`, `--shadow-lg`
- **FOUC prevention**: Inline `<script>` in `index.html` `<head>` reads `localStorage['todo-settings'].state.theme` synchronously and sets `data-theme` before React hydrates.
- **Theme effect** (`src/App.tsx`): `useEffect` reads `theme` from `settingsStore`; for `'system'` mode it attaches a `matchMedia('prefers-color-scheme: dark')` listener that updates `data-theme` on OS changes; for explicit `'light'`/`'dark'` it sets `data-theme` directly.
- **settingsStore** (`src/store/settingsStore.ts`): Added `theme: 'light' | 'dark' | 'system'` (default `'system'`) and `setTheme` action.
- **Settings UI** (`src/components/SettingsPane/SettingsPane.tsx` + `.module.css`): Appearance section at top with a 3-button segmented control (Light / System / Dark) — follows existing `viewModeToggle` pattern.

### CSS migration rule

All component `*.module.css` files must use CSS variables — **no hardcoded hex colors** for neutral/semantic values. Intentional accent colors that don't adapt (e.g. `#6366f1` indigo in NoteEditor highlight style, `#1e293b` code block background, `#374151` Notes FAB) are acceptable exceptions.

The `FloatingToolbar.module.css` is intentionally dark in all themes (it's a floating editor toolbar) — leave its colors as-is.

## Fitness App (Phase 1 — manual entry + customisable activity types + Strava import)

Full spec: BACKLOG.md → "Fitness App — Physical Exercise Tracking". New suite app (nav hotkey `7`/`Ctrl+7`, "extras" group below the `<hr>` divider in NavSidebar, alongside Portfolio) — physical activity tracking, built to later import automatically from Strava without a data-model change. Also the first app built against the **add-on tier** (see "Add-on app architecture" below) — code-split and gated through `isAppEnabled()`, same as Portfolio now is.

**Separate-but-linkable, following the Lists/Portfolio precedent, not the aspirational one:** CLAUDE.md's suite architecture describes Purposes as a fully shared cross-app entity, but in practice neither Portfolio nor Notes actually reuse the Organizer's `Purpose`/`PurposeId` — each rolled its own (Portfolio has its own `InvestmentPurposeId`, Notes has none at all). Fitness deliberately breaks from that and **does** import the shared `PurposeId` type (one type-only import in `src/types/fitness.ts`, same lightweight-coupling pattern `notes.ts` already uses for `CollectionId`) — chosen because the user explicitly asked for suite-wide connections and cross-app Purpose tagging is the cheapest, least-coupled way to get it. Everything else about Fitness (its own store, own component tree, own config) follows the Lists/Portfolio pattern of zero further coupling: `src/types/fitness.ts` is **not** re-exported through `src/types/index.ts` (import it directly as `@/types/fitness`, same as `@/types/lists` / `@/types/portfolio`); ID generation is local `nanoid()` in `fitnessStore.ts`, not routed through the shared `utils/id.ts` helpers. `ColorPicker` is the one shared UI primitive Fitness reuses directly — it's a genuine design-system component (like the platform layer is meant to provide), not an Organizer domain concept, so reusing it doesn't compromise separation.

### Data model

`src/types/fitness.ts` — `ActivityId` and `ActivityTypeId` (both branded). `ActivitySource = 'manual' | 'strava'` is an extensible union (Garmin/Apple Health/Google Fit/CSV are future members, not new types).

**`ActivityType` is a user-customisable registry, not a closed union or static config** — promoted from a plain `'run' | 'hike'` string in the very first cut of this app to a full stored entity once customisation was requested, because "add/delete/update the data captured" needs somewhere to persist per-type field definitions:

```typescript
interface ActivityType {
  id: ActivityTypeId; name: string; icon: string; color: string | null;
  tracksDistance: boolean;             // shows/hides the Distance field for this type
  fieldSchema: ActivityFieldSchema[];  // local to Fitness — NOT Records' FieldSchema (see below)
  isBuiltIn: boolean;   // gates deletion only; name/icon/color/tracksDistance/fieldSchema stay editable regardless
  archivedAt: string | null; createdAt: string; updatedAt: string;
}
```

Built-in types (`src/config/activityTypes.ts`'s `BUILTIN_ACTIVITY_TYPE_SEEDS`, seeded into the store on first load / migration) use **fixed, well-known ids** (`'run'`, `'hike'`, `'walk'`, `'ride'`, `'swim'`, `'strength'`, `'yoga'`, `'other'`) rather than `nanoid()` specifically so a future Strava sync can map `sport_type` → our type directly (e.g. `'Run'` → `'run'`) with no lookup table. User-created custom types get a random id. `ActivityFieldSchema`/`ActivityFieldType` (`text|number|date|rating|select|boolean|url|duration` — same 8-value set as Records' `FieldType`, deliberately re-typed rather than imported, mirroring how `ListFieldSchema` is Lists' own independent copy, not a Records import) — the field-customisation UI is a close mirror of `EditTrackerPane`'s field editor (see UI below), reusing that exact interaction pattern.

**`tracksDistance` fixes a real bug from the first cut of this app**: every activity type showed the same Distance + Moving Time fields regardless of whether distance made sense (Yoga and Strength don't have one). Moving time stays universal — every activity has *some* session length — but Distance is now conditional per type. Built-in seed values: `true` for Run/Hike/Walk/Ride/Swim/Other, `false` for Strength/Yoga. User-editable via a checkbox in `EditActivityTypeModal` ("Has a distance"), same as everything else about a type.

The `Activity` interface itself:

- `type: ActivityTypeId` — references the registry above (was a plain string in the pre-customisation version of this app).
- Canonical units are always SI (`distanceMeters`, `movingTimeSeconds`, `elapsedTimeSeconds`, `averageSpeedMps`) regardless of display preference — unit conversion happens only in `src/utils/fitnessFormat.ts`, at render time. Phase 1 display is metric-only (km, km/h); an imperial toggle is a render-layer-only change whenever it's wanted.
- `data: Record<string, unknown>` — now genuinely driven by the selected `ActivityType.fieldSchema` (custom field values keyed by `ActivityFieldSchema.id`), in addition to still being the extensibility valve for future Strava-only fields not yet in any schema.
- `sourceRaw: Record<string, unknown> | null` — extensibility valve, never read by Phase-1 UI. Exists so a future Strava sync can store the *entire* raw API payload (elevation, heart rate, splits, GPS polyline, kudos…) on day one, so surfacing more fields later in the UI is not a re-sync.
- `source` + `sourceId` — `sourceId` is `null` for manual entries; for imported ones it's the external activity id and needs a `(source, sourceId)` uniqueness constraint so re-syncing never duplicates. `fitnessStore.upsertBySource()` already implements the upsert-by-(source, sourceId) logic Phase 2's Strava sync will call — built now, unused until then.
- `archivedAt: string | null` — same sunset pattern as `Collection`/`Purpose`; no archive/restore UI wired up for Activities yet (delete is the only sunset action right now — the field exists so adding Archive later doesn't need a migration). `ActivityType` also has `archivedAt`, same reasoning, also unused by any UI yet (deletion is immediate for non-built-in types today).
- `purposeIds: PurposeId[]` — see the cross-app note above.

**Cross-app linking to Records (futureproofed, not built):** the `cross_app_links` table already exists (`supabase/migrations/008_notes_initial.sql`, created ahead of Notes actually using it — same situation here) and needs zero schema change to link an `Activity` to a Records tracker entry later; `Activity` having a stable typed ID today is the only prerequisite, and it does. No Fitness code reads or writes `cross_app_links` yet — nothing else in the app does either.

### Store — `fitnessStore.ts`

Zustand, `persist` to `fitness-storage`, **v3**, localStorage only (same "start local, Supabase sync is a later phase" choice already made for `noteStore`/`listStore`). `v1 → v2` migration seeds `activityTypes` for anyone who already had v1 data (v1's `Activity.type` held plain `'run'`/`'hike'` strings, which already match the fixed built-in ids, so existing activities keep working with no further migration). `v2 → v3` backfills `ActivityType.tracksDistance` — built-ins get their correct per-type default by looking up `BUILTIN_ACTIVITY_TYPE_SEEDS` by id (Strength/Yoga → `false`, everything else → `true`); any custom type a user already created defaults to `true` (matches `addActivityType`'s default). Actions: `addActivity`, `updateActivity`, `deleteActivity`, `upsertBySource` (Phase 2 sync entry point); `addActivityType`, `updateActivityType`, `deleteActivityType` (blocked for `isBuiltIn` types — the store enforces this, not just the UI).

`src/utils/fitnessActivityTypes.ts` — `getActivityType(id, activityTypes)` (graceful fallback to a generic "Activity ⛰️" if a referenced type was deleted — never throws) and `getTopActivityTypes(activityTypes, activities, count)` (usage-ranked: counts how many activities reference each type, returns the top N; falls back to `DEFAULT_TOP_TYPE_IDS` = `['run','hike','ride']` to fill any remaining slots so a brand-new user never sees an empty pill row).

### UI

- `FitnessSection/` — activity list (type icon, title, date, **distance, moving time, average speed** — exactly the three stats the UI is scoped to show; everything else is stored but not rendered). Empty state prompts "Add activity". A `source === 'strava'` badge is wired into both the list row and the edit modal header, and now genuinely set by synced activities. `StravaConnect` subcomponent (in `FitnessSection.tsx`, not split out — small enough): "Connect Strava" / "Sync now" + status message, see "Strava integration — built" above for the full wiring.
- `AddActivityModal/` — unified create/edit (mirrors the `AddCollectionModal`/`AddPurposeModal` `isEditMode` pattern, **Escape-safe from the very first commit**). Type row: the top-3-by-usage types render as pills (`getTopActivityTypes`), a native `<select>` labelled "More…" lists every active type plus a trailing "+ New activity type…" option (selecting it opens `EditActivityTypeModal` in create mode), and a `⚙` **Customise** button opens the same pane in edit mode for whichever type is currently selected — this is the "customise button somewhere appropriate" the field-customisation ask wanted, placed directly on the row it affects rather than buried in a separate settings area. Below that: title (defaults to the type name if left blank), date, **distance in km (only rendered when the selected type's `tracksDistance` is true — hidden entirely for Strength/Yoga, not just left blank)**, moving time as h/m inputs (mirrors the existing duration-field h/m/s UX from `AddEntryModal`'s `'duration'` FieldType, always shown), a live-computed "Average speed" preview (naturally absent when distance is hidden, since it needs both), **the selected type's custom fields** (rendered by a local `ActivityFieldInput` — a Fitness-scoped copy of `AddEntryModal`'s `FieldInput` dispatch, same per-type rendering for boolean/rating/select/number/date/duration/url/text), notes, and Purpose chips. Delete lives in the edit-mode footer, left of Cancel/Save.
- `EditActivityTypeModal/` — slide-in pane, **directly modeled on `EditTrackerPane`'s field editor** (same field-row/expand-to-configure/add-field-form structure and CSS, adapted for `ActivityFieldSchema`) since that's the established "how customisation is done" pattern elsewhere in the suite. Edits name/icon/color (via the shared `ColorPicker`), a "Has a distance" checkbox (`tracksDistance`), and the field schema; built-in types show a hint that they're still fully editable but not deletable, and the store's `deleteActivityType` refuses to delete `isBuiltIn` types regardless of what the UI does. Deleting a type that activities still reference is allowed (with a confirm warning) — those activities fall back to `getActivityType`'s generic "Activity ⛰️" rendering rather than breaking.
  - **z-index note:** this pane can open *from inside* `AddActivityModal` (both mounted at once — clicking Customise does not close the parent modal). Its overlay/pane therefore use `z-index: 100/101` (the same "always on top" tier as `SettingsPane`/`TaskPane`), not the `28/29` tier `EditTrackerPane` uses — that pane only ever opens standalone from `RecordsView`, so the lower tier never conflicts there. Copy the tier from context, not just the component, if this pattern gets reused a third time.
- Speed-dial FAB (`AddTaskButton`): Fitness-aware branch, single "Activity" option (`FITNESS_OPTIONS`), same speed-dial shape as every other section even though there's only one thing to create — kept for visual/interaction consistency rather than special-casing a bare `+` button.
- Header: Fitness excluded from both `CollectionFilterPicker` and the `E`/`Ctrl+E` hotkey (Activities have no `collectionId`/Endeavour concept) — same exclusion list as Lists/Portfolio, extended by one.

### Add-on app architecture (readiness for a future paid/optional-app suite)

The user's stated future model: today's nav items 1–5 (Tasks/Calendar/Records/Lists/Notes — everything in `CORE_NAV_ITEMS`, above the divider) ship in every install; items below the divider (Portfolio, Fitness) become separately-installable "add-on" apps, possibly paid. Two concrete gaps existed before this was addressed: nothing was actually code-split (despite the suite architecture doc claiming it), and there was no single place that decided "is this app available to this user."

- **`src/config/apps.ts`** — `APP_TIERS: Record<AppView, 'core' | 'addon'>` and `isAppEnabled(view)`. Today `isAppEnabled` unconditionally returns `true` for everything — there's no purchase/entitlement backend yet. The point of this function is that it's the **one place** that will change when there is one (e.g. reading a Supabase `user_entitlements` table); every caller already treats availability as something that can say no.
- **Three call sites gate through it**, not through re-deriving "is this an addon" locally: `NavSidebar` (the Portfolio/Fitness nav buttons, and the `<hr>` divider itself, only render when enabled), `App.tsx`'s section routing (`{activeView === 'fitness' && isAppEnabled('fitness') && ...}`), and the `6`/`7` nav hotkeys (become no-ops if disabled, so a hotkey can't reach a section the nav hides).
- **Real code-splitting**: `PortfolioSection` and `FitnessSection` are now `React.lazy()` imports wrapped in `<Suspense fallback={<AppSectionFallback />}>` in `App.tsx`, instead of static top-level imports. Verified in the build output — `PortfolioSection` and `FitnessSection` now emit their own `.js`/`.css` chunks (Portfolio: ~200KB, Fitness: ~3KB) and the main bundle dropped by ~200KB. Tasks/Calendar/Records/Lists/Notes stay eagerly bundled (they're core, every user has them — splitting them would just add loading flicker for zero benefit).
- **Deliberately not built**: any actual entitlement/purchase backend, a settings UI for enabling/disabling add-ons, or per-app pricing — none of that has a real requirement yet. The seam is real; the business logic behind it isn't.

### Strava integration — built

OAuth2 Authorization Code flow, `activity:read` scope, manual "Sync now" trigger only (no webhook/push). All Strava-secret-touching logic lives server-side in Vercel Edge Functions — the client never sees `STRAVA_CLIENT_SECRET` or stored access/refresh tokens.

**Env vars** (Vercel + `.env.local`, see `.env.example`): `VITE_STRAVA_CLIENT_ID` (public, client-inlined) and `STRAVA_CLIENT_SECRET` (server-only — deliberately **not** `VITE_`-prefixed, so it's never bundled into client JS; see the `VITE_FMP_API_KEY` cautionary note elsewhere in this doc for why that prefix matters). Registered app: client id `270097`.

**The redirect-identity problem and its fix:** Strava's OAuth callback is a full browser navigation, not a `fetch` — so there's no way to attach a Supabase `Authorization` header to it. Fixed by passing the user's current Supabase **access token through the OAuth `state` parameter** when building the authorize URL (`src/services/strava.ts`'s `getStravaConnectUrl()`); `api/strava-oauth-callback.ts` reads `state` back out and calls `supabase.auth.getUser()` with it to identify the user server-side, then writes the token row as that user — RLS (`auth.uid() = user_id`, same pattern as every other table) applies exactly as it would from the browser, no service-role key needed anywhere in this codebase.

**Supabase table** (`supabase/migrations/012_fitness_strava.sql`): `fitness_strava_connection` — `user_id` (PK, references `auth.users`), `athlete_id`, `access_token`, `refresh_token`, `expires_at` (unix seconds), `scope`, timestamps. RLS: select/insert/update/delete all gated on `auth.uid() = user_id`. **This migration has been written but not yet run against the live Supabase project** — run it before Strava connect will work end-to-end.

**Edge functions** (`api/`, following the existing `api/ticker-quote.ts` proxy pattern — `export const config = { runtime: 'edge' }`):
- `api/_lib/strava.ts` — `exchangeStravaCode(code)` / `refreshStravaToken(refreshToken)` (both POST to Strava's token endpoint with the client secret), and `mapSportType(sportType)` mapping Strava's `sport_type` to our 8 fixed built-in `ActivityTypeId`s (unrecognised → `'other'`, never dropped).
- `api/_lib/supabaseEdge.ts` — `getUserClient(accessToken)` (a Supabase client scoped to one user's token, `persistSession: false`) and `bearerToken(req)` (extracts `Authorization: Bearer …`).
- `api/strava-oauth-callback.ts` — GET, Strava's redirect target. Verifies the user via `state`, exchanges `code` for tokens, upserts `fitness_strava_connection`, redirects to `/?strava=connected` or `/?strava=error&reason=…`.
- `api/strava-status.ts` — GET, Bearer-authenticated. Returns `{ connected, athleteId?, connectedAt? }` — **never returns tokens**, so the client has no path to reading them even accidentally.
- `api/strava-sync.ts` — POST, Bearer-authenticated. Refreshes the access token if it's expired or expiring within 5 minutes (writing the refreshed pair back to the table), fetches the most recent 200 activities from `GET /athlete/activities`, maps each to `{ type, title, startedAt, distanceMeters, movingTimeSeconds, elapsedTimeSeconds, averageSpeedMps, sourceId, sourceRaw }` and returns them — it does **not** write to the Fitness store itself (that stays localStorage-only client-side); the client does the upsert.

**Client wiring:**
- `src/services/strava.ts` — `getStravaConnectUrl()` (builds the authorize URL with the state-param trick, `null` if not signed in or `VITE_STRAVA_CLIENT_ID` unset), `checkStravaStatus()` (calls `strava-status`, fails soft to `{ connected: false }`), `syncStrava()` (calls `strava-sync`, then loops the results through `fitnessStore.upsertBySource('strava', sourceId, …)` — pre-existing upsert-by-source logic, unused until now, now exercised for real).
- `FitnessSection.tsx`'s `StravaConnect` subcomponent — renders "Connect Strava" (disconnected) or "Sync now" + a "Strava connected" badge (connected), fetched once on mount via `checkStravaStatus()`. Also reads `?strava=connected` / `?strava=error&reason=…` off `window.location.search` on mount, shows a one-line status message, and cleans the query string via `history.replaceState`.
- `App.tsx` — a mount-only effect checks for a bare `?strava=` query param and calls `setActiveView('fitness')` if present, **before** `StravaConnect` needs to render the message. Necessary because Strava's redirect lands on bare `/` — no section context survives a full page navigation, so without this the user would land on whatever section was default (Tasks) and never see the connected/error message unless they happened to click into Fitness themselves.

**Known limitation:** Vercel Edge Functions only execute on an actual Vercel deployment — they cannot be exercised by the local Vite dev server or Playwright in this environment. Everything client-side (button rendering, signed-out guard, query-param redirect handling, auto-navigation to Fitness) was verified in-browser via Playwright; the actual OAuth round-trip and token exchange have **not** been tested end-to-end and need verification against the real deployment once the migration has been run.

**Not yet done:** run `012_fitness_strava.sql` against the live Supabase project (required before Connect will work at all); real end-to-end OAuth test on the Vercel deployment.

## Schedule (Calendar section) — recurring weekly timetables

A **Schedule** is a named, colour-coded, independently toggle-able *layer* of recurring weekly time blocks — a university timetable, a gym class schedule — that can be switched on/off over the real calendar without cluttering it when off. **Deliberately not named "Routine"** — that word already means something else in this app (`Collection.kind='routine'`, a daily habit checklist tracked in Records) and reusing it for a completely different concept (a scheduled timetable) would collide. The design is modelled on Google Calendar's "multiple calendars" concept (a named layer with its own colour, toggled via a checkbox), not on anything already in this codebase — confirmed with the user before building.

### Data model

```typescript
interface ScheduleBlock {
  id:             string;        // nanoid(8)
  title:          string;
  daysOfWeek:     number[];      // 0=Sun … 6=Sat; multiple days share one block (e.g. Mon/Wed/Fri)
  startTime:      string;        // HH:MM
  endTime:        string;        // HH:MM
  location:       string | null;
  interval:       number;        // weeks between occurrences; 1 = every week, 2 = every second week
  intervalAnchor: string;        // YYYY-MM-DD — the week containing this date is "week 0" for interval > 1
  exceptions:     string[];      // YYYY-MM-DD dates to skip — a single cancelled occurrence
  notes:          string | null; // reserved, not yet surfaced in the block editor UI
}

interface ScheduleTemplate {
  id: ScheduleId; name: string; color: string | null;
  startDate: string | null; endDate: string | null;   // null = no bound; e.g. a semester's start/end
  active: boolean;             // shown on the real calendar, or hidden (kept, never deleted by toggling)
  collectionId: CollectionId | null;  // optional Endeavour filing, same pattern as trackers/routines
  blocks: ScheduleBlock[];
  createdAt: string; updatedAt: string;
}
```

Types live in `src/types/index.ts` (not a separate `types/schedule.ts` module) — Schedule is core Calendar functionality, not a semi-independent add-on app like Lists/Fitness, so it follows `CalendarEvent`/`CalendarReminder`'s precedent of living in the main types file.

**The "irregular routine" problem (every-second-week classes, one-off cancellations) is solved by cribbing RFC 5545's `RRULE`/`EXDATE` model, scoped down to weekly-only patterns** — no generic recurrence engine was built, since uni/gym timetables are always weekly-cycle based:
- Systematic alternation → `interval` + `intervalAnchor` (the week containing the anchor date is "week 0"; an occurrence's week is checked against `weeksSinceAnchor % interval === 0`).
- One-off exceptions (a single cancelled class, a public holiday) → the block's own `exceptions: string[]` date list, exactly ICS's `EXDATE`.

`src/utils/scheduleOccurrences.ts`'s `expandScheduleBlock(block, template, rangeStart, rangeEnd)` turns a block into concrete occurrence dates, clipped by the template's own `startDate`/`endDate`. **Verified correct** with a standalone round-trip test (weekly, biweekly-with-exception, MWF-one-block, template-date-clipping) before ever wiring it into the UI — all cases passed on the first fully-worked-through implementation, no bugs found here (contrast with the timezone and ICS-import work earlier, where the analogous "verify the date math standalone first" step *did* catch real bugs — this one just happened to be correct).

### Store — `scheduleStore.ts`

Zustand, persisted to `todo-schedules`, localStorage only (matches the Lists/Notes/Fitness precedent of starting local; Supabase sync deferred, same as those). Actions: `addSchedule`, `updateSchedule` (deliberately allows `blocks` in its Partial, unlike most `updateX` actions which exclude structural arrays — the schedule editor edits the whole block list locally and commits it in one shot on Save, the exact pattern `EditTrackerPane` already uses for a tracker's `fieldSchema`, rather than granular per-block CRUD store actions), `deleteSchedule`, `toggleScheduleActive`, and two targeted single-occurrence actions used only by the calendar's "skip this occurrence" popover: `addException(scheduleId, blockId, date)` / `removeException(...)`. Registered in `PERSISTED_STORAGE_KEYS` (`src/config/backup.ts`) per the standing rule for new persisted stores.

### Rendering on the real calendar

`CalendarView.tsx`'s `CalDisplayItem` union gained a `'schedule'` kind (alongside `task`/`event`/`reminder`). In the `itemsByDate` builder, every **active** schedule's blocks are expanded via `expandScheduleBlock` within the visible date range (respecting the header's Endeavour filter against `schedule.collectionId`, same as tasks/events/reminders) and pushed in as synthetic, non-persisted display items — never materialized as real `CalendarEvent` rows, so toggling a schedule on/off is instant and free (a pure filter), not a bulk create/delete. Colour priority in `getPillStyle()`: a schedule block uses **the schedule's own colour** first (falling back to Endeavour colour only if the schedule has none) — the whole point of the "layer" model is that its blocks read as belonging to that schedule regardless of Endeavour filing. New `.calItem_schedule` CSS colour class (purple) alongside the existing task/event/reminder ones.

Week/day time-grid rendering "just worked" for schedule blocks with no view-specific code, because both already look up `endTime` generically per item kind — a schedule item carries its own `endTime` directly (unlike events, which are looked up from the `events` record by id, since a schedule occurrence isn't a real stored entity to look up).

### Week/day time-grid polish (post-launch refinements)

Three small follow-up tweaks to the hourly time-grid, all in `CalendarView.tsx`/`.module.css`:
- **No redundant time-in-pill**: since the hour gutter on the left already shows the time, week/day-view pills no longer also print `formatTime(item.time, clockFormat)` inside the block — the `.weekTimeBlockTime` span (and its CSS class) were removed from both the week-view and day-view block rendering; only the title remains in the pill body.
- **Active-hour gutter labels are bigger/bolder and top-aligned**: an hour whose row expanded (because something's scheduled in it) gets a `weekTimeGutterLabelActive` class on its gutter label — larger font-size, `font-weight: 600`, and `transform: translateY(0)` (vs. the default `translateY(-50%)` vertical-centering) so the top of the glyph lines up with the hour's horizontal divider line, rather than centering the label within the (now-taller) row. This was the "increase font size and shift it down so the top aligns with the line" ask — doable directly via the transform, no layout trick needed.
- **Row hover highlight, synchronized across gutter + all day columns**: a single `hoveredHour` state (`useState<number | null>`) is set by `onMouseEnter`/`onMouseLeave` on invisible `weekTimeRowHit` hitbox divs placed in the gutter and in every day column at each hour's row — hovering any one of them (gutter or any column) highlights the same hour everywhere at once via a `weekTimeRowHitActive` background tint and a `weekTimeGutterLabelHovered` bold-text class on the gutter label. Kept simple as asked — no per-row local state, one shared value drives all of it.

### Second polish pass: click-to-populate time, title wrapping, and the all-day-row alignment bug

- **Clicking a row in week/day view now prefills the time that row represents**: `handleColumnClick(e, dateStr, layout)` computes a click's pixel Y relative to the day column, converts it via `yToMinutes`/`snapMinutes` (the same pair built for the Schedule click-to-add-block builder — see above), and calls `showAddCalendarItem(dateStr, undefined, timeStr)`. `uiStore` gained a third param on `showAddCalendarItem` and a `calendarItemTime` field; `AddCalendarItemModal` seeds `startTime`/`endTime`/`time` from it on open, covering both Event and Reminder regardless of which the user ends up picking. **Clicking the heading row still populates date only, deliberately** — its own `onClick={() => showAddCalendarItem(dateStr)}` was left untouched, since a column header has no time-of-day meaning.
- **Pill titles wrap instead of truncating in week/day view**: `.weekTimeBlockTitle` (timed hourly-grid blocks) switched from `white-space: nowrap; text-overflow: ellipsis` to `white-space: normal; word-break: break-word` — there's room now that the grid expands active hours, and a wrapped title beats an unreadable ellipsis. The untimed-row pills (`.weekUntimedRow`/`.dayUntimedRow`, which reuse the same `.calItemTitle` class month view uses) needed a separate, scoped override — `.weekViewItem .calItemTitle { white-space: normal; ... }` — rather than changing `.calItemTitle` itself, since month view's cramped cells still need ellipsis and share that class.
- **Deadlines now show the ❗ icon on the calendar, in every view**: `kind:'task'` items' `typeIcon` was always `''`; now unconditionally `'❗'`, matching `TaskItem.tsx`'s own deadline pill (shown regardless of milestone status there too, so milestone tasks get both ❗ and the existing diamond styling, same as in the task list).
- **Bug fixed: an untimed item (deadline, all-day/multi-day event) in week view misaligned every column.** Root cause: `.weekSpanRow` (multi-day event pills) and `.weekUntimedRow` (untimed items) were flex/grid rows with their 7 day-columns starting at `x:0`, while `.weekTimeHeaderRow` and the hourly grid below both reserve a leading 52px time gutter (`.weekTimeGutterHeader`) before their 7 columns start — so whenever either row had content, its columns silently sat 52px left of where the header/grid's columns actually are. Fixed by wrapping both rows in a `*Wrap` flex container with a matching 52px gutter spacer (`.weekSpanGutter`/`.weekUntimedGutter`) before the existing row content, which keeps the original grid/flex math inside each row untouched. **Also moved both rows to render below the header row instead of above it** (the user's stated preference, and no harder to build than leaving them above — just a JSX reorder) — so the day-name/date header is always the first thing in the view, with all-day-ish content (now correctly aligned) appearing as its own strip beneath, only taking up space when the visible week actually has any.

### Clicking a Schedule occurrence — the exception-editing UX

Since a rendered Schedule occurrence isn't a real editable entity (there's no `CalendarEvent` row behind it), clicking one opens `ScheduleOccurrencePopover` (a small `createPortal`-to-`document.body` popover, positioned at the click, closes on outside-click/Escape) instead of the usual detail pane — confirmed with the user as the desired design (rather than pretending it's a normal editable event). Two actions:
- **"Skip this occurrence"** → `addException(scheduleId, blockId, date)`, i.e. writes exactly one date into that block's exception list. This is the "can I edit an individual occurrence from the calendar" ask — yes, scoped to skipping, not to editing that one occurrence's time/title (which would require per-occurrence overrides, a Google-Calendar-style "detach this instance" feature explicitly scoped OUT for v1 to keep the mental model simple: the Schedule is the single source of truth, exceptions are the only per-date override).
- **"Edit schedule…"** → `openEditSchedule(schedule)`, jumping straight to `AddScheduleModal` in edit mode for the whole template.

### `AddScheduleModal` — create/edit pane

A centred modal (overlay+modal nested correctly — see the Modals section above for why that nesting matters) following `AddCollectionModal`'s create/edit-in-one-component pattern, with a block editor directly modelled on `EditTrackerPane`'s field-schema editor (expand-to-configure rows, an inline "+ Add block" form) — name, colour (`ColorPicker`), start/end date, optional Endeavour (`CollectionPicker`), and the block list (title, a 7-button day-of-week toggle row, start/end `TimeInput`s, "repeats every N week(s)", optional location). Ctrl+Enter submits (`formRef.current?.requestSubmit()`, the standing rule), Escape closes, Delete available in edit mode.

**z-index bug caught and fixed during this build:** this modal can open *from inside* `ManageSchedulesPane` (clicking "+ Add Schedule" or a row's edit pencil while the manager is already open) — it was first given the everyday-modal z-index tier (30) and rendered *underneath* the manager pane (100/101), invisible except where the pane didn't cover it. Fixed by bumping it to 102 — same reasoning as `EditActivityTypeModal` opening from inside `AddActivityModal`, documented above; **the lesson generalizes**: any modal that can open from inside an already-open pane/modal needs a z-index above that container's tier, copied from context, not assumed from the component's own category.

**A second, subtler bug caught and fixed in the same pass:** both `AddScheduleModal` and `ManageSchedulesPane` register their own independent `document`-level `keydown` listener for Escape. Pressing Escape while the modal was open closed *both* layers in the same keystroke instead of just the modal, because `stopPropagation()` between two listeners attached to the identical `document` target does nothing — only `stopImmediatePropagation()` would stop a sibling listener on the same node, and even that depends fragile-ly on registration order. Fixed the robust way instead: `ManageSchedulesPane`'s Escape handler is now guarded on `openModal !== 'add-schedule'`, so it simply doesn't act while the modal is on top. **This is a general pattern worth remembering for any future pane-that-can-open-a-modal-on-top-of-itself**: the outer layer's Escape handler must check whether an inner layer is currently open, not just close unconditionally.

### `ManageSchedulesPane` — list, toggle, and the overlay-preview view

A wider-than-usual slide-in pane (`width: min(680px, 100vw)`, vs. the usual ~440px, to fit the preview grid) opened via a "🗓 Schedules" button in `CalendarView`'s header. Lists every schedule: an **active** checkbox (persisted, controls real-calendar visibility — the "checkbox to add/remove them as the user desires" from the original ask), a colour swatch, name + block count + date range, a conflict hint, a 👁 **preview** toggle (local component state only, unrelated to `active`), and edit/delete row actions.

**The "overlay them on top of each other and compare" view**, built by reusing the shared `src/utils/timeGrid.ts` extracted from `CalendarView`'s week/day rendering (a deliberate refactor done specifically to make this reuse possible, verified as a behaviour-neutral pure move before building on top of it): checking 👁 on one or more schedules renders `<ScheduleWeekGridPreview>` — a **generic Sun–Sat weekly-pattern grid** (not tied to any real dates, deliberately ignoring `interval`/`intervalAnchor`/`exceptions` — the point is "does gym clash with lecture on Tuesdays," not exact per-date collision) using the exact same `layoutDayTimeGrid` overlap-column algorithm the real calendar uses, so side-by-side blocks in the preview mean exactly what side-by-side blocks would mean once both schedules are switched on for real.

### `ScheduleWeekGridPreview` — shared weekly-pattern grid component

`src/components/ScheduleWeekGridPreview/ScheduleWeekGridPreview.tsx` — extracted from `ManageSchedulesPane`'s original inline preview-grid JSX/CSS (which was copy-paste duplicated for a second use case, see below) into a standalone component: takes `entries: PreviewEntry[]` (`{ key, title, daysOfWeek, startTime, endTime, color, groupLabel? }`) and lays them out via `buildHourLayout`/`layoutDayTimeGrid` from `timeGrid.ts`, identical math to the real calendar's week view. Two consumers today:
- `ManageSchedulesPane` — read-only compare view (no `onCellClick`), one `PreviewEntry` per block across all 👁-previewed schedules, `groupLabel` set to the parent schedule's name so the hover tooltip disambiguates which schedule a block belongs to when several are previewed at once.
- `AddScheduleModal` — the click-to-add-block builder (see below), `onCellClick` supplied, one `PreviewEntry` per block already added to the schedule being created/edited (colour follows the schedule's own colour, not a per-block one — matches how it renders on the real calendar).

An optional `onCellClick?: (day: number, minutes: number) => void` prop makes the grid clickable: two new pure helpers were added to `timeGrid.ts` to support it — `yToMinutes(y, layout)` (inverse of `minutesToY`, walks the hour buckets to find which one a pixel Y falls into) and `snapMinutes(minutes, step=30)` (rounds to the nearest half-hour, clamped to a valid start-of-day range). Omitting `onCellClick` renders a plain read-only grid with `cursor: default` on blocks and no click handling — the manager's compare view passes nothing and gets this for free.

### Click-to-add-block builder (`AddScheduleModal`)

In addition to the form-based "+ Add block" flow, `AddScheduleModal` now renders a `<ScheduleWeekGridPreview>` of the schedule's current blocks directly above the block list, with `onCellClick` wired to `handleGridClick(day, startMinutes)`: it pre-fills the new-block form's day toggle (the clicked day only), start time (snapped to the half-hour) and end time (+1 hour, clamped to end-of-day), then opens the form (`setAddingBlock(true)`) — the user still confirms with a title and hits "Add block," but the day/time fields that used to require the toggle row + two `TimeInput`s are already set. This is the "far more efficient" entry point requested alongside the existing manual form — both remain available side by side in the same pane, per the explicit ask not to build it as a separate flow. The grid re-renders live as blocks are added, so it doubles as a visual summary of the schedule being built, not just an input surface.

**Conflict detection — kept deliberately simple, per explicit request not to overcomplicate it**: `countTemplateConflicts()` flags two blocks as "potentially clashing" whenever they share a day-of-week and an overlapping time range, **regardless of `interval` alignment** (an every-other-week block is flagged against a weekly one even on weeks it would never actually land on) — a conservative "you might want to check this" heads-up shown as a small badge per schedule row (counted only against *other active* schedules), not an exact per-date collision engine. The precise, exact-date view is the side-by-side overlap layout on the real calendar/preview grid, which already exists for free from the time-grid work — this was the suggested "most elegant, not overcomplicated" approach and is what got built.

### Block editor follow-ups: first-occurrence anchor and a skip-occurrences checklist

Two gaps in the original block editor, closed in the same pass:

- **"First occurrence" date, exposing `ScheduleBlock.intervalAnchor` directly**: the field already existed in the data model and drove the every-Nth-week math (`expandScheduleBlock` in `scheduleOccurrences.ts`), but was only ever set implicitly (`startDate || todayIso()`) — there was no way to say "this every-other-week block should start counting from week 2, not week 1" (e.g. a class that skips its first fortnight). Both the new-block form and an existing block's expanded edit view now show a **First occurrence** date input, conditionally rendered only when `interval > 1` (irrelevant, and needless clutter, for the common every-week case) — `newAnchor` state for the former, direct `updateBlockRow(idx, { intervalAnchor })` for the latter.
- **Skip-occurrences checklist**: previously the only way to skip one occurrence of a block was the calendar's `ScheduleOccurrencePopover` ("Skip this occurrence"), one date at a time, only reachable once the block was already on the calendar. Each block's expanded edit view in `AddScheduleModal` now lists every occurrence date in the schedule's timeframe as a checkbox — unchecking one writes it into `block.exceptions` (the same array the popover already uses), checking it again removes it. Built by feeding `expandScheduleBlock` a **copy of the block with `exceptions` cleared** (`computeAllOccurrenceDates`) so it returns every date regardless of what's currently skipped, then cross-referencing that list against the real `block.exceptions` to decide each checkbox's checked state — reuses the existing occurrence-expansion logic exactly rather than re-implementing the interval/anchor math a second time.
  - **Capped when there's no end date**: an unbounded schedule would otherwise ask `expandScheduleBlock` to enumerate occurrences forever. `OCCURRENCE_LIST_CAP_DAYS = 120` bounds the window to ~4 months from the schedule's start date (or today, if that's unset too) when `endDate` is empty; a hint below the checklist says as much and points at adding an end date to see further ahead. A schedule with a real end date (the far more common case — a semester, a term) is never capped, since `expandScheduleBlock` is already bounded by it.

### Known gaps / deliberately deferred

- **Screenshot-to-schedule import** (the user's "how easily could we adapt a screenshot of an existing timetable" question): not built, and deliberately so — this needs an actual vision/LLM API call (e.g. an edge function similar to the existing Strava OAuth pattern in `api/`) to parse an uploaded image into structured `ScheduleBlock`s, which is a meaningfully separate integration from the core CRUD feature built here. The data model is already the right shape for it — a future importer just needs to produce the same block shape the manual editor produces (see `CreateScheduleBlockInput` in `src/types/index.ts`, currently only used by the manual editor's local state shape) and hand it to the same `updateSchedule(id, { blocks })` call.
- **Per-occurrence overrides** (changing just one occurrence's time/title, not skipping it entirely) — explicitly scoped out per the "keep the Schedule as sole source of truth" decision.
- **Supabase sync added** (`014_schedules_and_lists.sql`, migration written but **not yet run against the live project** — see Migration history above): `schedules` table mirrors `ScheduleTemplate` 1:1 (`blocks jsonb` holds the full array), wired into `syncService.ts`'s push/pull/subscribe pipeline the same as every other synced store.
- Block `notes` field exists in the data model but isn't surfaced in `AddScheduleModal`'s editor UI yet (reserved for later, same "field exists before the UI does" pattern used elsewhere in this app, e.g. `Activity.sourceRaw`).

## Not yet implemented (see BACKLOG.md for full specs)

### Fitness (Phase 2+)
- Strava webhook subscription (push instead of manual sync)
- Supabase sync for activities, activity types, and the OAuth token table
- Cross-app linking to Records via `cross_app_links` (table already exists, unused)
- Exercise plans (structure likely mirrors `RoutineTask[]` + `RepeatConfig`)
- Imperial units toggle; showing the already-stored-but-hidden fields (elevation, heart rate, splits, GPS route)
- Activity + ActivityType archive/restore UI (field exists on both, `ManagePane`-style UI doesn't yet — today deleting a custom type is immediate, not a sunset)
- Real entitlement/purchase backend behind `isAppEnabled()` (currently hardcoded to `true`); a settings UI for enabling/disabling add-ons

### Notes (Phase 2+)
- Supabase sync for notes (Phase 2)
- Export notes to JSON button (suite-level, location TBD, for data safety before migration)
- Inline text tagging / passage highlighting (Phase 2)
- Full-text search (Phase 2+)
- Backlinks display (Phase 2+)
- Note archiving (UI only; database soft-delete ready)
- Multi-user notes (deferred pending Supabase collab setup)
- NoteType schema templates (e.g., "definition" type with required fields; Phase 2+)
- TagType categorization UI (Phase 2+)

### Other
- Habit heatmap / streak stats in RecordsView
- Routine calendar/heatmap view (success visualisation per day in RecordsView)
- Streak functionality for habit trackers
- Tracker chart/stats views
- Tasks section toggle: tasks / routines / both (routines move below tasks in "both" mode)
- Records reminder schedules (configurable push/calendar notifications)
- Waiting-task follow-up notifications
- Task dependency / blocking (blockedBy: TaskId[])
- Project completion flow (prompt when all tasks done)
- Milestone tasks (kind='milestone' on calendar surface)
- Mini-calendar toggle in task list
- Daily planner view
- AI agent integration (notes-dump → tasks, voice, custom agent)
- Third-party imports (Strava, Goodreads)

---

## Android build — implementation status

Implements `docs/android/00-architecture.md` **Track A** in full, plus `01-tasks-app.md` (Phase 1), `02-calendar-app.md` (Phase 2), and the 2026-09-16 web-session catch-up (`06-web-session-catchup.md`). Built and verified end-to-end on a Play Store-flavoured API 35 AVD (Pixel 8) — both via visual screenshots and via direct Chrome DevTools Protocol interaction against the app's WebView (`chrome://inspect`-style, over `adb forward` to the `webview_devtools_remote_<pid>` socket), which proved more reliable than blind `adb shell input tap` coordinate guessing for confirming actual behaviour (touch coordinates must be computed from the WebView's real viewport rect, e.g. via `Page.getLayoutMetrics`/the `/json/list` endpoint's `description` field — the WebView does **not** span the full physical screen height; Android's own gesture-nav strip at the bottom is outside it).

**Environment notes for future work**: Capacitor 8.x's own `@capacitor/android` and `capacitor-cordova-android-plugins` Gradle modules require **JDK 21 minimum** (`sourceCompatibility`/`targetCompatibility` = `VERSION_21`) — Android Studio versions bundling JBR 17 (e.g. 2024.1/"Iguana") are not sufficient for command-line `gradlew` builds, even though the IDE itself may still open the project. Upgrading Android Studio to a version bundling JBR 21+ (e.g. via `winget upgrade/install --id Google.AndroidStudio`) resolves this. If a Gradle daemon is running from an old JBR while the new Android Studio installer runs, the installer silently fails to replace the locked `jbr/bin/java.exe` (classic Windows delayed-file-replace) — run `gradlew --stop` first. `android/local.properties`'s `sdk.dir` must use forward slashes (`C:/Users/...`) even on Windows; a backslash-escaped value produces a cryptic `IOException: The filename, directory name, or volume label syntax is incorrect` from Gradle's javac worker.

### Track A — foundation (all of §10 except step 8, the multi-entry-point icons)

- **`capacitor.config.ts`** (project root) — `appId: 'com.organisaitor.app'`, `webDir: 'dist'`. `android/` generated via `npx cap add android`, git-tracked (build artifacts gitignored: `android/.gradle/`, `android/app/build/`, `android/build/`, `android/.idea/`, `android/local.properties`, `android/captures/`, `android/app/release/`). `package.json` scripts: `build:android`, `open:android`, `sync:android`.
- **Packages installed**: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/haptics`, `@capacitor/keyboard`, `@capacitor/browser`. `@capacitor/local-notifications` deliberately **not** installed yet — notifications are Phase 5, out of scope for this pass.
- **`src/hooks/usePlatform.ts`** — `{ isAndroid, isNative, isWeb }` off `Capacitor.getPlatform()`/`isNativePlatform()`.
- **`src/store/settingsStore.ts`** — `theme` initial value is now `Capacitor.getPlatform() === 'android' ? 'dark' : 'system'` (`DEFAULT_THEME` const); bumped to persist **v1** with a defensive `migrate` that backfills `theme: 'system'` only if missing on existing (pre-v1) data — an existing user's already-persisted theme choice always wins over this default on rehydration regardless, so this only actually affects a genuinely fresh install.
- **`App.tsx`** — `platform-android` body class (mount effect); StatusBar `setStyle`/`setBackgroundColor` synced inside the existing dark-mode `data-theme` effect; `SplashScreen.hide()` on mount; Android back-button handling via `@capacitor/app`'s `backButton` listener calling `closeTopmostMobileOverlay()` then `mobileBackConsumer?.()` then `CapApp.minimizeApp()` (see below); the pre-existing Tauri-only `target="_blank"` click-interceptor now also runs under `isAndroid` (was gated on `'__TAURI_INTERNALS__' in window` only).
- **`src/utils/haptics.ts`** — `hapticLight/Medium/Success/Warning`, guarded on `Capacitor.isNativePlatform()`. Wired to `TaskItem`'s swipe-to-complete gesture (Phase 1); not yet wired to Records/Lists toggles (no Android UI built for those sections yet).
- **`src/utils/links.ts`** — `openExternalLink()` gained an Android branch (`Capacitor.getPlatform() === 'android'` → `@capacitor/browser`'s `Browser.open()`), checked before the existing Tauri branch. Fixes every existing `target="_blank"` anchor app-wide for free (task link pills, Notes hyperlinks, Calendar's Maps link, etc.) since they all already route through the same App.tsx click-interceptor.
- **`src/store/uiStore.ts`** — `mobileBackConsumer: (() => boolean) | null` + `registerMobileBackConsumer()`: a screen with its own back-relevant navigation (a master-detail detail view — not yet built for any section on Android) registers itself as the sole consumer. `closeTopmostMobileOverlay()`: an exported plain function (not a hook) checking a fixed priority list of every modal/pane/sheet boolean in the store and closing the first open one; returns `true` if it handled something. `mobileMoreSheetOpen` + `openMobileMoreSheet()`/`closeMobileMoreSheet()`.
- **Mobile layout shell**:
  - `src/components/MobileNav/` — bottom tab bar, **Tasks / Calendar / Records / Lists / More** (5 tabs; the four Organizer sections + More — Notes/Portfolio/Fitness live in More regardless of tier, so Notes moving free→paid later never touches this component). Reuses `NavSidebar`'s own icon set (`CORE_NAV_ITEMS` exported from `NavSidebar.tsx`) rather than duplicating SVGs. Distinct from `NavSidebar`'s own pre-existing `@media (max-width:600px)` collapse-to-bottom-bar behaviour (which shows all 7 sections, for narrow *browser* windows) — the two never render simultaneously since `App.tsx` only mounts `NavSidebar` when `!isAndroid`.
  - `src/components/MobileMoreSheet/` — bottom sheet: Notes, Portfolio (if enabled), Fitness (if enabled), divider, **Manage Library** (routed here since its desktop trigger — hovering the header hamburger — has no touch equivalent), Settings, Account. Backdrop tap, Escape, and drag-down-past-threshold (touch handlers on a grabber handle) all dismiss.
  - Full-screen-on-Android override (`:global(.platform-android) .pane { ... }`, higher specificity than the existing narrow-browser bottom-sheet `@media` block so it always wins) added to: `TaskPane`, `SettingsPane`, `IntegrationsPane` (previously had no responsive treatment at all), `CalendarEventPane`, `CalendarReminderPane`, `EditTrackerPane`, `EditRoutinePane`, `NoteEditorPane`. `AccountPane` (a different overlay+bottom-sheet-modal pattern, not a side panel) gets its own `:global(.platform-android) .overlay/.pane` override to the same effect. `ManagePane` already went full-screen at ≤560px width via its pre-existing `@media` rule — untouched.
  - `App.tsx` — `NavSidebar`/`Sidebar`/header hamburger button all conditionally hidden on Android (`{!isAndroid && ...}`); `MobileNav`/`MobileMoreSheet`/`MobileCalendarQuickAdd` mounted at Android-gated. `.appMobile` CSS class reserves `56px + env(safe-area-inset-bottom)` at the bottom of `.app` for `MobileNav`.
- **Multi-entry-point launcher icons (§4)** — **not built**, per the doc's own note that it's not required to start app-phase work. The app installs today with Capacitor's single default `MainActivity` launcher icon (confirmed via `adb shell dumpsys package … | grep LAUNCHER` — exactly one `com.organisaitor.app/.MainActivity` entry).

### Phase 1 — Tasks

- **`src/components/MobileQuickAddBar/`** — bottom-anchored bar (above `MobileNav`), replacing `QuickAddInput` on Android (`App.tsx`'s Tasks-section `<main>`). Bare-title Enter-to-submit; once title is non-empty, a chip row appears: **Due** (popover: Today/Tomorrow/This weekend/Pick a date… — the last opens a hidden native `<input type="date">` via `.showPicker()`), **Priority** (tap-to-cycle none→low→medium→high), **Endeavour** (popover wrapping the existing `CollectionPicker` component), and **More options…** (hands off to the full `AddTaskModal` pre-filled — see `uiStore.quickAddPrefill` + `showAddTaskWithPrefill()`, read by `AddTaskModal`'s `useState` initializers).
- **`TaskItem.tsx`** — checkbox bumped to 44×44px on Android (`:global(.platform-android) .checkbox`); pill row (`.itemRow`) allowed to `flex-wrap` instead of forcing single-line. Swipe gestures via **native (non-passive) touch listeners** in a `useEffect` (React's synthetic `onTouchMove` is passive by default, so `preventDefault()` there is a silent no-op — a real bug class this avoided by attaching listeners directly to the DOM node via `addEventListener(..., { passive: false })`): swipe right past 70px → `hapticLight()` + `toggleTask()`; swipe left past 70px → reveals a red "Delete" button (tap to confirm — never auto-deletes on release) via a `.swipeWrapper`/`.swipeDeleteAction` pair. Axis-lock: the gesture only commits to horizontal once `|dx| > |dy| * 2` past an 8px threshold, otherwise falls through to normal list scrolling.
- **`src/hooks/usePullToRefresh.ts`** — generic hook (ref + `onRefresh` callback), same native-non-passive-listener pattern as the swipe gesture; only activates when the scroll container's `scrollTop === 0`. Wired in `App.tsx`'s Tasks `<main>` to re-run `initSync(authUserId)` (a full re-fetch-and-resubscribe, already idempotent) when signed in.
- **`CollectionFilterPicker.tsx` / `PurposeFilterPicker.tsx`** — new `variant?: 'dropdown' | 'sheet'` prop (default `'dropdown'`, desktop unchanged). `'sheet'` renders the *same* option-list JSX (extracted to a local `listContent` variable, no logic duplicated) inside a bottom-sheet overlay instead of a positioned dropdown, with a compact icon-only trigger button (▽ / ◎) instead of the full text+chevron trigger. Wired in `App.tsx`'s header: `variant={isAndroid ? 'sheet' : 'dropdown'}` — applies to every section that already showed these pickers (Tasks, Calendar, Records, Notes), not just Tasks.
- **`SortBar.module.css`** — `:global(.platform-android) .bar` switches from `flex-wrap: wrap` (desktop: wraps to a second line) to `overflow-x: auto` (horizontal-scroll chip row) — same sort options/keys, CSS-only.
- **File manifest**: new — `MobileQuickAddBar/`, `usePullToRefresh.ts`. Modified — `TaskItem.tsx`/`.module.css`, `CollectionFilterPicker.tsx`/`.module.css`, `PurposeFilterPicker.tsx`/`.module.css`, `SortBar.module.css`, `uiStore.ts` (`quickAddPrefill`/`showAddTaskWithPrefill`), `AddTaskModal.tsx` (reads `quickAddPrefill` for initial state), `App.tsx`.

### Phase 2 — Calendar

- **Important pre-existing-code fix, not in the original doc**: `CalendarView.module.css` already had a plain `@media (max-width: 600px)` rule swapping the entire real month/week/day grid (`.desktopView`) for an old, much simpler single-day flat agenda list (`.mobileView`) — built long before any Android-specific work, for narrow *browser* windows only. Since Android phones are always ≤600px CSS width, this would have silently shown the old flat agenda on every Android install instead of the real calendar Phase 2 is actually about. Fixed with `:global(.platform-android) .desktopView { display: flex !important; } .mobileView { display: none !important; }`. Worth remembering if any other section has a similar narrow-browser `@media` fallback predating Android work — check before assuming "it's already responsive."
- **`src/components/MobileCalendarQuickAdd/`** — bottom-sheet quick-add for events/reminders: Event/Reminder toggle, title (autofocus), date (`<input type="date">`), optional time (`TimeInput`), Add button, "More options…" handoff to `AddCalendarItemModal` (extended with a 4th `calendarItemTitle` prefill field, mirroring the existing date/kind/time prefill pattern). Controlled via new `uiStore` state: `calendarQuickAddOpen/Date/Time/Kind` + `showCalendarQuickAdd()`/`closeCalendarQuickAdd()`; added to `closeTopmostMobileOverlay()`'s priority list.
- **`CalendarView.tsx`** — new `openCreateAt(dateStr, time?)` helper (Android → `showCalendarQuickAdd`, else → the existing `showAddCalendarItem`) replaces all 7 non-time-computing `showAddCalendarItem(...)` call sites (month date-number cells, month event cells, week header day-name cells, both day-pane "+ Add" buttons, mobile-agenda "+ Add item"); `handleColumnClick` (the week/day hourly-grid tap-to-create-with-time-prefill handler) now routes through the same helper instead of calling `showAddCalendarItem` directly — same pixel→time math (`yToMinutes`/`snapMinutes`), different destination component on Android. Tapping an *existing* item pill is completely unchanged (`handleItemClick`), on any platform.
- **Swipe-to-navigate-period**: a `useEffect` on a new `calendarBodyRef` (attached to `.calendarBody`, wrapping the header + all three views) using the same native-non-passive-listener + axis-lock pattern as Phase 1's gestures. Calls the existing `desktopPrev()`/`desktopNext()` — no new navigation logic. **Edge-gesture exclusion**: a touch starting within ~24dp of either screen edge (`24 * 2.625` device px at this AVD's density — computed from `window.innerWidth`, not hardcoded per-device) is ignored entirely, so a user's attempt at Android's own system back-gesture is never intercepted as "next period." Verified via synthetic touch events over CDP: an edge-starting swipe correctly produces no navigation; a mid-screen swipe correctly does.
- **Touch targets**: `.dateNumCell` (month view's date-number sub-row, the part that's clickable to quick-add) bumped to `min-height: 44px` on Android — the full-day `.eventsCell` below it was already comfortably tall enough via its own flex-grow sizing, untouched. The week/day hourly grid's per-row hit boxes needed no change: the click handler lives on the *entire* day-column element (`handleColumnClick` reads the click's pixel Y to derive a time), not on individual per-hour strips, so there's no sub-44px dead zone regardless of how compressed an individual empty hour's row is.
- **Header layout fix** (not in the original doc, found while testing on-device): the desktop header row (prev/title/next/Today, Month/Week/Day toggle, 🗓 Schedules) doesn't fit one line at phone width once `.desktopView` is forced on for Android (see the fix above) — `:global(.platform-android) .header { flex-wrap: wrap; }` plus a smaller `.monthTitle` min-width/font-size. Not a redesign, just "doesn't visually break," matching Schedule's own already-established "accessible but not optimised" bar.
- **Day-pane** (month view's "+N more" overflow) — `:global(.platform-android) .dayPane` goes full-width instead of a fixed 320px side panel.
- **Endeavour filter sheet, Maps link Android branch** — both already covered for Calendar for free by Phase 1/Track A's changes (the `variant='sheet'` wiring in `App.tsx`'s header applies to every non-portfolio/lists/fitness section; `openExternalLink()`'s Android branch is a shared utility). Nothing Calendar-specific needed for either.
- **File manifest**: new — `MobileCalendarQuickAdd/`. Modified — `CalendarView.tsx`/`.module.css`, `AddCalendarItemModal.tsx` (reads `calendarItemTitle`), `AddTaskButton.tsx` (`handleCalOption` routes to `showCalendarQuickAdd` on Android), `uiStore.ts`.

### Android catch-up — 2026-09-16 web session (see `docs/android/06-web-session-catchup.md`)

Closes all four gaps that session's web/desktop work left on Android: an Android-only quick-add path bypassing the new deadline→reminder wiring, the hardware back button not integrating with the new app-section-history stack, the new Calendar Layers picker having no touch-sheet variant, and a visual-verification pass over three areas that session's CSS/behaviour changes touched but nobody had checked on a real Android viewport. Verified end-to-end on the same Play Store-flavoured API 35 AVD via CDP, per this section's established method.

- **`MobileQuickAddBar.tsx`** — `submit()` now creates a linked `CalendarReminder` (`reminderType: 'task'`) via `calendarStore.addReminder()` before calling `addTask()`, mirroring `AddTaskModal.tsx`'s `handleSubmit` exactly — a task quick-added on Android with a Due chip now gets a real `calendarReminderId` immediately, instead of relying on `taskCalendarBackfill.ts`'s next-reload catch-up pass. Verified on-device: creating a task with "Due: Today" produced a `reminders` entry with `reminderType: 'task'` and the task's `calendarReminderId` pointing at it, without a reload; the deadline pill appeared on the Calendar section and correctly hid when the "Task deadlines" layer was toggled off.
- **`App.tsx`'s `backButton` handler** — now reads `sectionHistory`/`navigateBack()` from `uiStore` as a new tier between `mobileBackConsumer` and `CapApp.minimizeApp()`, so the hardware/gesture back button steps back through app-section history the same way desktop's `Backspace` does. Verified on-device via `adb shell input keyevent 4`: navigating Tasks → Calendar → (More sheet) → Notes then pressing back three times produced Calendar, then Tasks, then the app minimizing (confirmed via `dumpsys activity activities`); a modal (Settings pane) open on top still closed on the first back press without navigating, confirming `closeTopmostMobileOverlay()` still takes priority, unchanged.
- **`CalendarLayersPicker.tsx`/`.module.css`** — gained the same `variant?: 'dropdown' | 'sheet'` prop as `CollectionFilterPicker`/`PurposeFilterPicker`, following that exact pattern (shared `listContent`, no JSX duplication); `'sheet'` renders a 44px-min icon-only 👁 trigger and a bottom sheet with the same 4 checkboxes at 44px touch targets. `CalendarView.tsx` wires `variant={isAndroid ? 'sheet' : 'dropdown'}`. Verified on-device: the sheet opens as a real bottom sheet (not a dropdown that could clip off-screen), all 4 checkboxes measured 44px tall via the WebView's real viewport rect, toggling one immediately filtered the calendar and left the sheet open (multi-select, matches `PurposeFilterPicker`'s sheet behaviour), and the setting persisted to `settingsStore.calendarLayerVisibility` identically to desktop.
- **Visual verification pass** (three areas the catch-up doc flagged as "unverified, not presumed broken"):
  - **Day/week grid notes preview (`.weekTimeBlockNotes`)** — **found and fixed a real bug**, not just confirmed-fine: `.weekTimeBlock`'s `display:flex; flex-direction:column` left both `.weekTimeBlockTitle` and `.weekTimeBlockNotes` at the flexbox default `flex-shrink:1`, so a short (e.g. 30-minute) block with a long notes string squeezed the *title* down to a fraction of its line-height (measured 6.97px against a 15.6px line-height) instead of clipping the notes — the title text was genuinely unreadable, clipped top and bottom. Fixed with one line, `flex-shrink: 0` on `.weekTimeBlockTitle` (`CalendarView.module.css`), so the title always renders at full natural height and any remaining shrink pressure falls on the notes span instead, which already clips cleanly via its pre-existing `overflow:hidden`. Not platform-scoped — this is a general flexbox bug the CSS already had, just exposed clearly by a phone-width compressed hour row; fixed for every platform, not just Android. Verified on-device before and after: the title box's rendered height went from 6.97px (clipped) to 15.6px (its full, un-shrunk line-height) after the fix, confirmed both via `getBoundingClientRect()` and a visual screenshot showing a crisp, fully-legible bold title with the notes preview clipping cleanly mid-word beneath it.
  - **`SettingsPane`'s Keyboard shortcuts table** — no overflow found; `document.documentElement.scrollWidth === window.innerWidth` (411px, no horizontal scroll), and a customized hotkey's ↺ reset icon (only rendered once an override exists — tested by seeding one) measured well within the viewport, not clipped. No change made.
  - **`NotificationCenter`'s Done/Archive on a task-linked reminder** — works correctly; clicking Done on a `kind:'reminder'` notification whose `itemId` matched a task's `calendarReminderId` set `task.completed: true` via the `linkedTask` lookup, and Archive set `task.archived: true`, both verified directly against the task's stored state. The panel itself renders cleanly at phone width (confirmed via screenshot). No change made.
- **File manifest**: modified — `MobileQuickAddBar.tsx`, `App.tsx` (`backButton` handler), `CalendarLayersPicker.tsx`/`.module.css`, `CalendarView.tsx` (one call-site prop), `CalendarView.module.css` (`.weekTimeBlockTitle` flex-shrink fix). No new files.
- **Still only emulator-verified, not real-device** — same carve-out as every other phase: haptics, real edge-gesture navigation, and anything requiring a real Play Billing/OEM launcher aren't exercised by this pass.

### Not built yet (see `docs/android/` for specs)

- Multi-entry-point launcher icons (architecture doc §4, Track A step 8) — deliberately deferred, not required for Phases 1–4.
- Track B in full: `entitlementStore`, Play Billing, AdMob/UMP consent, locked-state screens for paid add-ons — `isAppEnabled()` remains the existing always-`true` stub.
- Phase 3 (Records) and Phase 4 (Lists) Android UX.
- Phase 5 (notifications) — `@capacitor/local-notifications` not yet installed.
- Real device testing (haptics, Play Billing, notifications, real edge-gesture navigation) — everything above was verified on a Play Store-flavoured AVD (emulator), which the project's own testing workflow (`docs/android/00-architecture.md` §10a) already flags as not fully representative for exactly those areas.
- **Touch support for drag-and-drop (List tab reordering, Chronicle tree drag-to-nest, Notes tab reordering)** — this is active work to pick up, not just a flagged risk: all three use the native HTML5 drag-and-drop API, which is mouse-only and almost certainly does not respond to touch in the Android WebView as-is. Full context (exact components, an architecture-decision fork that needs the user's input before building, and on-device acceptance checks) is in **`docs/android/07-drag-and-drop-touch.md`** — start there.
