# Android — gap analysis against the desktop app (2026-10-04)

What the desktop/web app can do that the Android build can't yet do, or can't do well on a phone, with a proposed treatment for each gap. The rules every Android build follows are in [`11-design-and-coding-patterns.md`](11-design-and-coding-patterns.md); this file is the *what*, that one is the *how*.

**Status:** Draft, being reviewed with the user. All 13 decisions made 2026-10-04 (see §J). Last reconciled against `implemented-features.md` on 2026-10-04 (newest entry: "Tasks: the open task is highlighted in the list…", 2026-10-01). Items marked **Decision Dn** wait on a sign-off listed in §J. When a decision is made, record it in §J, update the affected rows, and turn each workstream in §K into a numbered brief.

**How this was produced:** a read of CLAUDE.md, every `docs/` file and BACKLOG.md, plus a code survey of `src/` on 2026-10-04 (which components branch on `isAndroid`, which CSS has `:global(.platform-android)`, which interactions are hover-, drag- or hotkey-only). **Nothing here was checked on a device or emulator.** "Verify" rows mean "probably fine, look before closing". Gap rows are inferred from the code, and a few may turn out to work.

**Baseline:** Android Track A, Phase 1 (Tasks), Phase 2 (Calendar) and the 2026-09-16 catch-up are built and were verified on an emulator; see [`implementation-status.md`](implementation-status.md). Everything in `docs/features/implemented-features.md` dated after 2026-09-16 has had **no** Android pass.

Legend: **Severity**: H = broken or unreachable on Android; M = works but painful on a phone; L = polish. **Size**: S < half a day, M = 1–2 days, L = several days.

---

## Summary

| Area | State on Android | Biggest gaps |
|------|------------------|--------------|
| Platform / foundation | Shell built (nav, More sheet, full-screen panes, back button, haptics, links) | `/api/*` unreachable; OAuth can't return to the app; file export; back button misses newer overlays; hover-only actions everywhere |
| Tasks | Phase 1 built | Task links / blocked / completion options have no touch path; swipe-delete vs Recycling Bin |
| Calendar | Phase 2 built | Quick-add has no Deadline; drag-to-move vs swipe/scroll unverified; newer rendering unverified |
| Records | **Not built** (Phase 3 spec exists, partly stale) | Edit/delete rows unreachable (hover-only); no master-detail; no quick-log |
| Lists | **Not built** (Phase 4 spec exists, predates checklists) | Checklists, the best phone use case, are unspecced; hover-only row actions; tab drag |
| Notes | **No spec at all** (free tier) | 3-column Chronicle, touch editing in Tiptap, selection toolbar vs Android's own menu, drag features |
| Overview | Reachable from More, generic 600px CSS only | No mobile design; could be the phone's home screen (Decision D7) |
| Fitness / Portfolio | Reachable, unverified | Strava and quotes depend on `/api/*`; Portfolio table is wide |
| Suite-wide panes | Mostly full-screen | Manage view row actions hover-only; Quick Access has no entry point; backup export/download |
| Notifications | **Not built** (Phase 5, no `05-notifications.md`) | Spec must cover Deadlines, whole-day reminders, optional notify-before and Schedules |
| Launcher icons, monetization | **Not built** (Track A step 8, Track B) | Unchanged since the architecture doc |

---

## A. Platform and foundation

