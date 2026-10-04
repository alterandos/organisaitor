# Android — design and coding patterns

The rules every piece of Android work follows, so the phone app feels like one product and every agent builds it the same way. This file is to Android what CLAUDE.md's "Component patterns" and "Things that must be consistent" are to the whole suite. Those rules still apply on Android; this file adds the phone-specific ones. Architecture decisions (Capacitor, one APK, entry points, monetization) are in [`00-architecture.md`](00-architecture.md); the list of what's missing is in [`10-gap-analysis.md`](10-gap-analysis.md).

**Status:** Draft, under review with the user (started 2026-10-04). Every rule carries a tag:
- **Adopted**: already in the code; describe and follow it.
- **Proposed**: suggested, awaiting sign-off; don't build on it yet.
- **Decided YYYY-MM-DD**: signed off; follow it.

When a Proposed rule is signed off, change its tag, apply it to new code, and log any existing code that doesn't follow it in BACKLOG.md's "Pattern retrofit backlog" (CLAUDE.md "Pattern governance"). A pattern that can be checked automatically gets a check in `src/test/patterns.test.ts`.

---

## 1. Principles

1. **Adopted. One codebase, shared data layer, per-screen UI choice** (ADR-8). Stores, services, utils and types are shared, always. For each screen, decide: *reuse the desktop component with Android CSS* (occasional, configuration-heavy screens) or *build a mobile component* (daily hot paths: capture, ticking, logging). Record the choice in the section's spec.
2. **Proposed. A phone is for capture, glance and daily logging.** Desktop keeps the deep configuration tools. On a phone, those tools must be *reachable and not broken* ("accessible, not optimised"), but they don't get a mobile redesign unless a decision says so.
3. **Decided 2026-10-04. No dead ends.** Every action that exists on desktop has a way to do it on a phone, or a written reason why it doesn't (§6). Hover, right-click, drag and hotkeys are never the *only* path to an action.
4. **Proposed. Same behaviour, different trigger.** A gesture calls the same service or store action the desktop control calls (`toggleTaskCompletion`, `addTaskWithCalendar`, `navigateBack`, …). Android never re-implements a rule in a component.

## 2. Platform branching

- **Adopted.** JS: `const { isAndroid } = usePlatform()` (`src/hooks/usePlatform.ts`). Outside React: `Capacitor.getPlatform() === 'android'`.
- **Adopted.** CSS: `:global(.platform-android) .x { … }` in the component's own module (the body class is set in `App.tsx`).
- **Proposed. Never rely on `@media (max-width: …)` alone for Android.** Several sections have old narrow-browser rules that predate Android. One of them silently replaced the whole calendar with a flat list (see `implementation-status.md` Phase 2). Phone layout is driven by `.platform-android`; width media queries are for narrow desktop windows only. Before building a section, look for its existing `@media` block and decide whether it applies.
- **Adopted.** Mobile-only components are named `Mobile*` (`MobileNav`, `MobileQuickAddBar`, …) and mounted in `App.tsx` behind `isAndroid`. A shared component that needs a phone presentation takes `variant?: 'dropdown' | 'sheet'` (default desktop) instead of forking (`CollectionFilterPicker`, `PurposeFilterPicker`).
- **Adopted.** Stores never import platform code (ADR-1). Platform services live in `src/services/` or `src/utils/` and are called from components.

## 3. Layout shell

- **Adopted.** Bottom tab bar `MobileNav`: Tasks, Calendar, Records, Lists, More. More opens `MobileMoreSheet` (Overview, Notes, add-ons, Manage Library, Settings, Account). Overview is the **first item** in the More sheet and gets a master-detail mobile design (D7, decided 2026-10-04).
- **Adopted.** Slide-in panes and modals are full-screen on Android (`:global(.platform-android) .pane`). A new pane or modal adds that override in the same change.
- **Proposed. Bottom stack order** (top to bottom): content, toast, section quick-add bar, ad banner (Track B), `MobileNav`, system gesture area. Each layer reserves its height with a CSS variable (`--mobile-nav-h`, `--quick-add-h`), so the toast and the FAB are never hidden behind a bar.
- **Decided 2026-10-04 (D6, D7). Mobile header**, one row on every section: section title (or a breadcrumb in master-detail), then the section's icon actions on the right, in this order: search (Quick Access), filter, section-specific, notifications bell. Icons only, 44px each, `aria-label` from `LABELS`.
- **Adopted.** Safe areas: bottom chrome pads with `env(safe-area-inset-bottom)`.

