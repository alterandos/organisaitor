# Agent brief 02 — automated testing, then engineering hygiene

**Status:** Not started (start after brief 01, or Part A phases 1–2 in parallel with it — see below)

## Bookkeeping — you do this yourself; the user will not

1. **Right now:** change the `Status:` line at the top of this file to `In progress (started YYYY-MM-DD)`.
2. **As you go:** when a task/item finishes, note it under the Status line (`- Task 1: done YYYY-MM-DD — <one line>`). If you skip, defer or only partly finish something, say so there with the reason — never leave a silent gap.
3. **When you finish everything:** set `Status: Done YYYY-MM-DD — <outcome, and anything left over>`.
4. **Log the work** in `docs/features/implemented-features.md` using the entry template in `docs/README.md` (what, why, files, decisions, bugs found, verified vs. not verified, not built) — one entry per task/item.
5. **Keep the other docs true** per CLAUDE.md "How to write and maintain the docs": update CLAUDE.md only where a rule/pattern/store/migration changed, update BACKLOG.md's "Pattern retrofit backlog" if a listed pattern's state changed, and fix any doc mention of code you removed or renamed.
6. Tell the user, in your final message, which migration (if any) they need to run and anything you couldn't verify.

**Priority: after brief 01.** Self-contained: read `CLAUDE.md` first ("Pattern governance" and "Component patterns" in particular). Part A builds the test suite; Part B is a list of smaller improvements, each independent, roughly in the order worth doing. Part A comes first because several Part B items (splitting the giant files, the CLI migration workflow) are much safer with tests behind them.

**Running alongside brief 01:** Part A phases 1, 2 and 5 only add new files (tests, fixtures, config), so they can run in parallel with brief 01 without conflicts. Don't run these in parallel with it: Part A phase 3 (the modal prefill tests are brief 01 Task 4's safety net, so ideally they land *first*), Part A CI lint gating, and Part B4/B7 (they edit the same files as brief 01 Task 4). Brief 01 Task 1 adds a migration numbered 032 — Part B1 (Supabase CLI) must wait until that migration is applied.

Don't commit unless asked. Log finished work in `docs/features/implemented-features.md`; update `CLAUDE.md` where a rule/pattern/script changes.

---

# Part A — Automated testing

## Why, and the current state

There are **no automated tests** at all. Everything that has been verified so far was checked by throwaway scripts in a scratch folder (a Node harness bundling real store code against a stubbed Supabase; Playwright runs against the dev server). Those scripts found real bugs — timezone offset overshoot, ICS parameter-case mangling, a blur-before-flush race in `TimeInput`, an Escape-stack ordering bug, an encryption re-ordering race — and then were thrown away, so nothing stops those bugs coming back. The riskiest code is *pure logic with dates, sync merges and crypto*, which is exactly what is cheapest to test.

Goal: a suite that runs in CI on every push, is fast (unit tests in seconds), and encodes the project's **patterns as executable checks** so "Pattern governance" (CLAUDE.md) doesn't depend on someone remembering to grep.

## Tooling

| Need | Choice | Notes |
|------|--------|-------|
| Unit + component runner | **Vitest** | Reuses the Vite config and the `@/` alias (`resolve.alias` in `vite.config.ts` — mirror it in `vitest.config.ts` or share it). |
| DOM for component tests | **jsdom** (or happy-dom) + **@testing-library/react** + **@testing-library/user-event** | Default environment `node`; opt components in with `// @vitest-environment jsdom`. |
| Web Crypto / IndexedDB | Node 22's built-in `crypto.subtle`; **fake-indexeddb** | For `vault.ts`, `noteSecrets.ts`, `listSecrets.ts`. |
| Supabase | hand-rolled fake (see below), **not** the real client | A tiny in-memory object with `from(table).select/upsert/update` and `auth`, recording calls. |
| Browser E2E | **Playwright** (`@playwright/test`) | Against `vite preview` (build first) or `vite` dev on a fixed port. Chromium only. |
| Edge functions | plain Vitest calling the exported `handler(new Request(...))` | `fetch` mocked (`vi.stubGlobal('fetch', …)`). |
| CI | GitHub Actions | `tsc -b`, `eslint`, `vitest run`, `vite build`; Playwright on PRs to `main`. |