| ID | Gap | Sev | Proposed treatment | Size |
|----|-----|-----|--------------------|------|
| A1 ✅ | **`/api/*` calls fail on Android.** `utils/apiFetch.ts` only special-cases Tauri. Under Capacitor the page is served from `https://localhost`, so a relative `/api/...` hits nothing. Breaks Google Calendar sync, Strava sync, Portfolio ticker quotes and voice dictation. (BACKLOG "Desktop (Tauri) API access … Android equivalent still open".) | H | **Done 2026-10-04 (W1).** `apiFetch()` calls the production origin through `CapacitorHttp` on Android (adapted back into a `Response`); a pattern test forbids a bare `fetch('/api…`. Verified on the emulator (Portfolio ticker search + quote). Was: Add an Android branch to `apiFetch()` that calls the production Vercel URL through Capacitor's built-in `CapacitorHttp` (native HTTP, no CORS), mirroring the Tauri branch. Pattern: **11 §12.1**. | S |
| A2 ✅ | **OAuth connect can't come back to the app.** The Strava and Google connect flows redirect to the Vercel web callback, which lands in the system browser, not the app. | H | **Done 2026-10-04 (W1).** Custom scheme `organisaitor://` (manifest intent-filter), one router `services/android/deepLinks.ts`, `oauth-done` route, `@capacitor/browser` for the flow, callbacks return to the app when the nonce says so (migration 041, **pending until the user runs it**). Verified on the emulator with a local stand-in for the provider and callback; not yet against real Google/Strava (needs the deployed callbacks, migration 041 and a signed-in account). Was: **Decision D5.** Recommended: open the flow in `@capacitor/browser`. The callback page finishes the server-side save, as it does today, then redirects to `organisaitor://oauth-done?provider=…`. An App URL listener closes the browser and refreshes the connection status. Needs a custom URL scheme in `AndroidManifest.xml`. | M |
| A3 | **Done 2026-10-04 (W2).** **Back button closes overlays from a fixed flag list** (`closeTopmostMobileOverlay()`), which misses everything newer: `ConfirmDialog`, `ItemActionDialog`, the Task/List/Note pickers, the filter sheets, `CalendarSidePane`, the Overview modal, `HoverOptions`/`RowHoverActions` menus. Pressing back with one of those open closes the wrong layer or leaves the section. (BACKLOG "Android back button should use the same overlay stack as Escape".) | H | Back = the Escape stack. Export `closeTopOverlay()` from `useEscapeClose.ts`, call it first, and delete the flag list. Pattern: **11 §4.1**. | S |
| A4 | **Done 2026-10-04 (W2).** Back button ignores Notes' note-level history when the section history is empty: it checks `sectionHistory.length` before calling `navigateBack()`, so it minimises instead of going to the previous note. | M | Let `navigateBack()` report whether it moved and minimise only when it didn't. Fold into A3. | S |
| A5 | **Done 2026-10-04 (W2)** for `RowHoverActions`, `HoverOptions` and `TruncatedText` (LinkHoverPreview / calendar hover cards: n/a, a tap opens the item). **Hover-only affordances have no touch path anywhere:** `RowHoverActions` (Manage view, Records, Lists, Chronicle, Overview, Sidebar), `HoverOptions` (Complete alternatives), `TruncatedText` reveal, `LinkHoverPreview`, calendar hover cards. | H | **Decision D1.** Long-press opens the same actions as a bottom action sheet. Pattern: **11 §5–6**. One shared hook makes every `RowHoverActions`/`HoverOptions` site work at once. | M |
| A6 | **Hotkey-only features have no touch entry:** Quick Access (`Ctrl+G`), Notes "Create ▸" (has a toolbar button; check it), new tab (`Ctrl+T`; has a `+` button), Notes heading shortcuts (`Ctrl+H`), light rich text (`Ctrl+B/I/L` in task/calendar notes), dictation (`Ctrl+D`). | M | Rule: every hotkey records its touch path or "n/a + why" (**11 §6.2**, with a pattern test). Concretely: Quick Access gets a search icon in the mobile header (**Decision D6**). Dictation: rely on the keyboard's mic (already decided in `01-tasks-app.md` §3.1). Rich-text hotkeys: n/a on phone. | S–M |
| A7 ✅ | **File export doesn't work.** `downloadBackup()`, the ErrorBoundary's "Export backup" and the "export a snapshot" button use `<a download>`, which an Android WebView ignores. | H | **Done 2026-10-04 (W1).** `utils/saveFile.ts`: cache directory + share sheet on Android; every export uses it. Verified on the emulator (share sheet, valid JSON). Restore's `<input type=file>` opens the system picker as-is. Was: `@capacitor/filesystem` writes the file to cache, then `@capacitor/share` opens the share sheet (save to Drive, Files, email). Wrapped in one `saveFile(name, blob)` util used by every export. Pattern: **11 §12.2**. Check that import via `<input type=file>` works (Capacitor's WebChromeClient supports file choosers). | M |
| A8 | **Done 2026-10-04 (W2)**: `BottomSheet`, `ActionSheet`, `useLongPress`, `useSwipeRow` built (`useMasterDetail` comes with its first user). Shared mobile primitives are copy-pasted: each filter picker carries its own `.sheetOverlay/.sheetPanel` CSS and markup. | M | Extract one `BottomSheet`, plus `ActionSheet`, `useLongPress`, `useSwipeRow` and `useMasterDetail` (**11 §7**). Prerequisite for most workstreams. | M |
| A9 ✅ | Soft keyboard: it's unknown whether `MobileQuickAddBar`, the calendar quick-add sheet and full-screen modals stay above the keyboard. `@capacitor/keyboard` is installed with no configuration. | M | **Done 2026-10-04 (W1).** All three checks pass on the emulator with `resize: 'body'` (quick-add bar with chips, calendar quick-add sheet, AddTaskModal's bottom link field); no layout fix needed. Both quick-add titles now set `enterKeyHint="done"`. Was: Verify on the emulator, then fix by pattern **11 §10.3** (resize mode `body`, a `--keyboard-height` variable for bottom-anchored bars). | S |
| A10 | **Done 2026-10-04 (W2).** Toasts (completion toast with Undo / Follow-up): may overlap `MobileNav`/`MobileQuickAddBar` at the bottom of the screen. | M | Verify; on Android, place the toast above the bottom chrome (**11 §3**). | S |
| A11 | Multi-entry-point launcher icons are not built. | L | Unchanged; `00-architecture.md` §4. Workstream W10. | M |
| A12 | Notifications are not built. `05-notifications.md` now exists as a draft (2026-10-04, proposals N1–N10). Since BACKLOG §6 was drafted, desktop added the Deadline kind, whole-day reminder notifications (`notifyDaysBefore`/`notifyAtTime`), optional notify-before, important items and Google-import notifications. | H | Write `05-notifications.md` from BACKLOG §6, updated for those. **Decision D9** on priority. | L |
| A16 | **Desktop bug, all platforms (found 2026-10-04):** Deadlines never notify. `useNotificationChecker` has no `deadlines` loop, and since 2026-09-27 task-deadline shadows are `CalendarDeadline`s, so its `reminderType === 'task'` branch matches nothing. | H | First step of `05-notifications.md` N1 (shared `plan.ts` with a Deadline rule), or a standalone fix sooner. | S |
| A13 | Monetization (Track B) is not built: `isAppEnabled()` is still the always-true stub. | — | Unchanged; `00-architecture.md` §7. Not parity work, so it's out of this analysis except for ordering (§K). | L |
| A14 | "Trust this device" for the encryption vault keeps the key in IndexedDB (convenience-only). On Android, the Keystore (with biometric unlock) is the natural home. (BACKLOG, client-side encryption.) | L | Later. Note it in 11 §11 as the intended direction. | M |
| A15 | IndexedDB size and behaviour in the Android WebView are unmeasured (notes store, Recycling Bin, auto-backups). | L | Verify with real data during the Notes workstream (Settings → Storage already reports usage). | S |