## 4. Navigation and back

### 4.1 Back button = the Escape stack (Adopted 2026-10-04, W2; fixed gap A3)

The hardware or gesture back button does, in order:
1. **Close the newest overlay**: `closeTopOverlay()` exported from `src/hooks/useEscapeClose.ts`, the same stack Escape uses. Everything that registers `useEscapeClose` (dialogs, pickers, sheets, panes, menus) closes newest-first, with no flag list to maintain. `closeTopmostMobileOverlay()` is deleted.
2. **The screen's own back** (`mobileBackConsumer`): a master-detail detail view goes back to its list.
3. **History**: `navigateBack()`, which already checks Notes' note-level stack first. It returns whether it moved.
4. **Minimise** the app.

Consequence for new code: an overlay that doesn't call `useEscapeClose` won't close on back either. That's the existing Escape rule, so nothing new to remember.

### 4.2 Master-detail (Adopted rule, Proposed hook)

- **Adopted** (`00-architecture.md` §5d): a collapsible list/detail screen keeps its selection in `uiStore`, never local `useState`.
- **Proposed. `useMasterDetail({ selectedId, clear })`**: one hook that (a) tells the section whether to render list or detail on Android, (b) registers the `mobileBackConsumer` while a detail is showing, and (c) renders the header back arrow. Used by Records, Lists, Notes (three levels: it nests), Overview, Portfolio.
- **Adopted** (03/04 §1): entering a section from a launcher icon lands on the list, not a stale detail. **Proposed refinement:** switching tabs inside the app keeps the open detail, the same "state preservation" desktop gives.

## 5. Gesture vocabulary (Decided 2026-10-04: D1, D2, D3)

One meaning per gesture across the whole suite:

| Gesture | Means | Examples |
|---------|-------|----------|
| Tap | The primary action / open | Open a task; tick a checklist row; cycle a watchlist status badge |
| **Long-press** (≈450 ms, `hapticMedium`) | **"More for this item"**: opens the action sheet with the same items desktop shows on hover or right-click | Row actions (edit/archive/delete), Complete alternatives, "Move to…" |
| Long-press **then move** | Drag (reorder, nest, move a calendar block) | Tabs, Chronicle tree, calendar blocks |
| Swipe right on a row | The row's positive state change | Complete a task (built); log a habit tracker |
| Swipe left on a row | Reveal Archive + Delete (D2) | Tasks, tracker entries, list items |
| Horizontal swipe on a canvas | Previous / next period or tab | Calendar periods (built); note tabs |
| Pull down at top of content | Sync now | Built for Tasks; extend to every list section |
| Swipe down on the mobile header | Open Quick Access, sliding in from the top (D6) | Every section; the 🔍 header icon does the same |

Rules:
- **Axis-lock** before committing to a horizontal gesture: `|dx| > 2·|dy|` after 8px (built in `TaskItem`).
- **Edge exclusion**: ignore gestures that *start* within 24dp of either screen edge (system back). Built in Calendar; goes into the shared hooks.
- **Native non-passive listeners** (`addEventListener(..., { passive: false })` in an effect). React's `onTouchMove` is passive, so `preventDefault()` there does nothing. Built pattern; the shared hooks own it.
- A long-press never also fires the tap (cancel the click).
- Every gesture has a visible, tappable alternative somewhere (⋯ button, pane footer). Gestures are shortcuts, not the only path.

## 6. Hover and hotkeys need a touch path

