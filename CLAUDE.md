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

**Overview is the suite-level read layer** (`src/overview/`, section `'overview'`): each app contributes a *source* to `OVERVIEW_SOURCES` that maps its items onto one common row (What / When / Status / Where / Endeavour), and an Overview is a saved question over those rows (or an Endeavour's automatic one). **A new app, or a new kind of item that should appear in "everything for X", adds a source there** — one entry, its key in `OverviewSourceKey`, its label in `LABELS.overview.sources`, and (if it can be opened) a case in `overview/open.ts`. Sources are pure functions over a snapshot; only `useOverviewSnapshot` subscribes to stores and only `open.ts` touches uiStore. Detail: `docs/features/overview.md`.

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
| `docs/features/fitness.md`, `schedules.md`, `external-calendar-sync.md`, `overview.md` | The big self-contained features |
| `docs/features/not-yet-implemented.md` | Short summary list (full specs are in BACKLOG.md) |
| `docs/android/` | Android/Capacitor architecture, phased plan, and `implementation-status.md`; `05-notifications.md` (notifications/reminders design), `10-gap-analysis.md` (desktop→Android gaps, decisions, workstreams) and `11-design-and-coding-patterns.md` (Android design and coding rules — read before any Android work) |
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
- [ ] "Quality baseline" met (accessibility, security, performance, no unapproved dependency)
- [ ] Build passes (`npm run build`) and tests pass (`npm test`)
- [ ] **Android parity** (decided 2026-10-04): for a user-facing change, either it works on Android as-is, or it was built for Android in the same change, or an Android follow-up is logged in `docs/android/10-gap-analysis.md` (give the ID). A new hover, drag or hotkey affordance names its touch path (`docs/android/11-design-and-coding-patterns.md` §5–6)
- [ ] **Automated tests added/updated for whatever you changed, if that area has coverage** (see "Testing" below for what's covered) — running them is your regression testing; don't also manually re-verify what they already prove
- [ ] For anything NOT yet covered by the automated suite, verified manually (or via Playwright) instead — and consider whether it was worth turning into a permanent test rather than a one-off check
- [ ] A future Claude reading CLAUDE.md + the docs + BACKLOG.md would understand what exists, where the code lives, how it connects, and what's not done

---

## Tech stack

- **React 19** + **Vite 8** + **TypeScript** (strict)
- **Zustand 5** for state (`persist` middleware, localStorage)
- **CSS Modules** — no Tailwind, no inline styles except dynamic values
- **Supabase** for auth + optional cloud sync
- `nanoid` for ID generation; branded ID types for all entities
- Path alias `@/` → `src/`
- **Desktop dev tools** don't open on launch. To have a dev build (`npm run tauri dev`) open them, set `OPEN_DEVTOOLS_ON_START` to `true` in `src-tauri/src/lib.rs`, or set the environment variable `ORGANISAITOR_DEVTOOLS=1` for one run (PowerShell: `$env:ORGANISAITOR_DEVTOOLS=1; npm run tauri dev`). Release builds never include them. Ctrl+Shift+I still opens them by hand in a dev build.
- **Zod 4** for the agent command layer's input schemas (also emitted as the JSON Schema a model API needs) and **Vitest** for tests (`npm test`; test files sit beside the code as `*.test.ts`)

---

## Testing

**The automated suite is the regression test — prefer it over manually re-verifying by hand.** This is the whole point of having it: before this suite existed, every change was checked with a throwaway Node/Playwright script that was then deleted, so nothing stopped the same bug (timezone offset overshoot, an Escape-stack ordering bug, an encryption re-ordering race, a migration that silently dropped fields) from coming back the next time someone touched nearby code. The rule going forward:

1. **If the area you touched has test coverage** (check "What's covered" below, or just look for a `*.test.ts(x)` beside the file you're editing), **update that test in the same change and run it** (`npx vitest run <file>`, or `npm run check` for the full gate). That run *is* your regression testing for that area — don't also manually click through the app or write a one-off verification script to re-confirm the same thing; it burns time and tokens checking something the suite already guarantees, and produces nothing durable.
2. **If the area has no coverage yet**, manual or Playwright verification is still genuinely necessary — but if the behavior is worth checking once, it's usually worth a permanent test (add it under the matching phase in `docs/agent-tasks/02-testing-and-engineering-hygiene.md`, in the same file-placement style as the existing tests) rather than a throwaway script that gets deleted and tells the next agent nothing.
3. **Never mark a task "tested" on the strength of a manual check alone** if the thing you touched already has a test file — update the test instead of trusting your eyes, since the next agent won't repeat your manual check, only your test.

Full plan and phase-by-phase status: `docs/agent-tasks/02-testing-and-engineering-hygiene.md` (Part A — what's built vs. remaining; Part B — engineering hygiene items). That file's Status block is the authoritative "what's covered" — the summary below is a pointer, not a substitute for it.

**Running it:** `npm test` (`vitest run`) runs the whole suite; `npm run test:watch` for watch mode; `npm run check` runs `tsc -b && eslint . && vitest run && vite build` (currently fails on eslint's pre-existing baseline — see Part B7 — CI gates on that baseline instead of zero, `.github/workflows/ci.yml`, which runs the same suite on every push/PR as a backstop).

**What's covered today** (653 tests, 47 files, as of 2026-09-24 — re-check the brief's Status block, this will grow): pure logic (`utils/`: timezone, dates, recurrence, ICS parsing, natural-language date/time parsing, links, hotkeys, the time grid, notebook/quick-access resolution, config template validity); store *behaviour* (task archive/restore cascades, calendar occurrence editing, schedule commitment mode, uiStore back/forward history, hotkey conflicts) and a slice of store *migrations* (`settingsStore`/`scheduleStore`/`taskStore` only — see "Store migrations are deliberately NOT all tested" below); `crossAppLinkCleanup`; the full Supabase mapper round-trip (all 17 entity types) and the sync pipeline itself (`mergeRecords`, per-table failure isolation, the `enqueue()` mutex, `customListTypes`) against a fake Supabase client; the whole encryption stack (vault lifecycle, the note/list lock-and-cache mechanism, the re-encrypt queue's ordering guarantee) against real Web Crypto; edge functions (`api/*.ts` — Bearer/401s, Strava's token-refresh window, Google Calendar's cancelled-instance skipping, speech-recognize's payload-size-not-client-claim billing); "Pattern governance" as executable checks (`src/test/patterns.test.ts`); and a representative slice of hooks/components (`useEscapeClose`, `useCtrlEnterSubmit`, `ConfirmDialog`, `TimeInput`, one full modal-prefill example in `AddCollectionModal`, and `NoteEditor`'s tab restore on note switch — the template for mounting the real Tiptap editor in jsdom).

**What's NOT covered yet — manual/Playwright verification is still the right call here:** almost all UI rendering and interaction beyond the components just named (no Playwright/e2e suite exists at all yet — Phase 4); most individual Add/Edit modals' prefill behavior (only `AddCollectionModal` has one, as the template to copy); `CollectionPicker`/`CrossAppRefPicker`/`ItemActionDialog`; the speech `utteranceDetector`; the offline pending-queue retry internals (`loadPending`/`pushIds`/`flushPending`/`queueLocalOnlyAndNewer` — exercised only indirectly via the sync-pipeline tests); six of the nine stores' migration fixtures (see next point).

**Store migrations are deliberately NOT all tested — this was a scope decision, not an oversight.** The app hasn't shipped, so there is no installed base of old-version `localStorage` a migration test would be protecting; the three that exist (`settingsStore`, `scheduleStore`, `taskStore`) are kept because they were free and one caught a real bug, not because migrations are considered high-priority to cover. Don't read the other six stores' absence as a gap to fill reflexively — it was a conscious call, confirmed with the user 2026-09-24 and recorded in the brief.

**Conventions when adding a test** (copy an existing file in the same category rather than inventing a new shape): reset a store with `useXStore.setState(useXStore.getInitialState(), true)` in `beforeEach`; use `vi.useFakeTimers()`/`vi.setSystemTime()` for anything date- or `updatedAt`-ordering-sensitive; a store-migration test seeds `localStorage` with an old-version fixture, `vi.resetModules()`, then dynamically `import()`s the store fresh so `persist` rehydrates through `migrate` for real (`src/store/migrations.test.ts`); sync/edge-function tests fake the relevant module (`@/services/supabase`, `./_lib/supabaseEdge`) with `vi.mock` + `vi.hoisted` rather than hitting a real network — see `src/services/sync/syncService.test.ts` and `api/strava-sync.test.ts` for the pattern; component/hook tests need `// @vitest-environment jsdom` at the top of the file, `@testing-library/jest-dom/vitest` imported *in that file* (not globally — most tests run in plain `node` and don't need it), `cleanup()` in `afterEach` (required once anything portals to `document.body`, e.g. `ConfirmDialog`), and `act()` around a store write that must be reflected before the next assertion. `src/test/setup.ts` provides a Map-backed `localStorage` and awaits `preloadIdbStorage()` automatically for every test via `vitest.config.ts`'s `setupFiles`.

**Pattern tests** (`src/test/patterns.test.ts`) are BACKLOG.md's "Pattern retrofit backlog" turned into executable checks (native popups, Escape handling, Ctrl+Enter, Endeavour terminology, hotkey ids, `SYNC_TABLES` vs. the sync fetch list, migration grants, store-import boundaries, inline styles, persisted-store registration, the row hover-action menu, `/api/*` only through `apiFetch`). **A new pattern ships with a pattern test** — add a check here in the same change that records the pattern in "Pattern governance" below.

---

## Sections & navigation

Nav order matches hotkey order (top to bottom in sidebar):

| Section | Key | Nav hotkey | App |
|---------|-----|------------|-----|
| Overview | `'overview'` | `0` (no `Ctrl+0` — that's the browser's zoom reset) | Suite |
| Tasks | `'tasks'` | `1` / `Ctrl+1` | Organizer |
| Calendar | `'calendar'` | `2` / `Ctrl+2` | Organizer |
| Records | `'records'` | `3` / `Ctrl+3` | Organizer |
| Lists | `'lists'` | `4` / `Ctrl+4` | Organizer |
| Notes | `'notes'` | `5` / `Ctrl+5` | Notes app |
| Portfolio | `'portfolio'` | `6` / `Ctrl+6` | Portfolio app |
| Fitness | `'fitness'` | `7` / `Ctrl+7` | Fitness app |

Overview sits at the very top of the NavSidebar, above a divider, because it gathers from every app (it is deliberately *not* in `CORE_NAV_ITEMS`, which MobileNav's tab bar also reads; on Android it's in the More sheet). Portfolio and Fitness appear below the lower `<hr>` divider (the "extras" group); all others are in `CORE_NAV_ITEMS`.

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

Key fields beyond the obvious: `kind: TaskKind` (`'action' | 'waiting' | 'milestone'`), `timeIntensity: TimeIntensity | null` (`'low' | 'medium' | 'high'`), `parentId: TaskId | null`, `subtaskIds: TaskId[]`, `links: string[]`, `completedAt: string | null`, `scheduledAt: string | null` (YYYY-MM-DD day user plans to work on it — distinct from deadline), `scheduledTime: string | null` (HH:MM 24-hour), `calendarEventId: CalendarEventId | null` (auto-created CalendarEvent when scheduledAt is set; kept in sync on edits; deleted when task is deleted or scheduledAt cleared), `archived: boolean` + `archivedAt: string | null` + `archiveReason: string | null` (see "Task archiving" in Implemented features — the reason is its own field, deliberately not appended to `notes`), `itemLinks: ItemLink[]` (links this task owns to other tasks — see "ItemLink" below), `repeat: RepeatConfig | null` (a recurring task: completing it creates the next occurrence — see "Recurring tasks" below).

### ItemLink (task links)

```typescript
type ItemLinkKind = 'dependsOn' | 'followUpOf' | 'related' | 'repeatOf';
interface ItemLink { kind: ItemLinkKind; targetType: 'task'; targetId: string; reason: string | null; createdAt: string; }
```

A typed link with an optional reason, **stored once, on the owning task** ("owner `<kind>` target"). The other side is derived at render time (`utils/taskLinks.ts` `taskRelations`), the same way the note "Linked from" bar derives backlinks, so the two can never disagree. What each kind means (its labels, icon, whether it `blocks`, whether it's `symmetric`) lives in ONE registry, `config/itemLinkKinds.ts`. A new kind is one entry there, plus its labels in `LABELS.taskLinks.kinds` and the `ItemLinkKind` union. `targetType` exists so other item types (events, notes, list items, and recurring tasks, next) can reuse the shape.
- **Rules live in `utils/taskLinks.ts`** and nowhere else. `isBlocked`/`openBlockers`: waiting on an unresolved task, where resolved = completed **or archived**. `canAddLink`: no self-links, duplicates or loops; the store's `addItemLink` refuses anything else and returns why. `unlockedBy`, `openBlockersDeep`.
- **A link to a missing (deleted) task is ignored, not cleaned up.** Restoring that task from the Recycling Bin brings its links back.
- **`followUpOf` blocks too**: a follow-up created before its origin is done waits for it.
- **`repeatOf`** is set only by recurring tasks (an occurrence names the one it came from); it doesn't block.

### Recurring tasks

A task with `repeat` set is one occurrence of a series. **Completing it creates the next occurrence** (decided with the user 2026-10-07: one open occurrence at a time, not a pre-made list). The rules live in `services/recurringTasks.ts` and nowhere else: `spawnNextOccurrence` is called from `toggleTaskWithLists` (so every UI completion, through `toggleTaskCompletion`) and from `agent/access.ts`'s `toggleTask`. The next date is the first date on the rule after this occurrence's deadline (else its scheduled date, else today) that is not in the past — completing late skips missed dates rather than piling them up; the scheduled date moves by the same amount. It carries title, notes, links, Endeavour, tags, purposes, priority, kind, time intensity and `crossAppRefs` (its notes and lists), copies sub-tasks reset to undone, and gets a `repeatOf` link back. "After N times" counts down on each occurrence. Reopening and completing again reuses the existing next occurrence; the Completed toast's Undo deletes it for good (no Recycling Bin entry). Sub-tasks can't repeat. A repeat with no date sets the deadline to today. The repeat editor is `components/RepeatField`.

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
| `taskStore` | `todo-app-storage` | **v14** | localStorage + Supabase | tasks, collections, tags, purposes |
| `calendarStore` | `todo-calendar` | **v17** | localStorage + Supabase | calendar events, reminders, deadlines (v15: `doneDates` on reminders/deadlines; v16: `seriesId`/`seriesDate` on all three — see "Repeating series" under Component patterns; v17: `remindOccurrence` on all three, `seenDates` on events/deadlines — see "Notifications") |
| `trackerStore` | `todo-tracker` | **v1** | localStorage + Supabase | tracker entries |
| `routineStore` | `todo-routines` | **v1** | localStorage only | daily routine instances (transient) |
| `noteStore` | `notes-storage` | **v13** | **IndexedDB** (not localStorage — see below) + Supabase | notes, note tags, structured tag entries |
| `listStore` | `lists-storage` | **v7** | localStorage + Supabase | lists, list items, list types (custom types only) |
| `portfolioStore` | `todo-portfolio` | **v7** | localStorage + Supabase | watchlist items, portfolio tags, investment purposes (Portfolio app) — `columnConfig` (table display prefs) stays local-only |
| `fitnessStore` | `fitness-storage` | **v3** | localStorage only | activities + activity types (Fitness app) |
| `scheduleStore` | `todo-schedules` | **v1** | localStorage + Supabase | Schedule templates (recurring weekly timetables, Calendar section) |
| `uiStore` | `todo-ui-session` | **v4** | localStorage (partial) + memory | all UI state (modals, panes, active section) — only navigation/session memory is persisted, see below (v4: the Notes tree's `expandedNoteTagIds`) |
| `settingsStore` | `todo-settings` | **v7** | localStorage | user preferences (v7: `noteBackdrop`, what fills the room below a note — see `config/noteBackdrops.ts`; v6: Android notification settings — `notifyReminders`/`notifyEvents`, snooze times, `quietHours`) (includes `autoBackup*` fields — see "Automatic local backup rotation" in Implemented features — and `hideBlockedTasks`, v5) |
| `authStore` | — | — | memory only | Supabase session |
| `recentItemsStore` | `todo-recent-items` | **v1** | localStorage only | Quick Access (Ctrl+G) recent/frequent visit history |
| `notificationStore` | `todo-notifications` | **v2** | localStorage only | pending in-app notifications (v2: per-occurrence `key`, `occurrence`, `taskId`) + the log of already-notified triggers |
| `hotkeyOverridesStore` | `todo-hotkey-overrides` | **v1** | localStorage only | user-rebound keyboard shortcuts (see "Hotkeys rule") |
| `dialogStore` | — | — | memory only | queue behind `confirmDialog()` / `choiceDialog()` / `alertDialog()` (see "Confirmations and alerts") |
| `overviewStore` | `overviews-storage` | **v1** | localStorage + Supabase | saved (custom) Overviews — definitions only; rows are computed live (see "Overview") |
| `toastStore` | — | — | memory only | the one toast currently showing, behind `showToast()` (see "Toasts") |
| `voiceStore` | — | — | memory only | voice-dictation status and level for `VoiceIndicator` |
| `agentLogStore` | `agent-log` | **v1** | localStorage only | audit log of every agent command (reads as ids only); capped at 2000 entries; cleared on sign-out |
| `agentBatchStore` | `agent-batches` | **v1** | localStorage only | before-snapshots so an agent's changes can be undone; capped at 50 batches; cleared on sign-out |
| `trashStore` | `trash-storage` | **v1** | **IndexedDB** (not localStorage — same reasoning as `noteStore`) + Supabase | suite-wide Recycling Bin: a snapshot of every item deleted from any store, kept for restore — see "Recycling Bin" below |

### Zustand migration rule

When adding fields to a persisted store's shape: **bump `version`** and write a **cumulative `migrate` function** that backfills defaults for every prior version. Never write non-cumulative migrations.

Current taskStore v12 migrate backfills: `routineTasks: []`, `repeatConfig: null`, `fieldSchema: []`, `tagIds: []` on collections (v5); `scheduledAt: null`, `scheduledTime: null`, `calendarEventId: null` on tasks (v6); `collectionId: null` on collections (v7); `archivedAt: null` on both collections and purposes (v8); `calendarReminderId: null` on tasks (v9); `crossAppRefs: []` on tasks (v10); `archivedAt` (from `updatedAt` for already-archived tasks, else `null`) + `archiveReason: null` on tasks (v11); `calendarDeadlineId: null` on tasks (v12, "Deadline calendar kind" 2026-09-27); `itemLinks: []` on tasks (v13, "Task links" 2026-10-01); `repeat: null` on tasks (v14, "Recurring tasks" 2026-10-07). Each `if (fromVersion < N)` step **reassigns `state` and falls through** rather than returning — this matters because `migrate` is called once per load with whatever version is on disk, so a store that skipped several app versions in one load (not opened for months) must still receive every intervening step, not just the first applicable one. **Bug found and fixed 2026-09-24:** every step used to `return` immediately after applying its own patch, so a store more than one version behind silently skipped every later step (a v2 store jumping straight to v11 got only the v5 collections patch and the v11 wrapper's own fields, missing v6/v7/v8/v9/v10 entirely) — caught by `src/store/migrations.test.ts`'s "v2 -> v11" fixture; see BACKLOG.md. Follow the fall-through pattern for v12+ — never `return` from inside an individual version step again.

**Unversioned stores:** persisted data with no `version` arrives as v0. The first time such a store's shape changes, give it `version: 1` and a `migrate` that backfills the new fields (`scheduleStore` did exactly this) — a `version` with no `migrate` makes zustand discard the stored state. Every persisted store now has a version.

**Every persisted store uses `storage: persistStorage()`** (`src/utils/persistStorage.ts`) in its `persist` options — never zustand's default localStorage. Browsers give the whole site roughly 5 MB of localStorage, shared by every store, and zustand's persist calls `setItem` inside the store's own `set`, so a full quota throws a `QuotaExceededError` out of whatever action was running (opening a note, in the report that found this) and takes the section down through the error boundary. `persistStorage()` catches that one error: the change stays in memory (and still syncs, if signed in), the user gets an alert naming the biggest store and pointing at Settings → Storage, repeated every 10 minutes while writes keep failing, and the app carries on. Any other storage error still throws. Audit: `grep -L persistStorage` over the files that contain `persist(` must list nothing.

**The one exception is `noteStore`, which uses `storage: persistStorageIdb()` (`src/utils/idbStorage.ts`) and lives in IndexedDB** — notes hold pasted images inline and were the store that hit the 5 MB ceiling. IndexedDB has hundreds of MB, and works the same in the browser, Tauri's WebView2 and Android's WebView. How it keeps zustand's persist synchronous: `main.tsx` awaits `preloadIdbStorage()` (opens database `organisaitor`, object store `kv`, loads the IndexedDB-backed keys into an in-memory map, and on first run moves any old localStorage copy across — put first, remove from localStorage only after) and only THEN dynamically imports `App`, so **no store module may be imported before that finishes** (a store created early would read an empty cache and could persist an empty state over the real data; `idbBacked.getItem/setItem` throw if used before it is ready, on purpose). After that `getItem` reads the map and every `setItem` updates it and is written to IndexedDB in the background (write-behind, one write at a time, latest value wins). If IndexedDB can't be opened the key stays in the guarded localStorage. A failed background write goes through the same alert as a full localStorage (`reportPersistFailure`).

**Because of that, backup and restore must not read/write localStorage directly for a persisted key** — use `readPersistedValue(key)` / `writePersistedValue(key, value)` (`idbStorage.ts`; `backupExport.ts`, `AccountPane` and `IntegrationsPane` do). `writePersistedValue` also freezes further IndexedDB writes until the reload that restore always does, so the running app can't overwrite the restored data. To move another store to IndexedDB: use `persistStorageIdb()` and add its key to `IDB_STORAGE_KEYS`.

**Also:** when adding a brand-new persisted store (not just a field on an existing one), add its `persist` `name` to `PERSISTED_STORAGE_KEYS` in `src/config/backup.ts` — that's the one list both full-app Export/Restore implementations (`AccountPane`, `IntegrationsPane`) read from. This list drifted out of sync with reality once already (Records/Routines/Notes/Lists/Portfolio/Fitness were all silently missing from backups for a while), so treat it the same as a migration: part of shipping the store, not a follow-up. **Not every localStorage key belongs in this list** — per-device bookkeeping that isn't user data (`todo-sync-pending`, and `todo-autobackup-score` used by `services/autoBackup.ts`'s change-score tracker) is deliberately excluded, the same way neither is meant to survive a restore or travel in a backup.

### uiStore — key state and actions

uiStore is memory-only **except** the fields marked "persisted" below — those survive
closing the app (`todo-ui-session`, localStorage; see PERSISTED_STORAGE_KEYS). Everything
else (every modal/pane/dropdown open-state, every "currently editing X" pointer) resets on
reload by design, so the app never reopens pointing at a stale modal.

```typescript
// Active section (pending rename: activeView→activeSection, AppView→AppSection, setActiveView→setActiveSection)
activeView: AppView               // 'tasks' | 'calendar' | 'records'  — persisted
setActiveView(view, opts?: { mode?: 'push' | 'back' | 'forward' })  // mode defaults to 'push'

// The ONE back/forward history (store/navHistory.ts) — Alt+Left/Backspace, Alt+Right, the
// Android back button and the Alt+N history browser all walk it. A stop is a *place* (NavPlace):
// a section plus where you were in it. What counts as a stop (the user, 2026-10-07): Notes, every
// note (with its tab and notebook); Tasks / Lists, one per visit, back to the open task / list;
// Calendar, one per visit, back to the period and view; Records, its tracker/routine; Overview,
// its selection. Browser semantics: a normal navigation pushes where you're leaving and clears
// the forward stack. Both persisted; capped at MAX_NAV_HISTORY (40). Replaced sectionHistory and
// notesHistory (uiStore v3).
navHistory: NavPlace[], navForward: NavPlace[]   // most-recent-first
setActiveView(view, { mode: 'silent' })          // history's own moves; everything else pushes
openNote(id, tabId?, { mode: 'silent' })         // in Notes, the note being left is a stop
navigateBack(): boolean, navigateForward()        // navigateBack reports whether it moved (Android minimises when it didn't)
travelHistory(steps): boolean                     // several stops at once (the history browser); stops in between stay
currentPlace(): NavPlace
historyBrowserOpen, openHistoryBrowser(), closeHistoryBrowser()
// A new section with its own "where was I" (a selected item, a period) adds it to NavPlace,
// capturePlace and goToPlace (bottom of uiStore.ts), and a case in describePlace
// (components/HistoryBrowser/) — or it is one stop that just reopens the section.

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
tasksLastEditingTaskId: string | null   // last-open pane, restored on returning to Tasks (no TTL — see uiStore's own comment for why not)

// TaskList expand/collapse — lifted out of TaskList's own local state so it survives
// navigating away (TaskList unmounts on every section switch) and back. Memory-only (not
// persisted) — resets on reload, same scope as sortField/sortDir.
taskExpandedIds: string[]
toggleTaskExpanded(taskId), clearTaskExpanded()  // setTaskViewMode() also clears it itself

// Settings / account / integrations (slide-in panes)
settingsOpen, openSettings(), closeSettings()
accountOpen, openAccount(), closeAccount()
integrationsOpen, openIntegrations(), closeIntegrations()

// Edit panes (slide-in from right)
editTrackerOpen, editingTrackerId, openEditTracker(id), closeEditTracker()
editingEntryId, openEditEntry(id), closeEditEntry()
editingCalendarEventId, openCalendarEventPane(id), closeCalendarEventPane()
editingCalendarReminderId, openCalendarReminderPane(id), closeCalendarReminderPane()

// Calendar last-edited memory — persisted; restores whichever event/reminder pane was open
// when Calendar was last left, on returning to Calendar (any path — section click, hotkey, or
// Alt+Left/Right), but only within CALENDAR_LAST_EDITING_TTL_MS (30 min, checked at read time
// in setActiveView — no background timer). Not cleared when the pane is closed while still in
// Calendar — "last edited," not "currently open."
calendarLastEditing: { type: 'event' | 'reminder'; id: string; at: string } | null

// Which date/period Calendar is showing — lifted out of CalendarView's own local state
// (2026-09-25) so it survives leaving/re-entering the section, same reasoning as
// calendarLastEditing above but unconditional (no TTL — this is just "where were you
// looking," not reopening an edit UI). Month view reads year/month; week/day read
// calendarSelectedDate. calendarViewMode (month/week/day) was already lifted earlier.
calendarYear: number, calendarMonth: number /* 0-indexed */, calendarSelectedDate: string /* YYYY-MM-DD */
setCalendarYear(v), setCalendarMonth(v)   // v: number | ((prev: number) => number), same overload as React's setState
setCalendarSelectedDate(v: string)

// Notes: which notebooks are expanded in the Chronicle tree (persisted since v4, so the tree
// reopens as it was left; ids of deleted notebooks are harmless and ignored)
expandedNoteTagIds: NoteTagId[], toggleNoteTagExpanded(id)

// Notes: which column has keyboard focus (ChronicleView's arrow-key navigation), back to 'tree'
// on entering Notes; decides what N/Space creates. Memory-only.
notesFocusedColumn: 'tree' | 'list' | 'editor', setNotesFocusedColumn(col)

// Text carried from one creation pane to the next when CreateKindSwitcher switches kind.
// Cleared by closeModal.
createDraft: string | null, setCreateDraft(draft)

// Notes: a passage to select once a note is open (services/notePassage.ts sets it with openNote;
// NoteEditor consumes it), and the Glossary / Review views in place of the tree (memory-only).
requestedNotePassage: { noteId, mark, attr, value } | null, setRequestedNotePassage(p)
notesGlossaryOpen, openNotesGlossary(), closeNotesGlossary()
notesReviewOpen, openNotesReview(), closeNotesReview()

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
- **Adding a synced table or store property:** add it to `SYNC_TABLES` (the load fetches exactly this list and passes the rows on keyed by table name — never add a separate positional fetch list; one drifted by a position on 2026-09-27 and put every later table's rows in the wrong store), `TABLE_DEFS` (how to read its local records and build a row), `hydrateStores` (read `remote.<table>` and pass the table name to `mergeRecords`), `upsertAllToSupabase`, and `setupSubscriptions` (`watch()`); plus the mapper and migration below. Missing `TABLE_DEFS`/`watch` means its changes silently never sync.
- Never call `authStore.signOut()`/wipe the stores while `watch()` subscriptions are live — the wipe would be read as "user deleted everything" (`stopSync()` first; see `authStore.signOut`).
- **Restore marker** (`sync_markers`, migration `042`, 2026-10-06). A backup restore uploads records with their *old* `updatedAt`, so another device holding newer copies would push them back. `restoreBackupData` therefore calls `markRestored()` after its `forceUpload`, writing one account-level `restored_at`. A device that loads after a restore it hasn't seen (`todo-sync-restore-seen`, per device, not in `PERSISTED_STORAGE_KEYS`, cleared on sign-out) treats the cloud as the truth for that load. Local records and queued changes older than the restore give way; later edits still win. A device that has never loaded the account just records the marker. Logic: "Restore marker" in `syncService.ts` (`restoreCutoff`, read by `mergeRecords`); tests in `syncService.test.ts`. If the table can't be read, it's skipped.

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
| `001` – `027` | **Applied** | Everything through `027` has been run against the live project, confirmed by the user. `001`–`022` as a batch on 2026-09-19 ("ran all SQLs from 001 to 022"), `023` separately ("Migration 23 SQL has been completed"), and `024`–`027` on 2026-09-20 ("24, 25, 26, and 27 have all been run"; then "All Supabase SQL has been run up to 027 inclusive"). Reported by the user, not independently verified. `022` (grants) was written *after* 019–021 and run after them. Earlier "written, not yet run" notes on 012–021 predate this and were stale — removed. |
| `029` | **Applied** | `029_calendar_archive.sql` (archive timestamp + reason on calendar events and reminders) — run against the live project, confirmed by the user 2026-09-20 ("I've run SQL 029 in Supabase"). Reported by the user, not independently verified. |
| `030` | **Applied** | `030_speech_usage.sql` (voice dictation usage table + `record_speech_usage()` function) — run against the live project, confirmed by the user 2026-09-20 ("030 has been run in Supabase"). Reported by the user, not independently verified. |
| `031` | **Applied** | `031_drop_cross_app_links.sql` (drops the never-used `cross_app_links` table) — run against the live project, confirmed by the user 2026-09-20 ("031 has been run"). Reported by the user, not independently verified. |
| `028` | **Applied** | `028_task_archive_reason.sql` (task archive timestamp + reason) — run against the live project, confirmed by the user 2026-09-20 ("SQL task zero two eight has been run in Supabase"). Reported by the user, not independently verified. |
| `032` | **Applied** | `032_oauth_state.sql` (`oauth_states` nonce table + `mint_oauth_state` / `save_strava_connection` / `save_calendar_connection` functions — the OAuth `state` is now a single-use nonce instead of the user's access token) — run against the live project, confirmed by the user 2026-09-20 ("032 has been run in supabase"). Reported by the user, not independently verified. |
| `033` | **Applied** | `033_calendar_links.sql` (`links text[]` on `calendar_events` and `calendar_reminders`). every event/reminder upsert now sends `links`, so those two tables reject writes until it is applied (sync isolates the failure per table; nothing else breaks). |
| `034` | **Applied** | `034_trash_items.sql` (new `trash_items` table — the suite-wide Recycling Bin; see "Recycling Bin" above). `trashStore` still works fully locally without it (IndexedDB-backed) — only cross-device sync of trash entries is blocked until this runs, isolated per-table like every other migration. |
| `035` | **Applied** | `035_reminder_tentative.sql` (`status text` on `calendar_reminders`, extending the Events-only "tentative" flag to Reminders too, per the request 2026-09-24). Every reminder upsert now sends `status`, so `calendar_reminders` rejects writes until this runs (sync isolates the failure per table; nothing else breaks). |
| `036` | **Applied** | `036_calendar_event_background.sql` (`background boolean` + `color text` on `calendar_events` — "Background / banner calendar events", 2026-09-27). Every event upsert now sends both columns, so `calendar_events` rejects writes until this runs (sync isolates the failure per table; nothing else breaks). |
| `037` | **Applied** | `037_calendar_deadlines.sql` (new `calendar_deadlines` table + `tasks.calendar_deadline_id` — "Deadline calendar kind", 2026-09-27). `calendar_deadlines` sync (a new entry in `SYNC_TABLES`) fails entirely until this runs; isolated per-table like every other migration. |
| `038` | **Applied** | `038_list_links.sql` (`cross_app_refs jsonb` + `reset_on_task_complete boolean` on `lists` — "Lists: links from tasks, calendar items and notes", 2026-09-28). Every list upsert now sends both columns, so `lists` rejects writes until this runs (sync isolates the failure per table; nothing else breaks). |
| `039` | **Applied** | `039_task_item_links.sql` (`item_links jsonb` on `tasks` — "Task links", 2026-10-01). Every task upsert now sends `item_links`, so `tasks` rejects writes until this runs (sync isolates the failure per table; the change stays queued locally and syncs once it's applied). |
| `040` | **Applied** | `040_overviews.sql` (new `overviews` table + `lists.collection_id` — "Overview", 2026-10-01). Until it runs: saved Overviews don't sync (they still work locally), and every list upsert (which now sends `collection_id`) is rejected, so list changes stay queued locally. Sync isolates both per table; nothing else breaks. |
| `041` | **Applied** | `041_oauth_state_client.sql` (`oauth_states.client` + a two-argument `mint_oauth_state(p_provider, p_client)`, the save functions return `'ok:android'` for an Android flow, new `discard_oauth_state(p_nonce)` — "Android W1: platform services", 2026-10-04). Until it runs, the Android app falls back to the one-argument mint: Strava/Google connect still saves the connection, but the callback lands on the web app inside the in-app browser instead of returning to the app. Web and desktop are unaffected either way. |
| `042` | **Applied** | `042_sync_markers.sql` (new `sync_markers` table: the account's restore marker). Until it runs, restore works as before and other devices can still push older copies back over a restore; nothing else is affected. |
| `044` | **Applied** | `044_series_links.sql` (`series_id` + `series_date` text on `calendar_events`, `calendar_reminders`, `calendar_deadlines`: a date taken out of a repeating series keeps its link back). Every event/reminder/deadline upsert now sends both columns, so those tables reject writes until it runs (sync isolates the failure per table; changes stay queued locally). |
| `043` | **Applied** | `043_done_dates.sql` (`done_dates jsonb` on `calendar_reminders` and `calendar_deadlines`: Reminder/Deadline occurrences marked done). Every reminder/deadline upsert now sends `done_dates`, so those two tables reject writes until it runs (sync isolates the failure per table; changes stay queued locally). |
| `046` | **Applied** | `046_task_repeat.sql` (`repeat jsonb` on `tasks` — "Recurring tasks", 2026-10-07). Every task upsert now sends `repeat`, so `tasks` rejects writes until it runs (sync isolates the failure per table; changes stay queued locally). |
| `047` | **Applied** | `047_note_tab_dates.sql` (`main_tab_updated_at timestamptz` on `notes`: when the main tab's content last changed, for the tab's hover; extra tabs keep their dates inside the existing `tabs` jsonb). Every note upsert now sends it, so `notes` rejects writes until it runs (sync isolates the failure per table; changes stay queued locally). |
| `045` | **Applied** | `045_notification_acks.sql` (`remind_occurrence` on `calendar_events`/`calendar_reminders`/`calendar_deadlines`; `seen_dates jsonb` on events and deadlines). Every upsert to those three tables now sends them, so they reject writes until it runs (sync isolates the failure per table; changes stay queued locally). |

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
| `033_calendar_links.sql` | `links text[] not null default '{}'` on `calendar_events` and `calendar_reminders` — same as `tasks.links`; see "Calendar links, Complete button, pane Ctrl+Enter, TimeInput Enter" in `docs/features/implemented-features.md`. Alters existing tables only, so no new grant. Applied — see "Live migration status" above. |
| `034_trash_items.sql` | New `trash_items` table — the suite-wide Recycling Bin (see "Recycling Bin" in `docs/features/implemented-features.md`). `trashStore` works fully locally (IndexedDB-backed) without it; only cross-device sync of trash entries is blocked until run. Applied |
| `035_reminder_tentative.sql` | `status text not null default 'confirmed'` on `calendar_reminders` — same `EventStatus` (`'confirmed' \| 'tentative'`) column `calendar_events` has had since `017`, extended to Reminders 2026-09-24 (see "Tentative events" below — reopens what was a deliberate Events-only scope decision). Alters an existing table only, so no new grant. Applied |
| `036_calendar_event_background.sql` | `background boolean not null default false` + `color text` on `calendar_events` — "Background / banner calendar events" (see `docs/features/implemented-features.md`). Alters an existing table only, so no new grant. **Applied** |
| `037_calendar_deadlines.sql` | New `calendar_deadlines` table (full current `calendar_reminders` shape — links/important/status/notify-lead-time/cross_app_refs/archived) + `tasks.calendar_deadline_id text` — "Deadline calendar kind" (see `docs/features/implemented-features.md`). Includes its own grant (new table). **Applied** |
| `038_list_links.sql` | `cross_app_refs jsonb not null default '[]'` + `reset_on_task_complete boolean not null default false` on `lists` — a list's own links to notes, and the checklist "reusable" flag ("Lists: links from tasks, calendar items and notes"). Links *to* a list from a task/event/reminder/deadline use those tables' existing `cross_app_refs`. Alters an existing table only, so no new grant. **Applied** |
| `039_task_item_links.sql` | `item_links jsonb not null default '[]'` on `tasks` — task links (depends on / follow-up of / related, each with an optional reason; see "Task links" in `docs/features/implemented-features.md`). Alters an existing table only, so no new grant. **Applied** |
| `040_overviews.sql` | New `overviews` table (saved Overviews: `name`, `icon`, and the whole query as one `definition jsonb`, so a new query option never needs a migration) + `collection_id text` on `lists` (a list's Endeavour, list-level only). Includes its own grant (new table). See `docs/features/overview.md`. **Applied** |
| `041_oauth_state_client.sql` | Where an OAuth connect flow started (decision D5, `docs/android/10-gap-analysis.md`): `client text not null default 'web'` on `oauth_states` (`'web' \| 'android'`); a new two-argument overload `mint_oauth_state(p_provider, p_client)` (the one-argument version from 032 is unchanged); `save_strava_connection`/`save_calendar_connection` return `'ok:<client>'` for a non-web flow (still plain `'ok'` for web, same signatures); new `discard_oauth_state(p_nonce)` (`grant execute` to `anon`) consumes a nonce on a provider error and returns its client. Additive only (ADR-9). The callbacks use it through `api/_lib/oauthReturn.ts`. **Applied** |
| `042_sync_markers.sql` | New `sync_markers` table, one row per user: `restored_at timestamptz`, the time of the last backup restore ("Restore marker" under How sync works). Includes its own grant (new table). **Applied** |
| `044_series_links.sql` | `series_id text` + `series_date text` on `calendar_events`, `calendar_reminders` and `calendar_deadlines`: a date taken out of a repeating series ("Edit only this one" / "this and following") names the series and the occurrence it stands in for (iCalendar's RECURRENCE-ID). Alters existing tables only, so no new grant. **Applied** |
| `043_done_dates.sql` | `done_dates jsonb not null default '[]'` on `calendar_reminders` and `calendar_deadlines`: the occurrence dates marked done (struck through, no more notifications). See `docs/android/05-notifications.md` N4. Alters existing tables only, so no new grant. **Applied** |
| `045_notification_acks.sql` | `remind_occurrence text` on `calendar_events`, `calendar_reminders` and `calendar_deadlines` (which occurrence a snooze is for); `seen_dates jsonb not null default '[]'` on `calendar_events` and `calendar_deadlines` (occurrences acknowledged with "Got it", synced so no device notifies them again). Alters existing tables only, so no new grant. **Applied** |
| `046_task_repeat.sql` | `repeat jsonb` on `tasks` (null = doesn't repeat; the task's `RepeatConfig`) — "Recurring tasks". Alters an existing table only, so no new grant. **Applied** |
| `047_note_tab_dates.sql` | `main_tab_updated_at timestamptz` on `notes` (`Note.mainTabUpdatedAt`): when the main tab's content last changed. A tab's own `createdAt`/`updatedAt` live in the `tabs` jsonb, needing no column. Alters an existing table only, so no new grant. **Applied** |

### Supabase tables (summary)

- **tasks** — mirrors Task interface
- **collections** — mirrors Collection; includes `field_schema jsonb`, `routine_tasks jsonb`, `repeat_config jsonb`, `collection_id text`, `archived_at timestamptz`
- **tags** — mirrors Tag; includes `notes text`
- **purposes** — mirrors Purpose; includes `archived_at timestamptz`
- **calendar_events** / **calendar_reminders** — CalendarEvent / CalendarReminder; `calendar_reminders` includes `reminder_type text` (`'default' | 'task'` — see "Task Calendar Items — layers") and, since `035`, `status text` (`'confirmed' | 'tentative'`, same column and meaning as events — see "Tentative events"); `calendar_events` includes `status text`, `background boolean` + `color text` (since `036` — "Background / banner calendar events"), and `source`/`source_connection_id`/`source_calendar_id`/`source_event_id`/`source_raw` (external calendar sync provenance — see "External calendar sync")
- **calendar_connections** — one row per connected external calendar account (Google today); `id` is a real primary key (not `user_id`), since multiple connections per user are supported — a real structural difference from `fitness_strava_connection`, which only ever needs one row per user; unique on `(user_id, provider, account_email)`; `access_token`/`refresh_token`/`expires_at`/`scope` never read client-side, only through `api/google-calendar-*.ts`; `calendars_enabled jsonb` lists which of the account's calendars are opted into syncing
- **calendar_deadlines** — CalendarDeadline (since `037`, "Deadline calendar kind"); same shape as `calendar_reminders` (links/important/status/notify_days_before/notify_at_time/cross_app_refs/archived_at/archive_reason) plus `deadline_type text`; both it and `calendar_reminders` carry `done_dates jsonb` since `043` (`'default' | 'task'`, mirrors `calendar_reminders.reminder_type`) — a genuinely separate table, not a discriminator column on `calendar_reminders`
- **tracker_entries** — TrackerEntry; `data jsonb`, RLS on `user_id`
- **fitness_strava_connection** — one row per user: `athlete_id`, `access_token`, `refresh_token`, `expires_at`, `scope`; RLS on `user_id`; never read client-side directly, only through `api/strava-status.ts` / `api/strava-sync.ts`
- **schedules** — mirrors `ScheduleTemplate`; `blocks jsonb` (the full `ScheduleBlock[]`, same "commit the whole array on save" pattern as `collections.field_schema`)
- **lists** — mirrors `List`; `field_schema jsonb`, `tabs jsonb`, `cross_app_refs jsonb` + `reset_on_task_complete boolean` (since `038`), `collection_id text` (since `040` — the list's Endeavour, plaintext even on an encrypted list)
- **overviews** — mirrors `Overview` (since `040`); `definition jsonb` holds the whole query (sources, Endeavour, status, dates, search, sort, grouping)
- **sync_markers** — one row per user (since `042`): `restored_at`, read on every load and written by a restore; not a synced record table (not in `SYNC_TABLES`)
- **list_items** — mirrors `ListItem`; `data jsonb`, `sort_order integer` (the domain field is named `order`, renamed at the DB boundary only — `order` is a SQL reserved word)
- **list_types** — mirrors `ListType`, but **only rows for custom (non-built-in) types are ever written here** — built-ins have fixed ids (`lt-movies`, `lt-credentials`, …) and are always re-seeded locally by `listStore.ts` (its persist `merge` re-adds any built-in missing from saved state, so a new built-in just goes in `BUILTIN_LIST_TYPES` — no version bump), same as Fitness's `BUILTIN_ACTIVITY_TYPE_SEEDS`. No `created_at`/`updated_at` (the domain `ListType` interface has neither, same as `Tag`) — merges fall back to remote-wins, tombstone-aware, same as `tags`
- **notes** / **note_tags** / **structured_tag_entries** — mirror `Note` / `NoteTag` / `StructuredTagEntry`; `notes` includes `is_encrypted boolean` (see "Client-side encryption for Note content" below — when true, `content` holds a JSON envelope, not raw Tiptap doc JSON, opaque to this table)
- **user_vault** — one row per user: `wrapped_key`/`wrapped_key_iv`/`salt` (passphrase-unwrap path) and `recovery_wrapped_key`/`recovery_wrapped_key_iv`/`recovery_salt` (recovery-code-unwrap path), both wrapping the same underlying AES-GCM vault key; `kdf_iterations`; RLS on `user_id`; never holds anything usable without a secret only the client has — see "Client-side encryption for Note content"
- **watchlist_items** — mirrors `WatchlistItem`; `investment_purpose_ids`/`tag_ids`/`links` all `jsonb`
- **portfolio_tags** / **investment_purposes** — mirror `PortfolioTag` / `InvestmentPurpose`; neither has `created_at`/`updated_at` in the domain model (same as `Tag`) — merges fall back to remote-wins, tombstone-aware, same as `tags`/`list_types`. `investment_purposes`' built-in seed rows (fixed ids like `ip-dividend`) are ordinary synced data here, unlike `list_types`' built-ins — portfolioStore has no re-seed-on-load mechanism and never blocks editing/deleting a seed purpose
- **trash_items** — mirrors `TrashEntry` (the Recycling Bin, see below); `snapshot jsonb` holds the deleted entity verbatim, `deleted_by jsonb`; `original_deleted_at` is the domain "when was this deleted" timestamp — kept distinct from this row's own `deleted_at` sync tombstone (set only when a trash entry itself is forgotten — emptied or restored)

### Recycling Bin (suite-wide delete/restore)

Every store's `delete*` action is a real local removal — the record is spliced out of its record map, same as always. What makes it recoverable is `services/trashCapture.ts`'s `moveToTrash(kind, entity)`, called from inside the delete action **before** the record is removed: it resolves a short title/context line from the entity's own fields (never another store — a trashed item must stay identifiable even if everything it referenced is itself later deleted or trashed) and adds a `TrashEntry` (`types/trash.ts`) to `trashStore`. `services/trash.ts` (the mirror image) holds `restoreFromTrash`/`deleteForever` and imports every domain store to write a snapshot back — it is **never imported by a store or by `trashCapture.ts`**, which is what keeps `trashCapture.ts` (imported by every store) free of an import cycle (pattern test). UI and services may import it: `RecyclingBinPane`, and `services/undoableActions.ts` for the Undo of a swipe-delete — `trashedBy(run)` returns the entries a delete created (a cascade makes several) and `restoreAllFromTrash(ids)` restores them, newest first. A cascade delete that splices out children inline instead of calling their own `delete*` action (`taskStore.deleteCollection`'s tracker entries, `listStore.deleteList`'s items) must call `moveToTrash` for each child itself, or a restore brings the parent back with no way to recover what was inside it.

**Rules for new code:**
- **A new `delete*` action on any store must call `moveToTrash('<kind>', entity)`** before removing the record, and add its kind to `TrashableKind` (`types/trash.ts`), a resolver in `trashCapture.ts`'s `RESOLVERS`, and a restore target in `trash.ts`'s `RESTORE_TARGETS`.
- **Every mapper's `xToRow` function must send `deleted_at: null` explicitly**, not omit the column — Supabase's `upsert()` only touches columns present in the object, so omitting it would leave a row previously tombstoned by another device (or restored from the bin) zombie-tombstoned forever, deleted again on the next `hydrateStores()`. Enforced by `src/test/patterns.test.ts`'s "every mapper xToRow sends an explicit deleted_at: null" check.
- Agents cannot delete anything (`access.write` has no delete — see "Agent command layer" below), so every trash entry's `deletedBy` is `{ type: 'user' }` today; the type is a union (`{ type: 'user' } | { type: 'agent'; batchId }`) purely so a future agent-delete capability wouldn't need a breaking change, per BACKLOG.md.
- Reachable via `Ctrl+Shift+R` or the "Recycling Bin" button in Account (chosen over Settings/Integrations — Account already owns the closest sibling concept, full-app Export/Restore backup).

---

## File structure

```
src/
  App.tsx                    — root: hotkey handler, modal routing, section switcher
  types/index.ts             — all TypeScript interfaces and unions
  types/agent.ts             — agent command-layer types (RiskTier, EntityKind, AgentLogEntry, AgentBatch); not re-exported from index.ts
  types/overview.ts          — Overview types (OverviewQuery, Overview, OverviewRow, OverviewSourceKey); not re-exported from index.ts — see "Overview"
  contextMenu/               — right-click menus (see "Right-click menus"): types.ts (item / scope / provider / context), registry.ts (registerContextMenuProvider, scopes by element, resolveContextMenu), useContextMenuScope.ts
  specialChars/              — `//name` → a character, in every text field (see "Special characters"): charSets.ts (THE table: Greek today; findCharTrigger, matchChars, exactChar), charPicker.ts (the list under the cursor, shared), fieldInput.ts (installSpecialCharInput: one set of document listeners for every input and textarea, installed from App.tsx)
  charts/                    — charts for any app (see "Charts"): chartSpec.ts (ChartSpec, THE library-neutral description of a chart, and the pure data helpers: pasted tables, 100% stacking, waterfall steps), chartAdapter.ts (THE only module that knows Chart.js: toChartConfig, drawChart, which loads the library on first use), ChartWidget.ts + .module.css (THE chart-with-data-editor: the drawing, the data table, the paste box; plain DOM so any host can use it)
  overview/                  — the Overview engine (see "Overview"): sources.ts (OVERVIEW_SOURCES — THE registry, one entry per app/item kind, pure functions over a store snapshot), engine.ts (runOverview: filter/sort/group; endeavourOverviewQuery), useOverviewSnapshot.ts (the React hook that builds the snapshot, encrypted notes/lists resolved through their views), open.ts (openOverviewRow — jump to a row's source)
  types/trash.ts             — Recycling Bin types (TrashEntry, TrashableKind, DeletedBy); not re-exported from index.ts — see "Recycling Bin" above
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
    calendarEventTypes.ts    — PICKABLE_EVENT_TYPES (Event/Birthday/Travel, with icons — the one list AddCalendarItemModal, CalendarEventPane and the import review offer) + EVENT_TYPE_ICON; names come from LABELS.calendarEventType
    createKinds.ts           — CREATE_KINDS: every kind of thing a creation pane's switcher can switch to, grouped by section (see "Creation panes: the switcher")
    noteBackdrops.ts         — NOTE_BACKDROP_PRESETS and the NoteBackdrop type (what fills the room below a note); each preset's look is CSS in NoteEditor/NoteBackdrop.module.css
    backup.ts                — PERSISTED_STORAGE_KEYS: every localStorage key any store persists to (single source of truth for full-app Export/Restore in AccountPane and IntegrationsPane — add a key here when a new persisted store is added, nowhere else)
  store/
    navHistory.ts            — the back/forward history's shape (NavPlace, what a stop is) and pure stack moves (pushPlace, travel); uiStore captures and restores places
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
    dialogStore.ts           — queue of pending confirm/alert requests (memory-only) behind `confirmDialog()` / `choiceDialog()` / `alertDialog()` in components/ConfirmDialog/dialogs.ts
    overviewStore.ts         — saved Overviews (persisted `overviews-storage`, synced `overviews`); deleteOverview goes to the Recycling Bin
    toastStore.ts            — the one toast showing (memory-only) behind `showToast()` in components/Toast/showToast.ts — see "Toasts"
    hotkeyOverridesStore.ts  — user-rebound hotkeys (persisted `todo-hotkey-overrides`); `matchesHotkeyId`, `findConflicts`
    notificationStore.ts     — pending in-app notifications + already-notified log (persisted `todo-notifications`)
    voiceStore.ts            — voice dictation status/level for VoiceIndicator (memory-only, written by services/speech/dictation.ts)
    trashStore.ts            — Recycling Bin: TrashEntry snapshots (persisted `trash-storage`, IndexedDB), see "Recycling Bin" above
  services/sync/
    syncService.ts           — Supabase push/pull
    mappers.ts               — xToRow / rowToX for every entity
  services/newItem.ts       — openNewItem(view): THE N/Space/Ctrl+N routing, section by section (Notes: by focused column) — see "New-item hotkey"
  services/signOut.ts       — requestSignOut(): THE way to sign out — confirms (and says what stays on the device), locks the vault, force-uploads and only wipes if that succeeded (else warns, user can cancel), then authStore.signOut(). Never call authStore.signOut() directly from UI
  services/glossary.ts      — the Glossary model (Definitions, Concepts, Acronyms across notes): glossaryEntries/glossaryEntry/glossaryReferences, through the views — see "Annotations"
  services/noteFromItem.ts  — createNoteForItem(place, title): a new note in a notebook, or a new tab of a note, returned as the CrossAppRef to link; newNoteTitleFor(title, date). "+ New note" in the calendar panes
  services/notePassage.ts   — openNotePassage(noteId, { mark, attr, value }): THE way to open a note at a passage (finds the tab; NoteEditor selects it). definitionPassage(entryId)
  services/noteReview.ts    — Review later: reviewItems/dueReviews (Important passages on the review list, from stored content) and answerReview (writes the schedule back, through the editor if that text is open)
  services/liveNoteEditor.ts — which note/tab is open in the editor (registered by NoteEditor): liveNoteEditorFor(noteId, tabId). A change to a note's content from outside the editor goes through that view when it's open
  services/clearLocalData.ts — clearSyncedLocalData(): empties every CLOUD-SYNCED store + the account-specific selection ids (each reset from its own getInitialState()). Local-only stores (fitness, routine instances, settings, hotkeys, portfolio columnConfig) are deliberately left; add a store here in the same change that gives it cloud sync
  services/shrinkNoteImages.ts — shrinkNoteImages(): recompresses every large inline image in every note and tab (skips locked encrypted notes; closes the open note first so the editor can't autosave its old copy over the result); Settings → Storage's button
  services/oauthState.ts    — mintOAuthState(provider): the single-use nonce used as the OAuth `state` for Strava/Google connect (migration 032; on Android it also records the client, migration 041, falling back if that isn't run); never put a credential in an OAuth URL. openOAuthFlow(provider, url): THE way a connect button starts the flow — a page navigation on web/desktop, the in-app browser on Android (resolves when the flow returns or the browser closes)
  services/android/deepLinks.ts — THE organisaitor:// router on Android: registerDeepLink(host, handler), startDeepLinks() (one appUrlOpen listener + the cold-start launch URL), started from one effect in App.tsx. A feature adds a route here, never its own appUrlOpen listener
  services/android/oauthReturn.ts — the `oauth-done` route: what the callbacks send an Android flow back to (closes the browser, settles openOAuthFlow, navigates like the web's ?strava/?googleCalendar return, toast). Server half: api/_lib/oauthReturn.ts
  services/strava.ts         — client-side Strava wrapper: getStravaConnectUrl(), checkStravaStatus(), syncStrava() (calls api/strava-* edge functions, upserts results into fitnessStore)
  services/googleCalendar.ts — client-side Google Calendar sync wrapper: getGoogleCalendarConnectUrl(), fetchGoogleCalendarConnections(), setGoogleCalendarEnabled(), disconnectGoogleCalendar(), syncGoogleCalendars() (calls api/google-calendar-* edge functions, maps + upserts results into calendarStore via upsertSyncedEvent) — see "External calendar sync"
  services/crossAppLinkCleanup.ts — deleteTaskWithCleanup/deleteNoteWithCleanup/removeCrossAppRefFromTarget: keeps cross-app links (Task.crossAppRefs, Notes' ArtifactLinkMark) from going dead when either side is deleted; the one module allowed to import both taskStore and noteStore (they must never import each other directly) — see "Cross-app linking"
  services/taskCompletion.ts — toggleTaskCompletion(taskId): THE way the UI completes or reopens a task. Asks before completing one that's waiting on other tasks (complete anyway / complete the whole chain upstream, via choiceDialog), then toggles through taskListLinks and shows the Completed toast (what it unlocked, + Follow-up, Undo). Agents toggle directly (agent/access.ts) — no dialog, no toast. Enforced by a pattern test
  services/notifications/   — THE notification rules and their delivery (docs/android/05-notifications.md): plan.ts (planNotifications — pure, every platform; WHEN anything notifies is decided only here), actions.ts (snooze / Done / complete the task / open the item — shared by the bell and Android buttons), androidScheduler.ts (Android: books the next 14 days with the OS via @capacitor/local-notifications, reconciles on launch/resume/store change, channels, buttons, permission ask). The desktop/web poller is hooks/useNotificationChecker.ts, built on plan.ts
  config/itemIcons.ts       — ITEM_TYPE_ICON / ITEM_FLAG_ICON: THE icon for each item kind (deadline 🏁) and flag (❗ ✏️ 🔁) — see "Inline objects in notes"
  config/itemLinkKinds.ts   — ITEM_LINK_KINDS: THE registry of task-link kinds (Waiting on / Follow-up of / Related — icon, labels, blocks, symmetric); see "ItemLink" in Type system
  utils/taskLinks.ts        — the task-link rules, pure: taskRelations (both directions), openBlockers/isBlocked/openBlockersDeep, unlockedBy, canAddLink (self/duplicate/loop), makeItemLink
  services/recurringTasks.ts — recurring tasks: nextOccurrenceDate (pure), spawnNextOccurrence (called on completion by taskListLinks and agent/access), nextOccurrenceOf, discardOccurrence (the toast's Undo), repeatSummary — see "Recurring tasks" in Type system
  services/taskListLinks.ts — a task's linked lists: checklistProgress() (the "📋 3/7" pill), toggleTaskWithLists() (toggles a task and unticks a linked checklist marked reusable — the UI calls it through services/taskCompletion.ts, never directly), toggleChecklistItemWithTasks() (THE way UI ticks a checklist item — offers to complete the linked task when the last one is ticked). Agents don't use it (no list access) — see "Lists: links from tasks, calendar items and notes" in Implemented features
  services/taskCalendarLinks.ts — keeps a task's shadow CalendarDeadline (deadline date) and event (scheduled date) matching the task, and flows edits made on the event back — the one place that logic lives (see "Task ⇄ calendar shadow entries" in Implemented features); like crossAppLinkCleanup it may import both taskStore and calendarStore
  services/taskDeadlineMigration.ts — migrateTaskDeadlineShadows(), called once from App.tsx's startup effect: converts any pre-2026-09-27 task shadow that's still a `CalendarReminder` with `reminderType: 'task'` into a `CalendarDeadline` with `deadlineType: 'task'` and repoints the owning task's `calendarDeadlineId`. State-driven (looks for legacy shadows still present, not a run-once flag), so it's naturally idempotent — see "Deadline calendar kind" in Implemented features
  services/trashCapture.ts  — moveToTrash(kind, entity): the write half of the Recycling Bin, called from inside every store's own delete* action. Deliberately imports NO domain store (only trashStore) so every domain store can import it without an import cycle — see "Recycling Bin" above
  services/trash.ts         — restoreFromTrash(entryId)/deleteForever(entryId), trashedBy(run)/restoreAllFromTrash(ids): the restore half, imports every domain store to write a snapshot back; never imported by a store or by trashCapture.ts (import cycle)
  services/undoableActions.ts — archiveTaskWithUndo / deleteTaskWithUndo: act at once, then an Undo toast (decision D2: swipe-left and action-sheet paths; pane footers keep their confirm dialog). Delete's Undo restores every Recycling Bin entry the delete made
  services/noteSecrets.ts    — the encrypted-notes model: NoteSecrets/EntrySecrets shapes, the memory-only plaintext cache, noteView()/entryView()/isNoteLocked() (the ONE way to read a possibly-encrypted note), the serialized re-encrypt queue (queueEncrypt/flushEncryptions) — see "Client-side encryption for Notes — comprehensive"
  services/noteSecretsSync.ts — keeps that cache in step: decrypts encrypted notes/entries when the vault unlocks or a sync pull brings new payloads, wipes it on lock, upgrades v1 legacy encrypted notes
  services/listSecrets.ts    — the encrypted-lists model (Lists twin of noteSecrets.ts): ListSecrets/ItemSecrets shapes, memory-only plaintext caches, listView()/itemView()/isListLocked() — the ONE way to read a possibly-encrypted list/item. Reuses noteSecrets.ts's crypto, serialised re-encrypt queue and cache-version counter
  services/listSecretsSync.ts — keeps those caches in step with the vault (decrypt on unlock/sync pull, wipe on lock)
  store/listViews.ts         — React hooks useListViews()/useListView(id)/useListItemViews(): lists/items resolved through the cache
  components/ErrorBoundary/ — class ErrorBoundary: `scope="app"` (around <App /> in main.tsx: full-page fallback with Reload + Export backup + collapsed Details) and `scope="section"` (around the section switcher in App.tsx, keyed by `activeView` so navigating away resets it: "Reload this section", nav keeps working). A **new section must render inside that section boundary**; copy is `LABELS.errorBoundary`
  components/ConfirmDialog/ — THE replacement for window.confirm()/alert(): `dialogs.ts` (`confirmDelete`, `confirmDialog`, `choiceDialog`, `alertDialog`) + `ConfirmDialogHost`, mounted once in App.tsx (see "Confirmations and alerts")
  components/OverviewSection/ — the Overview section: sidebar (Endeavours → their automatic Overview; My overviews with RowHoverActions edit/delete; + New overview) + grouped table (row click opens the item in its app)
  components/AddOverviewModal/ — create/edit a saved Overview (sources, Endeavour, open/all, dates + window, title search, sort, group)
  utils/suggestRank.ts      — rankSuggestions/rankSearch: THE ordering for every "link a …" picker (see "Pickers suggest by keywords")
  components/HoverOptions/  — HoverOptions: hovering a button offers labelled alternatives to its plain click (the RowHoverActions machinery, `align`-able, vertical list); on Android a long-press opens them in an ActionSheet. Used for a task's Complete (TaskItem checkbox, ItemActionFooter's `completeOptions`)
  components/BottomSheet/   — BottomSheet: THE phone bottom sheet (portaled, backdrop tap / grabber drag-down / Escape + Android back close it, 85vh, safe-area padding, z-index 1020) — see "Bottom sheets"
  components/ActionSheet/   — ActionSheet (a BottomSheet of `{ label, icon?, onSelect, destructive? }`; choosing closes, then runs) + ActionSheetButton (one row, shared with RowAction in the sheet)
  components/Toast/         — `showToast()` (showToast.ts) + `ToastHost` (Toast.tsx), mounted once in App.tsx — see "Toasts"
  components/TaskLinks/     — TaskLinksField: TaskPane's "Task links" section (grouped both-direction rows with editable reasons; + Waiting on… / + Follow-up / + Related…)
  components/TaskPickerModal/ — the "link a task" search dialog (portaled, shares NotePickerModal's CSS module like ListPickerModal)
  components/DecryptPrompt/  — app-wide "enter your passphrase to permanently decrypt this note/list" modal (uiStore.decryptPrompt / requestDecrypt), portaled, z-index 200; opened by every clickable 🔒
  store/noteViews.ts         — React hooks useNoteViews()/useNoteView(id)/useEntryViews(): notes/entries resolved through the cache, re-derived when the store OR the cache changes
  services/vault.ts          — client-side encryption vault: setupVault/unlockWithPassphrase/unlockWithRecoveryCode/lockVault, trustThisDevice (IndexedDB key cache), encryptField/decryptField (AES-GCM via Web Crypto) — see "Client-side encryption for Note content"
  services/autoBackup.ts     — automatic local backup rotation (change-volume-triggered, no time-based trigger): subscribes to every persisted domain store, accumulates a weighted change score, and once it crosses settingsStore.autoBackupChangeThreshold builds+saves a snapshot via autoBackupStorage.ts and thins old ones via utils/backupRetention.ts. initAutoBackup() called once from App.tsx. See "Automatic local backup rotation" in Implemented features
  services/autoBackupStorage.ts — IndexedDB storage for automatic snapshots, its own database (`organisaitor-backups`, deliberately separate from the notes/trash one): saveBackupSnapshot/listBackupSnapshots/getBackupSnapshot/deleteBackupSnapshot, all best-effort
  utils/
    backupRetention.ts       — selectSnapshotsToKeep(snapshots, targetAgesDays, now): pure grandfather/tiered-thinning algorithm (always keeps the newest, then claims the nearest unclaimed snapshot per target age, closest-first) — used by services/autoBackup.ts
    backupExport.ts          — buildBackupSnapshot() (every `PERSISTED_STORAGE_KEYS` key, used by both downloadBackup() and services/autoBackup.ts) / downloadBackup() / downloadAutoBackupSnapshot(id, createdAt) (one automatic snapshot as a file — Integrations pane): exports straight from localStorage (works without the app rendering); used by AccountPane and the ErrorBoundary fallback. restoreBackupData(backup, userId): writes a backup object back to persisted storage + rehydrates the Supabase-synced stores + force-uploads if signed in — the one restore path AccountPane, IntegrationsPane and AutoBackupSection all call
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
    apiFetch.ts               — apiFetch(path, init): THE way to call /api/* (a pattern test fails on a bare fetch('/api…)); routes to the production Vercel URL through a native HTTP client in the packaged apps — @tauri-apps/plugin-http under Tauri, CapacitorHttp under Android (adapted back into a Response; never enable CapacitorHttp globally, it would patch Supabase's fetch too) — plain same-origin fetch in the browser. oauthRedirectOrigin(): the origin OAuth providers redirect back to (production in the packaged apps). See "Desktop (Tauri) API access" and "Android W1: platform services" in Implemented features
    saveFile.ts               — saveFile(filename, blob): THE way to hand the user a file (every export: backups, auto-backup snapshots, ErrorBoundary). Anchor download on web/Tauri; on Android writes to the cache directory and opens the share sheet (@capacitor/filesystem + @capacitor/share)
    textToTask.ts            — inferTaskFromSelection(text): non-AI date/time/priority/link inference for the Notes "Create ▸ Task" feature, and inferCalendarItemFromSelection(text) for "Create ▸ Calendar item" (kind event/reminder/deadline from phrase cues, plus travel/birthday, tentative, important, repeat — see "Notes Create ▸ Calendar item: phrase cues" in Implemented features) — regex-based, no external dependency; locale-aware (Intl) for ambiguous numeric dates. A new cue goes in with a test in textToTask.test.ts
    timelineWhen.ts          — readTimelineWhen (a timeline entry's When as a sortable point: dates in many formats, years, BC/AD, decades, ranges, times, "Day 3" steps) and readTimeline (the order, inherited years). Pure; a new format goes in with a test
    definitionInference.ts   — inferDefinitionFromSelection: term + meaning from "X is Y" / "X: Y" / a term and its sentence, for the Definition and Concept popover
    idbStorage.ts            — IndexedDB persistence for the notes store: preloadIdbStorage() (awaited in main.tsx before the app is imported), persistStorageIdb(), readPersistedValue()/writePersistedValue() for backup/restore, IDB_STORAGE_KEYS, getIdbUsage()
    persistStorage.ts        — THE `storage:` for every persist() (guards QuotaExceededError, see Zustand migration rule) + getStorageUsage()/formatStorageSize() for Settings → Storage
    imageCompress.ts         — compressImageBlob(file) / recompressDataUrl(dataUrl): scale to fit 1600 px + WebP, used on paste into notes and by shrinkNoteImages
    noteTabs.ts              — MAIN_TAB_ID ('__main__'), tabDatesText (a tab's created/modified, the tab bar's hover), linkTabIdFor / effectiveLinkTabId / tabNameOf: how a CrossAppRef.tabId (a link naming one tab of a note) is recorded, resolved (deleted tab → main) and named
    keywords.ts              — extractKeywords(text) (stop-words/short words dropped, max 8) + stemForMatch(word); used by NotePickerModal's title-keyword suggestions
    noteSearchText.ts        — getNoteTabTexts(note): cached plain text of a note's main tab and each extra tab for searching (never caches encrypted notes); read a note's text for search through this, not by re-parsing its JSON
    openCrossAppTarget.ts    — (in services/) openArtifactTarget(type,id): opens a linked task/event/reminder in its section; used by editor link clicks and the Linked-from pills
    noteContent.ts           — stripArtifactLinksFromContent(contentJson, targetType, targetId): pure JSON-tree walk over a Note's stored Tiptap content, editor-independent (the note being cleaned up is rarely the one currently open) — used by crossAppLinkCleanup.ts
    haptics.ts               — Android-only guarded haptic wrappers (hapticLight/hapticMedium/hapticWarning — add hapticSuccess when first needed), no-op via Capacitor.isNativePlatform() elsewhere
    timeGrid.ts              — shared hourly time-grid layout math (buildHourLayout, minutesToY, layoutDayTimeGrid, markActiveHours), generic over item type; used by CalendarView's week/day views and CalendarSidePane's overlay-preview grid
    timeGridDrag.ts          — computeDragResult(geometry, pointerMinute, pointerColIndex): pure snap/clamp math behind drag-to-move / drag-to-resize on any hourly time grid — see hooks/useTimeGridDrag.ts and "Calendar drag-to-move / drag-to-resize" in Implemented features
    markdownTextEdit.ts      — toggleWrap(value, start, end, marker) / insertMarkdownLink(value, start, end, url, linkText?): pure text-splicing behind the "light rich text" Task/Calendar notes hotkeys — see hooks/useMarkdownHotkeys.ts
    scheduleOccurrences.ts   — expandScheduleBlock() (turns one ScheduleBlock into concrete occurrence dates, honouring interval/anchor/exceptions), blocksMayConflict() + countTemplateConflicts() (the schedule manager's "N potential conflicts" hint)
    recurrence.ts            — repeating calendar items: expandRepeat (honours RepeatConfig.exceptions), isOccurrenceSkipped, withException / endedBefore / tailOf (the "this one / this and following" operations) — see "Calendar: editing individual occurrences"
    timezone.ts              — account-wide timezone: resolveTimezone, zonedTimeToUtc, utcToZonedTime, rezoneWallClock, todayIsoInZone, listTimezones
    quickAccess.ts           — Quick Access (Ctrl+G) provider registry: one QuickAccessProvider per destination type (note/notebook/task/list/endeavour/tracker/routine/schedule) with list()/resolve()/navigate(); searchQuickAccessItems(), resolveRecentItems(), navigateToQuickAccessItem() — extension point for new destination types (see Implemented features)
  services/timezoneMigration.ts — rezoneAllCalendarData(fromZone, toZone): re-stamps every stored wall-clock date+time when the timezone setting changes
  hooks/
    useCtrlEnterSubmit.ts    — THE Ctrl+Enter rule for form-less modals/panes: `useCtrlEnterSubmit(onSubmit, active?)` (see "Ctrl+Enter — universal submit rule")
    useEscapeClose.ts        — THE Escape rule: every overlay registers here; Escape closes only the most recently opened one (see "Escape key — universal close rule"). closeTopOverlay() is the same for the Android back button
    useLongPress.ts          — long-press (450 ms, cancelled by >10px movement, hapticMedium, swallows the click it produces, cancels Android's own long-press menu). Touch only — see "Bottom sheets"
    useSwipeRow.ts           — swipe right (row's positive action) / swipe left (reveal the row's actions), axis lock, 24px edge exclusion; the classification is pure exported functions. Used by TaskItem
    useTimeGridDrag.ts       — shared drag-to-move / drag-to-resize for any hourly time grid built on utils/timeGrid.ts: one hook instance can drive every draggable block on a page (geometry supplied per-gesture, not fixed at hook-creation time). Used by CalendarView's week/day grids (Events move+resize, Reminders move only) and ScheduleWeekGridPreview's block editor (AddScheduleModal) — see "Calendar drag-to-move / drag-to-resize" in Implemented features
    useMarkdownHotkeys.ts    — "light rich text" for plain-<textarea> notes fields (Task/Calendar): Ctrl+B/Ctrl+I wrap the selection in Markdown bold/italic syntax (utils/markdownTextEdit.ts's pure toggleWrap), Ctrl+L opens components/MarkdownLinkPrompt to insert a `[text](url)` link. Attached directly to the textarea element, not `document`. See "Light rich text" in Implemented features
  components/
    NavSidebar/              — left nav: section switcher, settings, account icons (desktop/web only — hidden on Android in favour of MobileNav); navItems.tsx holds CORE_NAV_ITEMS and SECTION_ICONS (THE icon per section)
    HistoryBrowser/          — Alt+N: the history carousel (portaled, z-index 410); describePlace.ts reads a place's title, path, detail and preview live from the stores
    MobileNav/               — Android-only bottom tab bar: Tasks/Calendar/Records/Lists/More
    MobileMoreSheet/         — Android-only overflow sheet for MobileNav's More tab: Notes/Portfolio/Fitness/Manage Library/Settings/Account
    MobileQuickAddBar/       — Android-only bottom-anchored task quick-add (title + Due/Priority/Endeavour chips), replaces QuickAddInput on Android
    MobileCalendarQuickAdd/  — Android-only bottom-sheet quick-add for calendar events/reminders
    Sidebar/                 — hover panel (from the header hamburger, left-hand side): pinned "Manage Library" button (M/Ctrl+M) at top, then active endeavours (collections), purposes, tags — quick glance + filter/edit, not administration (see ManagePane). Every section except Calendar — there, the same hamburger click-opens CalendarSidePane instead (see "Calendar side pane")
    TaskList/                — main task list + collapsible Routines section
    TaskItem/                — single task row; shows subtask progress pill
    TaskPane/                — slide-in task detail/edit pane
    Icons/                   — THE suite's shared UI icons (see "Icons come from one place"): index.ts, ActionIcons.tsx (TrashIcon/ArchiveIcon/RestoreIcon/CheckCircleIcon), TextColorIcon.tsx
    ItemActions/             — the SHARED archive/restore + delete pattern every item pane uses (Task, Calendar event, Calendar reminder; future apps' panes should too) — see "Shared item actions" in Implemented features: icons from components/Icons, ItemActionFooter (optional Complete/Mark-incomplete toggle for task-backed items), ItemActionDialog (archive-with-reason + delete-confirm, portaled z-102), ArchivedBanner, useItemActions hook (dialog state + Escape + Ctrl+Enter + hotkeys)
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
    CalendarDeadlinePane/    — slide-in: edit calendar deadline (structural near-copy of CalendarReminderPane; "Notify me" is always shown, not gated by "no Time set" — a Deadline notifies only before, never at, even with a Time)
    RecurrenceScopeBar/      — shown at the top of the event/reminder panes for a repeating item: edit/delete only this occurrence or this-and-following
    AddScheduleModal/        — create/edit a Schedule (recurring weekly timetable) and its blocks
    CalendarSidePane/        — left-sliding pane (Calendar section): Layers toggles + Schedule list/manager (active toggle, conflict hint, overlay-preview grid) in one place — supersedes the old CalendarLayersPicker (header dropdown) and ManageSchedulesPane (right-sliding pane), see "Calendar side pane" in Implemented features
    ScheduleOccurrencePopover/ — click a Schedule occurrence on the calendar: skip this date, commit/uncommit (commitment mode), or jump to editing the Schedule
    TimeInput/               — segmented hour/minute/AM-PM combobox respecting settingsStore.clockFormat (not a native <input type="time">, see Clock format setting below and the Timepicker rebuild entry in Implemented features), plus a quick-pick dropdown of half-hour times
    RepeatField/             — the repeat-rule editor (on/off, every N days/weeks/months/years, ends never/after N/on a date); TaskPane and AddTaskModal
    LinksField/              — the shared links list (clickable / edit / delete / add) used by TaskPane, CalendarEventPane and CalendarReminderPane; links typed into notes arrive via `mergeNewLinks` in the store's update action, never here
    LinkHoverPreview/        — app-wide: shows a hovered link's URL bottom-left (see "Link hover preview" pattern below)
    QuickAccessPane/         — app-wide, Ctrl+G: portaled search-and-jump overlay across Notes/Notebooks/Tasks/Lists/Endeavours/Trackers/Routines/Schedules, or browse Recent/Frequent visit history (see "Suite-wide Quick Access pane" in Implemented features)
    TruncatedText/           — wraps a CSS-ellipsis-truncated name/title; on hover, only when actually truncated, reveals the full text: `reveal="tooltip"` (default) in a floating box below the row, `reveal="extend"` drawn in place over the row and running out to the right (Notes: NoteList's note titles and ChronicleView's notebook names, 2026-09-28). Tooltip users: (2026-09-24) Sidebar/ManagePane/ListsSection/RecordsView's row names
    RowHoverActions/         — suite-wide nav-column row actions: RowOptionsMenu (the row's leading icon slot, which becomes a "⋯" on row hover; hovering it drops the actions down as a narrow column; long-press the row on Android) + RowAction (one labelled action), built on useRowHoverActions() (open/close state machine, shared with HoverOptions) + RowHoverActionsMenu (portaled floating panel; a BottomSheet on Android) — see "Row options menu" in Component patterns. Used by ChronicleView, Sidebar, ManagePane, ListsSection, RecordsView, OverviewSection
    SettingsPane/            — settings slide-in; reads HOTKEYS[] dynamically; NotificationsSection.tsx = Android-only Notifications block; SettingControls.tsx = the shared Toggle/SettingRow; StorageSection.tsx = the Storage block (per-store usage + Shrink images in notes)
    ManagePane/              — library admin (Endeavours/Purposes/Tags): left-nav tabs + content, opened by clicking (not hovering) the header hamburger; archive/restore/delete rows. MANAGE_SECTIONS array in the file is the extension point for future tabs
    AccountPane/             — Supabase auth + account info; renders AutoBackupSection (both signed-in and guest branches)
    AutoBackupSection/       — automatic local backup UI (enable toggle, threshold, snapshot list with per-row Restore) — see services/autoBackup.ts and "Automatic local backup rotation" in Implemented features
    IntegrationsPane/        — (stub) future integrations
    RecyclingBinPane/        — suite-wide Recycling Bin: Ctrl+Shift+R or the "Recycling Bin" button in Account; filter chips by section, Restore / Delete forever per row, "Empty recycling bin" — see "Recycling Bin" above
    ColorPicker/             — reusable colour swatch picker
    CollectionPicker/        — CollectionPicker.tsx (single-select dropdown, used in create/edit forms) + CollectionFilterPicker.tsx (header Endeavour-focus picker, numbered for the E/Ctrl+E hotkey)
    CrossAppRefPicker/       — controlled { value: CrossAppRef[]; onChange; onNavigate?; types?; newNoteTitle? } widget: chips for existing links + "+ Note" (NotePickerModal) and "+ List" (ListPickerModal) buttons, and "+ New note" where `newNoteTitle` is passed (the calendar panes: NotePickerModal's place mode, then services/noteFromItem.ts); `types` limits which are offered (a list's own ListLinksBar offers notes only). List item/Tracker entry targets are BACKLOG. Used by AddTaskModal, TaskPane, the calendar event/reminder/deadline panes and ListsSection's ListLinksBar
    ListPickerModal/         — the "link a list" search dialog (portaled, shares NotePickerModal's CSS module); checklists first, encrypted lists by their view name
    LinkedChecklists/        — a task's linked checklists rendered as tickable steps inside TaskPane (each row IS the ListItem — nothing copied)
    MarkdownLinkPrompt/      — the Ctrl+L "insert a link" prompt for plain-<textarea> notes fields (Task/Calendar) — text+URL popover, portaled, mirrors NoteEditor's own "New link" pane visually/by keyboard. See hooks/useMarkdownHotkeys.ts and "Light rich text" in Implemented features
    LinkedNoteAbstracts/     — under a calendar item's notes: each linked note's abstract, editable in place (saves to the note); kept apart from the item's own notes. Used by the three calendar panes
    NotePickerModal/         — the "link a note" search dialog (mode 'place': where a NEW note goes — notebooks join the results, picking a note means a new tab of it) (portaled to document.body, z-index 1000): title + notebook path + preview + date per result, multi-word search over title/path/content, title-keyword suggestions while the search box is empty (`suggestFrom`), keyboard nav; captures Ctrl+Enter so the pane/modal behind it doesn't answer. Any future "pick a note" UI should reuse it rather than list notes by title alone — titles are not unique
    PurposeFilterPicker/     — header Purpose-focus picker (multi-select checkboxes), Tasks section only; P/Ctrl+P hotkey
    SortBar/                 — sort controls for task list
    NoteEditor/              — Tiptap v3 rich-text editor with toolbar, zoom, table support, abstract, attributes panel
      extensions/ResizableImage.ts   — the note picture: eight handles when selected (corners keep the shape, edges stretch, `height` set once stretched) and Crop (crop handles over the whole picture, dimmed outside; Enter/Done/click away applies, Esc cancels). The crop is attributes (`crop`, fractions per side), never cut from the image. Geometry is pure in imageGeometry.ts; CSS in ResizableImage.module.css
      extensions/HeadingNumbering.ts — ProseMirror plugin: computes hierarchical heading numbers, sets data-heading-number
      extensions/Section.ts          — custom Document (content: 'section+') + Section node (content: 'block+', columns/locked attrs) + ColumnBlock/Column nodes (locked-columns layout); commands setSectionColumns / insertSectionBreak / toggleSectionLocked
      extensions/DuplicateLine.ts    — Alt+Shift+↓: duplicateLineDown copies the current line (textblock, or its whole list item) or the selected lines below
      extensions/Timeline.ts         — the `\timeline` note block: Timeline (variant attr) / TimelineItem / TimelineWhen nodes, insertTimeline, and TimelineBehaviour (Enter/Backspace/Delete, placeholders, current-entry dot, "+ Add entry" widget) — see "Note blocks"
      extensions/timelineMenu.ts     — the timeline's right-click provider (Style ▸ / Order ▸)
      noteClipboardText.ts           — what a copy puts on the clipboard as plain text (editorProps.clipboardTextSerializer): Markdown-style headings, lists, quotes, tables as tab-separated rows
      extensions/HeadingLevel.ts     — Ctrl+= / Ctrl+− on a heading change its level (else App.tsx zooms)
      extensions/NoteBylines.ts      — Subtitle (Ctrl+H, S) and Author (Ctrl+H, A) paragraph styles: own nodes like NoteTitle, never numbered or in the outline
      extensions/fontSize.ts         — the font-size ladder (FONT_SIZES), currentFontSize / setFontSize / stepFontSize (Ctrl+Shift+< / >, the ribbon's A− [size] A+)
      extensions/Quote.ts            — the `\quote` note block: QuoteBlock (variant, hidden), QuoteText, QuoteField (QUOTE_FIELDS), insertQuote / quoteFromSelection, setQuoteVariant / toggleQuoteField, keys and the pill; quoteMenu.ts is its right-click provider
      extensions/Cycle.ts            — the `\cycle` note block (at least two stages, each owning the arrow to the next; arrows' direction and name; icons/pictures; designs Ring / Flow / Steps); cycleMenu.ts is its right-click provider
      extensions/Breakdown.ts        — the `\breakdown` note block (a whole and at least two parts; designs Hub / Pillars / Tree; spectrum colours); breakdownMenu.ts is its right-click provider
      extensions/Hierarchy.ts        — the `\hierarchy` note block (`\tree`, `\taxonomy`): items stored flat with a level, written as an outline (Enter, Tab / Shift+Tab move an item and its children a level); level names (`tiers`) beside the rows or over the columns; designs Tree / Columns / Outline. hierarchyLayout.ts reads the tree (spans, siblings) purely; hierarchyMenu.ts is its right-click provider
      extensions/Chart.ts            — the `\chart` note block: one atom node (`variant` = chart type, `spec` = a ChartSpec) whose view is the block's pill around the shared ChartWidget (src/charts/); chartMenu.ts is its right-click provider
      extensions/Pyramid.ts          — the `\pyramid` note block (`\funnel`, `\maslow`): at least two layers, top first, each a label drawn on its shape and a note beside it; designs Pyramid / Funnel / Stacked; pyramidMenu.ts is its right-click provider
      extensions/SpecialCharInput.ts — `//name` → a character in the note editor (the same table, list and keys as fieldInput.ts, through ProseMirror; not in code)
      extensions/OccurrenceHighlight.ts — selecting a word or phrase faintly marks its other mentions in the tab (whole words when the selection is whole words); decorations only
      extensions/GlossaryAutolink.ts — offers to link a Glossary term as it's typed (once per note per term); Enter/Tab, Backspace undoes
      extensions/blockDesigns.ts     — Block designs, the shared half: BlockDesign, blockPill, designButtons, designMenuItem, pillButton, openBlockPopover, selectBlock / deleteBlock / selectButton (+ BlockDesigns.module.css for the popover)
      extensions/blockPicks.ts       — Ctrl+click picks parts of a block (BLOCK_PART_NODES), Delete / copy / cut them together; Ctrl+Alt+click selects the whole block
      NoteBackdrop.tsx               — the room below the end of a note (plain grey, a preset from config/noteBackdrops.ts, or the user's picture; settingsStore.noteBackdrop) and its picker
      extensions/ConceptRef.ts       — ConceptRefMark (text linked to a Glossary term) + ConceptMargin (the brace and label beside it, hover card, click to the definition) — see "Annotations"
      extensions/Importance.ts       — Important's levels, passages, Review later scheduling and the margin markers; importanceLevels.ts holds the three levels
      extensions/annotationMenu.ts   — right-click on linked text (go to definition, unlink) and on Important text (level, review, remove)
      extensions/ArtifactLinkMark.ts — Mark (targetType/targetId/display attrs) marking a span of note text as linked to a cross-app entity made from it, via FloatingToolbar's "Create ▸" menu (Ctrl+Q) or `\`; only data — drawn by objects/artifactGroups.ts; see "Cross-app linking" in Implemented features
      objects/               — inline objects (`\`) and link rendering (see "Inline objects in notes"): kinds.ts (NOTE_OBJECT_KINDS — THE registry; matchPickable/chosenKind across objects and blocks), blockKinds.ts (NOTE_BLOCK_KINDS — the note-block registry) + timelineBlock.ts, types.ts (NoteObjectKind, NoteBlockKind, PickableKind), reminderKind.ts, session.ts (the `\` session, derived from the text), actions.ts (accept/commit/unlink/insertObjectTrigger), NoteObjectTrigger.ts (the extension + keys), NoteObjectMenu.tsx, artifactTypes.ts (ARTIFACT_TYPES: live summary per linked type), artifactGroups.ts (ArtifactLinkGroups: the pane per link, states, the expanded box and body widget, Home/End, the stored-mark guard), eventKind.ts, deadlineKind.ts + reminderKind.ts (both from datedKindFactory.ts), ArtifactBody.tsx + WhenLine.tsx + ObjectBody.tsx + CalendarItemBody.tsx + EventBody.tsx + NotifyChips.tsx (the expanded body), flags.ts (ArtifactFlag, calendarFlags, flagMenuItems), calendarItems.ts, whenInput.ts (readWhenInput, expandShortWeekdays, the defaults), contextMenu.ts (right-click on a link), format.ts
      extensions/NoteTagMark.ts      — Mark (tagId/color/typeKey/structuredEntryId attrs) for annotation tags; structuredEntryId links a tagged passage to its StructuredTagEntry (see "Structured tag entries")
      contextMenu.ts         — the editor's right-click providers (clipboard, link/create, Style ▸, select all) on the `note-editor` scope; NoteEditorMenuApi is what NoteEditor hands them
      builtinTags.ts         — 8 built-in annotation tag definitions (Important/Concept/Definition/Example/Question/Reference/Learn Later/Acronym) — typeKey drives both Learn Later's future create-task action and Acronym's structured-tag-entry behaviour
      NoteBacklinks.tsx      — the "Linked from" bar under a note's title: single pill / "🔗 N" chip + list, each pill openable, draggable into the text, or insertable at the cursor (derived from other items' crossAppRefs via store/noteBacklinks.ts — nothing stored); artifactLinkInsert.ts holds the insert/drop helpers
    StructuredTagPopover.tsx — create/edit popover shared by every structured tag type (Acronym today): compact term+field preview with Enter-to-accept, "More options" expands in place to show every field + Endeavour + (edit mode) location/timestamps
    NoteEditorPane/          — slide-in pane wrapping NoteEditor for non-Notes sections
    AddNoteModal/            — quick-add note (Ctrl+Space) with hierarchical tag picker
    ContextMenu/             — ContextMenuHost (THE contextmenu listener, mounted once in App.tsx) + ContextMenu (the menu: sections, submenus, keyboard); content comes from src/contextMenu/
    CreateKindSwitcher/      — the Note / Notebook / Tag (…) strip at the top of a creation pane; kinds from config/createKinds.ts
    AddNoteTagModal/         — create notebook (area) or custom annotation tag; a notebook's "Inside" picker (starts at where it was opened from, can move anywhere in the tree or to the top level)
    EditNoteTagModal/        — edit notebook/tag name, icon, color; field schema editor for annotation tags
    EditNoteMetaModal/       — edit note metadata: tagIds (notebooks + annotation tags), accent color, pinned
    NoteTagPresetModal/      — install curated annotation tag packs; detects already-installed via presetKey
    ChronicleView/           — Notes section layout: notebook tree, note list, editor; hover-expand on notebooks; NotebookLocationView is the editor column's empty state (path/tree of where you are)
    NotesSection/            — Notes section wrapper; GlossaryView.tsx (the Glossary) and ReviewView.tsx (Review later), both opened from TagFAB's # panel
    ListsSection/            — Lists section: sidebar (Checklists/Watchlists/Reference dividers) + card grid (watchlist), table (reference) or ChecklistView.tsx (checklist — tick-off, checked items struck through and moved to the bottom via listStore.toggleListItemChecked) + tab bar
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
1. Use `useEscapeClose`. Nothing else handles Escape for an overlay. An overlay that isn't a React component (a popover a ProseMirror widget opens) uses `registerEscapeClose(onClose)` from the same file and calls the returned function when it closes.
2. **Inline, input-level Escape handlers** (cancel an in-place edit, dismiss a suggestions list) stay as ordinary `onKeyDown`, but must call `e.stopPropagation()` — and only when they actually have something to cancel — so the keypress doesn't also reach the stack and close the pane around the input. An input that is *always* mounted (e.g. `AddTaskModal`'s tag field) must consume Escape only while its list/edit is open, or the modal can never be closed from it.
3. Open order = close order automatically; don't try to control it with z-index or flags.
4. The one deliberate exception is a capture-phase key listener that owns *all* keys for a moment (`SettingsPane`'s hotkey-rebind capture): it consumes Escape itself (cancels the capture) before the stack sees it.
5. `FloatingToolbar` (Notes) registers while visible and runs its own priority ladder (create menu → tag search → link input → colour picker → collapse selection) inside that one entry.

**The Android back button is this stack too** (2026-10-04): `App.tsx`'s `backButton` listener calls `closeTopOverlay()` (exported from `useEscapeClose.ts`), then `mobileBackConsumer`, then `navigateBack()`, then minimises. So an overlay that registers `useEscapeClose` closes on back with nothing else to do, and one that doesn't is broken on both platforms. There is no flag list any more (`closeTopmostMobileOverlay()` was deleted). One system quirk: when an input has the soft keyboard up, the first back press only hides the keyboard (Android handles it; the app never sees it).

### Ctrl+Enter — universal submit rule for creation panes

**Every Add*/Create modal with a primary save action must submit on Ctrl+Enter (and Cmd+Enter on Mac).** This matters specifically because a plain `Enter` inside a `<textarea>` (e.g. a Notes field) always inserts a newline and never submits the surrounding `<form>` — without an explicit Ctrl+Enter binding, there's no keyboard-only way to save while focus is in a multi-line field. The established pattern (already in `AddTaskModal`, `AddCalendarItemModal`, `AddTrackerModal`, `AddWatchlistItemModal`, `AddRoutineModal`, `AddEntryModal`, `AddInvestmentPurposeModal`, `AddPortfolioTagModal`, `AddNoteModal`, `AddNoteTagModal`, `AddListModal`, `AddListItemModal`, and added to `AddCollectionModal`/`AddPurposeModal`/`AddTagModal` in this pass):

```tsx
const formRef = useRef<HTMLFormElement>(null);
useEscapeClose(closeModal);                                    // Escape: never in a keydown effect
useCtrlEnterSubmit(() => formRef.current?.requestSubmit());
// ...
<form ref={formRef} onSubmit={handleSubmit}>
```

(Older modals still bind Ctrl+Enter in an inline `useEffect`; that's the retrofit in BACKLOG.md, not a pattern to copy.)

`requestSubmit()` (not calling `handleSubmit` directly) is the important detail — it goes through the DOM form submission machinery, so it always invokes whatever `onSubmit` is bound in the **current** render, respects `disabled`/native validation the same way clicking the visible submit button would, and can never fire a stale closure over old form state. For a component with **no `<form>`** (a plain "Save" button as the primary action — the Edit panes, `EditNoteMetaModal`, `EditActivityTypeModal`, `BulkUploadWatchlistModal`, …) use **`useCtrlEnterSubmit(() => handleSave(), active)`** (`src/hooks/useCtrlEnterSubmit.ts`): it keeps the callback in a ref refreshed every render, so an inline closure can never call stale state. Call it above the early `return null`, pass `active` = the same condition the early return uses, and declare the handler as a **function declaration** (`function handleSave() {}`), not a `const` arrow — a `const` defined below the hook call trips `react-hooks/immutability`, and a hoisted declaration doesn't. (The hook is also fine for form modals: `useCtrlEnterSubmit(() => formRef.current?.requestSubmit())`. The ~20 older modals keep the inline effect above; migrating them is in BACKLOG.md's Pattern retrofit backlog.)

**Item panes** (Task, Calendar event, Calendar reminder) get it from `useItemActions`: those panes save each field on change/blur rather than through a Save button, so Ctrl+Enter blurs the focused field (committing a half-typed title, note, time or link) and closes the pane. It does nothing while the archive/delete dialog is open — the dialog owns it then.

**Deliberately not wired**: `NoteTagPresetModal` only (a list of independent "Install" actions — no primary action). Every other modal, pane and popover with a primary action binds it, including `CalendarImportReviewModal` (Import) and the `ConfirmDialog` (confirm). When two layers both bind Ctrl+Enter (a confirmation opened over a modal), the confirmation's listener runs in the capture phase and calls `stopImmediatePropagation`, so only the top layer answers.

### Icons come from one place — `src/components/Icons/` (suite-wide pattern, adopted 2026-10-07)

**A control that appears in more than one place takes its icon from `components/Icons` (`index.ts`)**, so it looks the same everywhere. The user asked for this when the ribbon's text-colour button (an underlined A, which reads as Underline) and the selection toolbar's (a hue-wheel swatch) had drifted apart.
- **What's there today:** `TextColorIcon` (the hue-wheel swatch, with the colour in use in its middle), the item-action icons `TrashIcon`, `ArchiveIcon`, `RestoreIcon`, `CheckCircleIcon` (moved from `ItemActions/icons.tsx`), `AccountIcon` (the header's account button; it was `◎`, which is also the Purpose icon) and `ImageIcon` (choosing a picture). Plain-DOM code (a ProseMirror widget) can't render the React component: it copies the same SVG markup with a comment naming the icon (`blockDesigns.ts`'s Delete), and a right-click item passes `createElement(TrashIcon)`.
- **A site can override locally** through the icon's props or `className` (size, tint, the current colour), never by drawing its own copy.
- **Item-kind icons** (task, event, deadline, ❗ ✏️ 🔁) are the emoji in `config/itemIcons.ts`, not here.
- **An icon used in only one component** may stay local, like NoteEditor's list and table SVGs. It moves here the day a second place needs it.
- **Pattern test:** no hue-wheel `conic-gradient` outside `components/Icons`, and no imports from the old `ItemActions/icons`. **Retrofit:** close ×, edit ✎ and link 🔗 are typed as characters across many files (BACKLOG.md "Pattern retrofit backlog").

### Confirmations and alerts — never `window.confirm()` / `alert()` / `prompt()`

**A native browser popup is a pattern violation, always.** They are unthemed, ignore the Escape and Ctrl+Enter rules, and look different in the Tauri and Android webviews. Use `src/components/ConfirmDialog/dialogs.ts`:

- `await confirmDelete(noun, itemName, detail?)` — "delete permanently". Red button, Cancel focused, "This cannot be undone." — the standard from "Archive and delete look and behave the same everywhere". `noun` is lower-case (`'tracker'`; use `LABELS.collection.toLowerCase()` for Endeavours); `detail` says what else goes with it.
- `await confirmDialog({ title, message?, itemName?, confirmLabel?, destructive?, irreversible? })` — any other yes/no (disconnect an account, change the timezone, remove a field that holds data).
- `await choiceDialog({ ...confirmDialog options, alternateLabel })` — a confirm with a third, secondary button; resolves `'confirm'` (primary, Ctrl+Enter), `'alternate'` or `'cancel'`. Used by the blocked-task prompt ("Complete anyway" / "Complete all N"). Put the choice that affects the least on the primary button.
- `await alertDialog(message)` — an error the user needs to see.

All of them return promises, so the handler becomes `async`. Where a listener owns the keyboard while it waits (`SettingsPane`'s hotkey capture), stop listening *before* opening the dialog. If an item has a real archive concept, prefer the `ItemActions` pane pattern instead (it offers "Archive instead").

**A prompt raised by what the user is typing** (e.g. the note editor's "remove the link too?") passes `focusDelayMs` (and optionally `isStale`): the dialog shows at once but takes no focus and ignores Ctrl+Enter for that long, so a stray Enter can't answer it; if `isStale()` is true when the delay ends it closes itself as cancel.

### Toasts — `showToast()`, one `ToastHost` (suite-wide pattern, adopted 2026-10-01)

**To tell the user something happened, with an optional quick follow-on action, use `showToast({ message, detail?, actions?, durationMs? })`** (`src/components/Toast/showToast.ts`). Example: "Completed “X” · + Follow-up · Undo". `<ToastHost />` is mounted once in `App.tsx` (a pattern test checks this).
- A toast is **non-blocking and dismisses itself** (7 s by default, held open while hovered).
- One at a time: a new toast replaces the current one.
- It's portaled at z-index 1050 (above every modal/pane tier, below the confirm dialog).
- It's deliberately **not** in the Escape stack: nothing is waiting on it.
- **Use it for** results the user may want to act on right away (Undo, a natural next step).
- **Don't use it for** anything that needs an answer (that's `confirmDialog`/`choiceDialog`) or errors the user must see (`alertDialog`).
- Before this there was no toast anywhere, so there is nothing to retrofit.

### Notifications — one set of rules, `services/notifications/plan.ts` (adopted 2026-10-06)

**When and what something notifies is decided in `planNotifications()` (`services/notifications/plan.ts`) and nowhere else.** The desktop/web poller (`hooks/useNotificationChecker.ts`) fires what it says is due now; the Android scheduler (`services/notifications/androidScheduler.ts`) books what it says is due in the next 14 days. A new notifying kind, a lead-time rule or a skip condition (archived, task done, `doneDates`) goes into `plan.ts` with a case in `plan.test.ts`. Both platforms then follow it. **Acting on a notification** goes through `services/notifications/actions.ts`, shared by the bell and the Android buttons; a new action goes there, never in `NotificationCenter`. The actions, re-specced with the user 2026-10-06 (full table: `docs/android/05-notifications.md` "Notification actions"):
- **Got it** (and the card's ✕): "I've noted it". A Reminder occurrence becomes done (`doneDates`, struck out). An Event or Deadline occurrence is only acknowledged (`seenDates`), because the event still happens and the deadline is still due. Either way it is synced and never notifies again on any device.
- **Done** (Deadlines only): the work is done (`doneDates`); a task's deadline completes the task.
- **Snooze** (presets, or "in N minutes/hours"): `remindAt` + `remindOccurrence`. It covers **that one occurrence only**; the series' other dates still notify.
- **Postpone**: *moves* the occurrence (Tomorrow / Next week / a date and time). A repeating item moves just that date, as a linked copy (see "Repeating series"). An event keeps its length; a task deadline moves the task's deadline.
- **Archive**: that occurrence (a repeating item: just that date, as a linked copy), or the whole series when its checkbox (off by default) is ticked; Undo in the toast.
- **Open**: that occurrence in the calendar.
- **Clear all** empties this device's bell only. Every per-item action above is synced.

The checker drops a bell card whose occurrence was done or seen elsewhere (`isStale`).

**Why:** before this, the rules lived inside the desktop poller. When Deadlines became their own kind (2026-09-27), nobody added them there, so no Deadline notified anywhere for nine days. Repeating items also only ever notified for their first date.

### Task completion — `toggleTaskCompletion()` (adopted 2026-10-01)

**Every UI path that completes or reopens a task calls `toggleTaskCompletion(taskId)`** (`services/taskCompletion.ts`): the checkbox, swipe, pane footers (task and calendar), sub-task rows and notifications. Never call `toggleTaskWithLists` or the store's `toggleTask` from a component. The service is where "it's still waiting on other tasks" is asked and the Completed toast is shown, so a component that skips it silently loses both. A pattern test fails on a direct call under `src/components/`.
- **Hovering Complete** offers the alternatives up front (`taskCompletionOptions(taskId)` → `HoverOptions`, on the TaskItem checkbox and every pane footer's Complete via `ItemActionFooter`'s `completeOptions`): *Complete + add follow-up*, *Complete, with the N it's waiting on* (only when blocked), *Add a follow-up (keep this open)*. They are `toggleTaskCompletion(taskId, { thenFollowUp | withBlockers })` / `showAddFollowUp` — add a new completion variant there, not in a component. Desktop only (no hover on Android).
- Exception: `taskListLinks.toggleChecklistItemWithTasks` (ticking the last checklist item) completes the linked task through `toggleTaskWithLists`, after its own confirm. It doesn't ask about blockers or show the toast (BACKLOG.md).

### Pickers suggest by keywords — `utils/suggestRank.ts` (suite-wide pattern, adopted 2026-10-01)

**Every "link a …" picker orders its list the same way**, so linking feels identical whatever you're linking to. The pattern came from `NotePickerModal`; the user asked for it to be applied everywhere.
- **Empty search box**: suggestions from the item being linked *from* (`suggestFrom`, its title), under a "Suggested from “…”" label. The title is reduced to keywords (`extractKeywords`, stop-words dropped, `stemForMatch`). Each keyword is looked for in every candidate's weighted fields (title 3, a container's name 2, body text 1 with log-capped hit counts), and rarer keywords count for more (idf). The rest follows under "Recent", most recent first.
- **Typed search**: every word must match some field, ranked by the fields hit.
- **Use `rankSuggestions` / `rankSearch` (`src/utils/suggestRank.ts`)** with the picker's own fields. `NotePickerModal` keeps its tab-aware original of the same scoring, since it also picks the best tab.
- **Every place that opens a picker passes `suggestFrom`.** Two pattern tests check both halves.
- **Applied to**: `NotePickerModal`, `TaskPickerModal` (title, Endeavour, parent, notes), `ListPickerModal` (name, description, item titles; checklists ahead in the recent tail).

### Row options menu (`RowOptionsMenu`) — suite-wide pattern, adopted 2026-09-24, changed 2026-10-05

Every nav-column row with per-row actions (edit/delete/…) uses **`<RowOptionsMenu rowRef={rowRef} title={name} icon={…}>`** (`src/components/RowHoverActions/RowOptionsMenu.tsx`), with `RowAction` children. It goes **as the row's first direct child, in place of the row's leading icon** (the icon is passed as `icon`). Never grow buttons inline in the row on hover: the old per-site convention (`opacity: 0 → 1` on `:hover`, actions eating into the row's width) was hand-rolled at 4-5 sites and easy to mis-click.

**How it behaves:**
- The slot is a fixed 22px icon slot at the start of every row. A row without an icon still gets the (empty) slot, so its title moves right and every title in a column lines up.
- While the row is hovered, the icon becomes a "⋯".
- Hovering the "⋯" (150 ms) or clicking it drops the actions down as a single column of 22px icon buttons centred under it. That column is no wider than the slot, so it covers only the icon slots of the rows below, never a row's title. It opens upwards when there's no room below.

**History and why:**
- 2026-09-24: the actions floated below the row whenever the row was hovered.
- 2026-10-05: they moved to a "⋯" at the row's right end, expanding to the right.
- Later the same day, at the user's request: the "⋯" moved to the left, in place of the icon, as a dropdown.

The user's rules: **hovering a row must never open its actions, only the "⋯" does, and the menu must not cover any title text.** One known exception: a section heading directly below a row (e.g. Manage's "LISTS") starts in the icon column, so the dropdown covers its first letter or two.

**Pieces** (`src/components/RowHoverActions/`):
- **`RowOptionsMenu`**: the slot, the "⋯", the hook and the menu. The site supplies `rowRef` (for the Android long-press), `title`, `icon` and the actions.
- **`useRowHoverActions<T>({ longPressRef? })`**: the open/close state machine shared with `HoverOptions`. Opening is delayed 150 ms; closing is delayed 250 ms so the mouse can cross into the portaled menu. It also returns `openNow` for a click.
- **`RowHoverActionsMenu`**: the floating panel, portaled to `document.body` (escapes a narrow column or an ancestor transform, same as `TruncatedText`), positioned from the anchor's `getBoundingClientRect()` in an effect. `align='dropdown'` is the row options placement. `'start'`/`'end'` (below the anchor, else above) belong to `HoverOptions`.

Sites import only `RowOptionsMenu` and `RowAction`. A pattern test fails if anything other than `RowOptionsMenu` and `HoverOptions` uses the hook or the menu directly. **Layout at a site:** the slot sits where the icon used to, so the row's own left padding has to provide the inset the icon used to get from its button's padding (`RecordsView`'s `.trackerItem`, `OverviewSection`'s `.navItem`, `Sidebar`'s `.row`).

**A row holds a `useRef`, and hooks run once per row *instance*,** so every row that used to be inline JSX inside a `.map()` is its own small component: `SidebarCollectionRow`/`SidebarTagRow`/`SidebarPurposeRow`, `SidebarListItem`, `TrackerSidebarRow`, `ManageRow`, `SavedRow`. `ChronicleView`'s tree node already was one.

**Applied to all 7 nav-column row sites** (the icon each takes over in brackets): `ChronicleView` (notebook tree: the notebook icon), `Sidebar` (Endeavours/Tags/Purposes: the colour dot), `ManagePane` (`ManageRow`: the colour dot, or nothing), `ListsSection` (sidebar: the list's emoji), `RecordsView` (tracker/routine sidebar: the colour dot, or nothing), `OverviewSection` (saved Overviews: the Overview's icon). Two kinds of row are deliberately **not** converted, because neither is a nav-column row: `ListsSection`'s `.itemCard` actions (list items in the main content area) and `NoteList`'s note rows (their inline `.noteActions`).

**Touch (Android, decision D1, 2026-10-04):** the slot shows the icon and no "⋯" (tapping the icon does nothing, so tap the row's name to select it). A long-press on `rowRef` (`useLongPress`) opens the same children in a `BottomSheet` titled with `title`. **Every child is a `RowAction`** (`RowAction.tsx`: `icon`, `label` from `LABELS`, `onClick`, `className` for the desktop button, `destructive`):
- On desktop it is the icon button, with `label` as its tooltip.
- In the sheet it reads a context (`rowActionsContext.ts`) and renders as a labelled `ActionSheetButton` that closes the sheet before acting.
- `RowAction` always stops propagation, because React bubbles a portal's clicks into the row.

A raw `<button>` inside a `RowOptionsMenu`/`RowHoverActionsMenu` is a pattern-test failure. `HoverOptions` is exempt: its options are already text, and on Android it opens an `ActionSheet`.

### Bottom sheets and touch gestures (Android) — adopted 2026-10-04

Phone UI is built from shared primitives (`docs/android/11-design-and-coding-patterns.md` §5, §7, §9); never copy sheet or gesture code into a component again.
- **`BottomSheet`** (`components/BottomSheet/`): every phone sheet. Mount it only while open. It registers `useEscapeClose` (so Escape and the Android back button close it), closes on a backdrop tap or a drag down on the grabber, is portaled at z-index 1020 (above panes and modals, below the toast and the confirm dialog), and stops React events from bubbling out of the portal into the row that rendered it. A backdrop tap closes only if the press also *started* on the backdrop, so the release of the long-press that opened it can't close it. A component with a `'sheet'` variant (the filter pickers) lets the sheet own the Escape registration rather than registering twice. Pattern test: no `.sheetOverlay`/`.sheetPanel` class outside the component.
- **`ActionSheet`** (`components/ActionSheet/`): a `BottomSheet` of `{ label, icon?, onSelect, destructive? }`. This is what a long-press opens ("more for this item"); choosing closes the sheet, then runs the action.
- **`useLongPress(ref, onLongPress, enabled)`** (`hooks/useLongPress.ts`): 450 ms still hold, cancelled by more than 10px of movement (so scrolling never triggers it), `hapticMedium()`, swallows the click the release produces, cancels Android's own long-press menu. Pass `enabled = isAndroid`.
- **`useSwipeRow(ref, { enabled, onSwipeRight?, leftRevealPx? })`** (`hooks/useSwipeRow.ts`): returns `{ offsetX, dragging, revealed, close }`; the row renders its own actions behind itself. Native non-passive `touchmove` (React's is passive), axis lock `|dx| > 2·|dy|` after 8px, touches starting within 24px of a screen edge ignored (system back).
- **Swipe-left / action-sheet deletes act at once with an Undo toast** (D2) through `services/undoableActions.ts`; pane footers keep `ItemActionDialog`; irreversible actions always confirm.
- **Anything on a hover must also work without one.** Use `@media (hover: hover)` for CSS `:hover` that *opens* something: on a touch screen `:hover` sticks to the last tapped spot (found 2026-10-04: the + speed dial stayed open over the task list).
- **Bottom chrome publishes its height**: `--mobile-nav-h` (MobileNav's CSS) and `--quick-add-h` (measured by MobileQuickAddBar while shown). Anything that must sit above the bars (the toast) offsets by them.

### Right-click menus (`src/contextMenu/`) — suite-wide pattern, adopted 2026-10-06

**What a right-click shows is decided entirely by where it lands**: the section, then every *scope* between the clicked element and the page. The user's brief: flexibility and future-proofing come first. So the menu is plain data, assembled at click time from declarations, and no component builds a menu or listens for `contextmenu` itself (pattern test).

**The model** (`src/contextMenu/types.ts`):
- **`ContextMenuItem`**: `{ id, label, icon?, shortcut?, disabled?, destructive?, run?, submenu? }`. `submenu` is sections of items. A section is an array of items; the menu draws dividers between sections.
- **Scope**: what an element declares about itself with **`useContextMenuScope(ref | element, () => ({ kind, data?, items?, propagate? }))`**. `kind` is what providers attach to; `data` is what they need (an id, an API object); `items` are the element's own entries. Called at right-click time, so it always sees current state.
- **Provider**: **`registerContextMenuProvider({ id, kind, order?, when?, items })`** (`registry.ts`). It adds one section to every scope of one kind, from anywhere, so a feature extends an existing place without touching it. Keyed by id, so re-registering (HMR) replaces it.
- **Resolution** (`resolveContextMenu`), walking the scopes innermost first:
  - Each scope contributes its own `items` (order 0), then its providers' sections in `order` (default 100).
  - The first scope that contributes anything ends the walk, unless it sets `propagate: true`.
  - After the declared scopes come two implicit ones, `section` (data: the `AppView`) and `app`, for section-wide and app-wide menus.
  - **Nothing contributed = no custom menu: the browser's own shows.**

**Host and menu:**
- **`ContextMenuHost`** (`components/ContextMenu/`, mounted once in App.tsx) is THE one `contextmenu` listener.
- It leaves the browser's menu alone for:
  - **Shift+right-click**, anywhere: the way back to spellcheck, as agreed with the user.
  - Text inputs and textareas.
  - Android, where long-press already opens the row sheet or the system text menu.
- The keyboard's Menu key opens the menu under the focused element.
- **`ContextMenu`** renders sections and submenus as stacked panels, z-index 1080. It **never takes focus**: presses on it are `preventDefault`-ed, so the note editor keeps its selection, and Cut/Copy (`execCommand`) act on it.
- Keyboard: arrows, Home/End, Enter, → / ← for submenus, all caught on the document in the capture phase while it is open. Escape goes through `useEscapeClose`, one registration per panel, so it closes the innermost submenu first.
- It closes on a press outside it, a scroll, a resize or the window losing focus. Choosing an item closes the menu, then runs the item.

**Where it's used today:**
- **`row`** — every `RowOptionsMenu`: the row's `RowAction` children become its right-click items (`rowActionItems`), so a row declares its actions once for the ⋯ dropdown, the Android sheet and the right-click menu.
- **`note-row`** — `NoteList` rows: Open, Edit details, make sub-note / move up a level, Delete.
- **`note-editor`** — the editing surface (`EditorContent`'s `innerRef`); its data is `NoteEditorMenuApi`. Providers in `components/NoteEditor/contextMenu.ts`:
  - Cut / Copy / Paste / Paste as plain text.
  - Link… / Create from selection….
  - Style ▸ (Title, Heading 1–5, Normal text).
  - Select all.
  - Paste from the menu reads the clipboard (`navigator.clipboard`), which needs the browser's permission; a refusal explains Ctrl+V / Ctrl+Shift+V.

**Adding to it:**
- A new place: call `useContextMenuScope` with a new `kind`.
- New entries for an existing place: register a provider for that kind.
- A new item behaviour (a checkbox, a radio group, an item visible only with a modifier): add a field to `ContextMenuItem` and handle it in `ContextMenu`.
- **Never** add an `onContextMenu` or a `contextmenu` listener anywhere else.
- **An action that also has a hotkey** is one function both call. `FloatingToolbar` exposes `openLinkInput` / `openCreateMenu` through `actionsRef` for this; never synthesise a keystroke.
- Item labels come from `LABELS.contextMenu`.

### Creation panes: the "what are you creating?" switcher (`CreateKindSwitcher`) — adopted 2026-10-05

A creation pane opens with a strip of every kind of thing its section can create, the open one highlighted. Notes shows Note / Notebook / Tag. Choosing another kind closes this pane and opens that kind's pane, **keeping what was typed**: the text travels in `uiStore.createDraft` and the next pane's lazy `useState` reads it as its starting name/title; `closeModal` clears it.
- **The registry is `config/createKinds.ts` (`CREATE_KINDS`)**: `{ id, section, label (LABELS.createKinds), icon, open }`. `open` uses the section's current context, as the rest of the app does: a notebook from Notes goes inside the selected notebook.
- **Adding a creatable thing** means one entry there, plus `<CreateKindSwitcher current="<id>" draft={…} />` as the first child of its pane's `.modal`, plus reading `createDraft` in its first text field's initial state. The switcher renders nothing for a section with one kind.
- **A pane that serves two kinds through uiStore state** must be keyed by that state at its mount, so switching remounts it with fresh state: `AddNoteTagModal`, keyed by `pendingNoteTagKind`.
- **Pattern test:** every `CREATE_KINDS` id must be named by some pane that renders the switcher.
- **Applied to:** Notes (`AddNoteModal`, `AddNoteTagModal` for notebooks and annotation tags). Other sections' panes are in BACKLOG.md's Pattern retrofit backlog.
- **Android:** the chips are ordinary tap targets.

### Inline objects in notes (`\`) and how linked text is drawn — adopted 2026-10-06

Typing `\` in the Notes editor creates an item (a Reminder, Event or Deadline today) from what's typed next, and links the note text to it. **The user intends this for almost every kind of thing**, so a new kind plugs into the same machinery, never a parallel one. Everything lives in `src/components/NoteEditor/objects/`. The design was settled with the user over five rounds on 2026-10-06; its history is in the "Inline objects in notes" entry in `docs/features/implemented-features.md`.

**Adding a kind — the checklist** (an Event, Reminder and Deadline each followed it; Deadline was built from it):
1. **A `NoteObjectKind`** in `objects/<name>Kind.ts`. Kinds with the same shape share a factory: `datedKindFactory.ts` makes Reminder and Deadline, which differ only in store action and input builder. Use the factory pattern rather than copying a kind.
2. **Register it** in `NOTE_OBJECT_KINDS` (`kinds.ts`). A pattern test fails on a `*Kind.ts` that isn't registered.
3. **`ARTIFACT_TYPES[targetType]`** (`artifactTypes.ts`), if the target type has none: `summarize`, `subscribe`, and where they apply `toggleDone`, `editWhen`, `flags` and `Body`. A test fails on a kind without one.
4. **The "Linked from" bar** (`store/noteBacklinks.ts`) must list the target type. The all-kinds test fails otherwise; deadlines once weren't listed.
5. **Strings** in `LABELS.noteObjects.<kind>`; the **icon** in `config/itemIcons.ts`.
6. **Tests:** `objects/objects.test.ts` runs every registered kind end to end (`\` → created → linked → drawn → listed in Linked from). Add the kind's own reading of text (cues, defaults) and anything its Body adds.
7. **Docs:** the feature entry, and this section if a rule changed.

**The kind** (`types.ts`, `NoteObjectKind<D>`):
- Identity: `id` (the keyword), `aliases`, `label`, `icon`, `hint`, `targetType`.
- Reading the text: `parse(body, ctx)`, pure.
  - It reuses the app's existing inference (`utils/textToTask.ts`) after `expandShortWeekdays` ("fri 1-2pm"), and tidies the title with `tidyObjectTitle` (a trailing "important" is the flag).
  - **Saying nothing about when means tomorrow at 12:00** (an event 12:00–13:00): `DEFAULT_OBJECT_TIME` / `defaultObjectDate` in `whenInput.ts`. A date alone is a whole day; a time alone is today.
- The preview's editable lines: `fields` / `applyField`, read with `readWhenInput`. Then `validate`.
- Acting:
  - `create(draft, ctx, backLinks)` goes through the same input builder the UI and the agent use (`utils/calendarItemInput.ts`).
  - `discard` is the toast's Undo: delete, and forget the Recycling Bin entry.
  - `openFull` opens the full pane, prefilled. Also `describe` and `linkText`.

**Typing it** (`session.ts`, `NoteObjectTrigger.ts`, `actions.ts`, `NoteObjectMenu.tsx`):
- **The session is derived from the text.** Plugin state holds only where the `\` is, how far the draft reaches, the menu highlight and the field overrides. Don't add state that would have to be kept in step with the text.
  - It starts only when a `\` is *typed* at a line start or after whitespace (never in a word, in code, or from paste).
  - It ends when the cursor leaves the draft, the `\` is deleted, or on Esc, and always leaves the text as typed.
- **Keys**, consumed with `stopPropagation` so the Escape stack and a pane's Ctrl+Enter don't also act:
  - ↑/↓, and Tab picks a kind; Enter picks once something is typed or the arrows were used.
  - Enter creates; Ctrl+Enter opens the full pane via `uiStore.pendingArtifactLink`, exactly like Ctrl+Q; Tab focuses the fields.
  - Esc ends it; `\\` types one backslash.
  - All changes go through `actions.ts`; the menu holds no state of its own.
- **Where it's created** comes from `objectTriggerStorage(editor).getContext` (set by NoteEditor in an effect): the note, its tab, its Endeavour.
- **The note text is the item's title.** Enter replaces what was typed with the title.
  - The full pane's hand-off (`replaceWithTitle`, resolved by `applyResolvedArtifactLink`) puts in the *final* title. It always waits, even with nothing typed.
  - Undo restores the typed words.

**How a link is drawn** — only by `artifactGroups.ts` (`ArtifactLinkGroups`), for `\` and Ctrl+Q links alike. The mark is unstyled data. **Never draw anything per `mark[data-artifact-…]` element in CSS**: ProseMirror splits a mark per paragraph and around other marks, so it would repeat (pattern test). The pieces are grouped into one link (`collectArtifactGroups`) and drawn as **one pane that expands**. It's **visual, not an editing form**: no field labels, each thing click-to-edit where it's shown.
- **Inline:** `[icon KIND ❗] title [date time · ✏️🔁 · state · ↗ ▾]`, sized to its contents. Important sits **before** the title in both views (it changes how much attention the item needs). It's a head widget, the text's inline decorations and a tail widget (`side: 1`) sharing one outline; keep the three at the text's font size so their borders line up.
- **Expanded:** the paragraph holding the link becomes the box (node decoration). `ArtifactBody` sits inside the same paragraph (its own React root, keyed stably, so typing in it never rebuilds it). Four bands:
  - **top bar:** icon, kind, ❗ (Important only — it matters most), title, and ↗ ▴ **right-aligned** (`paneActions`);
  - **second heading line** (`WhenLine`, then the kind's place / Endeavour / notification): everything that's **on**;
  - **content:** notes and links;
  - **bottom bar:** everything that's **off**, greyed.
  - **On → the heading lines, off → the bottom bar, never both.**
- **Clicks**, the same in both views:
  - The title (note text) and the date and time (`editWhen`) highlight under the mouse and edit on a click.
  - ↗ opens.
  - **Done lives in the icon slot.** While the pane is hovered (tracked per link, `data-hover` on every piece) or once done, the kind icon shows as ☐/☑ in the same space. Never put a done box elsewhere.
  - In the expanded view, a click on an active option (❗ in the top bar, ✏️ 🔁 in the second line) removes it. It reappears greyed at the bottom, where a click turns it back on.
  - **Any other click on the heading** expands or collapses: the pieces' background, the box's own empty space (the plugin's `click`, keyed by `data-artifact-key`), and the second line's empty space (`onToggle`).
  - A new control goes through `control()`, or stops its click, so it doesn't also toggle.
- **State** (`ArtifactState`, from `summarize`):
  - **done** (ticked) and **past** (an event that has ended; a repeating one never is) are drawn **faded**, not struck through. That's the practice of calendar and to-do apps, chosen 2026-10-06. Hovering brings it back to full strength.
  - **overdue** (past and not done) stays at full strength, with "Overdue" in the warning colour: it still needs doing.
  - A whole-day item is overdue only after its day.
- **Repeating items** (the user's design, 2026-10-06):
  - The pane shows, and ticks, the **current occurrence**: the first from today on that isn't done (`currentOccurrence`, `calendarItems.ts`). Ticking it moves the pane on to the next, the way a recurring to-do does; the ticked date stays ticked (`doneDates`).
  - The date reads "Tue, Oct 13 ▾". A click drops down the **list of dates** (`OccurrenceList` in `WhenLine.tsx`, from the type's `occurrences`): a few before (faded), the current one (NEXT), the next several. Each can be ticked (`toggleOccurrenceDone`) and opened on its own in the calendar (`openArtifactTarget(type, id, date)`, where the pane offers "only this one / this and following"). At the bottom: the rule ("Every week") and "Open the series".
  - In the inline pane the same date expands the pane with the list open (`occurrenceRequests.ts`).
  - ↗ opens the current occurrence.
- **Removing something that takes data with it asks first.** Turning Repeat off removes every other date of the series, so the flag's `toggle` confirms (`confirmDialog`, destructive) before it acts. The user lost a series to one stray click. Other options toggle at once. A new option that destroys data on removal does the same, inside its own `toggle`, so every place that offers it (heading icon, right-click menu) is covered.
- **A pane's body UI state lives in `paneState.ts` (`usePaneState`), never in plain `useState`**. That covers the list of dates being open and half-typed notes, links or place.
  - ProseMirror matches widgets one step at a time, so replacing the heading widget just before the body (its date changed) builds the body again, and component state would be lost: the list closed under the click that ticked a date.
  - The state is keyed per pane and cleared when it collapses. Don't try to keep the old DOM element instead: tried, and ProseMirror detaches it.
- **Options** (Important, Tentative, Repeat) come from **one list per kind**: `flags(id)` → `ArtifactFlag[]` (`flags.ts`). It feeds the heading icons (on), the greyed bottom-bar options (off; Repeat asks how often) and the right-click menu (`flagMenuItems`). A new option is one entry in the list.
- **Notifications:** an opt-in one (an event's) is a greyed "Notify me" while off. One the calendar always sends (a deadline's, a whole-day reminder's) is shown as its setting chip, never as off (`NotifyChips.tsx`).
- **A kind's `Body`** maps its fields onto the shared `ObjectBody`:
  - for the second line: `heading` (from `WhenLine`), place, Endeavour, `extra` (active chips);
  - for the content: notes and links;
  - for the bottom bar: the off `flags` plus `offExtra`.
  - `onToggle` lets its empty space collapse the pane.
- **Editing the title as text:**
  - The mark is inclusive, so typing at a title's end extends it. The plugin's `appendTransaction` drops the mark from stored marks on any line that doesn't hold it (Enter after a title starts plain text).
  - Home/End on an expanded heading are handled by `paneLineKeys`, because the body box confuses the browser's own.
  - A commit that clears stored marks must do so *after* its last step.
- Which view is the mark's `display` attribute. Live data is redrawn on store changes and every minute. Task completion goes through `toggleTaskCompletion`.

**Also:**
- **One icon per item kind, from `config/itemIcons.ts`** (`ITEM_TYPE_ICON`, `ITEM_FLAG_ICON`), wherever a link, backlink, Overview row or calendar entry shows one. Deadline is 🏁: ⏳ is a waiting task, 🚩 reads as flagged, ❗ is important. Never spell an item kind's icon out in a component (pattern test).
- **Right-click on a link:** the `note-editor.artifact-link` provider (`objects/contextMenu.ts`): Open, details, done, the kind's options, Unlink.
- **Android:** the editor toolbar's `\` button (`insertObjectTrigger`) is the touch path (gap F11).

### Note blocks (`\timeline`) — the other half of `\`, adopted 2026-10-06

`\` makes two families of thing, offered in one menu under two headings ("Create and link", "Add to the note"):
- **Objects** (above) are items that live elsewhere in the app, linked from the text.
- **Note blocks** are note-taking structures that live in the note itself and nowhere else: the timeline (`\timeline`), and, all 2026-10-07, the quote (`\quote`), the cycle (`\cycle`), the breakdown (`\breakdown`: a whole and the parts it's made of), the hierarchy (`\hierarchy`: ranks inside ranks, e.g. a taxonomy, with named levels), the pyramid (`\pyramid`: layers, top first) and the chart (`\chart`, see \"Charts\" below).

The user asked for this as a pattern, so each new block plugs into the same machinery.

**Adding a block — the checklist:**
1. **Its node(s)** in `extensions/<Name>.ts`, registered in `NoteEditor`'s `extensions`. Use `parseHTML`/`renderHTML` on `data-*` attributes, so copy and paste round-trip; notes are stored as Tiptap JSON. Put the keys and decorations in a separate `Extension` with `priority` above 100: a higher-priority *node* moves up the schema, and the first `block` node is what ProseMirror fills empty content with. That must stay the paragraph.
2. **A `NoteBlockKind`** (`objects/types.ts`) in `objects/<name>Block.ts`: `{ family: 'block', id, aliases, label, icon, hint, insert(view, from, to) }`. `insert` replaces the typed `\…` (and the space before it) with the block, cursor inside it. An empty line becomes the block; otherwise the block goes after the line, or after the nearest container that can hold it.
3. **Register it** in `NOTE_BLOCK_KINDS` (`objects/blockKinds.ts`). A pattern test fails on a `*Block.ts` that isn't registered.
4. **Strings** in `LABELS.noteBlocks.<block>`.
5. **Tests** beside the node (`extensions/Timeline.test.ts` is the template): insertion through `\`, its keys, and a JSON + HTML round trip.

**How picking one works** (`kinds.ts`, `NoteObjectTrigger.ts`, `actions.ts`):
- A block has no draft and no preview. Picking it (Tab or Enter in the menu, a click, or **its keyword then a space**: `\tl `) inserts it, and the writing happens in the block.
- `interpretQuery` never composes a block; `chosenKind` resolves a keyword across both families.

**Design rules for a block:**
- **Keyboard-first, list-like.** Enter moves forward through the block's parts, an empty part leaves, and Backspace steps back rather than merging two parts. The timeline: Enter in a When goes to the text; Enter on an empty last line starts the next entry; Enter on an entry that's still empty leaves the timeline.
- **Every hover affordance shows on touch.** Use `@media (hover: none)`; the timeline's "+ Add entry" is always visible there.
- **Every block offers several designs: see "Block designs" below.** Never a different node per look.
- **A block's settings** (style, order, which fields show) are a small pill at its top right, shown on hover, while editing in it and always on touch, **and** the same choices in its right-click menu (a `note-editor` provider: `extensions/timelineMenu.ts`, `quoteMenu.ts`). Both call one function per setting (`setTimelineSettings`, `setQuoteVariant`, `toggleQuoteField`). The pill element carries `data-block-tools`, which holds the shared look; a block's own attribute (`data-timeline-tools`, `data-quote-tools`) only places it. Settings live on the block, not in Settings: the choice is made where you're looking at it.
- **Optional fields** (the quote's Who/Role/Source/When/Where/Link) are child nodes present only while shown. Hiding one keeps its text in the block's `hidden` attribute, and showing it again restores it. An empty field shows only while the block is being edited.
- **Reordering happens when the cursor leaves a part, never under it** (the timeline sorts by its Whens in `appendTransaction`, `sortOnLeave`). The part the cursor moves into stays where it is, and the part that moved flashes in its new place. How a When is read as a date is `utils/timelineWhen.ts` (pure, tested); a new format goes there with a test.
- **Placeholders use their own attribute** (`data-tl-placeholder`), never `data-placeholder`, which the editor-wide Placeholder extension also writes.

### Block designs — every note block comes in several designs (suite pattern, named and adopted 2026-10-07)

**"Block designs"** is the name for this pattern: one block, several ways of drawing the same content, switched freely. The timeline (Vertical, Horizontal), quote (Classic, Card, Pull quote) and cycle (Ring, Flow, Steps) all follow it. The user asked for it to be a global pattern with a name, and in the backlog, "so we always know how to develop these". The how-to and ideas are in BACKLOG.md "Block designs".
- **A design is a value of the block's `variant` attribute plus its CSS under `[data-variant="…"]`.** The content never changes, so switching is always safe and loses nothing. Anything a design needs that the content doesn't hold is computed in decorations (e.g. the ring's stage positions, a stage's colour), never stored.
- **The list is a `<BLOCK>_DESIGNS: BlockDesign<V>[]`** in the block's extension: `{ id, label (LABELS), icon (a 16×16 line drawing) }`. Every block uses the shared half in `extensions/blockDesigns.ts`:
  - `blockPill(attr)`: the settings pill at the top right, shown on hover, while editing and always on touch;
  - `designButtons(designs, current, pick)`: the design row in the pill;
  - `designMenuItem(…)`: Design ▸ in the block's right-click menu;
  - `pillButton`, for the block's other settings;
  - `openBlockPopover(anchor, build)`: a small popover for a part of the block (a cycle's arrow or icon), closed by Escape through `registerEscapeClose`.
- **Every block can be selected whole** (to cut, copy or delete it): its root node's name is in `NOTE_BLOCK_NODES` and its root renders `data-note-block`. Its pill ends with `selectButton(view, getPos)`; right-click offers Select whole block; and **Esc inside a block selects it** (`NoteBlockSelect`, below the default priority so a `\` session sees Esc first; Esc again goes on to whatever is around the editor). A selected block is outlined, and the selection toolbar stays hidden for it.
- **Every block can be deleted whole** (`deleteBlock`): Delete block in its right-click menu, and a trash button in its pill that shows only while the block is selected (`selectButton` returns Select and Delete together). **Ctrl+Alt+click** anywhere in a block selects it.
- **Parts of a block can be picked** (`extensions/blockPicks.ts`, `NoteBlockPicks`): **Ctrl+click** a part (a timeline entry, quote field, cycle stage, breakdown part, hierarchy item, pyramid layer) to add it to or take it out of the picked set; Delete/Backspace, Ctrl+C and Ctrl+X act on the picked parts together; Esc, a plain click or any edit clears them. A block's part type is one entry in `BLOCK_PART_NODES` — **a new block with parts adds its entry there.** Deleting never leaves a block invalid: the block's own schema (`validContent`) decides, so picking every part deletes the block and leaving too few (a cycle's two stages) is refused with a message. The picks are positions in plugin state, never stored.
- **Every block can be framed:** Outline and Shade (`blockFrameAttributes()` spread into its attributes, `frameButtons` in its pill, `frameMenuItem` in its right-click menu). One default look each, drawn outside the block's own box (an outline at an offset and a shadow spread to the same distance), so no design's layout moves when it's framed. Colour choices for frames are not built.
- **A block's widget layout is fitted to the real DOM after each render when it must touch other parts** (the cycle's ring arcs end at the measured cards, `RingLayout`), not guessed from fixed sizes.
- **Pattern test:** every `objects/*Block.ts` block's extension must define `_DESIGNS: BlockDesign<…>`, use `designButtons` from `./blockDesigns`, have `selectButton(view, getPos)` and `data-note-block`, and offer frames (`...blockFrameAttributes()`, `frameButtons`).
- **A design is designed for both themes** (tokens, plus accent colours that read on both), keeps every part editable in place, and has a touch path: the pill shows on touch, and parts open on tap.
- **Adding a design to an existing block:** a value in its `*_VARIANTS`, an entry in its `*_DESIGNS` (label + icon), its CSS block, and a test that switching to it round-trips. **Adding a block:** the Note blocks checklist above, with at least two designs from the start.

### Annotations: the Glossary, linked terms and Important (adopted 2026-10-07)

Passages of a note can be marked as more than text. Definitions, Concepts and Acronyms are **records** (structured tag entries) that form one **Glossary** across all notes. Other text can be **linked to a term**, and passages can be **Important** at three levels and put on a **review list**. Detail: "The Glossary…" and "Important, built out…" in `docs/features/implemented-features.md`.
- **`\` on a selection opens the selection menu** (`objects/SelectionMenu.tsx`; caught on keydown *and* in `handleTextInput`, because a selection across paragraphs never reaches `handleTextInput`). A new way to mark selected text is one entry in its items, plus the same choice in the right-click menu (`extensions/annotationMenu.ts`). While it's open, the editor forwards keys to it (`selectionMenuKey`), so fast typing never replaces the selection.
- **The Glossary types are `GLOSSARY_TYPES`** (`config/structuredTagTypes.ts`); `glossaryMeaning` reads an entry's meaning. Read entries through `services/glossary.ts` (views, so encrypted ones show only while unlocked).
- **Linked text (`conceptRef` mark) is drawn once per run** by `extensions/ConceptRef.ts`: a highlight on the text, and the brace and label in a layer beside the editor. Never with CSS per mark element (it repeats per line; pattern test).
- **Important's state lives on its mark** (`NoteTagMark`: `level`, `passageId`, `reviewDue`, `reviewStep`), so it syncs and encrypts with the note. Change it through `extensions/Importance.ts` (`setImportance` keeps the passage id and schedule), never by setting the mark directly. Ctrl+1 steps through the levels and then off.
- **Linking to the Glossary as you type** (`extensions/GlossaryAutolink.ts`): when the word just typed is a Glossary term (plurals too), a chip offers the link. Enter/Tab links it (its own undo step), anything else leaves it, and Backspace straight after takes the link off. **Offered once per note per term**: not where the note already links it, and not again in a note where it was passed over this session. Never in code, an existing link, or the term's own definition. Hovering linked text shows its card, with a way to the definition (`ConceptMarginView`). A new place that should offer links reuses `findSuggestion`.
- **Opening a note at a passage** goes through `services/notePassage.ts` `openNotePassage(noteId, { mark, attr, value })`: it finds the tab, opens the note there and NoteEditor selects the passage (`uiStore.requestedNotePassage`).
- **Changing a note's content from outside the editor** (Review rescheduling a passage, and any future such change) must check `liveNoteEditorFor(noteId, tabId)` (`services/liveNoteEditor.ts`) and go through that view's transaction when the text is open. Otherwise the editor's next save writes its copy back over the change. `crossAppLinkCleanup.ts` predates this rule (BACKLOG.md retrofit).

### Special characters — `//name`, in every text field (adopted 2026-10-08)

**Typing `//` and a name puts in a character, the same way in every text field of the app** (the user: Greek letters first, other characters later, and the same everywhere). `//alpha` → α, `//Delta` → Δ (a capital first letter gives the capital), `//` alone lists the alphabet; ↑↓ choose, Enter or Tab puts it in, a full name and a space does it at once, Esc keeps the text. `//` only starts at the start of a word, so `https://` never does; `\\` was taken (it types a backslash) and `\` makes blocks.
- **The table is `src/specialChars/charSets.ts`**, with the pure rules (`findCharTrigger`, `matchChars`, `exactChar`). A new set (arrows, maths) is entries there with its own `set`; nothing else lists characters by name (pattern test).
- **Ordinary fields need nothing**: `installSpecialCharInput()` (`fieldInput.ts`, run once from App.tsx) listens on the document for every `<input>` (text-like types) and `<textarea>`, and replaces text with `setRangeText` plus an `input` event, so React's `onChange` sees it. Its keys are caught on `window` in the capture phase while the list is up, so Esc, Enter and Ctrl+Enter don't also reach the Escape stack, a form or a pane.
- **A rich-text editor is not an ordinary field**: the note editor has `extensions/SpecialCharInput.ts`, the same rules through ProseMirror. Any new rich-text editor adds that extension.
- The list (`charPicker.ts`) is one floating element for the app, never focused, at z-index 1200.
- No library: none does in-app text expansion for web fields; Tiptap's Typography extension covers arrows and © only, and OS tools (a Greek keyboard layout, Espanso) live outside the app.

### Charts — one neutral description, one adapter (adopted 2026-10-07)

**A chart anywhere in the suite is a `ChartSpec` (`src/charts/chartSpec.ts`) drawn through `src/charts/chartAdapter.ts`.** The user chose the simplest library (Chart.js) on the condition that it stays swappable, with a spreadsheet-like app possibly to come.
- **Stored data is only ever a `ChartSpec`**: title, axis titles, labels, series of numbers, stacking, options. Never a library's own config. A chart's *type* is held beside it (the note block's `variant`), so switching type loses nothing.
- **Only `chartAdapter.ts` imports the library**, and only with `import type` plus the dynamic `import('chart.js/auto')` in `drawChart`, so the library is its own chunk and loads the first time a chart is shown. A new chart type, or a change of library, is a change there (and in `CHART_KINDS`), never in stored notes or in the components.
- **Data in**: typed into the table (`parseNumber` reads "1,234", "$12", "45%", "(30)"), or pasted: a spreadsheet copy (tabs) or CSV/semicolons, headings detected (`parseDelimited` → `tableToChart`). A new way to get data in produces a `ChartSpec` through these, never its own parser.
- **Derived data** (100% shares, waterfall steps) is computed from the spec when drawing (`toPercentages`, `waterfallSteps`), never stored.
- Chart colours come from the theme tokens (`readChartTheme`), and a chart redraws when the theme changes.
- **Showing and editing a chart is `ChartWidget` (`src/charts/ChartWidget.ts`), for every app.** It owns the drawing, the data table and the paste box, and reports changes through `onCommit(spec)`; the host only stores the spec and adds its own chrome. The note block (`NoteEditor/extensions/Chart.ts`) is one host: its pill, frames and selection around the widget. The user plans charts in Records next: that is a second host (a small React wrapper that mounts the widget and saves to the tracker), never a copy of the table. Chart strings are `LABELS.charts`; only the note block's own are in `LABELS.noteBlocks.chart`.
- **The one exception**: Portfolio's ticker chart (`WatchlistView/TickerChart.tsx`) uses `lightweight-charts` for candlesticks and live price scales, which a ChartSpec doesn't describe.

### Repeating series — a date taken out stays linked (adopted 2026-10-06)

Calendar items (events, reminders, deadlines) follow the iCalendar model: a changed occurrence is still **part of its series**.
- "Edit only this one" (`detach…Occurrence`) and "Edit this and following" (`split…Series`) create an item with `seriesId` (the series) and `seriesDate` (the occurrence it stands in for). It **keeps `crossAppRefs`** (the note it was made from) and that date's done mark; it drops external-sync provenance.
- **The rules live in `services/calendarSeries.ts`**, for every pane: `changedDatesOf`, `unlinkFromSeries`, and `afterSeriesDeleted`. Deleting a series asks whether its changed dates go too; kept ones are unlinked, so nothing points at a deleted series.
- **UI:**
  - The calendar panes show `SeriesLinkBar` ("Part of a repeating series — stands in for its …", Open the series, Unlink).
  - The note pane's list of dates shows a changed one at the date it replaces, marked "changed", opening the separate item.
- **A new way to take a date out of a series** goes through the store's detach/split actions (never builds a copy itself), so the link is always set. The same holds for a new place that deletes a series: call `afterSeriesDeleted`.

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

**Every `HotkeyDef` names its touch path** in `touch` (required; decision D13): how to do the same thing on a phone, or `'n/a: <why>'`. A new hotkey fills it in the same change; a pattern test fails on one without it.

**Adding a new hotkey handled centrally in `App.tsx`** (i.e. anything that belongs in step 2's first case above): give its `HotkeyDef` a unique, permanent `id` and `customizable: true` if it's a plain global toggle/navigation-style action reassignable without side effects, then dispatch it via `matchesHotkeyId(e, 'your-id')` (`src/store/hotkeyOverridesStore.ts`) instead of a hardcoded `e.key === '...'` check — this is what makes it show up with a click-to-rebind affordance in Settings. A component-local hotkey (step 2's second case) is currently **not** wired to read overrides at all — see "Customizable hotkeys" in the Implemented features list for why that's a deliberate scope decision, not an oversight. Mark a hotkey `protected: true` (no `customizable`) instead if it must never be reassigned (only `Esc` today).

### Current hotkeys

| Primary | Secondary | Action |
|---------|-----------|--------|
| `0` | — | Overview section (`nav-overview`, customizable) |
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
| `Ctrl+Shift+R` | — | Open/close the Recycling Bin (`action-recycling-bin`, customizable) |
| `Esc` | — | Close panel / modal |
| `E` | `Ctrl+E` | Expand the Endeavour filter (header) — Tasks/Calendar/Records/Notes only |
| `0`-`9` | — | While the Endeavour filter is expanded: select an Endeavour by its position (0 = All) |
| `P` | `Ctrl+P` | Expand the Purpose filter (header) — Tasks section only |
| `M` | `Ctrl+M` | Open/close the Manage view (Endeavours / Purposes / Tags) |
| `Alt+Left` | `Backspace` | Go back one stop in history (a note, or a section where you were in it) — `uiStore.navHistory`/`navigateBack()` |
| `Alt+Right` | — | Go forward one stop, after going back — `uiStore.navForward`/`navigateForward()` |
| `//` | — | Any text field: a Greek letter by name — `//alpha` → α, `//Delta` → Δ, `//` alone lists them; ↑↓, Enter/Tab, or the whole name and a space; Esc keeps the text (`special-chars`; src/specialChars/) |
| `Alt+N` | — | The history browser: a carousel of where you've been; scroll / ←→ / swipe to move, Enter or a click to go there, Esc closes (`action-history`, customizable; touch: More → History) |
| `Ctrl+G` | — | Open/close Quick Access — search or browse recent/frequent items across Notes, Notebooks, Tasks, Lists, Endeavours, Trackers, Routines, Schedules |
| `Ctrl+D` | — | Dictate into the focused text field; press again (or plain `Enter`) to finish, `Esc` cancels (`action-dictate`, customizable; handled before the `isTyping` guard in `App.tsx`) |
| `Ctrl+Shift+A` | — | Archive the open task / calendar event / reminder — or Restore it if already archived (item panes only, via `useItemActions`) |
| `Delete` | `Ctrl+Shift+D` | Delete the open task / event / reminder — always opens the permanent-delete confirmation (item panes only, via `useItemActions`). Plain `Delete` is ignored while typing in a field, where it deletes a character |
| `Ctrl+Enter` | — | Confirm the archive dialog (Esc cancels); focus starts in the optional reason box |
| `O` | — | Toggle the Calendar side pane — Go to date / Layers / Schedules / Imported calendars (Calendar section only, local to `CalendarView.tsx`) |
| `T` | — | Go to today in whichever view is showing — month, week or day (Calendar section only, local to `CalendarView.tsx`) |
| `←`/`→` | `PgUp`/`PgDn` | Previous/next period — month, week, or day, matching the current view (Calendar section only, local to `CalendarView.tsx`) |
| `Tab` | `Shift+Tab` | Cycle Month → Week → Day view; Shift+Tab cycles in reverse (Calendar section only, local to `CalendarView.tsx`; suppressed while any calendar modal/pane is open so normal focus-tabbing still works there) |
| `→` | — | Expand selected notebook, then move to the next column: tree → notes → editor (Notes section only). Opening a note with the arrow keys leaves focus in the notes column, so `↑`/`↓` keep moving through notes until `→` (or `` Ctrl+` ``) enters the editor; clicking a note still goes straight into the editor |
| `←` | — | Collapse selected notebook (Notes section only) |
| `PgUp`/`PgDn` | — | Navigate the tree/list column, same as ↑/↓ (Notes section only) |
| `Ctrl+Tab` | `Ctrl+PgUp`/`Ctrl+PgDn` | Cycle between the open note's tabs, `Ctrl+Shift+Tab`/`Ctrl+PgUp` reverses (Notes editor focused, local to `NoteEditor.tsx`) |
| `Ctrl+T` | — | New tab, prompting for a name (Notes editor focused, local to `NoteEditor.tsx`) |
| `` Ctrl+` `` | — | Move keyboard focus between the tree/list nav columns and the editor (Notes section only; previously `Ctrl+Tab`, moved once `Ctrl+Tab` became the tab-cycle key above — see "Notes/Lists keyboard nav" below) |
| `Ctrl+L` | — | Turn the selection into a link (opens a URL popover); with no selection, opens a "New link" pane (text + URL) instead (Notes editor) |
| `Ctrl+H` | — | On normal text, makes it Heading 1 at once. Then press `1`–`5` for that heading level (works on a heading too), `0` for plain text (also strips all formatting except links/tags — `extensions/normalText.ts`), `H` to go to the tab's Title (creating it at the top from the tab name if there isn't one), `S` for a Subtitle or `A` for the Author; Ctrl may stay held for the second key (Notes editor, local to `NoteEditor.tsx`) |
| `Ctrl+Shift+>` | `Ctrl+Shift+<` | Larger / smaller text, a step at a time (Notes editor, `extensions/fontSize.ts`; the ribbon's A+ / A−) |
| `F2` | — | Rename the open tab; Enter (or Esc) puts the cursor back where it was (Notes editor) |
| `Ctrl+Shift+V` | — | Paste as plain text: no formatting, links or images from the source (Notes editor; ProseMirror's own Shift-paste, which `handlePaste` steps aside for) |
| `Alt+Shift+↓` | — | Insert a copy of the current line (paragraph, heading, list item) or the selected lines below it (Notes editor, `extensions/DuplicateLine.ts`) |
| `\` | — | Notes editor: create an object as you type (`\rem` / `\ev` / `\dl`, e.g. `\rem call mum tomorrow 5pm`, Enter). Tab/Enter picks the kind, Enter creates and links the text, Ctrl+Enter opens the full pane, Tab edits the fields, Esc keeps plain text, `\\` types a backslash. `\timeline` (or `\tl` then a space) adds a timeline instead, see "Note blocks" (`objects/NoteObjectTrigger.ts`; touch: the toolbar's `\` button) |
| `Ctrl+Q` | — | On a Notes selection: open the "Create ▸" menu (Task/Calendar item/List item/Tracker entry — Task is wired, the rest are stubs); 1-4 picks, Esc cancels (Notes editor) |
| `Ctrl+click` | — | On a link in the Notes editor: select its text instead of opening it (plain click opens) |
| `Ctrl+click` | — | On a part of a note block (timeline entry, cycle stage, layer…): pick it; then Delete / Ctrl+C / Ctrl+X act on every picked part; Esc clears (`notes-block-pick`, `extensions/blockPicks.ts`) |
| `Ctrl+Alt+click` | — | Anywhere in a note block: select the whole block (`notes-block-select`) |
| `Ctrl+−` | — | Zoom out in Notes editor (without Shift); on a heading, lower its level instead (H5 → normal text) |
| `Ctrl+=` | — | Zoom in in Notes editor (without Shift; Ctrl+Shift+= is superscript); on a heading, raise its level instead |
| `Ctrl+scroll` | — | Zoom in/out in Notes editor (non-passive wheel listener) |
| `↑`/`↓` | — | Navigate between lists (Lists section only, local to `ListsSection.tsx`; only when the sidebar nav area has focus — see "Notes/Lists keyboard nav" below) |
| `` Ctrl+` `` | — | Move focus between the lists sidebar and the list's content area (Lists section only, local to `ListsSection.tsx`) |
| `Ctrl+Tab` | `Ctrl+PgUp`/`Ctrl+PgDn` | Cycle between the current list's tabs, `Ctrl+Shift+Tab`/`Ctrl+PgUp` reverses (Lists section only, local to `ListsSection.tsx`; only when the selected list actually has tabs) |
| `Ctrl+T` | — | New tab, prompting for a name (Lists section only, local to `ListsSection.tsx`; the only runtime way to add a list's very first tab, so unlike the cycle hotkey above this one does NOT require the list to already have tabs) |

### New-item hotkey (N / Space / Ctrl+N) — section-aware behaviour

The routing lives in **`services/newItem.ts` `openNewItem(view)`** (App.tsx's handler just calls it; tested in `newItem.test.ts`). Change the rule there, not in App.tsx.

- Overview → `showAddOverview()`
- Tasks section → `showAddTask()`
- Calendar section → `showAddCalendarItem()`
- Records section + tracker (or routine) selected → `showAddEntry(id)`
- Records section + nothing selected → `showAddTracker()`
- Lists section → `showAddListItem(activeListId)` if a list is open, else `showAddList()`
- Portfolio → `showAddWatchlistItem()`
- Notes → follows the focused column (`uiStore.notesFocusedColumn`). In the Chronicle tree it is `showAddNoteTag(selectedNoteTagId, 'area')`: a notebook inside the selected one. In the notes column (or, via Ctrl+N, the editor) it is `showAddNote()`.
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
- **Zustand selectors must return a referentially-stable snapshot.** Never `useXStore((s) => Object.values(s.foo))` (or `.keys()`/`.entries()`, or an inline array/object literal) — it allocates a new reference on every call, and under React 18's `useSyncExternalStore` that causes an infinite render loop ("Maximum update depth exceeded"), not just wasted renders. Select the raw record/array field (`useXStore((s) => s.foo)`, a stable reference until it actually changes) and derive (`Object.values(...)`, mapping, filtering) in the render body instead. Caught `src/test/patterns.test.ts` ("zustand selectors return a stable reference"); found in `StructuredTagPopover.tsx` 2026-09-24 (crashed the Notes section whenever the Acronym popover opened).
- **User-facing terms come from `config/labels.ts`** — any string that names Endeavour/Collection, Purpose, Tracker, Routine, List, Activity, … uses `LABELS`, so renaming a concept stays a one-file change. Hotkey descriptions in `hotkeys.ts` too.

---

## Quality baseline for all work (adopted 2026-10-08)

Every change meets these, in every app. They aren't extra work to schedule; a change that misses one isn't done.

- **Accessibility.** Use the element that means the thing (`<button>` for an action, `<a>` for a link, headings in order, `<label>` or `aria-label` on every input and icon-only button). Everything works from the keyboard: reachable by Tab, operable with Enter/Space, closable with Escape (see "Escape key"), focus visible. Text and icons meet WCAG AA contrast (4.5:1 for text, 3:1 for large text and icons) in **both** themes; check the dark theme too, not just light. Colour is never the only signal (a state also gets an icon, text or pattern, as the tentative hatch does).
- **Security.** No secret in client code or the repo: keys the browser needs are the public Supabase anon key only; everything else lives in Vercel env vars, read by `api/*`. Every `api/*` route that touches user data checks the Supabase Bearer token first (the `ticker-*` exception is in "Known issues"). Validate input at every boundary the app doesn't control (edge-function bodies, OAuth callbacks, pasted/imported files, agent commands via Zod), and never put a credential in a URL (see `services/oauthState.ts`). RLS on every table plus its grant.
- **Performance.** Select the narrowest store slice that the component needs, and keep selectors stable (see "Coding conventions"). Don't fetch per item in a loop (N+1): sync fetches each table once. Heavy or rarely-used code is lazy-loaded (`React.lazy` for add-on apps, dynamic `import()` for a library like Chart.js), so the first load stays small. Look at the `npm run build` chunk sizes when you add an import.
- **Dependencies.** Use what's already installed first. Before installing a new package, make the case to the user and wait: what it solves, the alternatives considered (including writing it), its size (bundled, gzipped) and maintenance status, and the cost of not adding it.

### End-of-session report

When a working session ends, report to the user:
1. **What changed:** files and features.
2. **Skipped or incomplete,** and why.
3. **Patterns and breaches found:** what each is, where it applies, why it matters, and rough effort to fix.
4. **Proposed CLAUDE.md additions** for any new pattern. Write them in only once the user approves.

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
- **Every modal, slide-in pane, dropdown and panel closes on Escape — and Escape closes only the newest overlay.** Anything that closes on an outside click is an overlay too (pattern test; the notifications panel and the speed dial missed it until 2026-10-05). Use `useEscapeClose` (see "Escape key — universal close rule"); never a bespoke document listener. An audit (see Implemented features) found five that silently didn't close at all, and a later one found ~35 independent listeners that closed the wrong layer when overlays stacked. When adding a new modal or pane, call the hook rather than copying an older component's `useEffect`.

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
6. **A new pattern ships with a pattern test.** `src/test/patterns.test.ts` (see "Testing" above) turns most of "Pattern retrofit backlog"'s manual greps into an automated check that runs with `npm test`. When step 2 above records a new or changed pattern, add or update its check in that file in the same change — a grep a human has to remember to re-run drifts; a test in CI doesn't.

---

## Known issues and deferred hardening

Not bugs in normal use; recorded so they aren't rediscovered from scratch.

- **`api/ticker-*` are unauthenticated proxies to Yahoo Finance's unofficial endpoint.** Anyone who finds the URL can use the deployment's quota, and the unofficial API carries terms-of-service risk. They are unauthenticated **on purpose**: Portfolio must work for guests with no account, so simply requiring the Supabase Bearer token would break guest mode. A real fix needs per-IP rate limiting (Vercel KV/Upstash or Vercel's firewall rules) and/or moving to an official market-data API with a server-side key.
- **Soft-delete tombstones are never purged** (`deleted_at` rows stay forever). Fine at current scale; add a scheduled purge of rows older than ~90 days once any table grows.
- **`calendar_events.notify_before_value` is `integer`** but `CalendarEventPane` feeds it a free-typed number, so typing `1.5` would fail sync (see migration 023's note). Clamp/round the input, or widen the column.
- **The other stores still live in localStorage (about 5 MB for the whole site).** Notes moved to IndexedDB (see "Zustand migration rule"), so pasted images no longer count against it, but every save still re-serialises a whole store (opening a note writes `lastViewedAt`, which rewrites *all* notes — now a database write rather than a localStorage one) and images are still inline base64 in note content, which also inflates every Supabase sync of a note. Pasted images are scaled to 1600 px / WebP on the way in (`utils/imageCompress.ts`) and Settings → Storage can shrink existing ones (`services/shrinkNoteImages.ts`). Remaining ideas are in BACKLOG.md "Local storage headroom".
- **`src/services/autoBackup.test.ts` is flaky under full-suite load** (seen again 2026-10-07, "takes a snapshot once enough weighted changes accumulate"; first seen 2026-10-06: one or two of its tests failed in two full runs, passed alone and in the next full run; the file is untouched by the change that saw it). Probably IndexedDB/timer timing; worth a look before CI starts failing on it.
- **Modal z-index tiers are ad hoc** (28 / 30 / 100 / 102 / 110 / 1000 for modals; 400 Quick Access; 410 history browser; 500 voice indicator; 1020 BottomSheet; 1050 toast; 1080 right-click menu; 1100 confirm dialog; 1200 special-character list; 10000 link preview). It only matters when one overlay opens over another: a modal opened *from inside a pane* needs a tier above the pane's 100/101 (use 102), and anything that can be summoned from anywhere sits above the modals. `AddListModal`, `AddListItemModal` and `EditNoteTagModal` are at 100, the same tier as the panes, but nothing opens them from inside a pane today. Centralising these as `--z-*` tokens is optional tidying (docs/agent-tasks/02).

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
- **New semantic variables added**: `--color-surface-alt`, `--color-primary-subtle`, `--color-primary-border`, `--color-danger`, `--color-danger-muted`, `--color-warning`, `--color-warning-muted`, `--color-success-muted`, `--color-success-text`, `--shadow-lg`, `--color-border-strong` (2026-09-28 — the divider between a time grid's whole-day zone and its hours), `--color-backdrop` (2026-10-04 — the dimmed layer behind a BottomSheet), `--color-overscroll` (2026-10-06 — the greyed room below the end of a note, `NoteEditor/NoteBackdrop.tsx` when no backdrop is chosen; light grey in light mode, a dark grey lighter than the editor in dark), `--color-occurrence` (2026-10-07 — the faint mark on other mentions of the selected text in a note, OccurrenceHighlight), `--color-blocked-wash`/`--color-blocked-stripe` (2026-10-01 — the hatched overlay on a task waiting on another task, TaskItem `.itemBlocked::after`), `--color-tentative-stripe-1`/`-2` + `--tentative-blend-mode` (2026-09-27 — see "Fixed: tentative-event hatch unreadable in dark mode" in Implemented features; not just a colour swap, dark mode also switches the blend mode itself)
- **FOUC prevention**: Inline `<script>` in `index.html` `<head>` reads `localStorage['todo-settings'].state.theme` synchronously and sets `data-theme` before React hydrates.
- **Theme effect** (`src/App.tsx`): `useEffect` reads `theme` from `settingsStore`; for `'system'` mode it attaches a `matchMedia('prefers-color-scheme: dark')` listener that updates `data-theme` on OS changes; for explicit `'light'`/`'dark'` it sets `data-theme` directly.
- **settingsStore** (`src/store/settingsStore.ts`): Added `theme: 'light' | 'dark' | 'system'` (default `'system'`) and `setTheme` action.
- **Settings UI** (`src/components/SettingsPane/SettingsPane.tsx` + `.module.css`): Appearance section at top with a 3-button segmented control (Light / System / Dark) — follows existing `viewModeToggle` pattern.

### CSS migration rule

All component `*.module.css` files must use CSS variables — **no hardcoded hex colors** for neutral/semantic values. Intentional accent colors that don't adapt (e.g. `#6366f1` indigo in NoteEditor highlight style, `#1e293b` code block background, `#374151` Notes FAB) are acceptable exceptions.

The `FloatingToolbar.module.css` is intentionally dark in all themes (it's a floating editor toolbar) — leave its colors as-is.