## B. Tasks

| ID | Gap | Sev | Proposed treatment | Size |
|----|-----|-----|--------------------|------|
| B1 | **Done 2026-10-04 (W2).** Completion alternatives (`HoverOptions` on the checkbox and the pane's Complete: *complete + follow-up*, *complete with the N it's waiting on*, *add a follow-up*) are hover-only. | M | Long-press the checkbox to open an action sheet built from `taskCompletionOptions()` (A5). | S |
| B2 | **Done 2026-10-04 (W2).** **Swipe-left delete conflicts with the newer rules.** It deletes straight away when the red button is tapped. Desktop now confirms every delete, archive exists, and deletes go to the Recycling Bin. | M | **Decision D2.** Recommended: swipe left reveals **Archive** and **Delete**; Delete deletes at once and shows an Undo toast (it's in the Recycling Bin anyway). | S |
| B3 | Task links (`TaskLinksField`, `TaskPickerModal`) and the blocked-task hatch: unverified at phone width. The picker list is keyboard-oriented. | M | Verify; make sure the picker is full-screen with ≥44px rows. | S |
| B4 | Linked checklists inside `TaskPane` (tick steps): unverified touch targets. | M | Verify; apply the 44px rule. | S |
| B5 | `MobileQuickAddBar` has no *Scheduled* (work-on date) chip, only Due. | L | **Decision D8.** Optional extra chip. | S |
| B6 | `01-tasks-app.md` says "Nothing described here is built". It is built. | L | Status line fixed in this pass. | — |
| B7 | **`AddTaskModal`'s "More options" bar opens only on hover or keyboard** (`onMouseEnter`/`onKeyDown`, no `onClick`). On Android a tap opens it only when the WebView happens to emulate a mouseenter; in testing (W1, 2026-10-04) a tap usually just focused it. Tags, links, type and linked items are then unreachable from the full modal. | M | Add `onClick={() => setAdvanced(true)}` (the hover stays on desktop). Found during W1, not fixed there (outside its files). | S |

## C. Calendar

| ID | Gap | Sev | Proposed treatment | Size |
|----|-----|-----|--------------------|------|
| C1 | `MobileCalendarQuickAdd` offers Event or Reminder only. **Deadline** (2026-09-27) is missing, and it calls `addEvent`/`addReminder` directly rather than the shared input builders (`utils/calendarItemInput.ts`). | H | Add the Deadline kind and build through `buildCalendarEventInput`/`buildCalendarReminderInput` (and the deadline equivalent). Pattern **11 §8**. | S |
| C2 | **Drag-to-move/resize** (pointer events, `useTimeGridDrag`) on the same surface as swipe-to-change-period and vertical scroll. Unverified; likely either fires on any touch or fights the scroll. | H | **Decision D3.** Recommended: on Android, long-press a block (about 400 ms, with haptic) to pick it up, then drag; a plain touch scrolls or swipes as before. | M |
| C3 | Newer rendering not checked at phone width: background/banner events, the whole-day zone, collapsed night, Travel blocks, the reminder redesign, tentative hatch in dark mode, the Deadline marker. | M | Verification pass; fix only what's broken (the 06 Task 4 method). | S–M |
| C4 | `RecurrenceScopeBar`, `ScheduleOccurrencePopover`, `CalendarImportReviewModal` and the Deadline pane at phone width. | M | Verify; popover becomes a bottom sheet if it clips. | S |
| C5 | Calendar hover cards show notes and links; on touch these appear only after opening the pane. | L | n/a; tapping opens the pane. Record as a deliberate difference. | — |
| C6 | Google Calendar sync and ICS import: sync depends on A1/A2. | H | Covered by A1/A2. | — |
| C7 | The architecture doc and `02-calendar-app.md` still describe `CalendarLayersPicker`/`ManageSchedulesPane`, both superseded by `CalendarSidePane` (which already has Android CSS and an overlay). | L | Doc fix; check the side pane on the emulator. | S |

## D. Records (Phase 3 — not built)

`03-records-app.md` is still the right shape (master-detail, quick-log for single boolean/rating trackers, stacked history, swipe-delete on entries), with these corrections:

| ID | Gap | Sev | Proposed treatment | Size |
|----|-----|-----|--------------------|------|
| D1 | Tracker and routine rows use `RowHoverActions`, so edit/archive/delete are **unreachable** on Android. | H | A5 (long-press action sheet) plus a ⋯ in the detail header. | S |
| D2 | No master-detail collapse; the generic `@media (max-width:600px)` stacks the sidebar above the detail. | H | Build per 03 §3 using `useMasterDetail` (11 §7). | M |
| D3 | 03 §6 says `taskStore` is at v8; it's v13. Archiving and Endeavour filing of trackers/routines exist now and aren't mentioned. | L | Refresh the 03 spec in workstream W5. | S |
| D4 | Quick-log, stacked routine history, swipe-delete on entries, haptics on routine steps. | M | As specced in 03 §4–5. | M |

### D-hold. Records is ON HOLD (decided 2026-10-04)

The user put Records/trackers on hold until the other workstreams are built. Nothing below is decided. When it resumes, start here: get answers to Q1–Q3, sign off R1–R8, then rewrite `03-records-app.md` and write the W5 brief.

**Proposals discussed 2026-10-04 (not signed off):**
- **R1 Today screen as the Records home:** routines due today and trackers as cards you log *on the card*; logged ones show their value and sink; the full tracker list sits below.
- **R2 Inline logging for more field types:** boolean = tap, rating = stars, number = stepper/number pad, select = chips, duration = h/m picker, routine = expand the card and tick steps. Multi-field trackers use a bottom sheet instead of the full `AddEntryModal`.
- **R3 "Same as last time":** forms pre-fill from the previous entry.
- **R4 7-day strip** of logged/missed dots on each card (desktop too).
- **R5 Backfill:** date chip (Today / Yesterday / pick).
- **R6 Tracker detail:** entries newest first; swipe left to edit/delete; long-press the tracker for edit/archive/delete. Creating a tracker and editing its fields stay "accessible, not optimised".
- **R7 Sync routine step ticks:** today `routineStore` instances are local-only (completing a routine creates a synced tracker entry, but half-ticked steps never leave the device). Needs a new synced table and a migration.
- **R8 Ties into reminders:** "Remind me" prompts and the Log ✓ notification action (`05-notifications.md` N7, decided) land here.

**Open questions for the user:**
- **Q1** What is "due today" for a tracker (they have no schedule)? Either every tracker shows on Today, or only trackers with "Remind me" days. Leaning: only those with reminder days.
- **Q2** Sync routine step ticks (R7)? Leaning: yes.
- **Q3** Any tracking that doesn't fit these shapes (photos, several entries a day, timers)? Facts found: a tracker already allows several entries per day (`trackerStore.addEntry` has no per-day uniqueness), so "already logged today" means "at least one entry today".

**Note:** `05-notifications.md` N7 (tracker/routine "Remind me", decided) is part of the notifications work, not Records. Its skip-if-logged-today rule must match whatever Q1/Q3 settle.

## E. Lists (Phase 4 — not built)

`04-lists-app.md` covers watchlists and reference lists. Its prerequisite still holds: `ListsSection` still keeps `selectedListId` in local `useState`. What's changed since:

| ID | Gap | Sev | Proposed treatment | Size |
|----|-----|-----|--------------------|------|
| E1 | **Checklists** (2026-09-28: shopping lists, reusable checklists, links to tasks) aren't in the spec, and they are probably the most phone-shaped feature in the suite: you tick items in a shop with one hand. Today they get a 28px checkbox and nothing else. | H | **Decision D4.** Recommended "shop mode": big rows, tap anywhere on a row to tick, ticked items sink (already built), a sticky quick-add bar at the bottom, the screen kept awake while open, haptic on tick. | M |
| E2 | Sidebar rows use `RowHoverActions`, so list edit/delete are unreachable. | H | A5 plus a ⋯ in the list header. | S |
| E3 | Tab drag-reorder (HTML5 drag-and-drop) doesn't work by touch (`07-drag-and-drop-touch.md`). | M | **Decision D10** (07's A/B choice). Recommended: long-press-to-drag via the shared `useLongPress`, hand-rolled (07 Option B), so it shares code with C2 and the Chronicle tree. | M |
| E4 | Encrypted lists (`DecryptPrompt`), `ListLinksBar` and `ListPickerModal` at phone width. | M | Verify; full-screen. | S |
| E5 | Master-detail, single-column cards, stacked reference table, list-item quick-add, tap-to-cycle status, swipe-delete. | H | As specced in 04, after the `uiStore` prerequisite. | L |

