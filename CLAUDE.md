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

### Suite architecture (as built)

The suite ships as a **single Vite build, a single Vercel deployment, and a single Tauri binary** (plus the Capacitor Android wrapper) — one install gives access to every app. Today it is **one package**: the Apps (Organizer, Notes, Portfolio, Fitness) are sections inside `src/`, separated by convention — each has its own store and component folders, and the semi-independent ones (Lists, Fitness, Portfolio, Notes) their own `src/types/*.ts` — not by separate npm packages. Navigation is section-based (`uiStore.activeView`), not route-based. The add-on apps (Portfolio, Fitness) are code-split (`React.lazy`) and gated through `isAppEnabled()` (`src/config/apps.ts`).

What is shared today: **Supabase auth** (one session, one project, per-domain tables); **Endeavours and Purposes** (`Collection`/`Purpose` in `taskStore`, referenced by id from other apps — Fitness imports `PurposeId`); and the **cross-app linking mechanism** — embedded `crossAppRefs` fields plus the note's `ArtifactLinkMark` (see "Cross-app linking" in `docs/features/implemented-features.md`).

There is **no** typed event bus and **no** multi-package monorepo. Earlier drafts of this file described both as the plan (`packages/notes/`, `emit('create-task')`, a shared design-system package, route-based app switching). They remain possible future directions (BACKLOG.md), not current architecture — don't build on them as if they existed.

**Implication for new work:** keep each app's domain logic inside its own store and component folders, and let apps talk through the shared entities and `services/crossAppLinkCleanup.ts` (the one module allowed to import several domain stores), not by importing each other's stores directly.

### Android build (Capacitor) — Track A + Phases 1–2 built and verified on-device