Add scripts to `package.json`: `test` (`vitest run`), `test:watch`, `test:e2e` (`playwright test`), `check` (`tsc -b && eslint . && vitest run && vite build`). Keep test files next to the code: `src/utils/date.test.ts`, `src/store/taskStore.test.ts`; E2E in `e2e/`; shared helpers in `src/test/` (`factories.ts`, `fakeSupabase.ts`, `resetStores.ts`). Test files are excluded from the production build automatically (nothing imports them) — confirm `tsc -b` still passes with them included.

**Conventions:** no snapshot tests of large DOM; one behaviour per test with a descriptive name; use factories for entities (`makeTask({ deadline: '2026-01-31' })`) with branded ids cast (`id as TaskId`); reset every Zustand store in `beforeEach` (`store.setState(store.getInitialState(), true)` and clear `localStorage`) so tests can't leak; freeze time with `vi.useFakeTimers()` / `vi.setSystemTime()` for anything date-dependent; never depend on the machine's timezone — set `process.env.TZ` in `vitest.config.ts` `test.env`/global setup **and** run the timezone suite across several explicit zones.

## Phase 1 — pure logic (highest value per hour; do this first)

Write tests table-driven where possible. Cases in **bold** are known past bug shapes — write those first.

| Module | What to cover |
|--------|---------------|
| `utils/timezone.ts` | `zonedTimeToUtc` ⇄ `utcToZonedTime` round-trip across ≥10 zones × dates including **both DST transitions** and the non-existent/ambiguous hour; **the second-pass correction must diff against the fixed target, not the evolving guess**; `rezoneWallClock` re-expresses the same instant; `todayIsoInZone`. |
| `utils/date.ts` | `computeLinkedEndTime` (no end yet → +60 min; existing end → only the hour nudges, minutes preserved; **midnight wrap returns `dayOffset: 1`**), `addDaysToIso`, `isOverdue` with a zone, `formatTime`/`formatDeadline` for 12h/24h/system. |
| `utils/recurrence.ts` | `expandRepeat` for daily/weekly/monthly/yearly, `interval`, `count`/`until`/`forever`, month-end (31st → short months), leap day, **`exceptions` skipped but still counted toward `count`**; `withException`/`endedBefore`/`tailOf` (`tailOf` carries the remaining count). |
| `utils/scheduleOccurrences.ts` | `expandScheduleBlock` weekly, biweekly with anchor, anchor in the future excludes earlier weeks even for `interval 1`, exceptions, template `startDate`/`endDate` clipping; `computeNextOccurrenceDates` skips off-weeks; `countTemplateConflicts`. |
| `utils/textToTask.ts` | dates: relative words, ISO, `Month Day[, Year]`, numeric with `/` `-` `.` (**bare `10-15` and `3.14` are NOT dates; `11-09-2029` is**), locale day-first resolution, year rollover (**a passed date without a year rolls to next year; an explicit past year is kept**); times (`6pm`, `18:00`, noon, midnight, **ranges `2pm-3pm`, `2-3pm`, `14:00 to 15:30`; `10-15` is not a range**); priority words; URL extraction; **`stripSpans` title cleanup** ("The report is due on 2026-10-02" → "The report is due"); `inferCalendarItemFromSelection` event-vs-reminder guess. |
| `utils/icsParser.ts` | fixture `.ics` files: all-day + RRULE, `TZID=America/New_York` (**parameter *value* case must be preserved — `TZID` key uppercasing must not mangle it to `AMERICA/NEW_YORK`**), trailing `Z`, floating time, `EXDATE`, `LOCATION`, `looksLikeBirthday`. |
| `utils/googleReminders.ts` | `deriveNotifyBefore`: own popup overrides, `useDefault` → calendar defaults, cleared reminders stay off, several popups → the closest to start, read-only calendars (`accessRole`) → no fallback, all-day vs timed fallback. |
| `utils/links.ts` | `extractUrls`, `normalizeLinkUrl`, **`mergeNewLinks` only adds links new to the notes and never resurrects a deleted one**; comparison ignores protocol/`www.`/case/trailing slash. |
| `utils/acronymInference.ts` | parenthetical both orders, colon/dash, initials match with stopwords, all-caps token at either end. |
| `utils/hotkeyBinding.ts` | parse/format round-trip for every default in `config/hotkeys.ts`; **`matchesBinding` requires an exact modifier match**; `captureBindingFromEvent`. |
| `utils/timeGrid.ts` | `buildHourLayout`, `minutesToY`/`yToMinutes` inverse, `layoutDayTimeGrid` overlap columns, `snapMinutes`. |
| `utils/noteContent.ts`, `utils/notes.ts`, `utils/collections.ts`, `utils/quickAccess.ts` | strip artifact links from a Tiptap JSON tree (text kept, mark removed); endeavour inheritance (`resolveNoteInheritedCollectionId`); ordering of `getOrderedEndeavours` (projects then lists, archived excluded); provider `list/resolve/navigate`, stale-entry pruning, encrypted notes resolve through `noteView`. |
| `config/*` | `hotkeys.ts`: ids unique and permanent; every `customizable` entry is dispatched via `matchesHotkeyId` in `App.tsx` (see pattern tests below); `trackerTemplates`/`noteTemplates` produce valid Tiptap docs. |