### 6.1 Hover (Decided 2026-10-04: D1)
Anything revealed on hover on desktop has a touch path on Android:
- **`RowHoverActions` and `HoverOptions`**: the shared component also listens for long-press and renders its items in an `ActionSheet` on Android. One change converts every site (Manage, Records, Lists, Chronicle, Overview, task Complete).
- **`TruncatedText`**: on Android, wrap to two lines instead of truncating and revealing.
- **`LinkHoverPreview`**, calendar hover cards: n/a; the tap target already opens the item. Recorded as deliberate.
- New hover affordances must name their touch path in the same change.

### 6.2 Hotkeys (Decided 2026-10-04: D13; built in W2 with its pattern test)
Every `HotkeyDef` in `config/hotkeys.ts` gets `touch: string`, either the touch path ("Header search icon") or `'n/a: <why>'`. A pattern test fails on a hotkey without one. This keeps the gap from regrowing as desktop adds hotkeys. The Settings hotkey table hides on Android unless a hardware keyboard is present.

## 7. Shared mobile primitives (Adopted where built, 2026-10-04; the rest Proposed)

Build once (workstream W2), then use everywhere. Never copy sheet or gesture code into a component again.

| Primitive | Location | Purpose |
|-----------|----------|---------|
| `BottomSheet` | `src/components/BottomSheet/BottomSheet.tsx` (**Adopted**) | Portaled sheet: backdrop tap, drag-down to dismiss, `useEscapeClose` (so back closes it), max-height 85vh, grabber, safe-area padding. Replaces the copies in the filter pickers and `MobileMoreSheet`. |
| `ActionSheet` | `src/components/ActionSheet/ActionSheet.tsx` + `ActionSheetButton.tsx` (**Adopted**) | `BottomSheet` with a list of `{ label, icon, onSelect, destructive? }`. What long-press opens (D1, decided). |
| `useLongPress` | `src/hooks/useLongPress.ts` (**Adopted**) | Long-press with movement tolerance; cancels the click; haptic. Handing over to drag is still to come with `useTouchDrag` (W4). |
| `useSwipeRow` | `src/hooks/useSwipeRow.ts` (**Adopted**) | Swipe-right action and swipe-left reveal, axis lock, edge exclusion. `TaskItem`'s inline version moves here. |
| `useTouchDrag` | `hooks/useTouchDrag.ts` | (D3 + D10, decided) Long-press-then-drag with `elementFromPoint` hit-testing, a callback per zone model (left/right, before/inside/after, time grid). Decision D10. |
| `useMasterDetail` | `hooks/useMasterDetail.ts` | §4.2. |
| `saveFile` | `utils/saveFile.ts` | §12.2. |

Each comes with a jsdom test of its logic (thresholds, axis lock, cancel), the same way `useEscapeClose` is tested.

## 8. Creation flows (Adopted, with Proposed additions)

