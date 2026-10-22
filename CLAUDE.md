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

**Overview is the suite-level read layer** (`src/overview/`, section `'overview'`): each app contributes a *source* to `OVERVIEW_SOURCES` that maps its items onto one common row (What / When / Status / Where / Endeavour), and an Overview is a saved question over those rows (or an Endeavour's automatic one). **A new app, or a new kind of item that should appear in "everything for X", adds a source there** — one entry, its key in `OverviewSourceKey`, its label in `LABELS.overview.sources`, and (if it can be opened) a case in `overview/open.ts`. Sources are pure functions over a snapshot; only `useOverviewSnapshot` subscribes to stores, only `open.ts` touches uiStore, and only `edit.ts` changes an item from an Overview (the Runway's drags, each with Undo). **An Overview has three layouts** (List, Runway, Board; 2026-10-22): a row's timeline drawing is its `plan` (`OverviewPlan`: due / block / point / tray, start, important, movable), set by its source; a new source that has dates sets one, or it's left off the timelines. Detail: `docs/features/overview.md`.

**Implication for new work:** keep each app's domain logic inside its own store and component folders, and let apps talk through the shared entities and `services/crossAppLinkCleanup.ts` (the one module allowed to import several domain stores), not by importing each other's stores directly.

### Android build (Capacitor) — Track A + Phases 1–2 built and verified on-device

The suite is extended to Android via **Capacitor**, wrapping this same codebase (no rewrite, no separate app) — one APK/one Play Store listing, with Tasks/Calendar/Records/Lists free and Notes/Portfolio/Fitness as individually-purchasable one-time add-ons, each eventually surfaced as its own home-screen launcher icon via native `activity-alias` even though it's all one running process. Full architecture (entry points, entitlements, ads, monetization) is documented in **`docs/android/00-architecture.md`** — read that before touching `isAppEnabled()`, `settingsStore`'s theme default, or anything platform-detection-related. `docs/android/` holds the full phased build plan; see "Android build — implementation status" below (near the end of this file) for exactly what's built vs. still planned, and the full list of new/modified files. It supersedes the older Capacitor plan (moved from BACKLOG.md to `docs/android/12-original-capacitor-plan.md` on 2026-10-14, kept for its setup and build/release detail); notifications are `docs/android/05-notifications.md`.

---

## Documentation Protocol (Critical)

**CLAUDE.md is the source of truth for rules, patterns and architecture. `docs/` holds the detail behind each feature. BACKLOG.md holds what is confirmed but not built.** A Claude agent should be able to rebuild the app from those three — so keep them true.

### Doc map

| File | Holds |
|------|-------|
| `CLAUDE.md` (this file) | Overview and terminology, type system, stores, Supabase sync and live migration status, file structure, component patterns, hotkey rules, coding conventions, **pattern governance** |
| `docs/features/implemented-features.md` | Running log of built features: what, why, files, integration points, bugs found and how |
| `docs/features/fitness.md`, `schedules.md`, `external-calendar-sync.md`, `overview.md` | The big self-contained features |
| `docs/supabase/migrations.md` | The migration record: live status, history, table summary. **Read only when a task writes or depends on a migration** |
| `docs/architecture/file-structure.md` | The map of every folder and notable file |
| `docs/architecture/ui-store.md` | The full uiStore state and action listing |
| `docs/features/notes-objects.md` | How `\` inline objects in notes look and behave |
| `docs/android/` | Android/Capacitor architecture, phased plan, and `implementation-status.md`; `05-notifications.md` (notifications/reminders design), `10-gap-analysis.md` (desktop→Android gaps, decisions, workstreams) and `11-design-and-coding-patterns.md` (Android design and coding rules — read before any Android work) |
| `docs/agent-tasks/` | Self-contained briefs for follow-up work an agent can pick up cold; `07-demo-account.md` is how to add a new feature to the demo account |
| `docs/demo/walkthrough.md` | The presenter's script for the demo account |
| `docs/ai/` | The AI agent integration: `01-capability-inventory.md` (what the app can do, invariants, decisions, what is left) and `02-command-layer.md` (the built command layer: design, how to add a command, tests) |
| `BACKLOG.md` | Confirmed-but-unbuilt requirements, and the **Pattern retrofit backlog** |

**Cross-references:** wherever this file says "see Implemented features" or names a feature entry in quotes ("Shared item actions", "Cross-app linking", "Timepicker rebuild", "Suite-wide Quick Access pane", …), it means the matching bullet in `docs/features/implemented-features.md` — search for the quoted name. Fitness, Schedules and external calendar sync have their own files in `docs/features/`.

### Reading budget — read only what the task needs

CLAUDE.md is read in full every session; nothing else is. **Every other doc is reference: open it only when the task touches its subject**, and prefer Grep/Glob and partial reads (`offset`/`limit`) over reading a long file whole. Tokens spent reading what the task doesn't need are wasted. In particular: the migration record is for migration work only; `implemented-features.md` and BACKLOG.md are searched by feature name, never read top to bottom; the file-structure map is for when a search doesn't find something.

### How to write and maintain the docs

The split only stays useful if every agent follows the same structure. These rules apply to CLAUDE.md, everything in `docs/`, and BACKLOG.md.

**1. Put it in the right file.** Ask "would an agent need this *before writing any code*?" If yes → CLAUDE.md. If only when touching that feature → `docs/`.

| What you're recording | Where |
|-----------------------|-------|
| A rule, pattern, convention, or architecture fact that applies across features | CLAUDE.md (the matching section) |
| A store, persist key/version, type, or a rule | CLAUDE.md (Stores / Type system / Supabase sync) |
| A new folder or notable file; a migration's record | `docs/architecture/file-structure.md`; `docs/supabase/migrations.md` |
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

**7. Migration status is special.** Never mark a migration `Applied` on your own; only after the user says they've run it (rules under "Supabase sync → Migrations").

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
- [ ] If a SQL migration was added: it includes its own `grant … to authenticated` (if it creates a table), is listed in `docs/supabase/migrations.md` ("Migration history" **and** the status table, as `Pending — not yet run`), and the user has been told to run it — it only becomes `Applied` once they confirm
- [ ] If a new persisted store was added: its key is in `PERSISTED_STORAGE_KEYS` (`src/config/backup.ts`) and it has a `version`
- [ ] If a new pattern was defined: recorded here, applied to new code, and the retrofit audit logged in BACKLOG.md
- [ ] "Quality baseline" met (accessibility, security, performance, no unapproved dependency)
- [ ] Build passes (`npm run build`) and tests pass (`npm test`)
- [ ] **Demo account:** a new user-facing feature is added to the demo (`docs/agent-tasks/07-demo-account.md`), or the session report says why not
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
- **MathLive** (the maths block) and **lowlight** (colouring in code blocks): each loaded with a dynamic `import()` the first time a note shows maths or code, never in the first load
- **@xyflow/react** (React Flow) and **@dagrejs/dagre** for diagrams (approved by the user 2026-10-13): loaded with `src/diagrams/DiagramWidget.tsx` the first time a note shows a diagram, never in the first load
- **d3-hierarchy** (circle packing, approved by the user 2026-10-17): the Notes Map's blob layout (`components/NoteViews/Map/atlasLayout.ts`), in the Map's own chunk with React Flow
- **`@tiptap/extension-list`** declared as a direct dependency 2026-10-16 (it was already installed and bundled through the starter kit, so nothing new ships): `NoteEditor/extensions/ListItem.ts` extends its list item so a bullet can start with a block
- **Zod 4** for the agent command layer's input schemas (also emitted as the JSON Schema a model API needs) and **Vitest** for tests (`npm test`; test files sit beside the code as `*.test.ts`)

---

## Never swap working files under the running app (adopted 2026-10-22)

**The user runs the dev app against their real data while agents work.** So never `git stash`, `git checkout -- <file>`, `git reset --hard` or otherwise swap working-tree files to get a baseline (lint counts, test results, an old value): read the committed version with `git show HEAD:<path>` into a scratch copy outside `src/` instead. On 2026-10-22 a `git stash` for a lint comparison swapped code under the running app and, 12 seconds later, a stale copy of the notes store was saved over the current one, losing an encrypted note (found from the WebView2 IndexedDB log). `vite.config.ts` now reloads the page for any `.ts` change under `src/` (`fullReloadForStateModules`) rather than hot-swapping stores and services, but that's a guard, not permission.

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

**Conventions when adding a test** (copy an existing file in the same category rather than inventing a new shape): reset a store with `useXStore.setState(useXStore.getInitialState(), true)` in `beforeEach`; use `vi.useFakeTimers()`/`vi.setSystemTime()` for anything date- or `updatedAt`-ordering-sensitive, and **read "today" (`todayIso()`, `new Date()`, `Date.now()`) inside a test or a `beforeEach`, never at file or describe level**: those run when the file loads, on the real clock, so they only agree with the faked one by luck (a repeating-items test broke this way on 2026-10-13; pattern test); a store-migration test seeds `localStorage` with an old-version fixture, `vi.resetModules()`, then dynamically `import()`s the store fresh so `persist` rehydrates through `migrate` for real (`src/store/migrations.test.ts`); sync/edge-function tests fake the relevant module (`@/services/supabase`, `./_lib/supabaseEdge`) with `vi.mock` + `vi.hoisted` rather than hitting a real network — see `src/services/sync/syncService.test.ts` and `api/strava-sync.test.ts` for the pattern; component/hook tests need `// @vitest-environment jsdom` at the top of the file, `@testing-library/jest-dom/vitest` imported *in that file* (not globally — most tests run in plain `node` and don't need it), `cleanup()` in `afterEach` (required once anything portals to `document.body`, e.g. `ConfirmDialog`), and `act()` around a store write that must be reflected before the next assertion. **A stand-in for a third-party library** (a `vi.mock` of an editor or widget jsdom can't run) must copy the library's behaviour where it can break us, not only its surface: what throws before mounting, focus that arrives late, events fired asynchronously (agreed 2026-10-09: MathLive's stand-in accepted a property the real one rejects, and the maths block shipped broken with every test green). If you can't copy it, check that path once in a real browser. `src/test/setup.ts` provides a Map-backed `localStorage` and awaits `preloadIdbStorage()` automatically for every test via `vitest.config.ts`'s `setupFiles`.

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

