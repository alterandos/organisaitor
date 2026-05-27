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

---

## Tech stack

- **React 19** + **Vite 8** + **TypeScript** (strict)
- **Zustand 5** for state (`persist` middleware, localStorage)
- **CSS Modules** — no Tailwind, no inline styles except dynamic values
- **Supabase** for auth + optional cloud sync
- `nanoid` for ID generation; branded ID types for all entities
- Path alias `@/` → `src/`

---

## Three sections

| Section | Key | Nav hotkey |
|---------|-----|------------|
| Tasks | `'tasks'` | `1` / `Ctrl+1` |
| Calendar | `'calendar'` | `2` / `Ctrl+2` |
| Records | `'records'` | `3` / `Ctrl+3` |

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

### Task

Key fields beyond the obvious: `kind: TaskKind` (`'action' | 'waiting' | 'milestone'`), `timeIntensity: TimeIntensity | null` (`'low' | 'medium' | 'high'`), `parentId: TaskId | null`, `subtaskIds: TaskId[]`, `links: string[]`, `completedAt: string | null`.

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
| `taskStore` | `todo-app-storage` | **v5** | localStorage + Supabase | tasks, collections, tags, purposes |
| `trackerStore` | `todo-tracker` | **v1** | localStorage + Supabase | tracker entries |
| `routineStore` | `todo-routines` | **v1** | localStorage only | daily routine instances (transient) |
| `uiStore` | — | — | memory only | all UI state (modals, panes, active section) |
| `settingsStore` | `todo-settings` | — | localStorage | user preferences |
| `authStore` | — | — | memory only | Supabase session |

### Zustand migration rule

When adding fields to a persisted store's shape: **bump `version`** and write a **cumulative `migrate` function** that backfills defaults for every prior version. Never write non-cumulative migrations.

Current taskStore v5 migrate backfills: `routineTasks: []`, `repeatConfig: null`, `fieldSchema: []`, `tagIds: []` on collections.

### uiStore — key state and actions

```typescript
// Active section (pending rename: activeView→activeSection, AppView→AppSection, setActiveView→setActiveSection)
activeView: AppView               // 'tasks' | 'calendar' | 'records'
setActiveView(view)

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

// Routines (task list)
routinesSectionOpen: boolean     // default true
toggleRoutinesSection()
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

### Supabase tables (summary)

- **tasks** — mirrors Task interface
- **collections** — mirrors Collection; includes `field_schema jsonb`, `routine_tasks jsonb`, `repeat_config jsonb`
- **tags** — mirrors Tag; includes `notes text`
- **purposes** — mirrors Purpose
- **calendar_events** / **calendar_reminders** — CalendarEvent / CalendarReminder
- **tracker_entries** — TrackerEntry; `data jsonb`, RLS on `user_id`

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
  store/
    taskStore.ts             — tasks, collections, tags, purposes
    trackerStore.ts          — tracker entries
    routineStore.ts          — routine instances (localStorage only)
    uiStore.ts               — all UI state
    settingsStore.ts         — user preferences
    authStore.ts             — Supabase session
  services/sync/
    syncService.ts           — Supabase push/pull
    mappers.ts               — xToRow / rowToX for every entity
  utils/
    date.ts                  — todayIso(), formatDate(), etc.
    id.ts                    — typed nanoid wrappers
  components/
    NavSidebar/              — left nav: section switcher, settings, account icons
    Sidebar/                 — right sidebar: endeavours (collections), purposes, tags
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
    CalendarView/            — month/week/day calendar
    CalendarEventPane/       — slide-in: edit calendar event
    CalendarReminderPane/    — slide-in: edit calendar reminder
    SettingsPane/            — settings slide-in; reads HOTKEYS[] dynamically
    AccountPane/             — Supabase auth + account info
    IntegrationsPane/        — (stub) future integrations
    ColorPicker/             — reusable colour swatch picker
    CollectionPicker/        — collection selector dropdown
    PurposeFilterBar/        — purpose chip filter row
    SortBar/                 — sort controls for task list
  supabase/migrations/       — SQL migration files (run in order)
```

---

## Component patterns

### Modals

All new modals: overlay div + bottom-sheet on mobile / centred card at ≥520px. Follow `AddTaskModal` / `AddTrackerModal` as reference.

### Edit panes (slide-in from right)

Follow `EditTrackerPane`. Rendered at the App root level alongside the main content. Triggered by `openEditTracker(id)` / `openEditEntry(id)` etc. in uiStore.

### Escape key — universal close rule

**Every modal and slide-in pane must be closable with the Escape key.** Add a `keydown` listener in a `useEffect` that calls the close action when `e.key === 'Escape'`. This applies to: all Add*/Create modals, all Edit panes, the task pane, the day-overflow pane, and any future interactive overlay. No exceptions.

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
2. **`src/App.tsx`** — add/update the handler in the `keydown` useEffect.

Do **not** hardcode hotkey labels in `SettingsPane.tsx` or anywhere else.

### Current hotkeys

| Primary | Secondary | Action |
|---------|-----------|--------|
| `1` | `Ctrl+1` | Tasks section |
| `2` | `Ctrl+2` | Calendar section |
| `3` | `Ctrl+3` | Records section |
| `Space` | `Ctrl+N` | New item (section-aware, see below) |
| `S` | — | Toggle settings |
| `Esc` | — | Close panel / modal |

### New-item hotkey (Space / Ctrl+N) — section-aware behaviour

- Tasks section → `showAddTask()`
- Calendar section → `showAddCalendarItem()`
- Records section + tracker selected → `showAddEntry(activeTrackerId)`
- Records section + no tracker → `showAddTracker()`

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
- **Routines** appear in two places: the TaskList (collapsible "Routines" section, today's due routines only) and the RecordsView sidebar (RoutineChecklist cards).
- **Routine due-today logic**: a routine is due if it has no `repeatConfig`, or if today's day-of-week is in `repeatConfig.daysOfWeek`. If `daysOfWeek` is empty/undefined, it runs every day.
- **All new modals** follow the overlay + bottom-sheet (mobile) / centred (≥520px) pattern.
- **Edit panes** (slide-in from right) follow the `EditTrackerPane` pattern.
- **Trackers, routines, projects, and lists** can all be associated with tags and purposes.

---

## Implemented features (as of last commit)

- [x] Task CRUD with subtasks, priority, deadline, kind, timeIntensity, links, notes
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
- [x] Routines collapsible panel in Tasks section (due-today filter)
- [x] Speed-dial FAB (AddTaskButton): section-aware, shows tracker/entry/routine options in Records section
- [x] Tag notes textarea
- [x] Task links field (in AddTaskModal advanced section)
- [x] Subtask progress pill on TaskItem
- [x] Settings pane: per-section display toggles + dynamic hotkey table
- [x] Hotkeys: 1/2/3 (+ Ctrl variants), Space/Ctrl+N (new item), S (settings), Esc
- [x] Multi-day calendar events: end date picker in AddCalendarItemModal + CalendarEventPane; spanning pills in month view (week-block layout with spanRow above day cells) and week view (weekSpanRow above columns); multi-day events appear normally in day/mobile views
- [x] Supabase auth + cloud sync (tasks, collections, tags, purposes, tracker entries)
- [x] Vercel deployment (auto-deploy from main branch)

## Not yet implemented (see BACKLOG.md for full specs)

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
- Note-taking integration
- Third-party imports (Strava, Goodreads)