- **Adopted.** Every daily-use section has a quick-add: a bottom-anchored bar or a sheet. It has an autofocused title, a few optional chips, and **More options…**, which opens the full desktop modal pre-filled (`uiStore` prefill state read by the modal's `useState` initialisers).
- **Adopted.** Quick-add calls the **same service** the full modal calls (`addTaskWithCalendar`, …), so shadow calendar entries, links and defaults can't drift. **Proposed:** calendar quick-add moves to the shared `calendarItemInput.ts` builders and offers all three kinds (gap C1).
- **Proposed.** Quick-add stays open after submit (focus kept) so several items can be added in a row. A completion haptic (`hapticSuccess`) confirms each one.
- **Proposed.** Chips are only the fields worth setting on the go; anything else goes through More options.

## 9. Destructive actions (Decided 2026-10-04: D2)

Desktop's rule ("delete always asks, says it can't be undone") predates the Recycling Bin. On Android:
- **Delete from a gesture or action sheet** happens at once and shows an Undo toast ("Deleted “X” · Undo"). Undo restores from the Recycling Bin. This is the standard phone idiom, and one-handed use has no confirm dialog to interrupt it.
- **Delete from a pane footer** keeps `ItemActionDialog` (same as desktop).
- **Irreversible actions** (Empty Recycling Bin, Delete forever, sign-out wipe, permanently decrypt) always confirm, on every platform.

## 10. Touch, type and keyboard

1. **Adopted.** Touch targets are at least 44×44px (checkboxes, chips, icon buttons, list rows). Grow the hit area with padding rather than enlarging the visual.
2. **Proposed.** Text inputs are at least 16px font on Android; body text keeps the desktop scale. No layout depends on hover.
3. **Soft keyboard.** Adopted: `capacitor.config.ts` already sets `Keyboard: { resize: 'body', resizeOnFullScreen: true }`. Proposed: Bottom-anchored bars sit on the keyboard (their `bottom` follows a `--keyboard-height` variable set from Keyboard show/hide events). Inputs set `enterkeyhint` (`done`, `next`, `search`) to match what Enter does.
4. **Adopted.** Theme defaults to dark on Android; the status bar follows the theme.
5. **Proposed.** Haptics vocabulary: `hapticLight` for a toggle or tick, `hapticMedium` for long-press pickup, `hapticSuccess` for create/complete, `hapticWarning` for delete. Always through `utils/haptics.ts`.
6. **Proposed.** Lists longer than one screen must scroll without janking. Virtualise only when a measured list needs it (no premature virtualisation).

## 11. Native capabilities

- **Adopted.** Plugins are wrapped once and guarded with `isNativePlatform()`, so the web build is unaffected (`haptics.ts`, `links.ts`).
- **Proposed.** Plugin choice is part of the spec that needs it. Candidates already identified: `@capacitor/filesystem` + `@capacitor/share` (export), `@capacitor/local-notifications` (Phase 5), `@capacitor/camera` (Notes photo capture), a keep-awake plugin (checklist shop mode), and Android Keystore for the vault's "trust this device" (later).
- **Adopted.** Mobile-captured content is the same entity through the same store action. No parallel "mobile" data path.

## 12. Platform services

### 12.1 Network: `/api/*` (Proposed; gap A1)
`apiFetch()` gains an Android branch that calls the production Vercel origin through `CapacitorHttp` (native, no CORS), the same shape as the Tauri branch. Every `/api/*` call already goes through `apiFetch`; keep it that way (a pattern test can check for a bare `fetch('/api`).

### 12.2 Files (Proposed; gap A7)
`saveFile(filename, blob)`: on web and Tauri, today's anchor download; on Android, write to the cache directory and open the share sheet. Every export (backup, auto-backup snapshot, ErrorBoundary export, future CSV exports) calls it. Import keeps using `<input type="file">` (verify once on the emulator).

### 12.3 OAuth and deep links (Decided 2026-10-04: D5)
External auth opens in `@capacitor/browser`. The web callback, after finishing server-side as today, redirects to `organisaitor://…`. One `appUrlOpen` listener in `App.tsx` routes these (OAuth done; later, notification deep links and entry points).

### 12.4 External links (Adopted)
`openExternalLink()` routes to `@capacitor/browser` on Android.

## 13. Testing and verification

- **Adopted.** Logic is tested by the normal Vitest suite. Android-specific behaviour is verified on a Play-Store API 35 emulator over Chrome DevTools Protocol, with touch coordinates taken from the WebView's real viewport (method: `implementation-status.md` intro). Haptics, real edge gestures, notifications and billing also need a real device before a workstream is called done.
- **Proposed.** Shared hooks (§7) have jsdom unit tests with synthetic touch events, so a gesture regression shows up in `npm test`, not only on a device.
- **Proposed.** Each workstream brief ends with an acceptance checklist run on the emulator, and records what was verified vs. not, plainly.

## 14. Governance: keeping Android level with desktop (Decided 2026-10-04: D13)

The gap opened because desktop work had no Android step. Added to CLAUDE.md's "Checklist Before Done" on 2026-10-04:

- [ ] **Android parity**: for any user-facing change, one of:
  - "works on Android as-is";
  - "Android follow-up logged in `docs/android/10-gap-analysis.md` (ID …)";
  - built for Android in the same change.
  New hover, drag or hotkey affordances name their touch path (§6).

Also: the gap analysis keeps a "last reconciled against implemented-features.md on <date>" line, so the next agent knows where to resume.