## F. Notes (no Android spec yet)

Notes is free on Android (ADR-4) and has never had a phone design. It is the largest gap. Areas a spec has to cover:

| ID | Gap | Sev | Notes |
|----|-----|-----|-------|
| F1 | **Layout:** Chronicle is 3 columns (notebooks tree, note list, editor), with only a generic 560px stack. | H | Three-level master-detail: notebooks, then notes, then editor. Back walks up. Breadcrumb in the header. Selection state already lives in `uiStore`. |
| F2 | **Editing scope.** | H | **Decided (D11):** read-first. The default note screen is a clean reading view (title, tabs, content). Editing stays possible, but every tool is collapsed behind a small arrow. Columns, tables and other layout render readably but aren't edited on a phone. |
| F3 | **Selection toolbar vs Android's own text-selection menu.** `FloatingToolbar` appears on selection, and so does the system Copy/Paste menu. They overlap. | H | **Decided (D11):** no floating toolbar on Android. Tools live in one collapsed bar (small arrow to expand) docked above the keyboard while editing. Selecting text shows only the system menu. |
| F4 | Tabs: Ctrl+Tab cycling and drag-reorder. | M | Swipeable tab strip; reorder via the shared long-press drag (D10). |
| F5 | Tree drag-to-nest (Chronicle) and indent/outdent buttons. | M | Long-press drag (D10) plus "Move to…" in the row action sheet as the reliable path. |
| F6 | Linked-from bar: dragging a pill into the text. | L | n/a on phone; the existing "insert at cursor" action covers it. |
| F7 | Zoom (Ctrl+scroll / Ctrl+=). | L | Pinch-to-zoom on the editor, or n/a, decided inside the Notes spec. |
| F8 | Structured tags (Acronym popover), annotation tags, NotePicker, templates, encryption prompt. | M | Bottom sheets; verify. |
| F9 | Camera / photo capture into a note. | — | **Dropped for now (D11)**: Notes on a phone is read-first. |