## Phase 2 — stores and sync

- **Store migrations** — for every persisted store, feed `migrate` a fixture of *each historical version* and assert the current shape (CLAUDE.md "Zustand migration rule": migrations are cumulative). `taskStore` v1…v11, `calendarStore` v1…v9, `noteStore` v1…v12, `listStore`, `portfolioStore`, `fitnessStore`, `settingsStore` (**v1→v2 must backfill `calendarLayerVisibility.tentative`, or tentative events silently vanish**), `scheduleStore` v0→v1 (backfills `requiresCommitment`/`committedDates`), `notificationStore`/`hotkeyOverridesStore` v0→v1 (state preserved). Keep the fixtures as JSON files under `src/test/fixtures/` — they are the regression record.
- **Store behaviour**: `archiveTask` cascades to sub-tasks under one `archivedAt` and `restoreTask` restores only those; `deleteTaskWithCleanup` removes sub-tasks, shadow calendar event/reminder, and the note's `ArtifactLinkMark`; `deleteNoteWithCleanup` strips the note from tasks/events/reminders `crossAppRefs` and deletes its structured entries; recurrence actions (`skip/endBefore/detach/split` × event/reminder); `commitOccurrences`/`uncommitOccurrence`; `setActiveView` back/forward history semantics (push clears forward; back pushes onto forward; cap 6); `hotkeyOverridesStore.findConflicts`; `taskCalendarBackfill` is idempotent.
- **Sync (`services/sync/syncService.ts`, `mappers.ts`)** with the fake Supabase: (1) **mapper round-trip** — for every entity, `rowToX(xToRow(entity))` equals the entity (generate with factories; this catches a forgotten column immediately — the rule "every new column needs a mapper update"); (2) `mergeRecords`: remote tombstone deletes local; **newer `updatedAt` wins either way**; local-only entries untouched; timestamp-less entities (`Tag`, `list_types`, `portfolio_tags`) fall back to remote-wins but stay tombstone-aware; (3) `syncDiff` issues `update deleted_at` not `delete`; (4) **per-table failure isolation** — one table's error hydrates the rest, names the failed table in status, and suppresses the "remote empty → push local" branch; (5) `enqueue()` mutex — `initSync` and `forceUpload` never interleave; (6) `customListTypes` never uploads built-ins; (7) **sign-out order** — `stopSync()` is called before the wipe (regression test for the old soft-delete-everything bug).
- **`services/crossAppLinkCleanup.ts`** — all three directions, no dead links.
- **Encryption** (`services/vault.ts`, `noteSecrets.ts`, `listSecrets.ts` — port the two Node harnesses described in CLAUDE.md: 21 + 19 checks): the stored note, its sync row and its structured entries contain none of a set of planted secret strings; view returns plaintext unlocked and only the placeholder locked; **25 rapid edits end on the last value *in the payload*, not just the cache** (the re-encryption queue must always encrypt the latest secrets); lock flushes pending edits before dropping the key; wrong passphrase rejected; recovery-code unlock; `verifyVaultSecret` doesn't change lock state; legacy v1 encrypted notes upgrade; `encryptNote` while locked rejects; payload pulled from "another device" decrypts on unlock.
- **Edge functions** (`api/*.ts`): call the default export with a `Request`; assert Bearer-required endpoints return 401 without it, the Strava/Google token refresh window (5 min before expiry), cancelled-instance skipping in `google-calendar-sync`, `speech-recognize` cap and duration-from-payload-size (never trusts the client), `mapSportType` unknown → `'other'`.
- **Speech**: `utteranceDetector` (already checked ad hoc: pauses kept inside one utterance, blips ignored, flush, level callbacks) with synthetic PCM.