**Alt+0–7** also goes to each section, and works from inside a text field or a note (2026-10-17; `altDigitSection` in `config/hotkeys.ts`, read from the physical key so a Mac's Option+digit works too; fixed, not rebindable). **Alt + a place's letter** (Alt+S Settings, Alt+M Manage, Alt+A Account) does the same for those places (2026-10-18; `altLetterHotkey` in `hotkeyOverridesStore.ts`, following each one's single-letter binding). A new place with a single-letter hotkey joins its id list in App.tsx. **Alt+R** (Recycling Bin, beside Ctrl+Shift+R) and **Alt+T** (switch dark ↔ light; from System, to the opposite of what shows) work from text fields too. A binding with Alt and a letter also matches by the physical key (`matchesBinding`, `utils/hotkeyBinding.ts`), since Option+letter types a character on a Mac.

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
| `'project'` | Finishable, has deadline (finishing = archiving: its last task's Completed toast offers it) | `deadline` |
| `'list'` | Ongoing, never completes | — |
| `'tracker'` | Records tracker | `fieldSchema: FieldSchema[]` |
| `'routine'` | Repeating checklist | `routineTasks: RoutineTask[]`, `repeatConfig: RepeatConfig \| null` |

All collections also carry `collectionId: CollectionId | null` — meaningful for `kind='tracker'\|'routine'`, lets a tracker/routine be filed under a project/list Endeavour (same `collectionId` pattern as `Task`/`CalendarEvent`/`CalendarReminder`). `project`/`list` kind collections don't nest under another Endeavour; the field stays `null` for them in practice because `CollectionPicker` only ever offers `project`/`list` kind collections as options.

**Archiving:** `Collection.archivedAt: string | null` and `Purpose.archivedAt: string | null` — sunsetting, not deleting. Set via the Archive/Restore button in `AddCollectionModal`/`AddPurposeModal`'s edit mode, or directly from the `ManagePane` row actions. Archived items are excluded from every *selection* surface (`CollectionPicker`, `CollectionFilterPicker`/`getOrderedEndeavours`, `Sidebar`'s active lists, the purpose chip pickers in `AddTaskModal`/`AddCollectionModal`/`AddTrackerModal`/`EditTrackerPane`/`AddRoutineModal`/`EditRoutinePane`) but never deleted — existing references (a task's `collectionId`, a note's inherited Endeavour, etc.) keep working. `CollectionPicker` specifically keeps showing an already-selected archived value (`!c.archivedAt || c.id === value`) rather than hiding it outright. Hard delete (`deleteCollection`/`deletePurpose`) still exists as a separate, more destructive action, available from `Sidebar` and `ManagePane`.

### Task

Key fields beyond the obvious: `kind: TaskKind` (`'action' | 'waiting' | 'milestone'`), `timeIntensity: TimeIntensity | null` (`'low' | 'medium' | 'high'`), `parentId: TaskId | null`, `subtaskIds: TaskId[]`, `links: string[]`, `completedAt: string | null`, `scheduledAt: string | null` (YYYY-MM-DD day user plans to work on it — distinct from deadline), `scheduledTime: string | null` (HH:MM 24-hour), `calendarEventId: CalendarEventId | null` (auto-created CalendarEvent when scheduledAt is set; kept in sync on edits; deleted when task is deleted or scheduledAt cleared), `archived: boolean` + `archivedAt: string | null` + `archiveReason: string | null` (see "Task archiving" in Implemented features — the reason is its own field, deliberately not appended to `notes`), `itemLinks: ItemLink[]` (links this task owns to other tasks — see "ItemLink" below), `repeat: RepeatConfig | null` (a recurring task: completing it creates the next occurrence — see "Recurring tasks" below).

### ItemLink (task links)

```typescript
type ItemLinkKind = 'dependsOn' | 'followUpOf' | 'related' | 'repeatOf' | 'prepFor';
interface ItemLink { kind: ItemLinkKind; targetType: 'task' | 'event' | 'deadline'; targetId: string; reason: string | null; createdAt: string; }
```

A typed link with an optional reason, **stored once, on the owning task** ("owner `<kind>` target"). The other side is derived at render time (`utils/taskLinks.ts` `taskRelations`), the same way the note "Linked from" bar derives backlinks, so the two can never disagree. What each kind means (its labels, icon, whether it `blocks`, whether it's `symmetric`) lives in ONE registry, `config/itemLinkKinds.ts`. A new kind is one entry there, plus its labels in `LABELS.taskLinks.kinds` and the `ItemLinkKind` union. `targetType` exists so other item types (events, notes, list items, and recurring tasks, next) can reuse the shape.
- **Rules live in `utils/taskLinks.ts`** and nowhere else. `isBlocked`/`openBlockers`: waiting on an unresolved task, where resolved = completed **or archived**. `canAddLink`: no self-links, duplicates or loops; the store's `addItemLink` refuses anything else and returns why. `unlockedBy`, `openBlockersDeep`.
- **A link to a missing (deleted) task is ignored, not cleaned up.** Restoring that task from the Recycling Bin brings its links back.
- **`followUpOf` blocks too**: a follow-up created before its origin is done waits for it.
- **`repeatOf`** is set only by recurring tasks (an occurrence names the one it came from); it doesn't block.
- **Links to an event or a Deadline** (`targetType` `'event'` / `'deadline'`, 2026-10-23): `prepFor` (due when it starts), `followUpOf` (starts when it ends), `related`. Their rules are `utils/eventTaskLinks.ts`, linking is `services/eventTaskLinks.ts`, and `utils/taskLinks.ts` reads only task-to-task links. **Linked tasks follow a moved event through one calendar-store watcher** (`initEventTaskFollow`, with Undo, skipped while sync hydrates): never move them by hand where an event is moved, and a new way of moving an event needs nothing.

### Recurring tasks

A task with `repeat` set is one occurrence of a series. **Completing it creates the next occurrence** (decided with the user 2026-10-07: one open occurrence at a time, not a pre-made list). The rules live in `services/recurringTasks.ts` and nowhere else: `spawnNextOccurrence` is called from `toggleTaskWithLists` (so every UI completion, through `toggleTaskCompletion`) and from `agent/access.ts`'s `toggleTask`. The next date is the first date on the rule after this occurrence's deadline (else its scheduled date, else today) that is not in the past — completing late skips missed dates rather than piling them up; the scheduled date moves by the same amount. It carries title, notes, links, Endeavour, tags, purposes, priority, kind, time intensity and `crossAppRefs` (its notes and lists), copies sub-tasks reset to undone, and gets a `repeatOf` link back. "After N times" counts down on each occurrence. Reopening and completing again reuses the existing next occurrence; the Completed toast's Undo deletes it for good (no Recycling Bin entry). Sub-tasks can't repeat. A repeat with no date sets the deadline to today. **Skip this one** (`skipOccurrence`) moves the open occurrence to the rule's next date without completing it: its dates and calendar entries move, its sub-tasks reset, "after N times" counts it. The repeat editor is `components/RepeatField`, for tasks and calendar items alike (pattern test).

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
  daysOfWeek?: number[];        // weekly only: the weekdays (0=Sun…6=Sat); weeks run Mon–Sun
  monthWeekday?: { week: number; day: number };  // monthly/yearly: the nth (1–5, -1 = last) weekday
}
```

---

## Stores

| Store | Persist key | Version | Persisted to | Purpose |
|-------|------------|---------|-------------|---------|
| `taskStore` | `todo-app-storage` | **v14** | localStorage + Supabase | tasks, collections, tags, purposes |
| `calendarStore` | `todo-calendar` | **v20** | localStorage + Supabase | calendar events, reminders, deadlines (v20: `notifyMode` on all three and `notifyBeforeValue`/`notifyBeforeUnit` on reminders/deadlines, one notify setting for every item, `utils/notifyRule.ts`; v19: `notify` on reminders/deadlines, false = never notifies; v18: `travelMode`, `sourceAccount`, `sourceUid` on events — the calendar import, `docs/features/external-calendar-sync.md`; v15: `doneDates` on reminders/deadlines; v16: `seriesId`/`seriesDate` on all three — see "Repeating series" under Component patterns; v17: `remindOccurrence` on all three, `seenDates` on events/deadlines — see "Notifications") |
| `trackerStore` | `todo-tracker` | **v1** | localStorage + Supabase | tracker entries |
| `routineStore` | `todo-routines` | **v1** | localStorage only | daily routine instances (transient) |
| `noteStore` | `notes-storage` | **v13** | **IndexedDB** (not localStorage — see below) + Supabase | notes, note tags, structured tag entries |
| `listStore` | `lists-storage` | **v7** | localStorage + Supabase | lists, list items, list types (custom types only) |
| `portfolioStore` | `todo-portfolio` | **v7** | localStorage + Supabase | watchlist items, portfolio tags, investment purposes (Portfolio app) — `columnConfig` (table display prefs) stays local-only |
| `fitnessStore` | `fitness-storage` | **v3** | localStorage + Supabase (since 2026-10-22) | activities + activity types (Fitness app); custom types only sync, built-ins are seeded per device |
| `scheduleStore` | `todo-schedules` | **v1** | localStorage + Supabase | Schedule templates (recurring weekly timetables, Calendar section) |
| `uiStore` | `todo-ui-session` | **v10** | localStorage (partial) + memory | all UI state (modals, panes, active section) — only navigation/session memory is persisted, see below (v10: `overviewLayouts`, each Overview's layout; v9: `notesBrowseView` and `notesView` persisted, the Notes view to reopen on; v8: the Notes views' shared `notesFilter`, `notesGrouping`, `notesFocusGroupId` — see "Notes views"; v7: notes side by side — `noteLayout`, `notePanes`, `focusedNotePane`, `noteSplit`; v6: `noteCursorMemory`, where each note's tab was left; v4: the Notes tree's `expandedNoteTagIds`; v5: `mobileNotesHome`, the phone's Notes home view) |
| `settingsStore` | `todo-settings` | **v19** | localStorage | user preferences (v19: `linkSuggestions`, when Glossary terms are offered as links, and `scratchpadPos`; v18: backup targets 3 min / 10 min / 1 h added; v17: `scratchpadDesign`; v16: `noteMarginColumn`, the margin column open, closed or auto; v15: the starter typing shortcuts added; v14: `textShortcuts`, the person's own typing shortcuts; v13: `mathSlash`, what `/` makes in maths; v12: `noteColorBars`/`noteColorHeadings`, how a note's colour shows; v11: `dictionaryHighlight`; v10: `stickyHeadingsScale`, and `paneWidths` for every resizable panel — the Notes columns' old `chronicleTreeWidth`/`chronicleListWidth` moved into it; v9: `stickyHeadings`, the sticky heading trail in notes; v8: `noteHeadingPinned`, the phone note heading kept in place; v7: `noteBackdrop`, what fills the room below a note — see `config/noteBackdrops.ts`; v6: Android notification settings — `notifyReminders`/`notifyEvents`, snooze times, `quietHours`) (includes `autoBackup*` fields — see "Automatic local backup rotation" in Implemented features — and `hideBlockedTasks`, v5) |
| `authStore` | — | — | memory only | Supabase session |
| `recentItemsStore` | `todo-recent-items` | **v1** | localStorage only | Go to (Ctrl+G) recent/frequent visit history |
| `pinnedItemsStore` | `quick-access-pins` | **v2** | localStorage + Supabase | what's pinned to Quick Access (Q), in the person's order (see "Pin to Quick Access"; v2: the scratchpad pinned by default, once) |
| `notificationStore` | `todo-notifications` | **v2** | localStorage only | pending in-app notifications (v2: per-occurrence `key`, `occurrence`, `taskId`) + the log of already-notified triggers |
| `hotkeyOverridesStore` | `todo-hotkey-overrides` | **v1** | localStorage only | user-rebound keyboard shortcuts (see "Hotkeys rule") |
| `dialogStore` | — | — | memory only | queue behind `confirmDialog()` / `choiceDialog()` / `alertDialog()` (see "Confirmations and alerts") |
| `overviewStore` | `overviews-storage` | **v1** | localStorage + Supabase | saved (custom) Overviews — definitions only; rows are computed live (see "Overview") |
| `converterStore` | `converters-storage` | **v1** | localStorage + Supabase (`converters`, migration 057) | the person's own converters (`types/converters.ts`); `recent` (last used on this device) stays local |
| `toastStore` | — | — | memory only | the one toast currently showing, behind `showToast()` (see "Toasts") |
| `voiceStore` | — | — | memory only | voice-dictation status and level for `VoiceIndicator` |
| `agentLogStore` | `agent-log` | **v1** | localStorage only | audit log of every agent command (reads as ids only); capped at 2000 entries; cleared on sign-out |
| `agentBatchStore` | `agent-batches` | **v1** | localStorage only | before-snapshots so an agent's changes can be undone; capped at 50 batches; cleared on sign-out |
| `stickyStore` | `notes-stickies` | **v2** | localStorage only | where each sticky note sits on this device's screen, its size (v2: `w`/`h`, null until resized) and its design — the stickies themselves are notes in the Stickies notebook (`services/stickyNotes.ts`) |
| `trashStore` | `trash-storage` | **v1** | **IndexedDB** (not localStorage — same reasoning as `noteStore`) + Supabase | suite-wide Recycling Bin: a snapshot of every item deleted from any store, kept for restore — see "Recycling Bin" below |
| `pictureStore` | `pictures-storage` | **v2** | **IndexedDB** + Supabase | the picture library: each picture stored once, referred to by id (backdrops, pictures in note text, Glossary card pictures; v2: `origin`) — use it only through `services/pictures.ts`, see "Picture library" |

### Zustand migration rule

When adding fields to a persisted store's shape: **bump `version`** and write a **cumulative `migrate` function** that backfills defaults for every prior version. Never write non-cumulative migrations.

Current taskStore v12 migrate backfills: `routineTasks: []`, `repeatConfig: null`, `fieldSchema: []`, `tagIds: []` on collections (v5); `scheduledAt: null`, `scheduledTime: null`, `calendarEventId: null` on tasks (v6); `collectionId: null` on collections (v7); `archivedAt: null` on both collections and purposes (v8); `calendarReminderId: null` on tasks (v9); `crossAppRefs: []` on tasks (v10); `archivedAt` (from `updatedAt` for already-archived tasks, else `null`) + `archiveReason: null` on tasks (v11); `calendarDeadlineId: null` on tasks (v12, "Deadline calendar kind" 2026-09-27); `itemLinks: []` on tasks (v13, "Task links" 2026-10-01); `repeat: null` on tasks (v14, "Recurring tasks" 2026-10-07). Each `if (fromVersion < N)` step **reassigns `state` and falls through** rather than returning — this matters because `migrate` is called once per load with whatever version is on disk, so a store that skipped several app versions in one load (not opened for months) must still receive every intervening step, not just the first applicable one. **Bug found and fixed 2026-09-24:** every step used to `return` immediately after applying its own patch, so a store more than one version behind silently skipped every later step (a v2 store jumping straight to v11 got only the v5 collections patch and the v11 wrapper's own fields, missing v6/v7/v8/v9/v10 entirely) — caught by `src/store/migrations.test.ts`'s "v2 -> v11" fixture; see BACKLOG.md. Follow the fall-through pattern for v12+ — never `return` from inside an individual version step again.

**Unversioned stores:** persisted data with no `version` arrives as v0. The first time such a store's shape changes, give it `version: 1` and a `migrate` that backfills the new fields (`scheduleStore` did exactly this) — a `version` with no `migrate` makes zustand discard the stored state. Every persisted store now has a version.

**Every persisted store uses `storage: persistStorage()`** (`src/utils/persistStorage.ts`) in its `persist` options — never zustand's default localStorage. Browsers give the whole site roughly 5 MB of localStorage, shared by every store, and zustand's persist calls `setItem` inside the store's own `set`, so a full quota throws a `QuotaExceededError` out of whatever action was running (opening a note, in the report that found this) and takes the section down through the error boundary. `persistStorage()` catches that one error: the change stays in memory (and still syncs, if signed in), the user gets an alert naming the biggest store and pointing at Settings → Storage, repeated every 10 minutes while writes keep failing, and the app carries on. Any other storage error still throws. Audit: `grep -L persistStorage` over the files that contain `persist(` must list nothing.

**The one exception is `noteStore`, which uses `storage: persistStorageIdb()` (`src/utils/idbStorage.ts`) and lives in IndexedDB** — notes hold pasted images inline and were the store that hit the 5 MB ceiling. IndexedDB has hundreds of MB, and works the same in the browser, Tauri's WebView2 and Android's WebView. How it keeps zustand's persist synchronous: `main.tsx` awaits `preloadIdbStorage()` (opens database `organisaitor`, object store `kv`, loads the IndexedDB-backed keys into an in-memory map, and on first run moves any old localStorage copy across — put first, remove from localStorage only after) and only THEN dynamically imports `App`, so **no store module may be imported before that finishes** (a store created early would read an empty cache and could persist an empty state over the real data; `idbBacked.getItem/setItem` throw if used before it is ready, on purpose). After that `getItem` reads the map and every `setItem` updates it and is written to IndexedDB in the background (write-behind, one write at a time, latest value wins). If IndexedDB can't be opened the key stays in the guarded localStorage. A failed background write goes through the same alert as a full localStorage (`reportPersistFailure`).

**Because of that, backup and restore must not read/write localStorage directly for a persisted key** — use `readPersistedValue(key)` / `writePersistedValue(key, value)` (`idbStorage.ts`; `backupExport.ts`, `AccountPane` and `IntegrationsPane` do). `writePersistedValue` also freezes further IndexedDB writes until the reload that restore always does, so the running app can't overwrite the restored data. To move another store to IndexedDB: use `persistStorageIdb()` and add its key to `IDB_STORAGE_KEYS`.

**Also:** when adding a brand-new persisted store (not just a field on an existing one), add its `persist` `name` to `PERSISTED_STORAGE_KEYS` in `src/config/backup.ts` — that's the one list both full-app Export/Restore implementations (`AccountPane`, `IntegrationsPane`) read from. This list drifted out of sync with reality once already (Records/Routines/Notes/Lists/Portfolio/Fitness were all silently missing from backups for a while), so treat it the same as a migration: part of shipping the store, not a follow-up. **Not every localStorage key belongs in this list** — per-device bookkeeping that isn't user data (`todo-sync-pending`, and `todo-autobackup-score` used by `services/autoBackup.ts`'s change-score tracker) is deliberately excluded, the same way neither is meant to survive a restore or travel in a backup.

### uiStore — key state and actions

uiStore is memory-only **except** the fields in its `partialize` — those survive
closing the app (`todo-ui-session`, localStorage; see PERSISTED_STORAGE_KEYS). Everything
else (every modal/pane/dropdown open-state, every "currently editing X" pointer) resets on
reload by design, so the app never reopens pointing at a stale modal.

**Rules that constrain new code** (the full state and action listing is `docs/architecture/ui-store.md`; the store itself is the truth):
- **One back/forward history** (`store/navHistory.ts`): Alt+Left/Backspace, Alt+Right, the Android back button and the Alt+N history browser all walk `navHistory`/`navForward`. A normal navigation pushes; history's own moves use `{ mode: 'silent' }`. **A new section with its own "where was I"** (a selected item, a period) adds it to `NavPlace`, `capturePlace` and `goToPlace` (bottom of `uiStore.ts`) and a case in `describePlace` (`components/HistoryBrowser/`); otherwise it is one stop that just reopens the section.
- **Per-section memory** (the focused Endeavour `activeCollectionIdByView`, Calendar's period and view, Notes' tab and expanded notebooks, Lists' list and tab) is persisted, so a section reopens where it was left. Modal/pane open state and "currently editing" pointers are not.
- Picker open-states (`endeavourPickerOpen`, `purposePickerOpen`) are force-closed by every `setActiveView()`.

## Supabase sync

Mappers live in `src/services/sync/mappers.ts` — `xToRow` + `rowToX` pattern.

Every new column on a persisted type needs:
1. A mapper update in `mappers.ts`
2. A migration in `supabase/migrations/NNN_description.sql`

### How sync works (`src/services/sync/syncService.ts`)

- **Local first.** The app always renders from this device (localStorage; IndexedDB for notes). If signed in, `initSync` then downloads every row of every synced table (on launch, on sign-in, and Android pull-to-refresh) and merges per id — newest `updatedAt` wins, a remote soft-delete removes the local item. No realtime and no periodic pull: another device's changes arrive on its next load.
- **Every local change is recorded, then pushed** — including changes made while a load is still downloading: the watchers start before the fetch, and while `loading` they only record (pushes wait until the merge is done, or the fetched snapshot would bring a pushed delete back; fixed 2026-10-14). `watch()`/`trackChanges()` record each changed or deleted row id in a **pending-changes queue** persisted in localStorage (`todo-sync-pending`, deliberately NOT in `PERSISTED_STORAGE_KEYS`; per account; cleared on sign-out by `clearPendingSync()`), then `pushIds()` sends the row's *current* state (or a soft-delete if it no longer exists locally) immediately. An entry is forgotten only after Supabase accepts it. Failures stay queued and are retried when the browser comes back online, every 60 s while anything waits, and after each load — so being offline, a failed request, or closing the window mid-request no longer loses a change.
- **After each load's merge**, `queueLocalOnlyAndNewer()` queues anything that exists only locally (created offline / before sign-in) or is newer locally than in the cloud, and `mergeRecords()` refuses to resurrect a row deleted on this device but not yet reported. Tables whose records have no `updatedAt` (tags, list types, portfolio tags/purposes) can only be detected as "missing remotely"; an offline *edit* to one of those still loses to the cloud.
- **Adding a synced table or store property:** add it to `SYNC_TABLES` (the load fetches exactly this list and passes the rows on keyed by table name — never add a separate positional fetch list; one drifted by a position on 2026-09-27 and put every later table's rows in the wrong store), `TABLE_DEFS` (how to read its local records and build a row), `hydrateStores` (read `remote.<table>` and pass the table name to `mergeRecords`), `upsertAllToSupabase`, and `setupSubscriptions` (`watch()`); plus the mapper and migration below. Missing `TABLE_DEFS`/`watch` means its changes silently never sync.
- **A synced record's id must be unique across every account**, since most tables are keyed by `id` alone. Use `nanoid()`, never a fixed id. *Exceptions, each approved by the user:* an event imported from Google or Outlook gets `importedEventId(userId, key)` (`services/calendarImport/ids.ts`, 2026-10-18), and a Strava activity `stravaActivityId(userId, stravaId)` (`utils/fitnessIds.ts`, 2026-10-22): a hash of the app account and the source's id (`utils/stableId.ts`), so two devices importing it make one record; the account in the hash keeps it unique across accounts. A new such exception needs the user's approval. A table that does hold fixed ids shared by every account (built-in seeds: `investment_purposes`) is keyed by `(user_id, id)` and its `TABLE_DEFS` entry sets `onConflict` (migration 050; found 2026-10-18 when a second account's upload of `ip-growth` hit the first account's row and RLS refused it).
- Never call `authStore.signOut()`/wipe the stores while `watch()` subscriptions are live — the wipe would be read as "user deleted everything" (`stopSync()` first; see `authStore.signOut`).
- **Restore marker** (`sync_markers`, migration `042`, 2026-10-06). A backup restore uploads records with their *old* `updatedAt`, so another device holding newer copies would push them back. `restoreBackupData` therefore calls `markRestored()` after its `forceUpload`, writing one account-level `restored_at`. A device that loads after a restore it hasn't seen (`todo-sync-restore-seen`, per device, not in `PERSISTED_STORAGE_KEYS`, cleared on sign-out) treats the cloud as the truth for that load. Local records and queued changes older than the restore give way; later edits still win. A device that has never loaded the account just records the marker. Logic: "Restore marker" in `syncService.ts` (`restoreCutoff`, read by `mergeRecords`); tests in `syncService.test.ts`. If the table can't be read, it's skipped.

### Migrations

**Which SQL has actually been run against the live database is recorded only in `docs/supabase/migrations.md`** (its status table; the same file has the history and a summary of every table). Read it only when your task writes or depends on a migration. The files in `supabase/migrations/` only *describe* schema — nothing applies them automatically (no `supabase/config.toml`, project isn't CLI-linked); the user runs each one by hand in the Supabase SQL editor. So a migration file existing, or code depending on it, tells you nothing about whether it's live.

**Rules for every future migration (a standing pattern, not a one-off):**
1. Write the file in `supabase/migrations/NNN_description.sql` — and if it creates a table, it **must include its own `grant select, insert, update, delete on … to authenticated`** (raw SQL doesn't auto-grant; without it the API 403s before RLS runs — 019–021 forgot this and needed 022).
2. In `docs/supabase/migrations.md`, add a row to **"Migration history"** (what it does) **and** to the status table with status **`Pending — not yet run`**.
3. Tell the user which file(s) to run and in what order.
4. **Only after the user confirms they've run it**, change the row to **`Applied`** with the date and "confirmed by user". Never mark a migration applied on your own, and never assume one is applied because its file exists.
5. Code that depends on a still-`Pending` migration must degrade gracefully rather than break unrelated features (sync already isolates per-table failures — see "Per-table failure isolation").

### Recycling Bin (suite-wide delete/restore)

Every store's `delete*` action is a real local removal — the record is spliced out of its record map, same as always. What makes it recoverable is `services/trashCapture.ts`'s `moveToTrash(kind, entity)`, called from inside the delete action **before** the record is removed: it resolves a short title/context line from the entity's own fields (never another store — a trashed item must stay identifiable even if everything it referenced is itself later deleted or trashed) and adds a `TrashEntry` (`types/trash.ts`) to `trashStore`. `services/trash.ts` (the mirror image) holds `restoreFromTrash`/`deleteForever` and imports every domain store to write a snapshot back — it is **never imported by a store or by `trashCapture.ts`**, which is what keeps `trashCapture.ts` (imported by every store) free of an import cycle (pattern test). UI and services may import it: `RecyclingBinPane`, and `services/undoableActions.ts` for the Undo of a swipe-delete — `trashedBy(run)` returns the entries a delete created (a cascade makes several) and `restoreAllFromTrash(ids)` restores them, newest first. A cascade delete that splices out children inline instead of calling their own `delete*` action (`taskStore.deleteCollection`'s tracker entries, `listStore.deleteList`'s items) must call `moveToTrash` for each child itself, or a restore brings the parent back with no way to recover what was inside it.

**Rules for new code:**
- **A new `delete*` action on any store must call `moveToTrash('<kind>', entity)`** (the one exception: pictures, see "Picture library") before removing the record, and add its kind to `TrashableKind` (`types/trash.ts`), a resolver in `trashCapture.ts`'s `RESOLVERS`, and a restore target in `trash.ts`'s `RESTORE_TARGETS`.
- **Every mapper's `xToRow` function must send `deleted_at: null` explicitly**, not omit the column — Supabase's `upsert()` only touches columns present in the object, so omitting it would leave a row previously tombstoned by another device (or restored from the bin) zombie-tombstoned forever, deleted again on the next `hydrateStores()`. Enforced by `src/test/patterns.test.ts`'s "every mapper xToRow sends an explicit deleted_at: null" check.
- Agents cannot delete anything (`access.write` has no delete — see "Agent command layer" below), so every trash entry's `deletedBy` is `{ type: 'user' }` today; the type is a union (`{ type: 'user' } | { type: 'agent'; batchId }`) purely so a future agent-delete capability wouldn't need a breaking change, per BACKLOG.md.
- Reachable via `Ctrl+Shift+R` or the "Recycling Bin" button in Account (chosen over Settings/Integrations — Account already owns the closest sibling concept, full-app Export/Restore backup).

### Picture library — a picture is stored once and referred to (adopted 2026-10-17)

**A picture the person adds is stored once in the library (`pictureStore`, `pictures` table) and referred to by id**, never copied inline onto the record that uses it: a backdrop holds `{ kind: 'picture', pictureId }`, an image node in a note holds `pictureId` (its `src` empty), a Glossary card's image field holds `picture:<id>` (`pictureRef`). The user chose this over inline copies; it also takes pictures out of note text, so a note's row and every save of it stay small.
- **Everything goes through `services/pictures.ts`**: `addPicture(file, { encrypted, origin })` (compresses; an identical plain picture from the same origin is reused), `addPictureFromDataUrl`, `pictureSrc` / `usePictureSrc` / `onPicturesChange` to show one, `setBackdrop`, `pictureUses`, `deletePictureEverywhere`. Only that file, sync, backup and the sign-out wipe touch `pictureStore`, and only the library compresses a picture (pattern tests), so moving pictures to file storage later changes one file.
- **`origin`** (`backdrop` / `note` / `card`): only backdrop pictures are offered in the backdrop picker.
- **Encryption:** whatever an encrypted note (or its Glossary entries) uses is stored encrypted (`src` blank, the data URL in `encryptedPayload`, readable only while unlocked). Adding from an encrypted note encrypts from the start; a plain picture that turns up there (chosen, pasted, or the note encrypted afterwards) is swapped for ONE shared encrypted copy (`copyOf`), and a plain note/card picture that nothing plain uses any more is then removed, as encrypting used to remove inline pictures from the server. Nothing is removed while that can't be known (a locked encrypted note or entry, an encrypted snapshot in the Recycling Bin). `initPictures()` does this, and decrypts while unlocked.
- **A picture still inline** (pasted before the library, or HTML pasted from elsewhere) moves into the library when its note is open (`ResizableImage`'s plugin). The one-off "Move pictures" for every note at once was run and removed (2026-10-17). Copying writes the picture into the HTML as well as its `data-picture-id`, so it pastes anywhere and pastes back as the same picture.
- **Deleting a backdrop picture is the person's choice, not the Recycling Bin** (decided with the user 2026-10-17, the one exception to the Recycling Bin rule): "Delete everywhere" or "Just from here". A picture taken out of note text or off a card stays in the library (see "Known issues").
- **Backdrops:** a note's own, else its notebook's (then the notebooks above), else the app-wide one (`utils/noteBackdrop.ts`). Detail: "Backdrops per note and notebook" and "Picture library: note and card pictures" in `docs/features/implemented-features.md`.
- **Exempt:** block icons (`blockIcons.ts`, 160 px squares, inline in the block).

---

## File structure

The full map (every folder and notable file, one line each) is **`docs/architecture/file-structure.md`**. Prefer searching the code; open the map when you need orientation. Add a line there for each new folder or notable file.

Top level: `src/App.tsx` (root: hotkeys, modal routing, section switcher), `src/types/` (all entity types), `src/config/` (labels, hotkeys, registries), `src/store/` (Zustand stores), `src/services/` (cross-store logic and platform services), `src/utils/` (pure helpers), `src/hooks/`, `src/components/` (one folder per component), `src/agent/` (AI command layer), `src/overview/`, `src/contextMenu/`, `src/charts/`, `api/` (Vercel edge functions), `supabase/migrations/`, `src-tauri/` (desktop), `android/` (Capacitor).

### Single entry points — use these, never a side door

Each of these is THE one way to do its job. Most have a pattern section below and a pattern test; the rest are listed here so the rule isn't buried in the map.

| Job | Use | Never |
|-----|-----|-------|
| Sign out | `services/signOut.ts` `requestSignOut()` (confirms, locks the vault, uploads, then wipes) | `authStore.signOut()` from UI |
| Decide whether the app or the welcome page shows (signed out) | `App.tsx` with `services/welcome.ts` (`welcomePassed` / `passWelcome` / `resetWelcome`) | a second gate elsewhere |
| Wipe synced data on sign-out | `services/clearLocalData.ts` `clearSyncedLocalData()`; a store that gains cloud sync is added there in the same change | resetting stores one by one |
| Call `/api/*` | `utils/apiFetch.ts` `apiFetch()` | a bare `fetch('/api…')` (pattern test) |
| Hand the user a file (exports, backups) | `utils/saveFile.ts` `saveFile()` (share sheet on Android) | an anchor download in a component |
| Start an OAuth connect | `services/oauthState.ts` `mintOAuthState()` + `openOAuthFlow()` | a credential in an OAuth URL |
| Handle an `organisaitor://` link (Android) | `services/android/deepLinks.ts` `registerDeepLink()` | another `appUrlOpen` listener |
| Persist a store | `utils/persistStorage.ts` `persistStorage()` (`persistStorageIdb()` for IndexedDB) | zustand's default storage |
| Back up / restore persisted data | `utils/idbStorage.ts` `readPersistedValue` / `writePersistedValue`; `utils/backupExport.ts` `restoreBackupData()` | reading localStorage directly |
| Complete or reopen a task (UI) | `services/taskCompletion.ts` `toggleTaskCompletion()` | the store's `toggleTask` (pattern test) |
| Tick a checklist item (UI) | `services/taskListLinks.ts` `toggleChecklistItemWithTasks()` | the store action directly |
| Delete across apps (links) | `services/crossAppLinkCleanup.ts` | a store importing another domain store |
| Read a possibly-encrypted note / list | `noteView()` / `useNoteView()`, `listView()` / `useListView()` | the raw store record |
| A note's text for search | `utils/noteSearchText.ts` `getNoteTabTexts()` | re-parsing note JSON |
| Open a note at a passage | `services/notePassage.ts` `openNotePassage()` | setting uiStore fields by hand |
| New-item routing (N / Space / Ctrl+N) | `services/newItem.ts` `openNewItem()` | branching in `App.tsx` |
| Links typed into a task/event's notes | the store's update action (`mergeNewLinks`) | adding them in `LinksField` |
| A crash in a section | render inside the section `ErrorBoundary` in `App.tsx` (a new section too) | a section outside it |
| Log anything | `utils/log.ts` `log.*` (see "Errors and logging") | `console.*` (pattern test) |
| Offer colours to pick (any picker, any app) | `config/swatches.ts` (`SWATCHES`; `ColorPicker` reads it) | a local list of hex colours (pattern test) |
| Ask "is the person typing?" in a key handler | `utils/typingTarget.ts` `isTypingTarget(e)` (sees into shadow DOM) | testing `tagName` / `isContentEditable` (pattern test) |
| Put a `\` block into a note | `replaceTypedWithBlock` / `placeBlock` (`NoteEditor/extensions/blockDesigns.ts`) | copying the placement code into a block (pattern test) |
| Change a note's text from outside its editor | `services/noteContentEdit.ts` `editNoteContent()` / `editNoteText()` | `updateNote({ content })` / `updateNoteTabContent` from anywhere else (pattern test) |
| Link a passage, term or note to an idea hub | `services/noteHubs.ts` (`addPassageToHub`, `addLinkToHub`, `removeLink`) | adding a `hubRef` mark or `hubLink` by hand |
| Send a passage to an inbox | `services/noteInbox.ts` `sendToInbox()` | moving text between notes by hand |
| Ask "is this note's text open in an editor?" | `services/liveNoteEditor.ts` `liveNoteEditorFor` / `liveNoteFor` (every pane); `liveNote()` only for the editor in front | comparing `liveNote().noteId` (misses a note open in another pane) |
| Add, show, place or delete a picture (backdrops, note text, cards, and any new use) | `services/pictures.ts` (`addPicture`, `usePictureSrc`, `setBackdrop`, `pictureRef`, `pictureUses`, `deletePictureEverywhere`) | an inline data URL stored on a record; `pictureStore` from anywhere else (pattern test) |
| Import calendar events (Google and Outlook sync, .ics, and any future source) | `services/calendarImport/reconcile.ts` `applyImport()` over `ImportDraft`s; a repeat rule through `utils/rrule.ts` | `addEvent` from an import, or a source's own dedup |
| Pin or unpin an item in Quick Access | `services/quickAccessPins.ts` `togglePin()`; `hooks/usePinAction.ts` for a button or `RowAction`; `pinMenuItem()` for a right-click menu | `pinnedItemsStore`'s `pin`/`unpin` from anywhere else (pattern test) |
| Enter a time of day (any form, any app) | `components/TimeInput` (its segment rules are in the component's header comment) | a native `type="time"` (pattern test) |
| Ask how long before a calendar item notifies, read or write it | `utils/notifyRule.ts` (`eventRule` / `datedRule`, `eventPatch` / `datedPatch`, `notifyMoment`); the field `NotifyRuleField` / `NotifyRuleEditor` (`components/AllDayNotifyField/NotifyLead.tsx`) | reading `notifyBeforeValue` / `notifyDaysBefore` by hand, or a number box and unit select built in a pane |
| Enter a date (any form, any app) | `components/DateInput` (same segment rules as TimeInput); the go-to-date calendar is `components/MiniDatePicker` | a native `type="date"` (pattern test; one exception: the phone quick-add bar's hidden field that opens the phone's own picker) |
| Work out a formula a person wrote (converters, and any later use) | `utils/formula.ts` `compileFormula` / `formulaError` (mathjs syntax, so mathjs can replace it in that one file) | `eval` or `new Function` anywhere (pattern test) |
| Add a word to the Dictionary, read it | `services/dictionary.ts` (`addToDictionary`, `dictionaryWords`, `fetchDefinition`) | a list item made by hand, or a definition fetched anywhere else |

## Component patterns

### Modals

All new modals: overlay div + bottom-sheet on mobile / centred card at ≥520px. Follow `AddTaskModal` / `AddTrackerModal` as reference.

**Structural rule, not just visual:** the centred/bottom-sheet card (`styles.modal`) must be rendered as a DOM **child** of the overlay div (`<div className={styles.overlay}><div className={styles.modal}>…`), never a sibling. The centring is real flexbox (`.overlay { display:flex; align-items:center; justify-content:center }`), which only positions the overlay's own children — a sibling `.modal` gets no centring at all and instead renders whatever `position` its own CSS gives it in ordinary document flow whenever that happens to be `static`. **Caught as a real bug**: `CalendarImportReviewModal` was first built with `.overlay`/`.modal` as siblings inside a fragment; it worked by accident while nested inside `IntegrationsPane`'s narrow slide-in panel (looked like "the import pane is trapped in the sidebar, too small" — the actual reported symptom) and broke a different way once portaled to `document.body` (rendered at the bottom of the full page, not centred) — both symptoms were downstream of the same structural mistake, not two different bugs. Fixed by nesting `.modal` inside `.overlay` like every other modal in the codebase, and switching the overlay's backdrop-click-to-close handler from `onClick` to `onMouseDown` with an `e.target === e.currentTarget` guard (matching `AddCalendarItemModal`'s established pattern) — necessary once `.modal` is a real child, since a click on the modal content now bubbles up through the overlay and would otherwise incorrectly close it.

**A modal or pane is never taller than the screen** (2026-10-18; Account's Sign out was out of reach on a short window): the card gets a `max-height` from the viewport (`calc(100dvh - 2rem)`, or `92dvh` as a bottom sheet), is a flex column, and its body scrolls (`overflow-y: auto; min-height: 0`) while the header stays. Floating panels follow "Floating panels are always fully on screen". Retrofit audit: BACKLOG.md "Pattern retrofit backlog".

**Hover to preview, click to open** (2026-10-18): a header button whose panel opens on hover (the ☰ Sidebar, the bell, Settings) previews it and closes when the mouse leaves; a click pins it open or opens the full version (Manage, the Settings modal). New ones use `hooks/useHoverOpen.ts` (nothing happens on Android, where a tap opens). The Sidebar still has its own timers in App.tsx (retrofit candidate).

**Escaping an ancestor's `transform`:** a modal that needs to render centred in the full viewport, but whose trigger lives inside a component with its own CSS `transform` (including an *identity* `transform` left behind by a slide-in `@keyframes` animation, e.g. `IntegrationsPane`'s `.pane`) — cannot just use `position: fixed`. Per the CSS Transforms spec, any ancestor with a `transform` becomes the **containing block** for `position: fixed` descendants, so the "viewport-fixed" modal ends up sized/positioned relative to that transformed ancestor's box instead of the real viewport (this looks exactly like "the modal is stuck inside the sidebar, too small/narrow" — which is genuinely a distinct problem from the sibling/child structural bug above, both of which hit `CalendarImportReviewModal` at once). Fix: render the modal via `createPortal(<...>, document.body)` from `react-dom` (already an established pattern in this codebase — see the Notes table-hover-controls in `NoteEditor.tsx`) so its DOM position is a direct child of `<body>`, immune to any ancestor's transform. Z-index still applies normally after a portal — pick a value higher than whatever it needs to render above (see the z-index tier notes elsewhere in this file for precedent; `CalendarImportReviewModal` uses `110`/mounted-under-`.overlay`, one tier above `IntegrationsPane`'s own `100`/`101`).

### An effect that reacts to a change skips the first run (adopted 2026-10-17)

**An effect meant to answer a *change* (a note locked or unlocked, a setting switched) compares against the previous value and does nothing on mount**: `const prev = useRef(value); useEffect(() => { if (prev.current === value) return; prev.current = value; … }, [value])`. Effects run on mount too, and one that reloads or resets there undoes what the component's load just did. Found 2026-10-16: `NoteEditor`'s lock effect reloaded the note on mount and moved the cursor to the end, so coming back to Notes from another app always landed at the end of the tab. No mechanical check (an effect's intent isn't greppable); a review rule, logged in BACKLOG.md's Pattern retrofit backlog.

### Form state that starts from an item — initialise it, never copy it in an effect

A modal or pane that edits an item (or is prefilled from one) gets its starting values from **lazy `useState` initialisers** — `useState(() => editing?.name ?? '')` — not from a `useEffect` that calls `setName(...)` (`react-hooks/set-state-in-effect` flags that: an extra render with stale values, and easy to get subtly wrong). For this to be correct the component must be **remounted whenever the edited item changes**: modals are mounted only while open (`{openModal === 'x' && <XModal key={editingX?.id ?? 'new'} />}` in `App.tsx`) and item panes are keyed by id (`<TaskPane key={editingTaskId} />`, likewise the calendar event/reminder, tracker and routine panes; `NotesSection` keys `EditNoteTagModal`). **When you add a modal/pane, add its `key` at the mount site.** If the item can be briefly unavailable (an encrypted note's plaintext arrives after decryption), mount an inner form component only once it exists and key that (`EditNoteMetaModal` → `EditNoteMetaForm`). Other cases, in order: derive the value during render; "adjust state while rendering" (`if (prev !== next) { setPrev(next); setX(...) }` — `TimeInput`, `useItemActions`, `TaskList`, `NoteEditorPane`); and only for a real external-system sync keep the effect with `// eslint-disable-next-line react-hooks/set-state-in-effect -- <why>`. An effect that references a handler declared *below* it trips `react-hooks/immutability` — use `useCtrlEnterSubmit` with a function-declaration handler, and declare any function the effect calls above it.

### Edit panes (slide-in from right)

Follow `EditTrackerPane`. Rendered at the App root level alongside the main content. Triggered by `openEditTracker(id)` / `openEditEntry(id)` etc. in uiStore.

### Escape key — universal close rule (a suite-wide pattern)

**Escape closes the most recently opened overlay, and only that one.** Every modal, slide-in pane, dialog, popover and dropdown registers with **`useEscapeClose(onClose, active?)`** (`src/hooks/useEscapeClose.ts`) while it is open — it must **never** add its own `document.addEventListener('keydown', …)` for Escape. `active` gates registration for a component that stays mounted while hidden (`useEscapeClose(closeManage, manageOpen)`); a component that is only mounted while open uses the default. Call it above any early `return null`.

How it works: one `document` listener (installed at module load) plus an ordered stack. An overlay pushes itself when it opens and pops when it closes, so the top of the stack is always the most recently opened one; Escape is handed to that entry alone and `stopImmediatePropagation()` keeps everything else from also seeing it. Registration depends only on `active`, never on the callback, so re-renders can't reshuffle the order.

**Why not per-component listeners (the old rule):** two independent `document` listeners both fire on one keypress in whatever order they registered, so an overlay opened *on top of* another can't be given priority — a delete confirmation over an event pane, a schedule modal over the calendar side pane, a picker inside a modal each closed the layer underneath (or both). The old workarounds — an outer layer checking "is an inner modal open" (`openModal !== 'add-schedule'`), capture-phase + `stopImmediatePropagation` (`CrossAppRefPicker`, `DecryptPrompt`, `StructuredTagPopover`) — were each a one-off patch for one pair; they're gone.

**Rules for new overlays:**
1. Use `useEscapeClose`. Nothing else handles Escape for an overlay. An overlay that stays open while the person works somewhere else (the note's selection toolbar) passes `{ when: () => … }`: asked when Escape is pressed, and passed over when it answers false (2026-10-22: the toolbar took the scratchpad's Escape). **Every rich-text editor loads `extensions/EscapePassThrough.ts`** (pattern test): ProseMirror cancels every Escape typed in an editor, and the stack passes over a cancelled key, so without it Escape typed in an editor never closes the overlay around it (the scratchpad, 2026-10-22). An overlay that isn't a React component (a popover a ProseMirror widget opens) uses `registerEscapeClose(onClose)` from the same file and calls the returned function when it closes.
2. **Inline, input-level Escape handlers** (cancel an in-place edit, dismiss a suggestions list) stay as ordinary `onKeyDown`, but must call `e.stopPropagation()` — and only when they actually have something to cancel — so the keypress doesn't also reach the stack and close the pane around the input. An input that is *always* mounted (e.g. `AddTaskModal`'s tag field) must consume Escape only while its list/edit is open, or the modal can never be closed from it.
3. Open order = close order automatically; don't try to control it with z-index or flags.
4. The one deliberate exception is a capture-phase key listener that owns *all* keys for a moment (`SettingsPane`'s hotkey-rebind capture): it consumes Escape itself (cancels the capture) before the stack sees it.
5. `FloatingToolbar` (Notes) registers while visible and runs its own priority ladder (create menu → tag search → link input → colour picker → collapse selection) inside that one entry.
6. **Every dropdown is an overlay too**, and **each one registers on its own**: one `useEscapeClose` in a file doesn't cover a second dropdown in it (found 2026-10-17: the Notes ribbon's table, columns and colour dropdowns, five Portfolio panels and the Notes tag button all closed on an outside click but not on Escape). Pattern test: every outside-click listener on the document (`click`, `mousedown` or `pointerdown`, in `.ts` files too) is matched by an Escape registration in the same file.

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

(About 15 older modals bind Ctrl+Enter in their own inline `useEffect` that calls `requestSubmit()`. That still meets the rule (none of them handle Escape there; checked 2026-10-09), but new code uses the hooks.)

`requestSubmit()` (not calling `handleSubmit` directly) is the important detail — it goes through the DOM form submission machinery, so it always invokes whatever `onSubmit` is bound in the **current** render, respects `disabled`/native validation the same way clicking the visible submit button would, and can never fire a stale closure over old form state. For a component with **no `<form>`** (a plain "Save" button as the primary action — the Edit panes, `EditNoteMetaModal`, `EditActivityTypeModal`, `BulkUploadWatchlistModal`, …) use **`useCtrlEnterSubmit(() => handleSave(), active)`** (`src/hooks/useCtrlEnterSubmit.ts`): it keeps the callback in a ref refreshed every render, so an inline closure can never call stale state. Call it above the early `return null`, pass `active` = the same condition the early return uses, and declare the handler as a **function declaration** (`function handleSave() {}`), not a `const` arrow — a `const` defined below the hook call trips `react-hooks/immutability`, and a hoisted declaration doesn't. (The hook is also fine for form modals: `useCtrlEnterSubmit(() => formRef.current?.requestSubmit())`, as in the example above.)

**Item panes** (Task, Calendar event, Calendar reminder) get it from `useItemActions`: those panes save each field on change/blur rather than through a Save button, so Ctrl+Enter blurs the focused field (committing a half-typed title, note, time or link) and closes the pane. It does nothing while the archive/delete dialog is open — the dialog owns it then.

**Deliberately not wired**: `NoteTagPresetModal` (a list of independent "Install" actions — no primary action) and `ConverterPane` (a place to work things out; its editor, `ConverterEditor`, binds Save). Every other modal, pane and popover with a primary action binds it, including `CalendarImportReviewModal` (Import) and the `ConfirmDialog` (confirm). When two layers both bind Ctrl+Enter (a confirmation opened over a modal), the confirmation's listener runs in the capture phase and calls `stopImmediatePropagation`, so only the top layer answers.

### Icons come from one place — `src/components/Icons/` (suite-wide pattern, adopted 2026-10-07)

**A control that appears in more than one place takes its icon from `components/Icons` (`index.ts`)**, so it looks the same everywhere. The user asked for this when the ribbon's text-colour button (an underlined A, which reads as Underline) and the selection toolbar's (a hue-wheel swatch) had drifted apart.
- **What's there today:** `ColorDotIcon` (one colour as a round dot, an empty ring for none: a note's colour in the menus), `DisclosureIcon` (THE expand/collapse arrow: a chevron pointing right while closed, turned down while open, sized 1em; `createDisclosureIcon` gives plain-DOM code the same icon — the heading-fold arrow and a `\` link pane use them; not for a dropdown's ▾ or a submenu's ▸), `TextColorIcon` (the hue-wheel swatch, with the colour in use in its middle), the item-action icons `TrashIcon`, `ArchiveIcon`, `RestoreIcon`, `CheckCircleIcon` (moved from `ItemActions/icons.tsx`), the small controls `EditIcon` (✎ was typed), `CloseIcon` (close, dismiss, clear, take a chip off), `LinkIcon`, `UnlinkIcon` (remove a link, keeping both ends), `OpenIcon` (open it, go there: was ↗), `IndentIcon` / `OutdentIcon`, `ResetIcon` (back to the default), `PaletteIcon` (how something is coloured), `DesignIcon` (a block's or sticky's design), `StatusIcon`, `NoteLayoutIcon` (one note, two side by side…), `TableIcon`, the things you can make (the + speed dial, Manage, the Purpose filter): `PlusIcon`, `EndeavourIcon`, `PurposeIcon`, `ReminderIcon`, `RoutineIcon`, `TrackerIcon`, `ListIcon`, `NotebookIcon`, `StickyIcon`, `PresetIcon`, `UploadIcon`, with `TagIcon`, `PinIcon` / `UnpinIcon` (Quick Access; also the phone note heading's pin), `QuickAccessIcon`, `SearchIcon`, `AccountIcon` (the header's account button; it was `◎`, which is also the Purpose icon) and `ImageIcon` (choosing a picture). **Which X:** delete an item, field or part is `TrashIcon` (at `1em` where it stands in for text); close or dismiss is `CloseIcon`; removing a link is `UnlinkIcon`. The control icons' drawings are data in `glyphPaths.ts`: plain-DOM code (a ProseMirror widget, the chart table) draws them with `createGlyph(name)` (any glyph in that file), and a right-click item passes `createElement(TrashIcon)`. (`blockDesigns.ts`'s Delete still copies its SVG markup.)
- **A site can override locally** through the icon's props or `className` (size, tint, the current colour), never by drawing its own copy.
- **Icons beside text are sized from that text** (agreed with the user 2026-10-09). An icon that sits in or next to a line of text (an expand arrow, a marker) is a **1em square of that text's font size, centred on its first line** (`top: calc((1lh - 1em) / 2)` when positioned; `vertical-align` / flex centring inline), so it scales with the text and lines up with its middle. Its drawn glyph is about the height of the capitals (75–90% of the letters), the usual optical-sizing rule (Apple's SF Symbols scale with text; Material aligns icons to the text's centre). `DisclosureIcon` is drawn this way. A larger tap target comes from an invisible `::before` around the square, never a bigger icon. Pattern test: DisclosureIcon is 1em, and the heading-fold arrow keeps the rule.
- **Item-kind icons** (task, event, deadline, ❗ ✏️ 🔁) are the emoji in `config/itemIcons.ts`, not here.
- **An icon used in only one component** may stay local, like NoteEditor's list and table SVGs. It moves here the day a second place needs it.
- **Pattern test:** no hue-wheel `conic-gradient` outside `components/Icons`, and no imports from the old `ItemActions/icons`; no expand/collapse arrow made by hand (a `'▸' : '▾'`-style glyph ternary, or a local `.chevronOpen` rotation). **And** (2026-10-18) no ✎ / ✕ anywhere, no × as a control (it stays as a multiplication sign), 🔗 only as an item kind's icon, and none of ⊘ ↺ ↗ ↳ ↰ ◐ ◫ ▦ ◎ ▤ ✦ ◉ (↳ stays as the follow-up link kind's own icon). Fully applied 2026-10-18.

### Floating panels are always fully on screen — `utils/floatingPlacement.ts` (adopted 2026-10-17)

**A dropdown, picker, popover, hover card or menu placed next to what opened it is placed by `utils/floatingPlacement.ts`**, so the whole panel is always reachable. The user asked for this suite-wide after the note backdrop picker opened with its bottom off the screen. It follows the usual practice (Floating UI's flip → shift → size, and the platform menu guidelines):
- **Preferred side** (below, or `placement: 'beside'` for a submenu); **flip** to the other side if it fits there and not here; **fits neither: the roomier side with a `max-height`, and it scrolls inside**, never off screen and never by scrolling the page. Sideways it lines up with the anchor's other edge before being shifted inside the window (`align`: start, center, end).
- **Scroll the list, not the chrome**: a panel with a search box or header (the `\` menus) is a flex column whose list shrinks and scrolls (`min-height: 0`), so the search box stays. A panel's own CSS `max-height` (a list kept short on purpose) is respected.
- React: `const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchorRect, { align })` on a `position: fixed`, portaled panel; it re-measures after every render, on a size change and on a window resize, follows a panel that mounts later (a dropdown), and stays hidden until first placed. Plain DOM (a ProseMirror widget, the `//` list): `placeElement(el, anchorRect, options)` once the element is in the document.
- **Never work out a panel's place from `window.innerHeight` yourself.** Pattern test: "floating panels are placed by utils/floatingPlacement.ts". Applied everywhere 2026-10-17: the backdrop picker, the `\` and selection menus, the right-click menu and its submenus, row ⋯ and hover options, the `//` list, hover cards, block popovers and Portfolio's panels.

### Confirmations and alerts — never `window.confirm()` / `alert()` / `prompt()`

**A native browser popup is a pattern violation, always.** They are unthemed, ignore the Escape and Ctrl+Enter rules, and look different in the Tauri and Android webviews. Use `src/components/ConfirmDialog/dialogs.ts`:

- `await confirmDelete(noun, itemName, detail?)` — "delete permanently". Red button, Cancel focused, "This cannot be undone." — the standard from "Archive and delete look and behave the same everywhere". `noun` is lower-case (`'tracker'`; use `LABELS.collection.toLowerCase()` for Endeavours); `detail` says what else goes with it.
- `await confirmDialog({ title, message?, itemName?, confirmLabel?, destructive?, irreversible? })` — any other yes/no (disconnect an account, change the timezone, remove a field that holds data).
- `await choiceDialog({ ...confirmDialog options, alternateLabel })` — a confirm with a third, secondary button; resolves `'confirm'` (primary, Ctrl+Enter), `'alternate'` or `'cancel'`. Used by the blocked-task prompt ("Complete anyway" / "Complete all N"). Put the choice that affects the least on the primary button.
- `await alertDialog(message)` — an error the user needs to see.

**Deleting something empty doesn't ask** (the user's rule, 2026-10-22: anything deleted asks first, unless it's empty). Pass `{ empty }` to `confirmDelete(noun, name, detail, { empty })`; it then resolves at once. Decide emptiness with `utils/emptyContent.ts` (`richTextIsEmpty`, `noteIsEmpty`), `notebookIsEmpty` (`noteStore`), `isEmptyBlock` (note blocks, in `deleteBlock`), or the thing's own children (a list's items, a tracker's entries). When it can't be known (a locked encrypted item), it's not empty. Pattern test (a ratchet on calls without `empty`); the remaining sites are in BACKLOG.md's Pattern retrofit backlog.

All of them return promises, so the handler becomes `async`. Where a listener owns the keyboard while it waits (`SettingsPane`'s hotkey capture), stop listening *before* opening the dialog. If an item has a real archive concept, prefer the `ItemActions` pane pattern instead (it offers "Archive instead").

**A prompt raised by what the user is typing** (e.g. the note editor's "remove the link too?") passes `focusDelayMs` (and optionally `isStale`): the dialog shows at once but takes no focus and ignores Ctrl+Enter for that long, so a stray Enter can't answer it; if `isStale()` is true when the delay ends it closes itself as cancel.

### Errors and logging — one approach (adopted 2026-10-09)

The user asked for one way, so it can't drift again.
- **Log through `utils/log.ts`**: `log.error('sync', 'push failed', err)`. `log.debug/info/warn/error(scope, message, ...detail)`. The scope is the area (`sync`, `vault`, `noteSecrets`, a component name). Output reads `[scope] message`. Debug entries are dropped from production builds. The last 100 entries are kept (`recentLogs()`), and the crash screen's Details lists the recent warnings and errors. **Never `console.*` in `src/`** (pattern test). Edge functions in `api/` log with `console` (that's Vercel's server log).
- **Every error ends in one of four places:**
  1. **The user must see it and act** → `alertDialog(message)` (see "Confirmations and alerts"). Plain words, what happened and what to do; no stack traces or codes.
  2. **A render crash** → the `ErrorBoundary` (app-wide in `main.tsx`, per section in `App.tsx`), which logs it and offers Reload / Export backup.
  3. **Expected and recoverable** (offline, a sync push refused, a locked encrypted item) → handled where it happens, logged as `warn` or `error`, and shown as state where the user needs it (Account's sync badge, a 🔒), not a popup.
  4. **Nothing caught it** → `installGlobalErrorHandlers()` (installed in `main.tsx`) logs window errors and unhandled promise rejections.
- **Never swallow an error silently.** An empty `catch {}` needs a comment saying why ignoring it is correct (best-effort cleanup, a feature check). Otherwise log it.
- **Caught values are `unknown`**: read one with `errorMessage(e)`, not `e.message`.
- **Error types:** throw a plain `Error` with a clear message. A subclass only when callers need to tell errors apart (`AgentError` carries a code for the model; `SpeechError` a reason). Edge functions return `{ error: string }` with a 4xx/5xx status.

### Magic wand — a form filled in from words (adopted 2026-10-23)

**Every form that can be filled in from a description uses `MagicWandButton` + `MagicWandPanel` (`components/MagicWand`)**, so they look and behave alike: paste into an empty box reads at once, Enter reads, Escape closes, and it says when nothing was found. Asked for by the user when the date calculator became the second wand.
- **Reading the text is the form's own pure reader in `utils/`** (`textToTask.ts` `inferCalendarItemFromSelection` for calendar items, `dateCalc.ts` `readDateCalc` for the date calculator), tested beside it. The form passes `onRead(text)`, which fills it and returns whether anything was found. Never parse in a component.
- **`onRead` may return a promise**, so an AI reader (BACKLOG.md "Magic wand readers through the AI") can stand in later without changing a form.
- Used by `AddCalendarItemModal` and `DateCalculator`. A new wand is a reader and two components, never a copy of the panel.
- **Pattern test:** "the magic wand comes from components/MagicWand" (the 🪄 button appears nowhere else).

### Toasts — `showToast()`, one `ToastHost` (suite-wide pattern, adopted 2026-10-01)

**To tell the user something happened, with an optional quick follow-on action, use `showToast({ message, detail?, actions?, durationMs? })`** (`src/components/Toast/showToast.ts`). Example: "Completed “X” · + Follow-up · Undo". `<ToastHost />` is mounted once in `App.tsx` (a pattern test checks this).
- A toast is **non-blocking and dismisses itself after 4 s** (`TOAST_MS`, 2026-10-22). **How long is left shows as a fuse**: a line round the toast's edge that burns away (Toast.tsx). Hovering or focusing it pauses both; leaving carries on from there. Not drawn with reduced motion. Never give a toast its own countdown or timing: it's all in the one `ToastHost`.
- One at a time: a new toast replaces the current one.
- It's portaled at z-index 1050 (above every modal/pane tier, below the confirm dialog).
- It's deliberately **not** in the Escape stack: nothing is waiting on it.
- **Use it for** results the user may want to act on right away (Undo, a natural next step).
- **Don't use it for** anything that needs an answer (that's `confirmDialog`/`choiceDialog`) or errors the user must see (`alertDialog`).
- Before this there was no toast anywhere, so there is nothing to retrofit.

### Notifications — one set of rules, `services/notifications/plan.ts` (adopted 2026-10-06)

**When and what something notifies is decided in `planNotifications()` (`services/notifications/plan.ts`) and nowhere else.** **How long before a calendar item notifies is one rule for events, reminders and deadlines** (`utils/notifyRule.ts`, 2026-10-22: N units before its time, N days before at a time, or a timed reminder at its time; the gap is stored, so it follows the item's date and time); plan.ts, the panes and the note's chips all read and write it there. The desktop/web poller (`hooks/useNotificationChecker.ts`) fires what it says is due now; the Android scheduler (`services/notifications/androidScheduler.ts`) books what it says is due in the next 14 days. A new notifying kind, a lead-time rule or a skip condition (archived, task done, `doneDates`) goes into `plan.ts` with a case in `plan.test.ts`. Both platforms then follow it. **Acting on a notification** goes through `services/notifications/actions.ts`, shared by the bell and the Android buttons; a new action goes there, never in `NotificationCenter`. The actions, re-specced with the user 2026-10-06 (full table: `docs/android/05-notifications.md` "Notification actions"):
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
- **Hovering Complete** offers the alternatives up front (`taskCompletionOptions(taskId)` → `HoverOptions`, on the TaskItem checkbox and every pane footer's Complete via `ItemActionFooter`'s `completeOptions`): *Complete + add follow-up*, *Complete, with the N it's waiting on* (only when blocked), *Add a follow-up (keep this open)*, *Skip this one* (a repeating task: `skipOccurrence` in `services/recurringTasks.ts` moves it to the rule's next date, counting it as used, Undo in the toast).
- **A project's last open task**: the Completed toast also offers *Archive the project* (with Undo). A project has no completed state of its own (decided 2026-10-14). They are `toggleTaskCompletion(taskId, { thenFollowUp | withBlockers })` / `showAddFollowUp` — add a new completion variant there, not in a component. Desktop only (no hover on Android).
- Ticking the last item of a linked checklist (`taskListLinks.toggleChecklistItemWithTasks`) asks first, then completes through `toggleTaskCompletion` too (loaded with a dynamic `import()`: `taskCompletion` imports `taskListLinks`). No exception remains (2026-10-14).

### Pickers suggest by keywords — `utils/suggestRank.ts` (suite-wide pattern, adopted 2026-10-01)

**Every "link a …" picker orders its list the same way**, so linking feels identical whatever you're linking to. The pattern came from `NotePickerModal`; the user asked for it to be applied everywhere.
- **Empty search box**: suggestions from the item being linked *from* (`suggestFrom`, its title), under a "Suggested from “…”" label. The title is reduced to keywords (`extractKeywords`, stop-words dropped, `stemForMatch`). Each keyword is looked for in every candidate's weighted fields (title 3, a container's name 2, body text 1 with log-capped hit counts), and rarer keywords count for more (idf). The rest follows under "Recent", most recent first.
- **Typed search**: every word must match some field, ranked by the fields hit.
- **Use `rankSuggestions` / `rankSearch` (`src/utils/suggestRank.ts`)** with the picker's own fields. `NotePickerModal` keeps its tab-aware original of the same scoring, since it also picks the best tab.
- **Every place that opens a picker passes `suggestFrom`.** Two pattern tests check both halves.
- **Applied to**: `NotePickerModal`, `TaskPickerModal` (title, Endeavour, parent, notes), `ListPickerModal` (name, description, item titles; checklists ahead in the recent tail).

### Resizable side panels — `usePaneWidth` + `ResizeHandle` (suite-wide pattern, adopted 2026-10-09)

**Every side panel and nav column can be resized by dragging its inner edge**, the way the Notes columns could (the user asked for it everywhere). One mechanism, `components/ResizeHandle/`:
- `const resize = usePaneWidth('<id>', { edge, min, max })`; put `style={resize.style}` on the pane and `{resize.handle && <ResizeHandle {...resize.handle} />}` as its first child. `edge` is the side the handle sits on (`'left'` for a pane on the right of the screen). The pane needs a position other than static (a docked column gets `position: relative`).
- Widths live in `settingsStore.paneWidths` by id. **Panes of one family share an id**, so they open at the same width: `item-pane` (task, event, reminder, deadline), `record-pane` (tracker, routine). Until dragged, a pane keeps its CSS width; double-clicking the edge returns it there.
- Mouse, pen and touch drag (pointer capture); arrow keys move a focused edge 16px; the handle is a `role="separator"` with a label. While dragging, `:root[data-resizing]` holds the resize cursor and stops text selection. The handle follows a pane that scrolls its own content.
- **Desktop only**: on Android the hook returns no handle and no width (panes are full width or sheets).
- **Split views** (notes side by side) resize with `SplitDivider` from the same folder, in fractions rather than pixels (see "Notes side by side").
- **Applied to:** the Notes tree and note list, Contents, the Lists, Records and Overview sidebars, Portfolio's chart sidebar, the Calendar side pane and day pane, Manage's nav column, the Tasks sidebar, and the Task, Event, Reminder, Deadline, Routine, Tracker, Note, Integrations and Settings panes. A new side panel or column joins in the same change. Not: modals (Account, Recycling Bin), the icon rail (NavSidebar), popovers.
- **Pattern test:** every pane in the list uses `usePaneWidth`, and no `col-resize` outside the component (and `index.css`).

### Places — destinations that aren't items (`config/places.ts`, adopted 2026-10-09)

**A tool or suite pane worth jumping to is a Place**: Glossary, Review, Hubs, Map, History, Manage Library, Settings, Account, Integrations, Recycling Bin, Scratchpad, Date calculator, Converters. Quick Access (Q / Alt+Q) shows them as its Places row under the pins, ordered by use; Go to (Ctrl+G / Alt+G) finds them by name ahead of items. Quick Access itself is not a Place (it would list itself); it has a header button instead. Sections are **not** places (they have the 0–7 hotkeys and the nav rail). Architecturally Glossary and Review are Tools (level 5) of Notes; Settings and the like are suite panes outside the hierarchy; to navigation they're all places.
- **Adding one:** an entry in `PLACES` (`id`, `label` from LABELS, `Icon` from `components/Icons`, `open`, optional `badge` count), and `useRecentItemsStore.getState().recordVisit('place', '<id>')` in its uiStore open action, so it counts wherever it's opened from.
- **Its icon is the place's one icon everywhere** it's reached from (header, nav rail, its own heading, a panel button): add it to `components/Icons` and use it at every site. Never an emoji in the registry.
- Place visits are never listed among recent items (`resolveRecentItems` skips them).
- **Pattern test:** "Places" (every id recorded in uiStore; icons from `components/Icons`).

### Pin to Quick Access — one store, one toggle (adopted 2026-10-18)

**Quick Access (Q, or Alt+Q from a text field, or the header's ⚡ button) shows what the person has pinned, in their own order, then the Places row; Go to (Ctrl+G / Alt+G) is search and Recent / Frequent.** One overlay with two tabs (`QuickAccessPane`, `uiStore.quickAccessTab`); each tab's key closes it, the other's switches to it; typing searches everything on either.
- **Pins live in `pinnedItemsStore`** (synced, `quick_access_pins`), id `${type}:${entityId}`. **Pinnable:** notes, notebooks, lists, Endeavours, trackers, routines, Places and Glossary terms (`PINNABLE_TYPES`). **Not tasks, calendar items or schedules** (decided with the user 2026-10-18: short-lived or dated, so pins go stale).
- **Every way to pin goes through `services/quickAccessPins.ts`** (`togglePin`, which toasts with Undo): `usePinAction(type, id)` for a `RowAction` (`<RowAction {...pin} />`, so the ⋯ menu, right-click and the Android long-press sheet all get it) or a button (`PinButton`); `pinMenuItem` for a right-click menu; the `note-row` provider covers every note row and Mosaic card.
- **A pin whose item is gone is hidden, not removed** (`resolvePinnedItems`), so it returns with a restore, unarchive or unlock.
- **A new pinnable kind:** a member of `PinnableType` / `PINNABLE_TYPES`, a provider in `utils/quickAccess.ts` (it must resolve), and a pin action where the item is shown: its row's ⋯ menu if it has one, its heading otherwise. Its icons are `PinIcon` / `UnpinIcon`; Quick Access's is `QuickAccessIcon`.
- **Pattern tests:** "Pin to Quick Access" (only the service pins or unpins; every pinnable type has a provider).

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
- **`task-row`** — `TaskItem`: Open, Complete / Mark incomplete, Add a sub-task, Add a follow-up, Archive (or Restore), Delete. Archive and Delete act at once with an Undo toast (`undoableActions.ts`), as a swipe does.
- **`note-row`** — `NoteList` rows: Open, Edit details, make sub-note / move up a level, Delete.
- **`note-editor`** — the editing surface (`EditorContent`'s `innerRef`); its data is `NoteEditorMenuApi`. Providers in `components/NoteEditor/contextMenu.ts`:
  - Cut / Copy / Paste / Paste as plain text.
  - Link… / Create from selection….
  - Style ▸ (Title, Heading 1–5, Normal text).
  - Select all.
  - Paste from the menu reads the clipboard (`navigator.clipboard`), which needs the browser's permission; a refusal explains Ctrl+V / Ctrl+Shift+V.

**How a menu is organised — "clicked thing first, families fold"** (agreed with the user 2026-10-09, from the platform menu guidelines plus the user's own two ideas):
1. **Only what applies to the thing under the pointer.** A command for a heading, a block or a link shows only when that is what was right-clicked (a provider's `when`), never everywhere.
2. **The clicked thing's likely action comes first, at the top level** (a provider `order` below the general sections: 5–6 for the clicked thing, clipboard at 10). Example: "Collapse this heading" on a heading.
3. **Three or more related, less-used commands go into one submenu named for the family** (`Headings ▸`, `Style ▸`, `Design ▸`). A frequent command stays top level even when it belongs to a family.
4. **A family that matters wherever you are** (Expand all headings) sits in its family submenu, shown anywhere the family applies (any note with headings).
5. **At most two submenu levels** (`Headings ▸ Show headings to level ▸`). An on/off option shows `✓` as its icon while on.
6. **Hide what doesn't apply here; grey out (`disabled`) what applies but can't be done right now** (Cut with nothing selected).
`extensions/headingMenu.ts` is the worked example, and `headingMenu.test.ts` checks its order and depth. There is no mechanical check for the rest; the audit is in BACKLOG.md's Pattern retrofit backlog.

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

**How a link is drawn** — only by `artifactGroups.ts` (`ArtifactLinkGroups`), for `\` and Ctrl+Q links alike. The mark is unstyled data. **Never draw anything per `mark[data-artifact-…]` element in CSS**: ProseMirror splits a mark per paragraph and around other marks, so it would repeat (pattern test). The pieces are grouped into one link (`collectArtifactGroups`) and drawn as **one pane that expands**. It's **visual, not an editing form**: no field labels, each thing click-to-edit where it's shown.
- **The session is derived from the text** (`session.ts`): plugin state holds only where the `\` is, how far the draft reaches, the menu highlight and the field overrides. Don't add state that has to be kept in step with the text. Its keys stop propagation, so the Escape stack and a pane's Ctrl+Enter don't also act.
- **A kind's `create`** goes through the same input builder the UI and the agent use (`utils/calendarItemInput.ts`); `discard` (the toast's Undo) deletes and forgets the Recycling Bin entry.
- **A pane's body UI state lives in `paneState.ts` (`usePaneState`), never plain `useState`**: ProseMirror rebuilds the body widget when the heading before it changes, and component state would be lost.
- **Options** (Important, Tentative, Repeat) come from **one list per kind**, `flags(id)` (`flags.ts`), feeding the heading icons, the greyed bottom-bar options and the right-click menu. A new option is one entry there.
- **Removing something that takes data with it asks first**, inside the option's own `toggle` (Repeat off deletes the series's other dates), so every place offering it is covered.
- **Done lives in the icon slot** (☐/☑ in place of the kind icon). A new control goes through `control()` or stops its click, so it doesn't also expand/collapse the pane.
- The full behaviour (inline and expanded layouts, clicks, states, repeating dates, notifications, editing the title) is **`docs/features/notes-objects.md`**: read it before changing how a link looks or responds.

**Also:**
- **One icon per item kind, from `config/itemIcons.ts`** (`ITEM_TYPE_ICON`, `ITEM_FLAG_ICON`), wherever a link, backlink, Overview row or calendar entry shows one. Deadline is 🏁: ⏳ is a waiting task, 🚩 reads as flagged, ❗ is important. Never spell an item kind's icon out in a component (pattern test).
- **Right-click on a link:** the `note-editor.artifact-link` provider (`objects/contextMenu.ts`): Open, details, done, the kind's options, Unlink.
- **Android:** the editor toolbar's `\` button (`insertObjectTrigger`) is the touch path (gap F11).

### Note blocks (`\timeline`) — the other half of `\`, adopted 2026-10-06

`\` makes two families of thing, offered in one menu under two headings ("Create and link", "Add to the note"):
- **Objects** (above) are items that live elsewhere in the app, linked from the text.
- **Note blocks** are note-taking structures that live in the note itself and nowhere else: the timeline (`\timeline`), and, all 2026-10-07, the quote (`\quote`), the cycle (`\cycle`), the breakdown (`\breakdown`: a whole and the parts it's made of), the hierarchy (`\hierarchy`: ranks inside ranks, e.g. a taxonomy, with named levels), the pyramid (`\pyramid`: layers, top first), the chart (`\chart`, see "Charts" below), and, 2026-10-09, code (`\code`, or ``` as in Markdown) and maths (`\maths`; inline when typed inside text), the inbox (`\inbox`, see "Inboxes" below); and, 2026-10-13, the Glossary cards (`\definition`, `\acronym`, `\concept`), the question (`\question`), the comparison (`\compare`) and the diagram (`\diagram`, see "Diagrams"); and, 2026-10-14/15, the conclusion (`\conclusion`: what follows from what came before, with its reasons; drawn as an arrow, a brace, ∴, a total line or a funnel), the types (`\types`: a category and its kinds, "is a kind of", unlike the breakdown's "is part of") and the identification key (`\key`: numbered steps of choices, each leading to an answer or another step); and pros and cons (`\proscons`: one thing weighed, points weighted 1–3, split out of the comparison 2026-10-15) and options (`\options`: the different ways to one end, weighed or simply listed; each option holds the same pros/cons lists); and, 2026-10-17, the argument (`\argument`: a claim and its evidence for, against or both, the same weighted lists, plus why it holds, who made it, who's on each side and sources; Card, Tree, Debate); and, 2026-10-23, the conversion (`\convert`: one converter, built-in units or the person's own, worked out as you type; Card, Compact; the shared `components/ConverterPane/ConvertWidget`, stored as the choice and what was typed, never the answer). The Glossary card gained a fourth record type, the Profile (`\profile`). Code and maths are drawn by node views, like the chart, so they put their frame on their DOM with `applyFrameAttrs`.

The user asked for this as a pattern, so each new block plugs into the same machinery.

**Adding a block — the checklist:**
1. **Its node(s)** in `extensions/<Name>.ts`, registered in `NoteEditor`'s `extensions`. Use `parseHTML`/`renderHTML` on `data-*` attributes, so copy and paste round-trip; notes are stored as Tiptap JSON. Put the keys and decorations in a separate `Extension` with `priority` above 100: a higher-priority *node* moves up the schema, and the first `block` node is what ProseMirror fills empty content with. That must stay the paragraph.
2. **A `NoteBlockKind`** (`objects/types.ts`) in `objects/<name>Block.ts`: `{ family: 'block', id, aliases, label, icon, hint, insert(view, from, to, ctx) }` (`ctx`: the note's id, tab and Endeavour, for a block that makes a record there, as the Glossary cards do). `insert` replaces the typed `\…` (and the space before it) with the block through `replaceTypedWithBlock` (`blockDesigns.ts`), then puts the cursor inside it. Making the block is **its own undo step** (`replaceTypedWithBlock` closes the history first), so Ctrl+Z straight after takes just the block away and gives back the typed `\keyword` (pattern test). A block colouring its parts "by spectrum" uses `spectrumColour` from the same file. An empty line becomes the block; otherwise the block goes after the line, or after the nearest container that can hold it.
3. **Register it** in `NOTE_BLOCK_KINDS` (`objects/blockKinds.ts`). A pattern test fails on a `*Block.ts` that isn't registered.
4. **Strings** in `LABELS.noteBlocks.<block>`.
5. **Tests** beside the node (`extensions/Timeline.test.ts` is the template): insertion through `\`, its keys, and a JSON + HTML round trip.

**Every block has a category** (`objects/blockCategories.ts`, `BLOCK_CATEGORIES`, agreed with the user 2026-10-16): `card` (Glossary cards, question), `structure` (timeline, cycle, breakdown, types, key, hierarchy, pyramid, conclusion), `weighing` (compare, pros and cons, options, argument), `visual` (chart, diagram, maths, code, quote, convert), `container` (inbox, hub, embed, `\ref`), `mark` (`\unsure`: marks text, adds no block). A new block names one in its `NoteBlockKind.category` (pattern test). The category decides:
- **Placement.** A category marked `inline` (cards) goes in **as a chip** when typed after text on the line or on a bullet, and as the block on an empty line. Any other block goes after the line, or takes an empty line's place, **an empty bullet's too**: a list item may start with a block (`extensions/ListItem.ts`, `content: 'block+'`), so the bullet sits beside the block instead of above an empty line.
- **The `\` menu**: with nothing typed after the `\`, blocks are listed under their category's heading (`LABELS.noteBlocks.categories`); once typing, by match.
- **Category `mark`** (2026-10-17) is for a `\` entry that marks the text already there and adds no block (`\unsure`). Such an entry is a `NoteBlockKind` only so it sits in the menu, as `\ref` does. A kind's `icon` may be a drawn icon (`createElement(UnsureIcon)`) as well as an emoji.
- **A card-category block's Inline design is a chip** that shows the same content compactly, never a copy. Built for the Glossary cards (`extensions/GlossaryChip.ts`, see "Glossary records and cards"); the question's inline form is still to do (BACKLOG.md).

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
  - `designButtons(designs, current, pick)`: the design row in the pill, always first and set off from the rest by a thin rule (CSS on `[data-block-designs]`, so every block gets it);
  - `designMenuItem(…)`: Design ▸ in the block's right-click menu;
  - `pillButton`, for the block's other settings;
  - `openBlockPopover(anchor, build)`: a small popover for a part of the block (a cycle's arrow or icon), closed by Escape through `registerEscapeClose`.
- **The lists of blocks and their parts are `NoteEditor/blockNodes.ts`** (`NOTE_BLOCK_NODES`, `BLOCK_PART_NODES`, `LINKABLE_BLOCK_NODES`): plain data, so a util can read them without pulling in the editor (`blockDesigns.ts` / `blockPicks.ts` re-export them). A new block adds its root node there, and its part type if it has parts.
- **Ctrl+] / Ctrl+[ cycle a block's designs** (`extensions/designCycle.ts`, 2026-10-15): one command for every block, since each keeps its design in `variant`. **A new block with designs adds its `*_DESIGNS` to `BLOCK_DESIGN_LISTS`** there (pattern test).
- **Every block can be selected whole** (to cut, copy or delete it): its root node's name is in `NOTE_BLOCK_NODES` and its root renders `data-note-block`. Its pill ends with `selectButton(view, getPos)`; right-click offers Select whole block; and **Esc inside a block selects it** (`NoteBlockSelect`, below the default priority so a `\` session sees Esc first; Esc again goes on to whatever is around the editor). A selected block is outlined, and the selection toolbar stays hidden for it.
- **Every block can be deleted whole** (`deleteBlock`): Delete block in its right-click menu, and a trash button in its pill, **shown whenever the pill is (on hover), without selecting the block first** (changed 2026-10-13 at the user's request: it used to show only once the block was selected). `selectButton` returns Select and Delete together. Pattern test: no CSS hides `[data-block-delete]`. **Ctrl+Alt+click** anywhere in a block selects it.
- **Parts of a block can be picked** (`extensions/blockPicks.ts`, `NoteBlockPicks`): **Ctrl+click** a part (a timeline entry, quote field, cycle stage, breakdown part, hierarchy item, pyramid layer) to add it to or take it out of the picked set; Delete/Backspace, Ctrl+C and Ctrl+X act on the picked parts together; Esc, a plain click or any edit clears them. A block's part type is one entry in `BLOCK_PART_NODES` — **a new block with parts adds its entry there** (the chart, code and maths have no parts). Deleting never leaves a block invalid: the block's own schema (`validContent`) decides, so picking every part deletes the block and leaving too few (a cycle's two stages) is refused with a message. The picks are positions in plugin state, never stored.
- **Every block can be framed:** Outline and Shade, **except that a card block (`CARD_BLOCK_NODES`: Glossary card, question) takes no Outline**: it has a border of its own, and an outline drew a second, larger one around it (decided with the user 2026-10-13). `takesOutline` keeps it out of the pill, the frame options, the right-click menu and `setBlockFrame`; an outline stored before isn't drawn. A new card-like block joins `CARD_BLOCK_NODES`. Framing: (`blockFrameAttributes()` spread into its attributes, `frameButtons` in its pill, `frameMenuItem` in its right-click menu), each with options (2026-10-09): a colour (a `--color-swatch-*` token or a custom `#rrggbb`, checked by `frameColour` on the way in), and for the outline a shape, line and thickness. Change a frame only through `setBlockFrame`. A block drawn by a node view calls `applyFrameAttrs(dom, attrs)` on each render. Drawn outside the block's own box (an outline at an offset and a shadow spread to the same distance), so no design's layout moves when it's framed. The frame's distance also takes in whatever a design draws past its own box (the ring's side cards): `NoteBlockSelect`'s frame fit measures it after each render and sets `--frame-overflow`, so a new design may draw outside its box and still be framed correctly; parts inside something that clips (a design that scrolls sideways) don't count.
- **An icon or a picture on a block's part comes from `extensions/blockIcons.ts` (`iconSlot`)**: an emoji (picked or typed) or a picture cropped square, stored in the part's own `icon` / `image` attrs. A block may add rows to its picker (the cycle's shape and size). Used by the cycle and the types; a new block with icons uses it, never a copy.
- **A block's widget layout is fitted to the real DOM after each render when it must touch other parts** (the cycle's ring arcs end at the measured cards, `RingLayout`), not guessed from fixed sizes.
- **Pattern test:** every `objects/*Block.ts` block's extension must define `_DESIGNS: BlockDesign<…>`, use `designButtons` from `./blockDesigns`, have `selectButton(view, getPos)` and `data-note-block`, and offer frames (`...blockFrameAttributes()`, `frameButtons`).
- **A design is designed for both themes** (tokens, plus accent colours that read on both), keeps every part editable in place, and has a touch path: the pill shows on touch, and parts open on tap.
- **Block colours** (adopted 2026-10-22): every block has its own colour, a token `--color-block-<id>` in `index.css` (both themes; the Glossary kinds and the question use `--color-kind-<id>`), applied by one line in NoteEditor.module.css "Block colours" that sets `--color-primary` (and its subtle tint) on the block's root, so everything the block draws in the accent follows. **A new block adds its token in both themes and its line there**; no two blocks share a colour. Not the palette a person picks from. Pattern test.
- **"+" beside a part** (adopted 2026-10-22): a block whose parts can be added from the part itself (the hierarchy's nodes) uses `extensions/partAdders.ts` (`partAddersPlugin(name, partSelector, adders)`): buttons on a side of the hovered part's box, the side saying the direction; on touch, for the part holding the cursor. Never its own hover buttons (pattern test).
- **Adding a design to an existing block:** a value in its `*_VARIANTS`, an entry in its `*_DESIGNS` (label + icon), its CSS block, and a test that switching to it round-trips. **Adding a block:** the Note blocks checklist above, with at least two designs from the start.

### Annotations: the Glossary, linked terms and Important (adopted 2026-10-07)

Passages of a note can be marked as more than text. Definitions, Concepts and Acronyms are **records** (structured tag entries) that form one **Glossary** across all notes. Other text can be **linked to a term**, and passages can be **Important** at three levels and put on a **review list**. Detail: "The Glossary…" and "Important, built out…" in `docs/features/implemented-features.md`.
- **`\` on a selection opens the selection menu** (`objects/SelectionMenu.tsx`; caught on keydown *and* in `handleTextInput`, because a selection across paragraphs never reaches `handleTextInput`). A new way to mark selected text is one entry in its items, plus the same choice in the right-click menu (`extensions/annotationMenu.ts`). While it's open, the editor forwards keys to it (`selectionMenuKey`), so fast typing never replaces the selection.
- **The Glossary types are `GLOSSARY_TYPES`** (`config/structuredTagTypes.ts`); `glossaryMeaning` reads an entry's meaning. Read entries through `services/glossary.ts` (views, so encrypted ones show only while unlocked).
- **Linked text (`conceptRef` mark) is drawn once per run** by `extensions/ConceptRef.ts`: a highlight on the text, and its icon in the margin column (below). Never with CSS per mark element (it repeats per line; pattern test).
- **Important's state lives on its mark** (`NoteTagMark`: `level`, `passageId`, `reviewDue`, `reviewStep`), so it syncs and encrypts with the note. Change it through `extensions/Importance.ts` (`setImportance` keeps the passage id and schedule), never by setting the mark directly. Ctrl+1 steps through the levels and then off.
- **Unsure flags** (`extensions/UnsureFlag.ts`, 2026-10-17): the `unsureFlag` mark (`flagId`, `reason`, `qid`) on a passage you're not sure of. Made by `(?)` after a sentence (a typing offer), `\unsure` (the sentence before), or `\` / right-click on selected text. Its icon (`UnsureIcon` / `createUnsureIcon`, a question mark in a broken ring) is drawn once after the passage, never per mark element. "Turn into a question" puts a question block after the paragraph and the flag keeps its `qid`, so the icon shows when that question is answered. Which sentence is flagged: `utils/unsureFlag.ts`.
- **Linking to the Glossary as you type** (`extensions/GlossaryAutolink.ts`, through "Offer as you type" below): when the word just typed is a Glossary term (plurals too), a chip offers the link. Enter/Tab links it (its own undo step), anything else leaves it, and Backspace straight after takes the link off. **Offered once per note per term** by default (the "Offer links to Glossary terms" setting, `settingsStore.linkSuggestions`: never / once / every time): not where the note already links it, and not again in a note where it was passed over this session. Never in code, an existing link, or the term's own definition. Hovering linked text shows its card, with a way to the definition (`ConceptMarginView`). A new place that should offer links reuses `findSuggestion`.
- **Opening a note at a passage** goes through `services/notePassage.ts` `openNotePassage(noteId, { mark, attr, value })`: it finds the tab, opens the note there and NoteEditor selects the passage (`uiStore.requestedNotePassage`).
- **Changing a note's content from outside the editor** (Review rescheduling a passage, and any future such change) goes through `editNoteContent(noteId, tabId, { inEditor, inJson })` (`services/noteContentEdit.ts`), which uses the open editor's transaction when that text is open and the stored JSON otherwise. Otherwise the editor's next save writes its copy back over the change. With the editor's schema in hand, `editNoteText` writes the change once. No exceptions (the last, `shrinkNoteImages.ts`, was removed 2026-10-17). Pattern test (adopted 2026-10-09).

### Glossary records and cards — one record, two ways to show it (adopted 2026-10-13)

A Definition, Acronym or Concept is **one record** (`StructuredTagEntry`); marked text in a sentence and a card (`\definition`, `\acronym`, `\concept`, `extensions/GlossaryCard.ts`) are two ways of showing it, and since 2026-10-16 a **chip** inside a line (`extensions/GlossaryChip.ts`, the card's Inline design) is a third. Agreed with the user so they can never drift apart.
- **A chip holds only the record's id**, like a card: the kind's icon, the term and the start of the meaning; hovering shows the whole record; a click opens the full card on the line below (a widget drawn while open, never stored, using the same `GlossaryCardBody`). A card's Inline design (`cardToChip`) and a chip's "Show as a card" (`chipToCard`) convert between them. Anything that looks for where a record is defined or shown (`cardEntries` for the delete check, `stillDefined`, `definitionPassage`, a hub's selected term, the clipboard) counts chips along with cards.
- **A card holds only the record's id, its design, its width, how it shows the picture (`imageWidth`, `imagePlace`) and its frame**, never a copy of the term or the fields. Editing either the card or the marked text changes the record, so both show it.
- **Marking selected text (the tag picker, Ctrl+2/3/8, `\` on a selection) makes a card** for it (`cardFromSelection`); the popover it used to open was retired 2026-10-13, at the user's request. Marked text from before still shows, and right-click offers "Show as a card".
- **Deleting where a term is defined deletes the record, and asks first** (decided with the user 2026-10-13): removing its last card or marked text in its own note, or deleting it from the Glossary, confirms (`confirmGlossaryDelete`, saying how many links go with it), then removes every link to it in every note, the words staying (`services/glossaryDelete.ts`). Cut, undo and replacing the whole document don't ask. **Any new way to delete a record goes through `deleteGlossaryEntryAsked` / `deleteGlossaryEntryNow`.** A record whose note no longer holds its card or marked text counts as deleted (`stillDefined` in `services/glossary.ts`): not listed, linked or offered.
- **The record's fields come from its type's schema** (`config/structuredTagTypes.ts`): a new field is one entry there. A new *kind* of field (`text | textarea | list | image | parent | links | urls | facts` today) is a member of `StructuredTagFieldType`, a reader beside `fieldText`/`fieldList`/`fieldLinks`, and a renderer in `GlossaryCardBody`. Everything lives in the record's `fields`, which sync and encrypt with it, so no migration.
- **Where a term is defined is derived, never stored**: `definitionPassage` finds the marked text or the card in the note. How one entry relates to another is `config/glossaryRelations.ts` (one entry per relation, with its wording from both sides).
- **A Glossary card and a question are one family of look** (decided with the user 2026-10-13). **Card:** a box (border, `--radius-lg`, `--shadow-sm`), a small coloured kind line in capitals, the term or question at `--text-lg`, a short accent rule, then the parts with small grey labels. **Compact:** one bordered row: an icon, the term or question in bold, a thin rule in the accent colour, then the meaning or answer. One difference, at the user's request (2026-10-17): the question's text is italic at normal weight, not bold. A new block of the same kind (a record or a question-like block) takes these two designs and the same measurements; change them in both places (`GlossaryCard.module.css`, NoteEditor.module.css "Questions") together.
- **A card's fields hold a little formatting** (bold, italic, underline, strikethrough, superscript, subscript, code, and links to other Glossary terms, `<a data-term="id">`: `utils/richText.ts`, decided with the user 2026-10-13; term links 2026-10-22, offered as you type by `extensions/CardTermLinks.tsx`, the one deliberate exception to "Offer as you type" since a card's fields aren't ProseMirror), as a short HTML string; the term's is kept beside the plain term (`fields.termRich`, `termRich()`), so the term the rest of the app matches stays plain. **Everything but the card reads fields plain** through `fieldText` / `fieldList` / `glossaryMeaning`; only `GlossaryCardBody` reads `fieldRich` / `fieldRichList`, and it draws them only through `sanitizeInlineHtml` (pattern tests: no other `fieldRich`, and every `dangerouslySetInnerHTML` is sanitized). The ribbon's formatting buttons ask `formatFocusedBlockField` (`NoteEditor/blockFieldFormat.ts`) first, so they act on a focused field.

### Blocks with their own inputs take the typing (adopted 2026-10-13)

**A note block that is one unit (an atom) but has inputs of its own** (maths, a chart's table, a Glossary card) **hands keys typed while it's selected to the block** through `typeIntoBlockPlugin` (`extensions/blockDesigns.ts`), and never lets them replace it. Such a block is drawn a moment after it's put in and is selected whole until its input has focus; a key typed then replaced the block, the way typing over selected text does (found twice in a week: maths, then cards; the chart had it too).
- `typeIntoBlockPlugin(nodeNames, open)`: `open(view, pos, text)` puts the cursor in the block's input and types `text` there, or opens the block for editing (the chart opens its table).
- **A focus request made before the block has drawn itself must be held until it has** (the maths field and the card both do), not dropped.
- **There is always a place for the cursor between two blocks** (asked for by the user 2026-10-13): ProseMirror's gap cursor. Leaving a block onto another block stops in the gap between them (`moveFromBlock`), the next arrow goes into the block; clicking beside or just below a block puts it there (`gapAtClick`); typing or Enter there starts a new line. It's drawn in the text colour (a line, or upright beside a card in a row).
- **Its fields are moved through like the parts of any block** (asked for by the user 2026-10-13): Enter goes to the next field and, from the last, on to the text after; at a field's edge the arrows go to the next (previous) field, then out of the block (`moveFromBlock`, `blockDesigns.ts`). **Arrowing into such a block puts the cursor in it** (the start of its first field from above or the left, the end of its last from below or the right) rather than selecting it whole: a block takes part with `registerEnterableBlock(nodeName, enter)`. Glossary cards and maths do; a chart, a diagram and an embed are still selected whole (no text to type into straight away).
- **Pattern test:** every atom node in `NoteEditor/extensions/` with a node view that draws inputs (`createRoot`, `MathfieldElement`, `ChartWidget`, an `input`/`textarea`/`select`) uses `typeIntoBlockPlugin`.

### A note is named with its notebook (adopted 2026-10-17)

A title alone rarely says which note it is (the user has many notes called "Lectures", one per subject). **Wherever notes from different notebooks are shown together, the note's name carries its notebook**: `noteName(note, noteTags, { untitled, here? })` (`utils/notes.ts`) gives `title`, `notebook` (nearest; left out when it's `here`, the notebook already being looked at), `path` (for a tooltip) and `full` ("Lectures · Biology") for one-line text. Views on the browse model use `useNotesBrowse().nameOf`. Applied to the Mosaic, the Map, Overview (its Where column), Linked from, link hover cards and embeds, Review, Hubs, the hub picker and the "From the note" heading; Quick Access, the note picker, history and the tagged passages already showed the path. Pattern test (an allow-list of places that show the notebook another way).

### Notes views — one registry, one browse model (adopted 2026-10-17)

The Notes section can show several **views** (ways of browsing the notes: Tree, Map; Mosaic, Desk, Lenses, River to come) and **tools** (destinations of their own: Glossary, Review, Hubs, the tagged passages). Agreed with the user so new views don't each add flags and conditions.
- **One field says what's showing: `uiStore.notesView`**, from the registry `config/noteViews.ts` (`NOTE_VIEWS`: id, kind view/tool, label, icon, its Place, whether the editor is part of it, desktop only). What each renders is `components/NotesSection/noteViewComponents.ts` (with a `Phone` replacement and `lazy`); `NotesSection` renders through it and never imports a view. **A new view is one entry in each, plus its label.** Open with `setNotesView(id)` (it counts the Place visit), close with `closeNotesView(id)`. The view switcher (Phase 1) offers only `kind: 'view'`.
- **Every view draws one browse model**: `utils/notesBrowse.ts` turns the notes into a tree of groups for the current filter and grouping (`NOTE_GROUPINGS`: notebook, Endeavour, Purpose, tag; a new grouping is one entry, no view changes). A view reads it through **`useNotesBrowse()`** and acts through **`services/notesNav.ts`**; a view in `components/NoteViews/` imports no store (pattern test).
- **Switching views keeps your place**: the filter (`notesFilter`), grouping (`notesGrouping`) and the group you're in are shared, in uiStore. In the notebook grouping the group you're in IS `selectedNoteTagId` (the Tree's selection); read it with `notesFocusOf`, change it with `setNotesFocus`. Never keep a view's own copy of either.
- **Switching** is the header's `NotesViewSwitcher` (views only, desktop) and **Tab / Shift+Tab** (as in Calendar; not while typing or while any overlay is open: `hasOpenOverlay()` from `useEscapeClose.ts`). Notes reopens on the last *view* (`notesBrowseView`, persisted); closing a tool goes back to it.
- **History:** a Notes stop records the view and, outside the notebook grouping, the group. A view with `historyStops` (the Mosaic) makes each level gone into, and the level a note was opened from, a stop; the Tree keeps its own rule (a stop per note).
- **Animating a change of view or level** goes through `utils/viewTransition.ts` `withViewTransition(kind, change)` (the browser's View Transitions, no library; skipped with reduced motion). A new kind of transition is a `kind` there and its `::view-transition` rules in `index.css`.
- **The Mosaic** (`components/NoteViews/Mosaic/`) and **the Map** (`components/NoteViews/Map/`) are built this way; read them as the template for the next view. Their shared pieces are `NoteViews/ViewBar.tsx` (trail, Group by, filter), `ViewFilter.tsx`, `NoteLevel.tsx` (a note opened from a view: the editor, a strip of its neighbours, the way back) and `gridFocus.ts` (arrow keys between `[data-view-tile]` elements); a new view uses them rather than its own copies.
- **Notebook order is `byNotebookOrder`** (`utils/notes.ts`): the pinned notebooks (`isPinnedNotebook`: Stickies, then the Scratchpad since 2026-10-19) first at the top level, then the notebooks' own order. The browse model marks it `pinned`, and every view keeps a pinned group first with a line after it (Tree, Mosaic, 2026-10-18); a new view does the same, except the Map, which leaves the Stickies out altogether (2026-10-18, at the user's request: they sit over the notes, not on the map).
- **Pattern tests:** no per-view open flags; NotesSection renders through the registry; NoteViews import no store.

### Notes side by side — one registry of open editors (adopted 2026-10-16)

The ribbon's **View ▾** (`components/NoteSplitView/NoteViewMenu.tsx`) shows one note, two side by side, three (two stacked and a column) or four quadrants (`components/NoteSplitView/NoteSplitView.tsx`). Desktop only (Android gap F31). The user approved the registry this needed as a pattern.
- **Several editors can be open at once, so "is this note's text open?" is asked of the registry** (`services/liveNoteEditor.ts`): every editor registers with `registerOpenNoteEditor`; the one in front also with `registerLiveNoteEditor` (what `liveNote()` returns). Ask `liveNoteEditorFor(noteId, tabId)` / `liveNoteFor(noteId)`, never `liveNote()` plus a noteId check, which misses a note open in another pane.
- **Save before remounting editors**: anything that changes the layout calls `flushOpenNoteEditors()` first (found 2026-10-16: going from one note to two remounted the editor before its last typing was saved, and the new pane showed the older text, which its next save would have written back).
- **The pane in front holds uiStore's open note** (`notePanes[focusedNotePane] === editingNoteId`), so everything that opens a note (the list, links, Quick Access, back/forward) opens it there. **A note is in one pane at most** (opening one already showing moves the focus to it), so two editors never save over each other. A pane takes the focus on a press or focus inside it.
- **One ribbon**: `NoteEditor` takes a `pane` prop; the pane in front portals its toolbar into the shared ribbon, the others show none; each keeps its title and tabs. Only the editor in front writes the "last open" memory.
- **Panes resize by dragging the lines between them**: `SplitDivider` (`components/ResizeHandle/`), the split counterpart of `ResizeHandle`, holding fractions (`uiStore.noteSplit`) so proportions survive a window resize. A new split view uses it.
- A note is added to a pane through `NotePickerModal`; a note row's right-click offers **Open beside** (`openBeside`).

### The margin column — one place beside the text for every mark (adopted 2026-10-17)

**A thin column right of the note shows, on each line that holds a marked passage, that mark's icon** (`extensions/MarginColumn.ts`). Designed with the user; it replaced the Important markers in the left margin and the braces and labels beside Glossary links, which each drew their own margin and didn't line up.
- **A kind of mark takes part by registering a source**: `registerMarginSource(id, state => MarginItem[])`, each item a passage (`from`, `to`) with an icon, a colour, a title and what a click does (its own popover). Sources today: Important, Glossary links, Glossary chips, Unsure flags. **A new mark adds a source, never its own margin drawing** (pattern test). Something a source reads outside the document changing (a term renamed, a vault unlocked) calls `refreshMarginColumns()`.
- **Layout** (`utils/marginLayout.ts`, pure, tested): marks starting on the same line share a row, up to three icons, then "+N"; a passage over several lines gets a thin bracket down those lines; rows never overlap.
- Hovering an icon highlights its passage; clicking opens that mark's popover. **Collapsed**, each row is a short tick and the column opens while hovered; a tap on a tick opens the line's first mark (touch). `settingsStore.noteMarginColumn`: 'auto' opens it on a wide note and collapses it on a narrow one (side by side, Android); the button at its top sets open or closed.
- **A mark keeps its look in the text** (agreed with the user): the column adds the icon; it doesn't take away the highlight, underline or in-text icon.

### Offer as you type — one helper, `extensions/typingOffer.ts` (adopted 2026-10-13)

**Every chip that offers to do something with what was just typed** (link a Glossary term, record an acronym, and any future one: dates, people, tasks) **comes from `typingOfferPlugin`**, so all of them behave alike: shown only while typing, the text highlighted and the chip at the cursor; Enter or Tab (or a click) accepts it as its own undo step; **typing on past it leaves it lingering for 4 seconds** (`LINGER_MS`, agreed with the user 2026-10-13: people type straight on), floating above its words and fading, when Tab or a click still accept it but Enter is a new line again; it ends early when its words change or the cursor leaves the line; Esc or letting it go passes it over, not offered again for the same thing in that note this session; Backspace or Ctrl+Z straight after accepting takes it back (the offer's `undo` if it has one, else the history's undo of the accept step; see "Automatic changes are undoable").
- An offer is a spec: `find(state, typed, noteId, passedOver)`, `chip(offer)` (text, a bold part, a tooltip), `accept(state, offer)` returning the transaction, optional `undo`. Applied to `GlossaryAutolink.ts`, `AcronymOffer.ts` and `BlockOffers.ts` (a quotation, "there are three types of …:", "the pros and cons of …:" offer their block; the rules are `utils/blockOffers.ts`; a new block offer is one more spec there).
- **Pattern test:** nothing but `typingOffer.ts` builds an offer chip (`data-autolink-chip`).

### Automatic changes are undoable straight after — Backspace or Ctrl+Z (adopted 2026-10-17)

**Anything the app changes on its own while the person types** (a shortcut or formula `-->` → →, `CO2` → CO₂; a Markdown input rule `## `; an accepted typing offer) **is taken back by Backspace or Ctrl+Z (Cmd+Z) pressed straight after**, leaving what was typed. The user asked for one way across the suite, matching word processors' autocorrect. Any other key ends the chance; after that both keys do their ordinary job.
- **Note editor:** an input rule gets it for free: `SpecialCharInput` binds Backspace (Tiptap's default) and `Mod-z` to `undoInputRule`. **Every rich-text editor loads `SpecialCharInput`** (pattern test). A typing offer gets it from `typingOffer.ts`.
- **Text fields:** `fieldInput.ts` keeps the last replacement and handles both keys (a script's `setRangeText` isn't in the browser's own undo).
- **A new kind of automatic change** goes through one of these (an input rule, a typing offer, or `fieldInput`'s shortcut path), never its own replace. MathLive's own shortcuts are its business (its undo).
- **Pattern test:** "automatic changes as you type are undoable straight after".

### Colours a person picks — one palette, `config/swatches.ts` (adopted 2026-10-09)

**Every colour picker in the suite offers `SWATCHES`** (`config/swatches.ts`): 12 named colours. The user agreed to this after six components were found keeping their own lists.
- **Saved as data** (an Endeavour's, a tag's, a note's accent, text colour in a note), a colour is stored as its `hex`, a mid-tone that reads on light and dark; `pale` is the soft variant for fills behind text (`ColorPicker palette="light"`). Existing stored colours outside the palette keep working; they just aren't offered.
- **Drawn by the app and stored by name** (a block's frame), it uses the `--color-swatch-<id>` token, tuned per theme for contrast.
- Names for labels come from `LABELS.swatches` (`swatchLabel(hex)` for an accessible name).
- **Pattern tests:** no `const …COLORS = [` list outside `config/swatches.ts`, and every palette id has its token in both themes.
- **Marks on text keep out of the palette** (adopted 2026-10-16, raised by the user). A mark the app draws over words to say what they are (a Dictionary word, a link to a hub, a link being offered, a linked term) uses the neutral `--color-text-mark` tint, the primary colour, or its kind's colour from one registry (the Glossary types'). **Never a palette colour** (`--color-swatch-*`, a `SWATCHES` hex): those are kept for colours a person picks (frames, a note's colour, text colour), so a picked colour and a mark can never be mistaken for each other or clash. Pattern test: "marks on text keep out of the palette" (`TEXT_MARKS` lists the mark selectors; a new mark joins it). **Items linked into the text** (`\` objects) are coloured by kind from tokens (`--color-item-task` blue, `--color-item-calendar` green, `index.css`), read through `--pane-accent` from `data-artifact-type` (2026-10-22); a new linked kind adds its token.

### Idea hubs — one bigger idea and what bears on it (built 2026-10-13)

A hub is a note block (`\hub`, `extensions/Hub.ts`): the idea's name, your own take, then **typed links**, grouped by how each relates (`RELATIONS` in `utils/noteHubs.ts`: causes, leads to, supports, contradicts, example of, part of, related). A link is to a **passage** (Add to hub on selected text), a **Glossary term** or a **whole note** (the hub's + Link…). Agreed with the user: a hub is a block that can live anywhere, several per note, and a "hub note" is just a note built around one; links, not live copies (live references are a later option); List and Compact now, a **canvas** to come as another design of the same block.
- **A passage stays where it is.** It gets a `hubRef` mark (several hubs = several marks: `excludes: ''`), drawn as one marker after the passage (a decoration, never CSS per mark element). The hub keeps a short preview, except of an encrypted note's passage when the hub's note isn't encrypted (then it says where it is instead).
- **Removing a link takes its mark off** (`removeLink`). A mark or link left behind some other way is harmless: following it says so, and a marker that leads nowhere removes itself when clicked.
- **"Is it still there?" checks read the open editor first** (`noteHasPassage`, `services/notePassage.ts`): the open note's text can be ahead of the store until it saves.
- Reading hubs without an editor (the picker, the **Hubs** view, a Place) is `utils/noteHubs.ts`. Detail: "Idea hubs" in `docs/features/implemented-features.md`.

### Links between notes, and embedded passages (built 2026-10-13)

**Text links to another note, or to one passage of it** (a paragraph, or a heading and its section): the `noteLink` mark (`extensions/NoteLink.ts`), made with `[[`, `\ref` or "Link to a note…" (selection menu, right-click). **Not Ctrl+L**, which is a web link, and the keyword is `ref`, never `link`, so the two can't be confused (agreed with the user). A click opens the note at the passage, Ctrl+click selects the linked words, hovering shows the passage as it reads now. **`\embed`** (`extensions/NoteEmbed.ts`) shows a passage from another note, live; "Copy as text here" turns it into a plain copy.
- **A passage is found by a lasting id**, `blockId` on paragraphs, headings and (since 2026-10-15) every note block and every block's part (`LINKABLE_BLOCK_NODES`, `NoteEditor/blockNodes.ts`), so a link or an embed can point at a block or a part of one (`extensions/BlockIds.ts`), given only when something first points at it (`ensureBlockId`, through `editNoteText`). Copies lose it (a repeat is cleared), so an id is never in two places. Never find a passage by its position or text.
- **A link or embed holds only where it points** (`noteId`, `tabId`, `blockId`), never a copy of the text: the text is read when shown (`linkTarget`, `services/noteLinkTargets.ts`), from the open editor when that note is open.
- **What links to a note is derived, never stored** (`utils/noteLinks.ts`): the note's foot lists the notes that link to it, with their sentence, and the notes that mention its title without linking (`NoteLinksFrom`, with a Link button). Same idea as the "Linked from" bar for other apps' items.
- **Opening a link** goes through `openNoteLink`. The **Map** (a Notes view since 2026-10-17: `components/NoteViews/Map/`, links from `utils/noteMap.ts` through `hooks/useNoteMapLinks.ts`) reads the same links. A new kind of link between notes is read in `noteTargetsIn` too, so it shows on the Map.

### Inboxes — moving a passage somewhere to take it further (built 2026-10-09)

An inbox is a note block (`\inbox`, `extensions/Inbox.ts`): a named list of items, each a passage with a status (Idea → In discussion → Parked → Built), where it came from, and optionally a task. Designs List / Cards / Board (a column per status); the inbox's own order (newest, oldest, A–Z). **Send to inbox** (the selection menu `\`, or right-click on selected text) MOVES the passage: `services/noteInbox.ts` `sendToInbox` puts it in the chosen inbox (any note, or a new one at the end of this note) and leaves a `movedStub` marker where it was. The marker can be removed freely (nothing refers to it). Within one note it's one undo step; between notes the toast's Undo puts it back. Moving text out of an encrypted note into an unencrypted one asks first (`confirmDialog`), since the passage would be stored without encryption.
- **Changing another note's content goes through `services/noteContentEdit.ts`** (`editNoteText`, the schema form of `editNoteContent`; the rule under "Annotations"). Locked notes can't be changed.
- Reading inboxes without an editor (the picker, Overview's "Inbox items" source and its built-in **All inboxes**) is `utils/noteInboxes.ts`; the document operations shared by the block and the service are `utils/inboxDoc.ts`.
- Detail: "Inboxes" in `docs/features/implemented-features.md`.

### Special characters — `//name`, in every text field (adopted 2026-10-08)

**Typing `//` and a name puts in a character, the same way in every text field of the app** (the user: Greek letters first, other characters later, and the same everywhere). Sets: Greek (`//alpha` → α, `//Delta` → Δ: a capital first letter gives the capital), marks (`//tick` ✓, `//greentick` ✅, `//cross` ✗, `//redcross` ❌), arrows (`//to` →, `//implies` ⇒), maths (`//inf` ∞, `//leq` ≤; names follow LaTeX) and super/subscript digits (`//sup2` ², `//sub2` ₂; a name may end in digits). Case matters only for Greek. `//` alone lists the Greek alphabet; ↑↓ choose, Enter or Tab puts it in, a full name and a space does it at once, Esc keeps the text. `//` only starts at the start of a word, so `https://` never does; `\\` was taken (it types a backslash) and `\` makes blocks.
- **The table is `src/specialChars/charSets.ts`**, with the pure rules (`findCharTrigger`, `matchChars`, `exactChar`). A new set is entries there with its own `set`; nothing else lists characters by name (pattern test).
- **Shortcuts** (`SHORTCUTS` + `findShortcut`, same file): `-->` →, `<=` ≤, `>=` ≥, `!=` ≠, `^2` ², replaced as the last character is typed; and common chemical formulas get subscripts (`CO2` → CO₂: `CHEMICAL_FORMULAS`, whole words, exact case). **Backspace or Ctrl+Z straight after puts the typed text back** (in the note editor Ctrl+Z does this for every input rule, through `undoInputRule`). Fields: only for typed input (`InputEvent` `insertText`, never a paste), not in URL, email or search fields. The note editor: an input rule (so Tiptap's `undoInputRule` gives the Backspace undo, and code is skipped). A new shortcut is one entry in `SHORTCUTS`.
- **The person's own shortcuts** (`govt` → government; Settings → Typing shortcuts, `settingsStore.textShortcuts`, 2026-10-17) go through the same two paths (`findUserShortcut`, beside `findShortcut`), but fire only **once the word ends** (a space or punctuation typed after it), so `tech` can't fire inside "technical". A lower-case shortcut also matches capitalised or in capitals. Never straight after `.`, `/`, `@`, `_` or `:` (a web address, email or path). A replacement already ending in the punctuation typed doesn't get it twice (`eg.` → e.g.). Undone the same way. A starter set (`DEFAULT_TEXT_SHORTCUTS`, the user's list) is installed once; one the person deletes never comes back. A field inside `data-no-shortcuts` gets no shortcuts at all (the Settings fields where they're written).
- **Ordinary fields need nothing**: `installSpecialCharInput()` (`fieldInput.ts`, run once from App.tsx) listens on the document for every `<input>` (text-like types) and `<textarea>`, and replaces text with `setRangeText` plus an `input` event, so React's `onChange` sees it. Its keys are caught on `window` in the capture phase while the list is up, so Esc, Enter and Ctrl+Enter don't also reach the Escape stack, a form or a pane.
- **A rich-text editor is not an ordinary field**: the note editor has `extensions/SpecialCharInput.ts`, the same rules through ProseMirror. Any new rich-text editor adds that extension (and `EscapePassThrough`, see "Escape key").
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

### Diagrams — one neutral description, one widget (adopted 2026-10-13)

**A diagram anywhere in the suite is a `DiagramSpec` (`src/diagrams/diagramSpec.ts`: boxes with a label, a shape and a position; arrows with an optional label) drawn by `src/diagrams/DiagramWidget.tsx`**, the same arrangement as charts. Stored data is only ever the spec; how it's arranged (Free, Flow, Flowchart) is held beside it (the note block's `variant`), and the arranged layouts are computed by `diagramLayout.ts` (dagre) when drawing, never stored. Only the widget imports React Flow, and it's lazy-loaded with it. A new place that shows diagrams hosts the widget (`onCommit(spec)`) rather than copying it; diagram strings are `LABELS.diagrams`. A future mind-map view of how notes link (BACKLOG) should draw through the same widget.

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

**Page hotkeys stand aside (adopted 2026-10-17).** A section's own hotkeys (Calendar's O / T / arrows / Tab, the Notes tree's arrows, Lists' arrows, Notes' Tab) start with **`if (pageKeyBlocked(e)) return;`** (`utils/pageKeys.ts`): not while typing, and not while any overlay is open over the page. Overlays are known from the Escape stack (every one registers with `useEscapeClose`), so a new modal or pane is covered with no hotkey change. **Never guard with a list of open-state flags** (`openModal || editingTaskId || …`): Calendar's list had missed its own day pane, and Lists had no guard at all, so its arrows moved behind an open modal. A panel docked beside the page that should leave the page's keys working registers with `useEscapeClose(close, open, { docked: true })` (Calendar's side pane). Pattern test. **The same goes for App.tsx's global hotkeys** (2026-10-18; found when Space in Manage opened a new task under it): the handler reads `hasOpenOverlay()` once and, while an overlay is open, skips everything that acts on the page underneath (new item, section switching, back/forward, the filters, zoom). Only hotkeys that open or close a suite overlay of their own (Settings, Manage, Account, Recycling Bin, Quick Access, History) or act in the focused field (dictation) stay live. A new global hotkey that acts on the page goes below the `if (overOverlay) return;` line. Pattern test.

**A handler that acts on a plain key returns early while the person is typing: `if (isTypingTarget(e)) return;`** (`utils/typingTarget.ts`; pass `document.activeElement` where there's no event). Never test `tagName` or `isContentEditable` yourself (pattern test): the helper also looks inside a custom element's shadow root, so typing in a MathLive maths field can't fire hotkeys. Adopted 2026-10-09, when five handlers each had their own copy.

**Every `HotkeyDef` names its touch path** in `touch` (required; decision D13): how to do the same thing on a phone, or `'n/a: <why>'`. A new hotkey fills it in the same change; a pattern test fails on one without it.

**Adding a new hotkey handled centrally in `App.tsx`** (i.e. anything that belongs in step 2's first case above): give its `HotkeyDef` a unique, permanent `id` and `customizable: true` if it's a plain global toggle/navigation-style action reassignable without side effects, then dispatch it via `matchesHotkeyId(e, 'your-id')` (`src/store/hotkeyOverridesStore.ts`) instead of a hardcoded `e.key === '...'` check — this is what makes it show up with a click-to-rebind affordance in Settings. A component-local hotkey (step 2's second case) is currently **not** wired to read overrides at all — see "Customizable hotkeys" in the Implemented features list for why that's a deliberate scope decision, not an oversight. Mark a hotkey `protected: true` (no `customizable`) instead if it must never be reassigned (only `Esc` today).

### Current hotkeys

The list is **`src/config/hotkeys.ts`** (`HOTKEYS`, with each key's action and touch path), shown to the user in Settings. It is not repeated here; search that file for a key before adding one, and check `findConflicts`.

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
- **ProseMirror's own class names are `:global(...)` in a CSS module** (`.ProseMirror-selectednode`, `.ProseMirror-trailingBreak`, `.ProseMirror-gapcursor`…). CSS Modules renames every class, so a bare `.ProseMirror-…` in a `.module.css` file silently matches nothing (found twice 2026-10-13: a selected block's outline and the quote's placeholders). Pattern test: "the editor library's classes are :global in scoped CSS". The same goes for any library's classes (`:global(.react-flow__edge-path)`).
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

**Put the routine facts in one summary table, and keep the words for what needs them** (agreed with the user 2026-10-09). Build results, test counts, what was or wasn't checked in the app, docs and Android parity go in the table, not in sentences. One row per feature or fix, then the standing rows:

| Item | Status | Tests | Checked in app | Notes |
|---|---|---|---|---|
| *each feature or fix* | ✅ Done · 🟡 Partial · ⏸ Waiting on you · 💬 Discussion only · ❌ Not done | added / updated / none | ✅ / ❌ needs your eye | one short phrase, or nothing |
| Build · type check | | — | — | |
| Test suite | | N/N pass | — | name any failure |
| Lint (changed files) | | — | — | |
| Docs | | — | — | which files |
| Android parity | | — | — | as-is / built / gap ID |
| New dependencies · migrations | | — | — | name them; a migration says "run it" |

**The table does not replace the rest of the report.** Anything the user has to read, decide or act on still gets its own short section after the table: questions waiting on them, answers to things they asked, problems found, the patterns and breaches (point 3), and proposals (point 4). Leave out sections with nothing in them, and don't repeat in prose what the table already says.

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

- **The Microsoft client secret expires** (Outlook calendar sync; 24 months at most from when it was made in Entra). Before then make a new one and replace `MICROSOFT_CLIENT_SECRET` in Vercel, or every Outlook sync fails with a token error. Record the expiry date here when the app is registered: *not yet registered*.
- **`api/ticker-*` are unauthenticated proxies to Yahoo Finance's unofficial endpoint.** Anyone who finds the URL can use the deployment's quota, and the unofficial API carries terms-of-service risk. They are unauthenticated **on purpose**: Portfolio must work for guests with no account, so simply requiring the Supabase Bearer token would break guest mode. A real fix needs per-IP rate limiting (Vercel KV/Upstash or Vercel's firewall rules) and/or moving to an official market-data API with a server-side key.
- **Soft-delete tombstones are never purged** (`deleted_at` rows stay forever). Fine at current scale; add a scheduled purge of rows older than ~90 days once any table grows.
- **The other stores still live in localStorage (about 5 MB for the whole site).** Notes moved to IndexedDB (see "Zustand migration rule"), so pasted images no longer count against it, but every save still re-serialises a whole store (opening a note writes `lastViewedAt`, which rewrites *all* notes — now a database write rather than a localStorage one) Pictures are no longer inline in note content (2026-10-17, "Picture library"): a note holds their ids, and old inline ones move into the library when the note opens. Pictures are still whole rows in Supabase, not Storage files. Remaining ideas are in BACKLOG.md "Local storage headroom".
- **Pictures no longer used stay in the library.** A picture removed from a note's text or a card (or whose note was deleted for good) isn't cleaned up: deciding that safely needs every note, entry and Recycling Bin snapshot readable (encrypted ones locked can't be), and it keeps undo and the bin's restore working. Worth a cleanup pass ("used nowhere for 30 days", run while unlocked) once the library grows; BACKLOG.md "Picture library cleanup".
- **`src/services/autoBackup.test.ts` is flaky under full-suite load** (seen again 2026-10-07, "takes a snapshot once enough weighted changes accumulate"; first seen 2026-10-06: one or two of its tests failed in two full runs, passed alone and in the next full run; the file is untouched by the change that saw it). Probably IndexedDB/timer timing; worth a look before CI starts failing on it.
- **`NoteEditor.test.tsx` "F2 renames the open tab…" fails now and then under full-suite load** (2026-10-09: twice in about eight full runs; always passes alone and in repeated runs of the Notes tests). It first appeared in the session that added the sticky heading trail (`StickyHeadings`, which measures on an animation frame), but no link was found. Look at it before CI starts failing on it.
- **Most z-index values are still literals** (28 / 30 / 100 / 102 / 110 / 1000 for modals, and the summoned-from-anywhere tiers 400–10000). The tiers are now tokens (`--z-*`, "Design tokens and theming"); existing literals move to them as files are touched. It matters only when one overlay opens over another. `AddListModal`, `AddListItemModal` and `EditNoteTagModal` are at 100, the same tier as the panes, but nothing opens them from inside a pane today.

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

## Design tokens and theming (adopted 2026-10-09)

**Every visual value comes from a token in `src/index.css`** (`:root`, the one shared source for every app in the suite): colours `--color-*` (redefined for dark mode under `[data-theme="dark"]`), type `--text-2xs … --text-2xl`, spacing `--space-1 … --space-7`, radius `--radius-sm/md/lg/pill`, shadows `--shadow-sm/md/lg` (also per theme), stacking tiers `--z-*`, and two named sets: `--color-swatch-*` (the suite's palette, `config/swatches.ts`, as drawn by the app: a block's frame) and `--color-code-*` (the code block's dark panel and syntax colours, the same in both themes). Theming lives entirely in that file: a component never checks the theme to pick a colour.
- **New CSS uses tokens.** A hard-coded value is allowed only where no token fits and the value is genuinely local (a 1px hairline, `50%` for a circle, a measured position).
- **Existing hard-coded values are replaced as files are touched**, not in a sweep (the user's call, 2026-10-09). If a value you need isn't on a scale, add a token rather than a literal, and say so in the session report.
- **Text and icons on a `--color-primary` fill use `--color-on-primary`**, never `white`/`#fff` (pattern test).
- **Deliberate exceptions** keep their literal colours: `FloatingToolbar.module.css` (dark in both themes), the `NoteBackdrop` presets, brand colours (Strava `#fc4c02`), the accent colours named in a comment (indigo highlight), and sticky notes' paper (`--sticky-*` tokens, light paper and dark ink in both themes, because they're drawn as paper).
- **Pattern test** (`patterns.test.ts`, "styles use the design tokens"): a ratchet on hard-coded colours, font sizes, z-index, radius and shadows in `*.module.css`. The counts may only go down; when you lower one, lower its baseline in the test.
- A modal opened from inside a pane uses `--z-pane-modal`; anything that can be summoned from anywhere sits above every modal (see the tier comments).

### Dark mode — how it works

- **CSS variables**: All colors live as `--color-*` custom properties in `src/index.css`. The `:root` block defines light mode values; `[data-theme="dark"]` on `<html>` overrides them with dark equivalents.
- **Colour tokens** and what each is for: the comments beside them in `src/index.css`.
- **FOUC prevention**: Inline `<script>` in `index.html` `<head>` reads `localStorage['todo-settings'].state.theme` synchronously and sets `data-theme` before React hydrates.
- **Theme effect** (`src/App.tsx`): `useEffect` reads `theme` from `settingsStore`; for `'system'` mode it attaches a `matchMedia('prefers-color-scheme: dark')` listener that updates `data-theme` on OS changes; for explicit `'light'`/`'dark'` it sets `data-theme` directly.
- **settingsStore** (`src/store/settingsStore.ts`): Added `theme: 'light' | 'dark' | 'system'` (default `'system'`) and `setTheme` action.
- **Settings UI** (`src/components/SettingsPane/SettingsPane.tsx` + `.module.css`): Appearance section at top with a 3-button segmented control (Light / System / Dark) — follows existing `viewModeToggle` pattern.