## G. Overview

| ID | Gap | Sev | Proposed treatment |
|----|-----|-----|--------------------|
| G1 | Overview only has the generic 600px CSS (sidebar stacked at 40vh, two columns hidden). | M | Master-detail: list of Overviews (Endeavours, then My overviews), then the result list as cards grouped like desktop; tapping a row opens the item (`open.ts`). |
| G2 | Overview is buried in the More sheet. Its "everything about X" question fits a phone home screen well. | M | **Decision D7.** Options: keep it in More; replace one tab; or make it the More tab's landing page. |

## H. Fitness and Portfolio (add-ons)

| ID | Gap | Sev | Proposed treatment |
|----|-----|-----|--------------------|
| H1 | Strava sync and Portfolio quotes need `/api/*`. | H | A1/A2. |
| H2 | No Android layout pass on either section. Portfolio's watchlist is a wide table. | — | **Deferred (D12)** to the add-on phases. |

## I. Suite-wide panes

| ID | Gap | Sev | Proposed treatment |
|----|-----|-----|--------------------|
| I1 | **Done 2026-10-04 (W2).** **Manage view** (Endeavours/Purposes/Tags) is reachable from More, but its row actions are hover-only, so you can't edit, archive or delete anything. | H | A5. |
| I2 | Quick Access has no entry point. | M | A6 / D6. |
| I3 | Recycling Bin: reachable from Account. | — | Fine; verify layout. |
| I4 | Settings: Storage, auto-backup and hotkey table. | L | Hide the hotkey table on Android unless a hardware keyboard is attached (or n/a). Auto-backup snapshot export depends on A7. |
| I5 | Notification bell (`NotificationCenter`) placement in the mobile header. | L | Verify. |
| I6 | The AI agent command layer has no UI on any platform yet. | — | Out of scope. The BACKLOG "phone widget" idea stays there. |
| I7 | **Integrations pane has no entry point on Android** (only `NavSidebar`, hidden on Android, opens it). So a guest can't export a backup at all (Account shows Export only when signed in), and nobody can import an ICS file or download an auto-backup snapshot. Found during W1, 2026-10-04. | H | Add Integrations to `MobileMoreSheet` (or move Export/Import into Account for guests). The export itself works on Android (A7); the file chooser works (verified via Account → Restore). |