## Phase 3 — component and hook tests (jsdom + Testing Library)

`useEscapeClose` (**only the newest overlay closes; order = open order; re-render doesn't reshuffle**), `useCtrlEnterSubmit` (fires once, sees current state, inactive when `active=false`), `ConfirmDialog` (focus on Cancel when destructive; Escape → false; Ctrl+Enter → true and **doesn't also trigger a Ctrl+Enter listener underneath**; queue order — the logic was verified in a browser on 2026-09-20; encode it), `ItemActionDialog`, `TimeInput` (**type a full realistic sequence, not one key**: "2","3","5","9" in 24h; 12h auto-finalize; impossible first digits flash and clear; the blur-before-flush race), `CollectionPicker`, `CrossAppRefPicker` (portaled dropdown; clicking submit right after picking works), and a prefill test for each Add/Edit modal (create → blank, edit → values, switch item → new values — this is also the safety net for brief 01 Task 4). Mock `matchMedia`, `ResizeObserver`, and `scrollIntoView` in a shared setup file.

## Phase 4 — end-to-end (Playwright)

Start from the scripts used on 2026-09-20 (dev server on a spare port, system Edge or bundled Chromium, seed state through `page.evaluate(() => import('/src/store/…'))`). Flows: create/complete/archive/restore/delete a task (delete dialog appears, Escape keeps it); a scheduled task appears on the calendar; recurring event "delete only this one"; Manage → archive/delete an Endeavour; **backup export → wipe → restore round-trip covers every key in `PERSISTED_STORAGE_KEYS`**; hotkey rebind + conflict dialog; theme/clock-format/timezone (timezone change re-stamps events); Notes: create note, tag selection, Create ▸ Task round-trip, link removal; Lists tab drag-and-drop reorder; sign-in/out with a **mocked** Supabase (route-intercept `*.supabase.co`) — see brief 01 Task 2. Keep E2E to ~15 stable flows; anything flaky belongs at a lower level.

## Phase 5 — pattern tests (the "Pattern retrofit backlog" as code)

One Vitest file, `src/test/patterns.test.ts`, that reads source files and fails when the codebase drifts. Each check should print the offending file:line. These are the checks listed in BACKLOG.md's "Pattern retrofit backlog" — implement them all:

1. no `window.confirm|alert|prompt` anywhere in `src`;
2. every `persist(` call has a `name` **that is in `PERSISTED_STORAGE_KEYS`** (or in an explicit allow-list, e.g. `todo-remembered-email`) and a `version`;
3. no `'Escape'` handling outside `useEscapeClose.ts`, `hotkeyBinding.ts` and an explicit list of documented inline handlers that call `stopPropagation`;
4. every component that renders `styles.overlay` (or pane/modal) calls `useEscapeClose`;
5. every `Add*Modal`/`Edit*Modal`/`Edit*Pane` calls `useCtrlEnterSubmit` or binds Ctrl+Enter, except an allow-list (`NoteTagPresetModal`);
6. no hard-coded `Endeavour` in `.tsx`/`.ts` outside `labels.ts` and comments;
7. no raw `type="time"` outside `TimeInput.tsx`; no raw `fetch('/api` (must be `apiFetch`);
8. `hotkeys.ts`: ids unique; every `customizable: true` id appears in `App.tsx` as `matchesHotkeyId(e, '<id>')`;
9. `SYNC_TABLES` matches the `from('…')` fetch list in `runInitSync` (same order — CLAUDE.md warns this must stay in step);
10. every migration file that creates a table contains `grant … to authenticated` (or 022 covers it — encode that exception), and every `supabase/migrations/NNN_*.sql` appears in CLAUDE.md's "Migration history" table;
11. no imports between the domain stores that must not import each other (`taskStore` ⇄ `noteStore`); only `services/crossAppLinkCleanup.ts` may import both;
12. no constant inline `style={{ … }}` (the grep in the backlog table);
13. `tsc` strictness, unused exports: fail on a new unused export in `src/` (the audit script from 2026-09-20 found 40+ — start with an allow-list of today's, then it can only shrink).

## CI

`.github/workflows/ci.yml`: Node 22, `npm ci`, `npx tsc -b`, `npx eslint .` (**only after brief 01 Task 4 lands** — until then use `--max-warnings` with an explicit baseline, or lint changed files only), `npx vitest run --coverage`, `npm run build`. A second job runs Playwright on pull requests. Upload coverage. Don't gate on a coverage percentage at first; do require that Phase 1 modules stay above ~85%.

## Order of work and definition of done

Phase 1 → 2 → 5 → 3 → 4 → CI. Done when: `npm run check` passes locally and in CI; Phase 1–2 and 5 fully implemented; ≥15 E2E flows green three times in a row; `docs/` explains how to run and add tests (a short "Testing" section in CLAUDE.md pointing here, plus a rule in "Pattern governance": *a new pattern ships with a pattern test*).

---

# Part B — Engineering hygiene (each item independent)

## B1. Supabase CLI for migrations (do soon — removes a manual step that has already gone wrong)

**Today:** migrations are `.sql` files the user pastes into the SQL editor by hand, and CLAUDE.md's "Live migration status" table is the only record of what ran. Three migrations (019–021) forgot their grants and needed 022; status has drifted from reality before.

**Do:**
1. `npm i -D supabase` (or use `npx supabase`), `npx supabase init` (creates `supabase/config.toml`; `supabase/migrations/` already exists).
2. `npx supabase login`, `npx supabase link --project-ref zwbyvspbamovlqfxpjft` (the user must do the login/link — it needs their credentials and DB password; don't ask for them, write the exact commands and stop).
3. **Baseline**: migrations must be `<timestamp>_name.sql` for the CLI's history table. Renaming 001–031 changes the history the docs cite by number, so instead run `supabase db pull` to capture the live schema as one baseline migration and `supabase migration repair --status applied <version>` for it, then **name future migrations with the CLI's timestamps** (`supabase migration new <name>`), keeping the numeric files 001–031 as read-only history under `supabase/migrations/legacy/`. Write down the decision.
4. Workflow after: `supabase migration new x` → edit → `supabase db push` (the user runs it) → `supabase migration list` is the source of truth. **Replace** CLAUDE.md's "Live migration status" table and rules 1–5 with this workflow (keep the grant rule: a table-creating migration must include its own `grant … to authenticated`), and keep a one-paragraph history pointing at `legacy/`.
5. CI job: `supabase db lint` / a check that new migrations include grants (pattern test 10 above).

## B2. `vercel.json`: SPA fallback + security headers (small; do soon)

Add `rewrites` so deep links don't 404 (`{ "source": "/((?!api/).*)", "destination": "/index.html" }` — needed for the planned `/organizer`, `/portfolio`… routes and harmless now) and a `headers` block for `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (allow `microphone=(self)` — voice dictation needs it). **CSP is the risky part**: ship it as `Content-Security-Policy-Report-Only` first and watch for violations before enforcing. Allowed origins to start from: `self`, the Supabase project URL (`connect-src` https + wss), `accounts.google.com` / `www.googleapis.com` / `www.strava.com` (redirects/navigation, not fetch — the edge functions call them), Tiptap and the app's CSS-modules need `style-src 'unsafe-inline'`, `img-src 'self' data: blob:`, `worker-src blob:` (the dictation AudioWorklet is loaded from a Blob), and Tauri/Capacitor webviews use their own origins (headers only apply to the Vercel deployment). Verify PWA, dictation, Notes image paste, and the OAuth round trip still work. Note in CLAUDE.md.

## B3. Tombstone purge (design first, then implement)

`deleted_at` rows are never removed (CLAUDE.md "Known issues"). A purge must not resurrect deletions: a device that has been offline longer than the retention window would re-upload an item other devices already deleted, because the tombstone that told it "deleted" is gone. So: retention **≥ 180 days**; a scheduled Supabase job (`pg_cron`: `delete from <table> where deleted_at < now() - interval '180 days'`) for the 8+ synced tables; and make the client refuse to upload a local entry whose `updatedAt` is older than the retention window *and* whose id isn't in the remote (treat as stale). Write the design in the docs entry before changing anything; ship as a migration through the B1 workflow. Low urgency at current data scale.

## B4. Split the very large files (do after Part A phases 1–3 exist)

`NoteEditor.tsx` (~1,900 lines), `CalendarView.tsx` (~1,400), `WatchlistView.tsx` (~1,150), `ListsSection.tsx` (~900), `uiStore.ts` (~800). This is **not a quick change** — they hold many interdependent effects and refs, and behaviour in them (autosave flush, tab restore, drag and drop, the hourly grid) has regressed before. Do it as pure moves, one seam at a time, each its own commit: e.g. `NoteEditor` → toolbar, tab bar, table hover controls, section-lock controls, heading-key handler as hooks (`useNoteEditorHotkeys`); `CalendarView` → `MonthView`, `WeekGrid`, `DayGrid`, `useCalendarNavigation`, `useItemsByDate`; `WatchlistView` → table, detail pane, columns config; `uiStore` → slices per concern (navigation, modals, notes-session) combined with zustand's slice pattern while keeping one store and the same persisted keys. No behaviour change, no CSS class renames beyond moving them. After each move: tsc, lint, the tests from Part A, and a manual pass on that area. Most of the remaining `react-hooks/refs` errors (NoteEditor, ChronicleView) are easier to fix *after* the split.

## B5. Central z-index tokens (optional tidy; low value)

**What it means:** every overlay currently hard-codes its own `z-index` (modals 28/30/100/102/110/1000, panes 100/101, Quick Access 400, voice indicator 500, confirm dialog 1100, link preview 10000 — see CLAUDE.md "Known issues"). It only bites when one overlay opens over another: a modal launched from inside a pane must beat the pane's tier, and it has been gotten wrong before (Add Task under Task pane; Manage modals under the Manage pane). **The fix** is naming the tiers once in `src/index.css` (`--z-modal: 30; --z-pane: 100; --z-over-pane: 102; --z-summoned: 400; --z-dialog: 1100; --z-tooltip: 10000`) and replacing the numbers with `var(--z-…)` in each `.overlay`/`.pane` rule, so the next modal picks a *meaning* instead of a number. It's mechanical (~60 declarations) and safe if you keep every numeric value identical. Only do it if you're touching those files anyway; add a pattern test ("no numeric `z-index` in module CSS") if you do.

## B6. Type-safety leftovers (small)

`calendarStore.ts` has 13 `any`s, all inside its persist `migrate(state: any, version: number)` function (lines ~258–306) — type the persisted shape per version instead — and `listStore.ts:317` has one; `portfolioStore.ts` has 4 `@ts-ignore` (lines ~173–223) that ESLint wants as `@ts-expect-error`. For each: replace `any` with the real record type (or a generic on the helper), and change `@ts-ignore` → `@ts-expect-error` with a one-line reason — then delete any that no longer error. Also drop unused destructured `_` variables (`calendarStore` ×2, `hotkeyOverridesStore`, `scheduleStore`) using `const { [id]: _removed, ...rest }` with `// eslint-disable-next-line @typescript-eslint/no-unused-vars` or a `Object.fromEntries(filter)`; and `config/apps.ts`'s unused `_view` param. Goal: `@typescript-eslint/*` errors → 0. Cheap, mechanical, test-guarded.

## B7. Remaining lint after brief 01

Whatever brief 01 leaves: `react-hooks/refs` (NoteEditor, ChronicleView — reading refs during render), `preserve-manual-memoization` (NoteEditor ×2), `react-refresh/only-export-components` (`NavSidebar` exports `CORE_NAV_ITEMS` next to the component — move it to `config/`), `no-empty` (3 empty `catch {}` blocks in `AddListItemModal`, `AddTaskModal`, `TaskItem` — add a comment saying why ignoring is fine, or handle), `no-unused-expressions` (2). Then turn ESLint into a CI gate (Part A).

## When done

The **Bookkeeping** section at the top applies: set the Status line to Done with the outcome (say which Part A phases and Part B items are finished and which aren't), and log every finished item. In addition, log each finished item in `docs/features/implemented-features.md`; keep CLAUDE.md true (new scripts, the migration workflow replacing the "Live migration status" table, any new pattern) and update BACKLOG.md's "Pattern retrofit backlog" as checks turn into tests.