The suite is extended to Android via **Capacitor**, wrapping this same codebase (no rewrite, no separate app) — one APK/one Play Store listing, with Tasks/Calendar/Records/Lists free and Notes/Portfolio/Fitness as individually-purchasable one-time add-ons, each eventually surfaced as its own home-screen launcher icon via native `activity-alias` even though it's all one running process. Full architecture (entry points, entitlements, ads, monetization) is documented in **`docs/android/00-architecture.md`** — read that before touching `isAppEnabled()`, `settingsStore`'s theme default, or anything platform-detection-related. `docs/android/` holds the full phased build plan; see "Android build — implementation status" below (near the end of this file) for exactly what's built vs. still planned, and the full list of new/modified files. It supersedes BACKLOG.md's older "Android App — Capacitor" section for architecture decisions (that section's notification detail is still valid until `docs/android/05-notifications.md` exists).

---

## Documentation Protocol (Critical)

**CLAUDE.md is the source of truth for rules, patterns and architecture. `docs/` holds the detail behind each feature. BACKLOG.md holds what is confirmed but not built.** A Claude agent should be able to rebuild the app from those three — so keep them true.

### Doc map

| File | Holds |
|------|-------|
| `CLAUDE.md` (this file) | Overview and terminology, type system, stores, Supabase sync and live migration status, file structure, component patterns, hotkey rules, coding conventions, **pattern governance** |
| `docs/features/implemented-features.md` | Running log of built features: what, why, files, integration points, bugs found and how |
| `docs/features/fitness.md`, `schedules.md`, `external-calendar-sync.md` | The big self-contained features |
| `docs/features/not-yet-implemented.md` | Short summary list (full specs are in BACKLOG.md) |
| `docs/android/` | Android/Capacitor architecture, phased plan, and `implementation-status.md` |
| `docs/agent-tasks/` | Self-contained briefs for follow-up work an agent can pick up cold |
| `docs/ai/` | The AI agent integration: `01-capability-inventory.md` (what the app can do, invariants, decisions, what is left) and `02-command-layer.md` (the built command layer: design, how to add a command, tests) |
| `BACKLOG.md` | Confirmed-but-unbuilt requirements, and the **Pattern retrofit backlog** |

**Cross-references:** wherever this file says "see Implemented features" or names a feature entry in quotes ("Shared item actions", "Cross-app linking", "Timepicker rebuild", "Suite-wide Quick Access pane", …), it means the matching bullet in `docs/features/implemented-features.md` — search for the quoted name. Fitness, Schedules and external calendar sync have their own files in `docs/features/`.

### How to write and maintain the docs

The split only stays useful if every agent follows the same structure. These rules apply to CLAUDE.md, everything in `docs/`, and BACKLOG.md.

**1. Put it in the right file.** Ask "would an agent need this *before writing any code*?" If yes → CLAUDE.md. If only when touching that feature → `docs/`.

| What you're recording | Where |
|-----------------------|-------|
| A rule, pattern, convention, or architecture fact that applies across features | CLAUDE.md (the matching section) |
| A store, persist key/version, type, migration, or a new folder/file-structure entry | CLAUDE.md (Stores / Type system / Supabase sync / File structure) |
| What a feature does, why, which files, integration points, bugs found, what was verified | `docs/features/implemented-features.md` |
| A feature big enough to have its own architecture and sub-sections (roughly 100+ lines) | its own file in `docs/features/`, **plus** a one-line entry in `implemented-features.md` linking to it, **plus** a row in the Doc map above and in `docs/README.md` |
| Confirmed requirement not yet built, or a known gap to retrofit | BACKLOG.md (features) / its "Pattern retrofit backlog" (consistency work) |
| Deferred hardening or a known issue that isn't a feature | CLAUDE.md "Known issues and deferred hardening" |
| Follow-up work for another agent | a numbered brief in `docs/agent-tasks/` |
| Android plan/architecture/status | `docs/android/` |

**2. Keep CLAUDE.md focused — but never at the cost of a true rule.** It is read in full at the start of every session, so every line has a cost, and that is the only reason to be economical. There is **no hard size limit**: if a genuinely important rule or pattern makes the file longer, add it. Never leave a real rule out, shorten it into vagueness, or bury it in `docs/` just to stay small. What *does* keep the file healthy is not letting per-feature narrative accumulate in it — that goes in `docs/features/`. If the file has grown noticeably (as a rough prompt: past ~1,000 lines), look for a section that has turned into the history of one feature and move that (verbatim, with a pointer left behind); don't touch the important addition. A rule belongs here when it constrains code the reader hasn't written yet.

**3. Feature entries in `implemented-features.md`.** Append at the bottom, newest last, as `- [x] **Title** (YYYY-MM-DD).` followed by, as applicable: *what and why* · *files/components/store actions/hotkeys* · *integration points* · *decisions and why* (including options rejected) · *bugs found and how* · *verified vs. not verified* (say plainly which) · *not built*. Use absolute dates, never "recently". Use file and symbol names, never line numbers. Don't record what git history or the code already shows.

**4. One truth per topic.** If you change something an existing entry describes, **edit that entry in place** (or mark it `Superseded by <entry>`) — never leave two contradictory descriptions. When you delete or rename code, grep the docs for its identifiers and fix or remove every mention in the same change: a doc that describes code that no longer exists is a bug.

**5. Moving or splitting content.** Move verbatim, leave a one-line pointer where it was, keep `docs/README.md` and the Doc map current, and keep the note at the top of moved files. Don't rewrite while moving — do that as a separate change.

**6. Agent briefs (`docs/agent-tasks/NN-name.md`).** Numbered, self-contained (a cold agent needs only the brief plus CLAUDE.md), each task with *the problem, what done looks like, how to verify*, and a "When done" section. Put a `Status:` line under the title (`Not started` / `In progress` / `Done YYYY-MM-DD — outcome`). Don't delete a finished brief; mark it done so the reasoning survives. **The agent doing the work keeps the Status line current and logs the work itself — the user is never expected to.**

**7. Migration status is special.** Never mark a migration `Applied` on your own; only after the user says they've run it (rules under "Live migration status").

**8. Patterns.** A new or changed pattern follows "Pattern governance" below: recorded here, applied to new code, retrofit audit logged in BACKLOG.md.

### Every Feature Change Requires:

1. **Record it** in `docs/features/implemented-features.md` (or the feature's own file): what was added/changed, why, file paths (not line numbers — those rot), component names, store actions, hotkeys, entity types, integration points. Update **this file** too *only if* the change touches a rule, a pattern, the store table, the type system, the file-structure map, or migration status.
2. **Log in BACKLOG.md** if adding a new unimplemented feature or changing scope.
3. **Update `config/labels.ts`** if user-facing strings changed — including any string that names a concept defined there (Endeavour, …).
4. **Update `src/types/index.ts`** if new entity types or unions were added.
5. **If you defined or changed a pattern**, follow "Pattern governance" below.

### Checklist Before "Done":

- [ ] Docs written in the right place, per "How to write and maintain the docs" (feature entry in `docs/features/…`; CLAUDE.md only if a rule/pattern/store/type/migration changed; stale mentions of deleted code removed)
- [ ] BACKLOG.md updated if requirements changed
- [ ] `config/labels.ts` updated if new user-facing strings
- [ ] `src/types/index.ts` updated if new types
- [ ] If a SQL migration was added: it includes its own `grant … to authenticated` (if it creates a table), is listed in "Migration history" **and** in "Live migration status" as `Pending — not yet run`, and the user has been told to run it — it only becomes `Applied` once they confirm
- [ ] If a new persisted store was added: its key is in `PERSISTED_STORAGE_KEYS` (`src/config/backup.ts`) and it has a `version`
- [ ] If a new pattern was defined: recorded here, applied to new code, and the retrofit audit logged in BACKLOG.md
- [ ] Build passes (`npm run build`) and tests pass (`npm test`)
- [ ] Feature tested end-to-end
- [ ] A future Claude reading CLAUDE.md + the docs + BACKLOG.md would understand what exists, where the code lives, how it connects, and what's not done

---

## Tech stack

- **React 19** + **Vite 8** + **TypeScript** (strict)
- **Zustand 5** for state (`persist` middleware, localStorage)
- **CSS Modules** — no Tailwind, no inline styles except dynamic values
- **Supabase** for auth + optional cloud sync
- `nanoid` for ID generation; branded ID types for all entities
- Path alias `@/` → `src/`
- **Zod 4** for the agent command layer's input schemas (also emitted as the JSON Schema a model API needs) and **Vitest** for tests (`npm test`; test files sit beside the code as `*.test.ts`)

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

Key fields beyond the obvious: `kind: TaskKind` (`'action' | 'waiting' | 'milestone'`), `timeIntensity: TimeIntensity | null` (`'low' | 'medium' | 'high'`), `parentId: TaskId | null`, `subtaskIds: TaskId[]`, `links: string[]`, `completedAt: string | null`, `scheduledAt: string | null` (YYYY-MM-DD day user plans to work on it — distinct from deadline), `scheduledTime: string | null` (HH:MM 24-hour), `calendarEventId: CalendarEventId | null` (auto-created CalendarEvent when scheduledAt is set; kept in sync on edits; deleted when task is deleted or scheduledAt cleared), `archived: boolean` + `archivedAt: string | null` + `archiveReason: string | null` (see "Task archiving" in Implemented features — the reason is its own field, deliberately not appended to `notes`).

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
| `taskStore` | `todo-app-storage` | **v11** | localStorage + Supabase | tasks, collections, tags, purposes |
| `calendarStore` | `todo-calendar` | **v10** | localStorage + Supabase | calendar events, reminders |
| `trackerStore` | `todo-tracker` | **v1** | localStorage + Supabase | tracker entries |
| `routineStore` | `todo-routines` | **v1** | localStorage only | daily routine instances (transient) |
| `noteStore` | `notes-storage` | **v12** | **IndexedDB** (not localStorage — see below) + Supabase | notes, note tags, structured tag entries |
| `listStore` | `lists-storage` | **v5** | localStorage + Supabase | lists, list items, list types (custom types only) |
| `portfolioStore` | `todo-portfolio` | **v7** | localStorage + Supabase | watchlist items, portfolio tags, investment purposes (Portfolio app) — `columnConfig` (table display prefs) stays local-only |
| `fitnessStore` | `fitness-storage` | **v3** | localStorage only | activities + activity types (Fitness app) |
| `scheduleStore` | `todo-schedules` | **v1** | localStorage + Supabase | Schedule templates (recurring weekly timetables, Calendar section) |
| `uiStore` | `todo-ui-session` | **v1** | localStorage (partial) + memory | all UI state (modals, panes, active section) — only navigation/session memory is persisted, see below |
| `settingsStore` | `todo-settings` | **v2** | localStorage | user preferences |
| `authStore` | — | — | memory only | Supabase session |
| `recentItemsStore` | `todo-recent-items` | **v1** | localStorage only | Quick Access (Ctrl+G) recent/frequent visit history |
| `notificationStore` | `todo-notifications` | **v1** | localStorage only | pending in-app notifications + the log of already-notified triggers |
| `hotkeyOverridesStore` | `todo-hotkey-overrides` | **v1** | localStorage only | user-rebound keyboard shortcuts (see "Hotkeys rule") |
| `dialogStore` | — | — | memory only | queue behind `confirmDialog()` / `alertDialog()` (see "Confirmations and alerts") |
| `voiceStore` | — | — | memory only | voice-dictation status and level for `VoiceIndicator` |
| `agentLogStore` | `agent-log` | **v1** | localStorage only | audit log of every agent command (reads as ids only); capped at 2000 entries; cleared on sign-out |
| `agentBatchStore` | `agent-batches` | **v1** | localStorage only | before-snapshots so an agent's changes can be undone; capped at 50 batches; cleared on sign-out |

### Zustand migration rule

When adding fields to a persisted store's shape: **bump `version`** and write a **cumulative `migrate` function** that backfills defaults for every prior version. Never write non-cumulative migrations.

Current taskStore v11 migrate backfills: `routineTasks: []`, `repeatConfig: null`, `fieldSchema: []`, `tagIds: []` on collections (v5); `scheduledAt: null`, `scheduledTime: null`, `calendarEventId: null` on tasks (v6); `collectionId: null` on collections (v7); `archivedAt: null` on both collections and purposes (v8); `calendarReminderId: null` on tasks (v9); `crossAppRefs: []` on tasks (v10); `archivedAt` (from `updatedAt` for already-archived tasks, else `null`) + `archiveReason: null` on tasks (v11). The steps up to v10 each `return` early, so v11 is deliberately applied as a wrapper *after* them (in `migrate`, an IIFE around the old body) — a v9 store returns from its own step and would otherwise never reach a later `if (fromVersion < 11)` block. Follow that wrapper pattern for v12+ rather than adding another early-return block.

**Unversioned stores:** persisted data with no `version` arrives as v0. The first time such a store's shape changes, give it `version: 1` and a `migrate` that backfills the new fields (`scheduleStore` did exactly this) — a `version` with no `migrate` makes zustand discard the stored state. Every persisted store now has a version.

**Every persisted store uses `storage: persistStorage()`** (`src/utils/persistStorage.ts`) in its `persist` options — never zustand's default localStorage. Browsers give the whole site roughly 5 MB of localStorage, shared by every store, and zustand's persist calls `setItem` inside the store's own `set`, so a full quota throws a `QuotaExceededError` out of whatever action was running (opening a note, in the report that found this) and takes the section down through the error boundary. `persistStorage()` catches that one error: the change stays in memory (and still syncs, if signed in), the user gets an alert naming the biggest store and pointing at Settings → Storage, repeated every 10 minutes while writes keep failing, and the app carries on. Any other storage error still throws. Audit: `grep -L persistStorage` over the files that contain `persist(` must list nothing.

**The one exception is `noteStore`, which uses `storage: persistStorageIdb()` (`src/utils/idbStorage.ts`) and lives in IndexedDB** — notes hold pasted images inline and were the store that hit the 5 MB ceiling. IndexedDB has hundreds of MB, and works the same in the browser, Tauri's WebView2 and Android's WebView. How it keeps zustand's persist synchronous: `main.tsx` awaits `preloadIdbStorage()` (opens database `organisaitor`, object store `kv`, loads the IndexedDB-backed keys into an in-memory map, and on first run moves any old localStorage copy across — put first, remove from localStorage only after) and only THEN dynamically imports `App`, so **no store module may be imported before that finishes** (a store created early would read an empty cache and could persist an empty state over the real data; `idbBacked.getItem/setItem` throw if used before it is ready, on purpose). After that `getItem` reads the map and every `setItem` updates it and is written to IndexedDB in the background (write-behind, one write at a time, latest value wins). If IndexedDB can't be opened the key stays in the guarded localStorage. A failed background write goes through the same alert as a full localStorage (`reportPersistFailure`).

**Because of that, backup and restore must not read/write localStorage directly for a persisted key** — use `readPersistedValue(key)` / `writePersistedValue(key, value)` (`idbStorage.ts`; `backupExport.ts`, `AccountPane` and `IntegrationsPane` do). `writePersistedValue` also freezes further IndexedDB writes until the reload that restore always does, so the running app can't overwrite the restored data. To move another store to IndexedDB: use `persistStorageIdb()` and add its key to `IDB_STORAGE_KEYS`.

**Also:** when adding a brand-new persisted store (not just a field on an existing one), add its `persist` `name` to `PERSISTED_STORAGE_KEYS` in `src/config/backup.ts` — that's the one list both full-app Export/Restore implementations (`AccountPane`, `IntegrationsPane`) read from. This list drifted out of sync with reality once already (Records/Routines/Notes/Lists/Portfolio/Fitness were all silently missing from backups for a while), so treat it the same as a migration: part of shipping the store, not a follow-up.

### uiStore — key state and actions

uiStore is memory-only **except** the fields marked "persisted" below — those survive
closing the app (`todo-ui-session`, localStorage; see PERSISTED_STORAGE_KEYS). Everything
else (every modal/pane/dropdown open-state, every "currently editing X" pointer) resets on
reload by design, so the app never reopens pointing at a stale modal.

```typescript
// Active section (pending rename: activeView→activeSection, AppView→AppSection, setActiveView→setActiveSection)
activeView: AppView               // 'tasks' | 'calendar' | 'records'  — persisted
setActiveView(view, opts?: { mode?: 'push' | 'back' | 'forward' })  // mode defaults to 'push'

// Back/forward section navigation (Alt+Left/Alt+Right, Backspace a secondary alternate for
// back) — standard browser semantics: 'push' clears the forward stack, 'back'/'forward'
// push onto the *other* stack. Both stacks persisted.
sectionHistory: SectionHistoryEntry[]          // back stack, most-recent-first, capped at MAX_SECTION_HISTORY
sectionForwardHistory: SectionHistoryEntry[]   // forward stack, same shape
navigateBack(), navigateForward()

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

### How sync works (`src/services/sync/syncService.ts`)

- **Local first.** The app always renders from this device (localStorage; IndexedDB for notes). If signed in, `initSync` then downloads every row of every synced table (on launch, on sign-in, and Android pull-to-refresh) and merges per id — newest `updatedAt` wins, a remote soft-delete removes the local item. No realtime and no periodic pull: another device's changes arrive on its next load.
- **Every local change is recorded, then pushed.** `watch()`/`trackChanges()` record each changed or deleted row id in a **pending-changes queue** persisted in localStorage (`todo-sync-pending`, deliberately NOT in `PERSISTED_STORAGE_KEYS`; per account; cleared on sign-out by `clearPendingSync()`), then `pushIds()` sends the row's *current* state (or a soft-delete if it no longer exists locally) immediately. An entry is forgotten only after Supabase accepts it. Failures stay queued and are retried when the browser comes back online, every 60 s while anything waits, and after each load — so being offline, a failed request, or closing the window mid-request no longer loses a change.
- **After each load's merge**, `queueLocalOnlyAndNewer()` queues anything that exists only locally (created offline / before sign-in) or is newer locally than in the cloud, and `mergeRecords()` refuses to resurrect a row deleted on this device but not yet reported. Tables whose records have no `updatedAt` (tags, list types, portfolio tags/purposes) can only be detected as "missing remotely"; an offline *edit* to one of those still loses to the cloud.
- **Adding a synced table or store property:** add it to `SYNC_TABLES`, `TABLE_DEFS` (how to read its local records and build a row), the `fetch` list in `runInitSync`, `hydrateStores` (with its table name passed to `mergeRecords`), `upsertAllToSupabase`, and `setupSubscriptions` (`watch()`); plus the mapper and migration below. Missing `TABLE_DEFS`/`watch` means its changes silently never sync.
- Never call `authStore.signOut()`/wipe the stores while `watch()` subscriptions are live — the wipe would be read as "user deleted everything" (`stopSync()` first; see `authStore.signOut`).

### Live migration status (Supabase project `zwbyvspbamovlqfxpjft`)

**This table is the only source of truth for which SQL has actually been executed against the live database.** The files in `supabase/migrations/` only *describe* schema — nothing applies them automatically (no `supabase/config.toml`, project isn't CLI-linked); the user runs each one by hand in the Supabase SQL editor. So a migration file existing, or code depending on it, tells you nothing about whether it's live.

**Rules for every future migration (a standing pattern, not a one-off):**
1. Write the file in `supabase/migrations/NNN_description.sql` — and if it creates a table, it **must include its own `grant select, insert, update, delete on … to authenticated`** (raw SQL doesn't auto-grant; without it the API 403s before RLS runs — 019–021 forgot this and needed 022).
2. Add a row to **"Migration history"** below (what it does) **and** a row to the table below with status **`Pending — not yet run`**.
3. Tell the user which file(s) to run and in what order.
4. **Only after the user confirms they've run it**, change the row to **`Applied`** with the date and "confirmed by user". Never mark a migration applied on your own, and never assume one is applied because its file exists.
5. Code that depends on a still-`Pending` migration must degrade gracefully rather than break unrelated features (sync already isolates per-table failures — see "Per-table failure isolation").

| Migrations | Status | Confirmed |
|------------|--------|-----------|
| `001` – `027` | **Applied** | Everything through `027` has been run against the live project, confirmed by the user. `001`–`022` as a batch on 2026-09-19 ("ran all SQLs from 001 to 022"), `023` separately ("Migration 23 SQL has been completed"), and `024`–`027` on 2026-09-20 ("24, 25, 26, and 27 have all been run"; then "All Supabase SQL has been run up to 027 inclusive"). Reported by the user, not independently verified. `022` (grants) was written *after* 019–021 and run after them. Earlier "written, not yet run" notes on 012–021 predate this and were stale — removed. the next new one is `034`. |
| `029` | **Applied** | `029_calendar_archive.sql` (archive timestamp + reason on calendar events and reminders) — run against the live project, confirmed by the user 2026-09-20 ("I've run SQL 029 in Supabase"). Reported by the user, not independently verified. |
| `030` | **Applied** | `030_speech_usage.sql` (voice dictation usage table + `record_speech_usage()` function) — run against the live project, confirmed by the user 2026-09-20 ("030 has been run in Supabase"). Reported by the user, not independently verified. |
| `031` | **Applied** | `031_drop_cross_app_links.sql` (drops the never-used `cross_app_links` table) — run against the live project, confirmed by the user 2026-09-20 ("031 has been run"). Reported by the user, not independently verified. |
| `028` | **Applied** | `028_task_archive_reason.sql` (task archive timestamp + reason) — run against the live project, confirmed by the user 2026-09-20 ("SQL task zero two eight has been run in Supabase"). Reported by the user, not independently verified. |
| `032` | **Applied** | `032_oauth_state.sql` (`oauth_states` nonce table + `mint_oauth_state` / `save_strava_connection` / `save_calendar_connection` functions — the OAuth `state` is now a single-use nonce instead of the user's access token) — run against the live project, confirmed by the user 2026-09-20 ("032 has been run in supabase"). Reported by the user, not independently verified. |
| `033` | **Applied** | `033_calendar_links.sql` (`links text[]` on `calendar_events` and `calendar_reminders`). every event/reminder upsert now sends `links`, so those two tables reject writes until it is applied (sync isolates the failure per table; nothing else breaks). |

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
| `008_notes_initial.sql` | notes, note_tags, cross_app_links tables (`cross_app_links` was never used and is dropped by 031) |
| `009_task_scheduled.sql` | `scheduled_at text`, `scheduled_time text`, `calendar_event_id text` on tasks |
| `010_collection_endeavour.sql` | `collection_id text` on collections (trackers/routines → Endeavour) |
| `011_archiving.sql` | `archived_at timestamptz` on collections and purposes |
| `012_fitness_strava.sql` | `fitness_strava_connection` table (Strava OAuth tokens) |
| `013_soft_delete.sql` | `deleted_at timestamptz` on all 7 synced tables — soft-delete tombstones so deletions propagate across devices |
| `014_schedules_and_lists.sql` | First-ever Supabase tables for Schedules and Lists: `schedules`, `lists`, `list_items`, `list_types` (custom types only — built-ins never sync) |
| `015_task_calendar_layers.sql` | `calendar_reminder_id text` on `tasks`; `reminder_type text not null default 'default'` on `calendar_reminders` — see "Task Calendar Items — layers" |
| `016_task_cross_app_refs.sql` | `cross_app_refs jsonb not null default '[]'` on `tasks` — reverse cross-app links (e.g. which note(s) a task was created from); see "Cross-app linking" |
| `017_event_status.sql` | `status text not null default 'confirmed'` on `calendar_events` — tentative events, see "Tentative events" |
| `018_calendar_sync.sql` | New `calendar_connections` table (one row per connected external account); `source`/`source_connection_id`/`source_calendar_id`/`source_event_id`/`source_raw` columns on `calendar_events` — see "External calendar sync" |
| `019_user_vault.sql` | New `user_vault` table (one row per user): wrapped vault-key blobs for client-side encryption (passphrase path + recovery-code path) — see "Client-side encryption for Note content" |
| `020_notes_sync.sql` | Catches up `notes`/`note_tags` (reserved early by `008_notes_initial.sql`, never wired into `syncService.ts`) with every field added to the domain model since, adds `deleted_at` tombstones to both, adds `is_encrypted` to `notes`; creates `structured_tag_entries` table — see "Notes Supabase sync" |
| `021_portfolio_sync.sql` | New `watchlist_items`, `portfolio_tags`, `investment_purposes` tables — portfolioStore's first-ever Supabase sync — see "Portfolio Supabase sync" |
| `022_grants_notes_portfolio_vault.sql` | `grant … to authenticated` for every table added by 008/012/018/019/020/021 — **required**: raw SQL doesn't auto-grant, and without it the API 403s ("permission denied for table X") before RLS is even evaluated. 019–021 omitted this (found 2026-09-19 when initial sync 403'd). **Every new-table migration must include its own grant** (001/003/014 do) |
| `023_note_tags_order_fractional.sql` | `note_tags."order"` `int` → `double precision`: the app stores fractional sibling orders on purpose (`parent.order + 0.5` on outdent, drag-and-drop midpoints), and the integer column made the first Notes force-upload fail with `invalid input syntax for type integer: "0.5"`. Audited every other integer column (`tasks`/`list_items` `sort_order`, `notify_before_value`, `athlete_id`, `expires_at`, `kdf_iterations`) — none are *deliberately* given fractions by app code. One latent exception, not seen and not fixed: `calendar_events.notify_before_value` is `integer` but `CalendarEventPane` feeds it `Number(e.target.value)` from a free-typed field, so typing `1.5` would fail sync the same way |
| `024_encrypted_note_payloads.sql` | `notes.encrypted_payload text`; `structured_tag_entries.is_encrypted boolean` + `encrypted_payload text` — the single AES-GCM envelope holding an encrypted note's/entry's sensitive fields (see "Client-side encryption for Notes — comprehensive"). No new table, so no grant needed |
| `025_calendar_important_optional_notify.sql` | `important boolean` on `calendar_events`/`calendar_reminders`; `cross_app_refs jsonb` on both (reverse links from a note — see "Cross-app linking"); drops `NOT NULL` on `calendar_events.notify_before_value` (null = "notify before" off — see "Calendar: optional notify-before"). Alters existing tables only, so no new grants needed |
| `026_reminder_allday_notify.sql` | `notify_days_before integer` (default 1) and `notify_at_time text` (default '17:00') on `calendar_reminders` — see "Calendar: whole-day reminder notifications". Alters an existing table only |
| `027_encrypted_lists.sql` | `is_encrypted boolean` + `encrypted_payload text` on `lists` and `list_items` — the single AES-GCM envelope holding an encrypted list's name/description/type/field schema/tabs and each item's title/data/notes/links (see "Client-side encryption for Lists"). No new table, so no grant needed |
| `028_task_archive_reason.sql` | `archived_at timestamptz` + `archive_reason text` on `tasks` (the `archived boolean` has existed since 001); backfills `archived_at = updated_at` for rows already archived. Alters an existing table only, so no new grant. Applied 2026-09-20 — see "Task archiving" |
| `029_calendar_archive.sql` | `archived_at timestamptz` + `archive_reason text` on `calendar_events` and `calendar_reminders`. Alters existing tables only, so no new grant. Applied 2026-09-20 |
| `030_speech_usage.sql` | New `speech_usage` table (per-user, per-day seconds; select-only via RLS + `grant select`) and a security-definer `record_speech_usage(p_seconds, p_monthly_limit)` function (`grant execute`) that checks the monthly cap and increments in one step — a user-writable counter would let anyone reset their own limit. See "Voice dictation". Applied 2026-09-20 |
| `031_drop_cross_app_links.sql` | Drops `cross_app_links` (created by 008, granted by 022): superseded by embedded `crossAppRefs` columns (016, 025) and never read or written by any code. Applied 2026-09-20 |
| `032_oauth_state.sql` | New `oauth_states` table (RLS on, **no policies, no grants** — only the functions touch it) and three security-definer functions: `mint_oauth_state(p_provider)` (`grant execute` to `authenticated`; binds a random ≥244-bit nonce to `auth.uid()` + provider, 10-minute expiry, one live nonce per user+provider) and `save_strava_connection(...)` / `save_calendar_connection(...)` (`grant execute` to `anon`; called by the two OAuth callbacks with the anon key — each deletes the nonce in the statement that validates it, so it is single-use, then upserts the connection row for the nonce's user). Replaces putting the access token in the OAuth `state` URL. See "OAuth `state` nonces" in `docs/features/implemented-features.md`. Applied 2026-09-20 (confirmed by user). |
| `033_calendar_links.sql` | `links text[] not null default '{}'` on `calendar_events` and `calendar_reminders` — same as `tasks.links`; see "Calendar links, Complete button, pane Ctrl+Enter, TimeInput Enter" in `docs/features/implemented-features.md`. Alters existing tables only, so no new grant. **Pending — not yet run** |

### Supabase tables (summary)

- **tasks** — mirrors Task interface
- **collections** — mirrors Collection; includes `field_schema jsonb`, `routine_tasks jsonb`, `repeat_config jsonb`, `collection_id text`, `archived_at timestamptz`
- **tags** — mirrors Tag; includes `notes text`
- **purposes** — mirrors Purpose; includes `archived_at timestamptz`
- **calendar_events** / **calendar_reminders** — CalendarEvent / CalendarReminder; `calendar_reminders` includes `reminder_type text` (`'default' | 'task'` — see "Task Calendar Items — layers"); `calendar_events` includes `status text` (`'confirmed' | 'tentative'` — see "Tentative events") and `source`/`source_connection_id`/`source_calendar_id`/`source_event_id`/`source_raw` (external calendar sync provenance — see "External calendar sync")
- **calendar_connections** — one row per connected external calendar account (Google today); `id` is a real primary key (not `user_id`), since multiple connections per user are supported — a real structural difference from `fitness_strava_connection`, which only ever needs one row per user; unique on `(user_id, provider, account_email)`; `access_token`/`refresh_token`/`expires_at`/`scope` never read client-side, only through `api/google-calendar-*.ts`; `calendars_enabled jsonb` lists which of the account's calendars are opted into syncing
- **tracker_entries** — TrackerEntry; `data jsonb`, RLS on `user_id`
- **fitness_strava_connection** — one row per user: `athlete_id`, `access_token`, `refresh_token`, `expires_at`, `scope`; RLS on `user_id`; never read client-side directly, only through `api/strava-status.ts` / `api/strava-sync.ts`
- **schedules** — mirrors `ScheduleTemplate`; `blocks jsonb` (the full `ScheduleBlock[]`, same "commit the whole array on save" pattern as `collections.field_schema`)
- **lists** — mirrors `List`; `field_schema jsonb`, `tabs jsonb`
- **list_items** — mirrors `ListItem`; `data jsonb`, `sort_order integer` (the domain field is named `order`, renamed at the DB boundary only — `order` is a SQL reserved word)
- **list_types** — mirrors `ListType`, but **only rows for custom (non-built-in) types are ever written here** — built-ins have fixed ids (`lt-movies`, `lt-credentials`, …) and are always re-seeded locally by `listStore.ts`, same as Fitness's `BUILTIN_ACTIVITY_TYPE_SEEDS`. No `created_at`/`updated_at` (the domain `ListType` interface has neither, same as `Tag`) — merges fall back to remote-wins, tombstone-aware, same as `tags`
- **notes** / **note_tags** / **structured_tag_entries** — mirror `Note` / `NoteTag` / `StructuredTagEntry`; `notes` includes `is_encrypted boolean` (see "Client-side encryption for Note content" below — when true, `content` holds a JSON envelope, not raw Tiptap doc JSON, opaque to this table)
- **user_vault** — one row per user: `wrapped_key`/`wrapped_key_iv`/`salt` (passphrase-unwrap path) and `recovery_wrapped_key`/`recovery_wrapped_key_iv`/`recovery_salt` (recovery-code-unwrap path), both wrapping the same underlying AES-GCM vault key; `kdf_iterations`; RLS on `user_id`; never holds anything usable without a secret only the client has — see "Client-side encryption for Note content"
- **watchlist_items** — mirrors `WatchlistItem`; `investment_purpose_ids`/`tag_ids`/`links` all `jsonb`
- **portfolio_tags** / **investment_purposes** — mirror `PortfolioTag` / `InvestmentPurpose`; neither has `created_at`/`updated_at` in the domain model (same as `Tag`) — merges fall back to remote-wins, tombstone-aware, same as `tags`/`list_types`. `investment_purposes`' built-in seed rows (fixed ids like `ip-dividend`) are ordinary synced data here, unlike `list_types`' built-ins — portfolioStore has no re-seed-on-load mechanism and never blocks editing/deleting a seed purpose

---

## File structure

```
src/
  App.tsx                    — root: hotkey handler, modal routing, section switcher
  types/index.ts             — all TypeScript interfaces and unions
  types/agent.ts             — agent command-layer types (RiskTier, EntityKind, AgentLogEntry, AgentBatch); not re-exported from index.ts
  agent/                     — the AI agent command layer (see "Agent command layer" below and docs/ai/02-command-layer.md): access.ts (THE boundary: what an agent can read and do), commands/*.ts, run.ts (runCommand), registry.ts (toolDefinitions), batch.ts (snapshot/diff/revert), errors.ts, devHandle.ts (dev-only console handle)
  test/                      — Vitest setup (Map-backed localStorage) and helpers
  config/
    hotkeys.ts               — HOTKEYS[] + HOTKEY_GROUPS (single source of truth)
    labels.ts                — all user-facing strings; rename concepts here
    trackerTemplates.ts      — FieldSchema[] presets for habit/books/movies/custom
    noteTagPresets.ts        — TagPresetDef[] curated annotation tag packs (Academic preset)
    noteTemplates.ts         — NoteTemplateDef[] content-prefill templates for AddNoteModal (Blank, Meeting Minutes, Daily Journal, Book/Article Notes, Project Brief, Cornell Notes)
    activityTypes.ts         — BUILTIN_ACTIVITY_TYPE_SEEDS (Run/Hike/Walk/Ride/Swim/Strength/Yoga/Other, fixed ids) used once by fitnessStore to seed activityTypes; DEFAULT_TOP_TYPE_IDS fallback for the pill row before any activities exist
    structuredTagTypes.ts    — STRUCTURED_TAG_TYPES[]: registry of built-in tags that carry their own separate StructuredTagEntry data (Acronym today); each entry pairs a typeKey (matching BuiltinTag.typeKey) with a field schema and an optional non-AI infer() — see "Structured tag entries" in Implemented features for the extensibility design
    apps.ts                  — APP_TIERS (core vs addon nav sections) + isAppEnabled(view): single gating point for add-on app availability (Portfolio, Fitness today; no real entitlement backend yet — always returns true)
    backup.ts                — PERSISTED_STORAGE_KEYS: every localStorage key any store persists to (single source of truth for full-app Export/Restore in AccountPane and IntegrationsPane — add a key here when a new persisted store is added, nowhere else)
  store/
    taskStore.ts             — tasks, collections, tags, purposes
    trackerStore.ts          — tracker entries
    routineStore.ts          — routine instances (localStorage only)
    noteStore.ts             — notes + note tags (localStorage only)
    listStore.ts             — lists + list items + list types; list/item mutations route encrypted lists themselves (see "Client-side encryption for Lists")
    fitnessStore.ts          — activities (Fitness app, localStorage only)
    scheduleStore.ts         — Schedule templates (recurring weekly timetables, Calendar section, localStorage only)
    uiStore.ts               — all UI state
    settingsStore.ts         — user preferences
    authStore.ts             — Supabase session
    recentItemsStore.ts      — Quick Access (Ctrl+G) recent/frequent visit history, keyed by `${QuickAccessTargetType}:${entityId}`
    dialogStore.ts           — queue of pending confirm/alert requests (memory-only) behind `confirmDialog()` / `alertDialog()` in components/ConfirmDialog/dialogs.ts
    hotkeyOverridesStore.ts  — user-rebound hotkeys (persisted `todo-hotkey-overrides`); `matchesHotkeyId`, `findConflicts`
    notificationStore.ts     — pending in-app notifications + already-notified log (persisted `todo-notifications`)
    voiceStore.ts            — voice dictation status/level for VoiceIndicator (memory-only, written by services/speech/dictation.ts)
  services/sync/
    syncService.ts           — Supabase push/pull
    mappers.ts               — xToRow / rowToX for every entity
  services/signOut.ts       — requestSignOut(): THE way to sign out — confirms (and says what stays on the device), locks the vault, force-uploads and only wipes if that succeeded (else warns, user can cancel), then authStore.signOut(). Never call authStore.signOut() directly from UI
  services/clearLocalData.ts — clearSyncedLocalData(): empties every CLOUD-SYNCED store + the account-specific selection ids (each reset from its own getInitialState()). Local-only stores (fitness, routine instances, settings, hotkeys, portfolio columnConfig) are deliberately left; add a store here in the same change that gives it cloud sync
  services/shrinkNoteImages.ts — shrinkNoteImages(): recompresses every large inline image in every note and tab (skips locked encrypted notes; closes the open note first so the editor can't autosave its old copy over the result); Settings → Storage's button
  services/oauthState.ts    — mintOAuthState(provider): the single-use nonce used as the OAuth `state` for Strava/Google connect (migration 032); never put a credential in an OAuth URL
  services/strava.ts         — client-side Strava wrapper: getStravaConnectUrl(), checkStravaStatus(), syncStrava() (calls api/strava-* edge functions, upserts results into fitnessStore)
  services/googleCalendar.ts — client-side Google Calendar sync wrapper: getGoogleCalendarConnectUrl(), fetchGoogleCalendarConnections(), setGoogleCalendarEnabled(), disconnectGoogleCalendar(), syncGoogleCalendars() (calls api/google-calendar-* edge functions, maps + upserts results into calendarStore via upsertSyncedEvent) — see "External calendar sync"
  services/crossAppLinkCleanup.ts — deleteTaskWithCleanup/deleteNoteWithCleanup/removeCrossAppRefFromTarget: keeps cross-app links (Task.crossAppRefs, Notes' ArtifactLinkMark) from going dead when either side is deleted; the one module allowed to import both taskStore and noteStore (they must never import each other directly) — see "Cross-app linking"
  services/taskCalendarLinks.ts — keeps a task's shadow calendar reminder (deadline) and event (scheduled date) matching the task, and flows edits made on the event back — the one place that logic lives (see "Task ⇄ calendar shadow entries" in Implemented features); like crossAppLinkCleanup it may import both taskStore and calendarStore
  services/noteSecrets.ts    — the encrypted-notes model: NoteSecrets/EntrySecrets shapes, the memory-only plaintext cache, noteView()/entryView()/isNoteLocked() (the ONE way to read a possibly-encrypted note), the serialized re-encrypt queue (queueEncrypt/flushEncryptions) — see "Client-side encryption for Notes — comprehensive"
  services/noteSecretsSync.ts — keeps that cache in step: decrypts encrypted notes/entries when the vault unlocks or a sync pull brings new payloads, wipes it on lock, upgrades v1 legacy encrypted notes
  services/listSecrets.ts    — the encrypted-lists model (Lists twin of noteSecrets.ts): ListSecrets/ItemSecrets shapes, memory-only plaintext caches, listView()/itemView()/isListLocked() — the ONE way to read a possibly-encrypted list/item. Reuses noteSecrets.ts's crypto, serialised re-encrypt queue and cache-version counter
  services/listSecretsSync.ts — keeps those caches in step with the vault (decrypt on unlock/sync pull, wipe on lock)
  store/listViews.ts         — React hooks useListViews()/useListView(id)/useListItemViews(): lists/items resolved through the cache
  components/ErrorBoundary/ — class ErrorBoundary: `scope="app"` (around <App /> in main.tsx: full-page fallback with Reload + Export backup + collapsed Details) and `scope="section"` (around the section switcher in App.tsx, keyed by `activeView` so navigating away resets it: "Reload this section", nav keeps working). A **new section must render inside that section boundary**; copy is `LABELS.errorBoundary`
  components/ConfirmDialog/ — THE replacement for window.confirm()/alert(): `dialogs.ts` (`confirmDelete`, `confirmDialog`, `alertDialog`) + `ConfirmDialogHost`, mounted once in App.tsx (see "Confirmations and alerts")
  components/DecryptPrompt/  — app-wide "enter your passphrase to permanently decrypt this note/list" modal (uiStore.decryptPrompt / requestDecrypt), portaled, z-index 200; opened by every clickable 🔒
  store/noteViews.ts         — React hooks useNoteViews()/useNoteView(id)/useEntryViews(): notes/entries resolved through the cache, re-derived when the store OR the cache changes
  services/vault.ts          — client-side encryption vault: setupVault/unlockWithPassphrase/unlockWithRecoveryCode/lockVault, trustThisDevice (IndexedDB key cache), encryptField/decryptField (AES-GCM via Web Crypto) — see "Client-side encryption for Note content"
  utils/
    backupExport.ts          — downloadBackup(): exports every `PERSISTED_STORAGE_KEYS` key straight from localStorage (works without the app rendering); used by AccountPane and the ErrorBoundary fallback
    calendarItemInput.ts     — buildCalendarEventInput / buildCalendarReminderInput: the rules for turning what a person or an agent supplied into a stored event/reminder (used by AddCalendarItemModal and the agent commands)
    scheduleBlocks.ts        — createScheduleBlock(): the one place a ScheduleBlock's defaults live (used by AddScheduleModal and the agent commands)
    date.ts                  — todayIso(), formatDate(), timeAddMinutes(), addDaysToIso(), computeLinkedEndTime() (auto-derives a linked end time from a start time — see Timepicker rebuild in Implemented features), etc.
    id.ts                    — typed nanoid wrappers
    notes.ts                 — Note/NoteTag Endeavour resolution: getEffectiveCollectionId, resolveNoteInheritedCollectionId, getNoteEffectiveCollectionId, getVisibleNoteTagIds, getNoteBreadcrumb (location string for StructuredTagPopover)
    acronymInference.ts      — inferAcronymFromSelection(selectedText, contextText): non-AI pattern/initials-based acronym expansion inference for the Acronym structured tag type (see structuredTagTypes.ts)
    collections.ts           — getOrderedEndeavours(collectionsRecord): Projects then Lists, in CollectionFilterPicker's render order; shared by the picker and the Ctrl+E digit-select hotkey
    fitnessFormat.ts         — Fitness display formatting (metric only, Phase 1): formatDistance, formatDuration, formatSpeed, computeAverageSpeedMps. Stored data is always SI (meters/seconds/m·s⁻¹); conversion happens only here, at render time
    fitnessActivityTypes.ts  — getActivityType() (graceful fallback if a type was deleted) and getTopActivityTypes() (usage-ranked, for the AddActivityModal pill row)
    links.ts                 — openExternalLink(url) (Tauri-aware: routes through @tauri-apps/plugin-opener under Tauri, @capacitor/browser under Android, window.open() in the browser/PWA) and normalizeLinkUrl(raw) (prefixes bare domains with https://); shared by TaskItem/TaskPane/Notes link UI and App.tsx's global external-link click interceptor
    apiFetch.ts               — apiFetch(path, init): drop-in fetch() replacement for /api/* calls; routes through @tauri-apps/plugin-http's native fetch against the production Vercel URL under Tauri (bypasses browser CORS, no edge-function changes needed), plain same-origin fetch everywhere else — see "Desktop (Tauri) API access" in Implemented features
    textToTask.ts            — inferTaskFromSelection(text): non-AI date/time/priority/link inference for the Notes "Create ▸ Task" feature (see Implemented features) — regex-based, no external dependency; locale-aware (Intl) for ambiguous numeric dates
    idbStorage.ts            — IndexedDB persistence for the notes store: preloadIdbStorage() (awaited in main.tsx before the app is imported), persistStorageIdb(), readPersistedValue()/writePersistedValue() for backup/restore, IDB_STORAGE_KEYS, getIdbUsage()
    persistStorage.ts        — THE `storage:` for every persist() (guards QuotaExceededError, see Zustand migration rule) + getStorageUsage()/formatStorageSize() for Settings → Storage
    imageCompress.ts         — compressImageBlob(file) / recompressDataUrl(dataUrl): scale to fit 1600 px + WebP, used on paste into notes and by shrinkNoteImages
    noteTabs.ts              — MAIN_TAB_ID ('__main__'), linkTabIdFor / effectiveLinkTabId / tabNameOf: how a CrossAppRef.tabId (a link naming one tab of a note) is recorded, resolved (deleted tab → main) and named
    keywords.ts              — extractKeywords(text) (stop-words/short words dropped, max 8) + stemForMatch(word); used by NotePickerModal's title-keyword suggestions
    noteSearchText.ts        — getNoteTabTexts(note): cached plain text of a note's main tab and each extra tab for searching (never caches encrypted notes); read a note's text for search through this, not by re-parsing its JSON
    openCrossAppTarget.ts    — (in services/) openArtifactTarget(type,id): opens a linked task/event/reminder in its section; used by editor link clicks and the Linked-from pills
    noteContent.ts           — stripArtifactLinksFromContent(contentJson, targetType, targetId): pure JSON-tree walk over a Note's stored Tiptap content, editor-independent (the note being cleaned up is rarely the one currently open) — used by crossAppLinkCleanup.ts
    haptics.ts               — Android-only guarded haptic wrappers (hapticLight/Medium/Success/Warning), no-op via Capacitor.isNativePlatform() elsewhere
    timeGrid.ts              — shared hourly time-grid layout math (buildHourLayout, minutesToY, layoutDayTimeGrid, markActiveHours), generic over item type; used by CalendarView's week/day views and CalendarSidePane's overlay-preview grid
    scheduleOccurrences.ts   — expandScheduleBlock() (turns one ScheduleBlock into concrete occurrence dates, honouring interval/anchor/exceptions), blocksMayConflict() + countTemplateConflicts() (the schedule manager's "N potential conflicts" hint)
    recurrence.ts            — repeating calendar items: expandRepeat (honours RepeatConfig.exceptions), isOccurrenceSkipped, withException / endedBefore / tailOf (the "this one / this and following" operations) — see "Calendar: editing individual occurrences"
    timezone.ts              — account-wide timezone: resolveTimezone, zonedTimeToUtc, utcToZonedTime, rezoneWallClock, todayIsoInZone, listTimezones
    quickAccess.ts           — Quick Access (Ctrl+G) provider registry: one QuickAccessProvider per destination type (note/notebook/task/list/endeavour/tracker/routine) with list()/resolve()/navigate(); searchQuickAccessItems(), resolveRecentItems(), navigateToQuickAccessItem() — extension point for new destination types (see Implemented features)
  services/timezoneMigration.ts — rezoneAllCalendarData(fromZone, toZone): re-stamps every stored wall-clock date+time when the timezone setting changes
  hooks/
    useCtrlEnterSubmit.ts    — THE Ctrl+Enter rule for form-less modals/panes: `useCtrlEnterSubmit(onSubmit, active?)` (see "Ctrl+Enter — universal submit rule")
    useEscapeClose.ts        — THE Escape rule: every overlay registers here; Escape closes only the most recently opened one (see "Escape key — universal close rule")
  components/
    NavSidebar/              — left nav: section switcher, settings, account icons (desktop/web only — hidden on Android in favour of MobileNav)
    MobileNav/               — Android-only bottom tab bar: Tasks/Calendar/Records/Lists/More
    MobileMoreSheet/         — Android-only overflow sheet for MobileNav's More tab: Notes/Portfolio/Fitness/Manage Library/Settings/Account
    MobileQuickAddBar/       — Android-only bottom-anchored task quick-add (title + Due/Priority/Endeavour chips), replaces QuickAddInput on Android
    MobileCalendarQuickAdd/  — Android-only bottom-sheet quick-add for calendar events/reminders
    Sidebar/                 — hover panel (from the header hamburger, left-hand side): pinned "Manage Library" button (M/Ctrl+M) at top, then active endeavours (collections), purposes, tags — quick glance + filter/edit, not administration (see ManagePane). Every section except Calendar — there, the same hamburger click-opens CalendarSidePane instead (see "Calendar side pane")
    TaskList/                — main task list + collapsible Routines section
    TaskItem/                — single task row; shows subtask progress pill
    TaskPane/                — slide-in task detail/edit pane
    ItemActions/             — the SHARED archive/restore + delete pattern every item pane uses (Task, Calendar event, Calendar reminder; future apps' panes should too) — see "Shared item actions" in Implemented features: icons.tsx (TrashIcon/ArchiveIcon/RestoreIcon/CheckCircleIcon), ItemActionFooter (optional Complete/Mark-incomplete toggle for task-backed items), ItemActionDialog (archive-with-reason + delete-confirm, portaled z-102), ArchivedBanner, useItemActions hook (dialog state + Escape + Ctrl+Enter + hotkeys)
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
    RecurrenceScopeBar/      — shown at the top of the event/reminder panes for a repeating item: edit/delete only this occurrence or this-and-following
    AddScheduleModal/        — create/edit a Schedule (recurring weekly timetable) and its blocks
    CalendarSidePane/        — left-sliding pane (Calendar section): Layers toggles + Schedule list/manager (active toggle, conflict hint, overlay-preview grid) in one place — supersedes the old CalendarLayersPicker (header dropdown) and ManageSchedulesPane (right-sliding pane), see "Calendar side pane" in Implemented features
    ScheduleOccurrencePopover/ — click a Schedule occurrence on the calendar: skip this date, commit/uncommit (commitment mode), or jump to editing the Schedule
    TimeInput/               — segmented hour/minute/AM-PM combobox respecting settingsStore.clockFormat (not a native <input type="time">, see Clock format setting below and the Timepicker rebuild entry in Implemented features), plus a quick-pick dropdown of half-hour times
    LinksField/              — the shared links list (clickable / edit / delete / add) used by TaskPane, CalendarEventPane and CalendarReminderPane; links typed into notes arrive via `mergeNewLinks` in the store's update action, never here
    LinkHoverPreview/        — app-wide: shows a hovered link's URL bottom-left (see "Link hover preview" pattern below)
    QuickAccessPane/         — app-wide, Ctrl+G: portaled search-and-jump overlay across Notes/Notebooks/Tasks/Lists/Endeavours/Trackers/Routines, or browse Recent/Frequent visit history (see "Suite-wide Quick Access pane" in Implemented features)
    TruncatedText/           — wraps a CSS-ellipsis-truncated name/title; shows the full text in a floating tooltip below the row on hover, only when actually truncated. Used by ChronicleView's tree node names and NoteList's note titles
    SettingsPane/            — settings slide-in; reads HOTKEYS[] dynamically; StorageSection.tsx = the Storage block (per-store usage + Shrink images in notes)
    ManagePane/              — library admin (Endeavours/Purposes/Tags): left-nav tabs + content, opened by clicking (not hovering) the header hamburger; archive/restore/delete rows. MANAGE_SECTIONS array in the file is the extension point for future tabs
    AccountPane/             — Supabase auth + account info
    IntegrationsPane/        — (stub) future integrations
    ColorPicker/             — reusable colour swatch picker
    CollectionPicker/        — CollectionPicker.tsx (single-select dropdown, used in create/edit forms) + CollectionFilterPicker.tsx (header Endeavour-focus picker, numbered for the E/Ctrl+E hotkey)
    CrossAppRefPicker/       — controlled { value: CrossAppRef[]; onChange; onNavigate? } widget: chips for existing links (with the note's notebook) + a "+ Link" button that opens NotePickerModal. Note is the only wired type; Calendar/List/Tracker are BACKLOG. Used by AddTaskModal, TaskPane, CalendarEventPane and CalendarReminderPane
    NotePickerModal/         — the "link a note" search dialog (portaled to document.body, z-index 1000): title + notebook path + preview + date per result, multi-word search over title/path/content, title-keyword suggestions while the search box is empty (`suggestFrom`), keyboard nav; captures Ctrl+Enter so the pane/modal behind it doesn't answer. Any future "pick a note" UI should reuse it rather than list notes by title alone — titles are not unique
    PurposeFilterPicker/     — header Purpose-focus picker (multi-select checkboxes), Tasks section only; P/Ctrl+P hotkey
    SortBar/                 — sort controls for task list
    NoteEditor/              — Tiptap v3 rich-text editor with toolbar, zoom, table support, abstract, attributes panel
      extensions/ResizableImage.ts   — custom NodeView: resizable image with drag handle
      extensions/HeadingNumbering.ts — ProseMirror plugin: computes hierarchical heading numbers, sets data-heading-number
      extensions/Section.ts          — custom Document (content: 'section+') + Section node (content: 'block+', columns/locked attrs) + ColumnBlock/Column nodes (locked-columns layout); commands setSectionColumns / insertSectionBreak / toggleSectionLocked
      extensions/ArtifactLinkMark.ts — Mark (targetType/targetId attrs) marking a span of note text as the source of a cross-app entity created from it via FloatingToolbar's "Create ▸" menu (Ctrl+Q); see "Cross-app linking" in Implemented features
      extensions/NoteTagMark.ts      — Mark (tagId/color/typeKey/structuredEntryId attrs) for annotation tags; structuredEntryId links a tagged passage to its StructuredTagEntry (see "Structured tag entries")
      builtinTags.ts         — 8 built-in annotation tag definitions (Important/Concept/Definition/Example/Question/Reference/Learn Later/Acronym) — typeKey drives both Learn Later's future create-task action and Acronym's structured-tag-entry behaviour
      NoteBacklinks.tsx      — the "Linked from" bar under a note's title: single pill / "🔗 N" chip + list, each pill openable, draggable into the text, or insertable at the cursor (derived from other items' crossAppRefs via store/noteBacklinks.ts — nothing stored); artifactLinkInsert.ts holds the insert/drop helpers
    StructuredTagPopover.tsx — create/edit popover shared by every structured tag type (Acronym today): compact term+field preview with Enter-to-accept, "More options" expands in place to show every field + Endeavour + (edit mode) location/timestamps
    NoteEditorPane/          — slide-in pane wrapping NoteEditor for non-Notes sections
    AddNoteModal/            — quick-add note (Ctrl+Space) with hierarchical tag picker
    AddNoteTagModal/         — create notebook (area) or custom annotation tag
    EditNoteTagModal/        — edit notebook/tag name, icon, color; field schema editor for annotation tags
    EditNoteMetaModal/       — edit note metadata: tagIds (notebooks + annotation tags), accent color, pinned
    NoteTagPresetModal/      — install curated annotation tag packs; detects already-installed via presetKey
    ChronicleView/           — Notes section layout: notebook tree, note list, editor; hover-expand on notebooks; NotebookLocationView is the editor column's empty state (path/tree of where you are)
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

### Form state that starts from an item — initialise it, never copy it in an effect

A modal or pane that edits an item (or is prefilled from one) gets its starting values from **lazy `useState` initialisers** — `useState(() => editing?.name ?? '')` — not from a `useEffect` that calls `setName(...)` (`react-hooks/set-state-in-effect` flags that: an extra render with stale values, and easy to get subtly wrong). For this to be correct the component must be **remounted whenever the edited item changes**: modals are mounted only while open (`{openModal === 'x' && <XModal key={editingX?.id ?? 'new'} />}` in `App.tsx`) and item panes are keyed by id (`<TaskPane key={editingTaskId} />`, likewise the calendar event/reminder, tracker and routine panes; `NotesSection` keys `EditNoteTagModal`). **When you add a modal/pane, add its `key` at the mount site.** If the item can be briefly unavailable (an encrypted note's plaintext arrives after decryption), mount an inner form component only once it exists and key that (`EditNoteMetaModal` → `EditNoteMetaForm`). Other cases, in order: derive the value during render; "adjust state while rendering" (`if (prev !== next) { setPrev(next); setX(...) }` — `TimeInput`, `useItemActions`, `TaskList`, `NoteEditorPane`); and only for a real external-system sync keep the effect with `// eslint-disable-next-line react-hooks/set-state-in-effect -- <why>`. An effect that references a handler declared *below* it trips `react-hooks/immutability` — use `useCtrlEnterSubmit` with a function-declaration handler, and declare any function the effect calls above it.

### Edit panes (slide-in from right)

Follow `EditTrackerPane`. Rendered at the App root level alongside the main content. Triggered by `openEditTracker(id)` / `openEditEntry(id)` etc. in uiStore.

### Escape key — universal close rule (a suite-wide pattern)

**Escape closes the most recently opened overlay, and only that one.** Every modal, slide-in pane, dialog, popover and dropdown registers with **`useEscapeClose(onClose, active?)`** (`src/hooks/useEscapeClose.ts`) while it is open — it must **never** add its own `document.addEventListener('keydown', …)` for Escape. `active` gates registration for a component that stays mounted while hidden (`useEscapeClose(closeManage, manageOpen)`); a component that is only mounted while open uses the default. Call it above any early `return null`.

How it works: one `document` listener (installed at module load) plus an ordered stack. An overlay pushes itself when it opens and pops when it closes, so the top of the stack is always the most recently opened one; Escape is handed to that entry alone and `stopImmediatePropagation()` keeps everything else from also seeing it. Registration depends only on `active`, never on the callback, so re-renders can't reshuffle the order.

**Why not per-component listeners (the old rule):** two independent `document` listeners both fire on one keypress in whatever order they registered, so an overlay opened *on top of* another can't be given priority — a delete confirmation over an event pane, a schedule modal over the calendar side pane, a picker inside a modal each closed the layer underneath (or both). The old workarounds — an outer layer checking "is an inner modal open" (`openModal !== 'add-schedule'`), capture-phase + `stopImmediatePropagation` (`CrossAppRefPicker`, `DecryptPrompt`, `StructuredTagPopover`) — were each a one-off patch for one pair; they're gone.

**Rules for new overlays:**
1. Use `useEscapeClose`. Nothing else handles Escape for an overlay.
2. **Inline, input-level Escape handlers** (cancel an in-place edit, dismiss a suggestions list) stay as ordinary `onKeyDown`, but must call `e.stopPropagation()` — and only when they actually have something to cancel — so the keypress doesn't also reach the stack and close the pane around the input. An input that is *always* mounted (e.g. `AddTaskModal`'s tag field) must consume Escape only while its list/edit is open, or the modal can never be closed from it.
3. Open order = close order automatically; don't try to control it with z-index or flags.
4. The one deliberate exception is a capture-phase key listener that owns *all* keys for a moment (`SettingsPane`'s hotkey-rebind capture): it consumes Escape itself (cancels the capture) before the stack sees it.
5. `FloatingToolbar` (Notes) registers while visible and runs its own priority ladder (create menu → tag search → link input → colour picker → collapse selection) inside that one entry.

Not covered: Android's hardware back button (`closeTopmostMobileOverlay()` in `uiStore.ts`) still uses a fixed priority list of store flags rather than this stack — same class of inconsistency, not yet unified; see BACKLOG.md.

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

`requestSubmit()` (not calling `handleSubmit` directly) is the important detail — it goes through the DOM form submission machinery, so it always invokes whatever `onSubmit` is bound in the **current** render, respects `disabled`/native validation the same way clicking the visible submit button would, and can never fire a stale closure over old form state. For a component with **no `<form>`** (a plain "Save" button as the primary action — the Edit panes, `EditNoteMetaModal`, `EditActivityTypeModal`, `BulkUploadWatchlistModal`, …) use **`useCtrlEnterSubmit(() => handleSave(), active)`** (`src/hooks/useCtrlEnterSubmit.ts`): it keeps the callback in a ref refreshed every render, so an inline closure can never call stale state. Call it above the early `return null`, pass `active` = the same condition the early return uses, and declare the handler as a **function declaration** (`function handleSave() {}`), not a `const` arrow — a `const` defined below the hook call trips `react-hooks/immutability`, and a hoisted declaration doesn't. (The hook is also fine for form modals: `useCtrlEnterSubmit(() => formRef.current?.requestSubmit())`. The ~20 older modals keep the inline effect above; migrating them is in BACKLOG.md's Pattern retrofit backlog.)

**Item panes** (Task, Calendar event, Calendar reminder) get it from `useItemActions`: those panes save each field on change/blur rather than through a Save button, so Ctrl+Enter blurs the focused field (committing a half-typed title, note, time or link) and closes the pane. It does nothing while the archive/delete dialog is open — the dialog owns it then.

**Deliberately not wired**: `NoteTagPresetModal` only (a list of independent "Install" actions — no primary action). Every other modal, pane and popover with a primary action binds it, including `CalendarImportReviewModal` (Import) and the `ConfirmDialog` (confirm). When two layers both bind Ctrl+Enter (a confirmation opened over a modal), the confirmation's listener runs in the capture phase and calls `stopImmediatePropagation`, so only the top layer answers.

### Confirmations and alerts — never `window.confirm()` / `alert()` / `prompt()`

**A native browser popup is a pattern violation, always.** They are unthemed, ignore the Escape and Ctrl+Enter rules, and look different in the Tauri and Android webviews. Use `src/components/ConfirmDialog/dialogs.ts`:

- `await confirmDelete(noun, itemName, detail?)` — "delete permanently". Red button, Cancel focused, "This cannot be undone." — the standard from "Archive and delete look and behave the same everywhere". `noun` is lower-case (`'tracker'`; use `LABELS.collection.toLowerCase()` for Endeavours); `detail` says what else goes with it.
- `await confirmDialog({ title, message?, itemName?, confirmLabel?, destructive?, irreversible? })` — any other yes/no (disconnect an account, change the timezone, remove a field that holds data).
- `await alertDialog(message)` — an error the user needs to see.

All three return promises, so the handler becomes `async`. Where a listener owns the keyboard while it waits (`SettingsPane`'s hotkey capture), stop listening *before* opening the dialog. If an item has a real archive concept, prefer the `ItemActions` pane pattern instead (it offers "Archive instead").

**A prompt raised by what the user is typing** (e.g. the note editor's "remove the link too?") passes `focusDelayMs` (and optionally `isStale`): the dialog shows at once but takes no focus and ignores Ctrl+Enter for that long, so a stray Enter can't answer it; if `isStale()` is true when the delay ends it closes itself as cancel.

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
| `A` | — | Toggle account pane (`action-account`, customizable) |
| `Esc` | — | Close panel / modal |
| `E` | `Ctrl+E` | Expand the Endeavour filter (header) — Tasks/Calendar/Records/Notes only |
| `0`-`9` | — | While the Endeavour filter is expanded: select an Endeavour by its position (0 = All) |
| `P` | `Ctrl+P` | Expand the Purpose filter (header) — Tasks section only |
| `M` | `Ctrl+M` | Open/close the Manage view (Endeavours / Purposes / Tags) |
| `Alt+Left` | `Backspace` | Go back to the previous app section (up to 6 deep) — `uiStore.sectionHistory`/`navigateBack()` |
| `Alt+Right` | — | Go forward to the next app section, after going back — `uiStore.sectionForwardHistory`/`navigateForward()` |
| `Ctrl+G` | — | Open/close Quick Access — search or browse recent/frequent items across Notes, Notebooks, Tasks, Lists, Endeavours, Trackers, Routines |
| `Ctrl+D` | — | Dictate into the focused text field; press again (or plain `Enter`) to finish, `Esc` cancels (`action-dictate`, customizable; handled before the `isTyping` guard in `App.tsx`) |
| `Ctrl+Shift+A` | — | Archive the open task / calendar event / reminder — or Restore it if already archived (item panes only, via `useItemActions`) |
| `Delete` | `Ctrl+Shift+D` | Delete the open task / event / reminder — always opens the permanent-delete confirmation (item panes only, via `useItemActions`). Plain `Delete` is ignored while typing in a field, where it deletes a character |
| `Ctrl+Enter` | — | Confirm the archive dialog (Esc cancels); focus starts in the optional reason box |
| `O` | — | Toggle the Calendar side pane — Go to date / Layers / Schedules / Imported calendars (Calendar section only, local to `CalendarView.tsx`) |
| `←`/`→` | `PgUp`/`PgDn` | Previous/next period — month, week, or day, matching the current view (Calendar section only, local to `CalendarView.tsx`) |
| `Tab` | `Shift+Tab` | Cycle Month → Week → Day view; Shift+Tab cycles in reverse (Calendar section only, local to `CalendarView.tsx`; suppressed while any calendar modal/pane is open so normal focus-tabbing still works there) |
| `→` | — | Expand selected notebook (Notes section only) |
| `←` | — | Collapse selected notebook (Notes section only) |
| `PgUp`/`PgDn` | — | Navigate the tree/list column, same as ↑/↓ (Notes section only) |
| `Ctrl+Tab` | `Ctrl+PgUp`/`Ctrl+PgDn` | Cycle between the open note's tabs, `Ctrl+Shift+Tab`/`Ctrl+PgUp` reverses (Notes editor focused, local to `NoteEditor.tsx`) |
| `Ctrl+T` | — | New tab, prompting for a name (Notes editor focused, local to `NoteEditor.tsx`) |
| `` Ctrl+` `` | — | Move keyboard focus between the tree/list nav columns and the editor (Notes section only; previously `Ctrl+Tab`, moved once `Ctrl+Tab` became the tab-cycle key above — see "Notes/Lists keyboard nav" below) |
| `Ctrl+L` | — | Turn the selection into a link (opens a URL popover); with no selection, opens a "New link" pane (text + URL) instead (Notes editor) |
| `Ctrl+H` | — | Then press `1`–`5` to turn the current paragraph into that heading level, or `0` for plain text (Notes editor, local to `NoteEditor.tsx`) |
| `Ctrl+Q` | — | On a Notes selection: open the "Create ▸" menu (Task/Calendar item/List item/Tracker entry — Task is wired, the rest are stubs); 1-4 picks, Esc cancels (Notes editor) |
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
- Dynamic values (e.g. `style={{ background: color }}`, or measured `top`/`left`) are the only acceptable inline styles — a constant style (`marginRight`, `display: flex`, `position: relative`) belongs in the module CSS. A hidden file input uses the `hidden` attribute.
- **No native popups** (`window.confirm/alert/prompt`) — see "Confirmations and alerts".
- **User-facing terms come from `config/labels.ts`** — any string that names Endeavour/Collection, Purpose, Tracker, Routine, List, Activity, … uses `LABELS`, so renaming a concept stays a one-file change. Hotkey descriptions in `hotkeys.ts` too.

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
- **Archive and delete look and behave the same everywhere.** Any pane for a user-owned item (task, calendar event/reminder today; notes, list items, portfolio items… later) gets its footer from `ItemActionFooter`, its dialogs from `ItemActionDialog`, its dialog/hotkey/Escape logic from `useItemActions`, and its archived banner from `ArchivedBanner` (all in `src/components/ItemActions/`) — never a bespoke footer. Delete always asks for confirmation and says it can't be undone; archive is reversible, takes an optional reason (`archivedAt` + `archiveReason` on the entity), and hides the item from views while keeping it findable and restorable. Icons: trash for delete, lidded box for archive, the same box with an up-arrow for restore — always next to a text label. Copy lives in `LABELS.itemActions`.
- **Every modal and slide-in pane binds Ctrl+Enter to its primary action** (`useCtrlEnterSubmit`, or `requestSubmit()` for a form) — except a modal with no single primary action. See "Ctrl+Enter — universal submit rule".
- **Every modal and slide-in pane closes on Escape — and Escape closes only the newest overlay.** Use `useEscapeClose` (see "Escape key — universal close rule"); never a bespoke document listener. An audit (see Implemented features) found five that silently didn't close at all, and a later one found ~35 independent listeners that closed the wrong layer when overlays stacked. When adding a new modal or pane, call the hook rather than copying an older component's `useEffect`.

---

## Agent command layer — the boundary rule

An AI agent reads and changes the app's data **only** through commands in `src/agent/commands/`, and a command touches data **only** through `src/agent/access.ts` (`read` / `write`) — never a store or service directly (an ESLint rule fails the build; `boundary.test.ts` proves it fires). Consequences that constrain new code:

- **No delete, ever.** `access.write` has no delete; agents archive. Don't add one. Undoing an agent's own creations is `revertBatch`, a user action.
- **Encrypted notes/lists are invisible to agents** — even while the vault is unlocked, existence included. `access.read` is where they are dropped; when a store with encrypted content gets commands, filter there and extend the planted-secrets test.
- **Read commands are side-effect free** (no `touchNote`, no recording of visits); the runner undoes and rejects a read that changes tracked data. Agent reads go in the audit log instead.
- **Anything that changes tracked data is undoable as a batch.** A newly tracked store goes in `TRACKED` in `batch.ts`.
- **When you add or change an operation on an entity an agent can reach**, keep the rule in ONE place (a store action or a service like `taskCalendarLinks.ts`, or a util like `calendarItemInput.ts`) that both the UI and `access.ts` call — don't re-implement it in a component.

How it works, the command list, and how to add one: `docs/ai/02-command-layer.md`. Remaining phases and the reasoning: `docs/ai/01-capability-inventory.md`.

---

## Pattern governance — one way of doing each thing, across the whole suite

This project grew in stages, and several patterns were agreed only after a lot of code existed — which is how the audit on 2026-09-20 found ~28 native popups, 13 hard-coded terms and 5 modals without Ctrl+Enter. The rule that prevents a repeat:

1. **Patterns are suite-wide, not per-app.** Tasks, Calendar, Records, Lists, Notes, Portfolio and Fitness all use the same pattern for the same job. Before building something, look for the existing pattern (this file's "Component patterns" and "Things that must be consistent"); don't invent a local variant, and don't copy an older component that predates the pattern.
2. **When a new pattern is agreed** (or an existing one changes), in the same piece of work: (a) **record it here** — the rule, *why* it exists, and how to apply it; (b) **apply it to all new code from then on**; and (c) **audit for existing non-conforming code** with a grep/lint check and **log the result in BACKLOG.md under "Pattern retrofit backlog"** — the pattern's name, the exact check to re-run, and the list of known non-conforming sites (or "fully applied on <date>").
3. **A retrofit entry stays in the backlog until its check finds zero sites.** Fixing some sites is progress, not completion; update the list.
4. **The deliberate exceptions are written down too** (e.g. `NoteTagPresetModal` has no Ctrl+Enter) — an undocumented exception is indistinguishable from a bug at the next audit.
5. Re-run the checks in "Pattern retrofit backlog" when you touch an area, and before calling an audit clean.

---

## Known issues and deferred hardening

Not bugs in normal use; recorded so they aren't rediscovered from scratch.

- **`api/ticker-*` are unauthenticated proxies to Yahoo Finance's unofficial endpoint.** Anyone who finds the URL can use the deployment's quota, and the unofficial API carries terms-of-service risk. They are unauthenticated **on purpose**: Portfolio must work for guests with no account, so simply requiring the Supabase Bearer token would break guest mode. A real fix needs per-IP rate limiting (Vercel KV/Upstash or Vercel's firewall rules) and/or moving to an official market-data API with a server-side key.
- **Soft-delete tombstones are never purged** (`deleted_at` rows stay forever). Fine at current scale; add a scheduled purge of rows older than ~90 days once any table grows.
- **`calendar_events.notify_before_value` is `integer`** but `CalendarEventPane` feeds it a free-typed number, so typing `1.5` would fail sync (see migration 023's note). Clamp/round the input, or widen the column.
- **The other stores still live in localStorage (about 5 MB for the whole site).** Notes moved to IndexedDB (see "Zustand migration rule"), so pasted images no longer count against it, but every save still re-serialises a whole store (opening a note writes `lastViewedAt`, which rewrites *all* notes — now a database write rather than a localStorage one) and images are still inline base64 in note content, which also inflates every Supabase sync of a note. Pasted images are scaled to 1600 px / WebP on the way in (`utils/imageCompress.ts`) and Settings → Storage can shrink existing ones (`services/shrinkNoteImages.ts`). Remaining ideas are in BACKLOG.md "Local storage headroom".
- **Modal z-index tiers are ad hoc** (28 / 30 / 100 / 102 / 110 / 1000 for modals; 400 Quick Access; 500 voice indicator; 1100 confirm dialog; 10000 link preview). It only matters when one overlay opens over another: a modal opened *from inside a pane* needs a tier above the pane's 100/101 (use 102), and anything that can be summoned from anywhere sits above the modals. `AddListModal`, `AddListItemModal` and `EditNoteTagModal` are at 100, the same tier as the panes, but nothing opens them from inside a pane today. Centralising these as `--z-*` tokens is optional tidying (docs/agent-tasks/02).

---

## Notes app — orientation

Notes is the knowledge-base app: a rich-text editor (Tiptap) over hierarchical **notebooks** with cross-cutting **annotation tags**, linked to the rest of the suite through the cross-app linking mechanism. What is built, and how, is in `docs/features/implemented-features.md` (search "Notes"); what isn't is in BACKLOG.md. Data types are in `src/types/notes.ts`, state in `noteStore`, sync in `syncService.ts`.

**Terminology when working on Notes:**
- **Notebook (area)** = a hierarchy node — `NoteTag` with `kind='area'`. Root notebooks are the user's top-level containers (e.g. "University"); children nest below (Subject → Topic).
- **Annotation tag** = a cross-cutting label — `NoteTag` with `kind='tag'` (e.g. "Important", "Definition"); cuts across notebooks, marks passages of text.
- **Note** = the content unit (rich-text JSON, tabs, optional abstract and tag attributes).
- **Structured tag entry** = a built-in tag that also carries its own separate record (Acronym today).
- **Backlink** = the reverse half of a cross-app link (`crossAppRefs` on the linked entity).

Reading an encrypted note: **always through `noteView()` / `useNoteView()`** — see "Client-side encryption for Notes" in the implemented-features doc.

---

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