---

## J. Decisions needed (sign-off log)

Each decision is recorded here once made: the date, the choice, and anything rejected. Recommendations are in the rows above and in the patterns doc.

| # | Question | Recommendation | Status |
|---|----------|----------------|--------|
| D1 | Touch equivalent for hover actions | Long-press opens an action sheet with the same items; plus a visible ⋯ wherever a detail header exists | **Decided 2026-10-04**, as recommended |
| D2 | Swipe-left on rows | Reveal Archive + Delete; Delete is immediate with an Undo toast (Recycling Bin) | **Decided 2026-10-04**, as recommended. Pane footers keep the confirm dialog; irreversible actions always confirm |
| D3 | Calendar drag on touch | Long-press to pick up, then drag | **Decided 2026-10-04**, as recommended |
| D4 | Checklist "shop mode" | Yes: big rows, tap-row-to-tick, keep the screen awake, bottom quick-add | **Decided 2026-10-04**, as recommended (plus "Untick all" in the action sheet for reusable checklists) |
| D5 | OAuth return to the app | Custom scheme `organisaitor://`, redirected to from the callback page | **Decided 2026-10-04**, as recommended |
| D6 | Quick Access entry point | Search icon in the mobile header, every section | **Decided 2026-10-04**: swiping down on the mobile header slides Quick Access in from the top (the user's preferred way in), **and** the 🔍 header icon stays as the visible alternative. Header swipe-down was free: edges = system back, horizontal = period/tab, pull-down on content = sync |
| D7 | Where Overview lives | — (options in G2) | **Decided 2026-10-04: (b)** first item in the More sheet, with a proper mobile design (G1). Rejected for now: replacing the Records tab (Records is a daily-logging section and isn't built yet); revisit once Overview is used on the phone |
| D8 | Scheduled chip in task quick-add | Optional; low priority | **Decided 2026-10-04**: include it, next to Due |
| D9 | Notifications priority | After parity workstreams W1–W3; before Records/Lists polish | **Decided 2026-10-04, changed from the recommendation**: reminders and record tracking are, in the user's words, "some of the most important reasons to have this app" and must be designed "really well". Notifications (W9) and Records (W5) move up to start right after W1/W2, ahead of the other sections. Both get a design conversation with the user before their briefs are written |
| D10 | Touch drag-and-drop approach (07's A vs B) | B: one hand-rolled long-press-drag hook shared by tabs, tree and calendar | **Decided 2026-10-04: B** (hand-rolled `useTouchDrag`). Rejected: a drag-drop-touch polyfill (position translation risky for the tree's 3-zone drop) |
| D11 | Notes editing scope on phone | Read + capture + light edit first-class; layout/table tools accessible, not optimised | **Decided 2026-10-04, changed from the recommendation**: Notes on a phone is **read-first and simple**, and the main job is finding and reading notes written on desktop. All editing tools (formatting, headings, tags, Create ▸, …) are **collapsed by default** behind a small arrow that opens them. The design focus is simplicity and access to notes, not editing parity. Camera capture (F9) is dropped for now |
| D12 | Fitness/Portfolio timing | "Doesn't break" pass now; design with the add-on phases | **Decided 2026-10-04**: not required now; no pass at all until the add-on phases |
| D13 | Governance: Android parity check in every feature's definition of done | Yes (11 §14) | **Decided 2026-10-04**: added to CLAUDE.md's "Checklist Before Done"; hotkey `touch` field logged in BACKLOG.md's Pattern retrofit backlog |

## K. Proposed workstreams (briefs to write once decisions are in)

Each becomes a self-contained brief in `docs/android/` that a cold agent can pick up with CLAUDE.md and the patterns doc, in the `06-web-session-catchup.md` style: tasks, acceptance checks on the emulator via CDP, and a "when done" section.

| W | Workstream | Covers | Depends on | Parallel? |
|---|-----------|--------|-----------|-----------|
| W1 | Platform services: brief `docs/agent-tasks/05-android-w1-platform-services.md` | A1, A2, A7, A9 | D5 | **Done 2026-10-04** (branch `android/w1-platform-services`; migration 041 pending). See `implementation-status.md` "W1 — platform services" |
| W2 | **Done 2026-10-04.** Mobile primitives + back/overlay unification: brief `docs/agent-tasks/06-android-w2-mobile-primitives.md` (adds TruncatedText and the hotkey `touch` field) | A3, A4, A5, A8, A10, I1 | D1, D2 | Yes. **Start first**: W3–W8 build on it |
| W3 | Tasks + Calendar catch-up | B1–B4, C1–C4, C7 | W2, D3 | After W2 |
| W4 | Touch drag-and-drop | E3, F4, F5, C2's pickup | W2, D10 | After W2 |
| W5 | Records (Phase 3, refreshed) | D1–D4 | **On hold (2026-10-04)**: resume after the other workstreams; see §D-hold | — |
| W6 | Lists (Phase 4, refreshed, with checklists) | E1–E5 | W2, D4 | After W2 |
| W7 | Notes, read-first (new spec, then build) | F1–F8 | W2, W4, D11 | Spec now; build after W2 |
| W8 | Overview + Quick Access + Manage | G1, G2, I1, I2 | W2, D6, D7 | After W2 |
| W9 | Notifications and reminders (write `05-notifications.md`, build): **priority** | A12 | Design session with the user | Spec now; build alongside W1/W2 |
| W10 | Launcher icons, then Track B | A11, A13 | Icon assets | Independent |

**Order (D9, 2026-10-04):** W1 and W2 first and in parallel, with W9 (reminders) built alongside them since it barely touches UI. W5 (Records) was next but is **on hold** (2026-10-04, see §D-hold). So: W3, W6, W8 and W7, then Records. W4 slots in whenever W6/W7 need it; W10 is independent.

W1 and W2 can run at the same time. W3, W5, W6 and W8 touch different sections and can run in parallel once W2 lands. They share one file, `App.tsx`; each brief will name the exact lines it owns.

## L. Doc housekeeping found during this analysis

- The status lines of `00-architecture.md`, `01-tasks-app.md` and `02-calendar-app.md` said "Nothing described here is built". Fixed in this pass to point at `implementation-status.md`.
- `00-architecture.md` §11 reserves `06-notes-app.md`, `07-portfolio-app.md` and `08-fitness-app.md`, but `06` and `07` were since used for the catch-up and drag-and-drop briefs. New Android docs are numbered from 10 upwards; the Notes spec will be `12-notes-app.md` (or whatever number is next when it's written).
- `00-architecture.md` §8 still says "the in-process event bus", which CLAUDE.md says doesn't exist (cross-app links go through `crossAppRefs`). Fix the next time that file is edited.
