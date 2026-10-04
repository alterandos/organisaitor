# 06 — Android W2: mobile primitives, back button, touch paths for hover actions

Status: Not started

Builds the shared touch building blocks every later Android workstream uses, and with them closes the "you can't do X on a phone" gaps: the back button closing the wrong thing, edit/archive/delete reachable only on hover, swipe-to-delete ignoring the Recycling Bin. Workstream **W2** in `docs/android/10-gap-analysis.md` (gaps A3, A4, A5, A8, A10, B1, B2, I1 and decision D13's hotkey field).

**Runs in parallel with W1** (`05-android-w1-platform-services.md`). Stay inside "Files you own". Work in your own git worktree on branch `android/w2-mobile-primitives`. Commit there; don't merge to `main` or push. The user merges.

## Read first
1. `CLAUDE.md`, in full. Especially "Escape key — universal close rule", "Row hover-action menu", "Toasts", "Task completion", "Recycling Bin", "Pattern governance" and "Testing".
2. `docs/android/11-design-and-coding-patterns.md` in full. §4.1, §5, §6, §7 and §9 are what you're implementing; their rules are **Decided** (D1, D2, D13).
3. `docs/android/10-gap-analysis.md` §A, §B and §J.
4. `docs/android/implementation-status.md`: build setup and the emulator/CDP verification method.

If you hit a genuine ambiguity this brief doesn't settle, stop and ask the user. Don't guess.

## Files you own
`src/hooks/useEscapeClose.ts` (+ test), `src/store/uiStore.ts` (back-related parts), `src/App.tsx` (**only** the `backButton` effect and removing `closeTopmostMobileOverlay` imports), new `src/components/BottomSheet/`, new `src/components/ActionSheet/`, new `src/hooks/useLongPress.ts`, new `src/hooks/useSwipeRow.ts` (+ tests), `src/components/RowHoverActions/*`, `src/components/HoverOptions/*`, `src/components/TruncatedText/*`, `CollectionFilterPicker`, `PurposeFilterPicker`, `MobileMoreSheet`, `TaskItem`, `src/components/Toast/*`, `src/config/hotkeys.ts`, `src/test/patterns.test.ts`. You may read `services/trash.ts`/`trashCapture.ts` and change them as described in T5.

W1 adds a deep-link `useEffect` to `App.tsx` and installs plugins. Don't touch those.

## Tasks

### T1. Back button = the Escape stack (gaps A3, A4; patterns §4.1)
- Export `closeTopOverlay(): boolean` from `useEscapeClose.ts`: it runs the top entry's handler (exactly what Escape does) and returns whether there was one.
- Make `uiStore.navigateBack()` return `boolean` (whether it moved, including Notes' note-level stack). Update its callers.
- In `App.tsx`'s `backButton` listener: `closeTopOverlay()`, else `mobileBackConsumer?.()`, else `navigateBack()`, else `CapApp.minimizeApp()`.
- **Delete `closeTopmostMobileOverlay()`.** Before deleting, audit every flag in its list (decrypt prompt, Quick Access, modals, calendar quick-add, every pane, Manage, Integrations, Recycling Bin, Account, Settings, `NoteEditorPane` outside Notes, `noteTagViewActive`, `MobileMoreSheet`). Confirm each registers `useEscapeClose` while open, and add the call where one doesn't. That makes Escape work for it on desktop too.
- Tests: `closeTopOverlay` order and return value in the existing `useEscapeClose` test; `navigateBack` return value in the uiStore test.
- Resolve BACKLOG.md's "Android back button should use the same overlay stack as Escape" (mark it built) and the Escape row's Android note in the Pattern retrofit backlog.

### T2. `BottomSheet` and `ActionSheet` (gap A8; patterns §7)
- `BottomSheet`: portaled to `document.body`, backdrop tap closes, drag-down on the grabber closes, registers `useEscapeClose` (so back closes it), `max-height: 85vh`, safe-area bottom padding, theme tokens only, 44px minimum rows.
- `ActionSheet`: `BottomSheet` plus a list of `{ label, icon?, onSelect, destructive? }`. Selecting closes the sheet, then runs the action.
- Move the existing hand-rolled sheets onto `BottomSheet`: the `'sheet'` variants of `CollectionFilterPicker` and `PurposeFilterPicker`, and `MobileMoreSheet`. Keep their content and behaviour; desktop `'dropdown'` is untouched.
- Pattern test: no `sheetOverlay`/`sheetPanel` CSS classes outside `components/BottomSheet/`.
- Record both components in CLAUDE.md's file structure and as a "Bottom sheets" component pattern.

### T3. `useLongPress` (patterns §5)
- About 450 ms hold, cancelled by more than 10px of movement (so scrolling never triggers it).
- Fires `hapticMedium()`, then suppresses the click that follows.
- Prevents Android's own long-press behaviour on the element (`contextmenu` preventDefault; `-webkit-touch-callout: none` and `user-select: none` on the target, Android-scoped).
- Native, non-passive listeners where `preventDefault` is needed (see `TaskItem`'s existing swipe code for why).
- Tests (jsdom + fake timers): fires after the delay, not on a quick tap, not after movement, and the click is suppressed.

### T4. Long-press for every hover action (gaps A5, B1, I1; decision D1)
One shared change makes every site work.
- **`RowHoverActions`**: on Android, `useRowHoverActions` attaches `useLongPress` to the row (it already holds `anchorRef`). `RowHoverActionsMenu` renders its existing `children` inside a `BottomSheet` as a vertical list, instead of the floating panel.
  - Many of those children are icon-only buttons. In the sheet each needs a visible text label: audit the sites (`ChronicleView`, `ListsSection`, `ManagePane`, `OverviewSection`, `RecordsView`; `Sidebar` isn't mounted on Android) and give every action a label (from `LABELS`), shown in the sheet layout.
  - Choosing an action closes the sheet.
  - Desktop hover behaviour is unchanged.
- **`HoverOptions`** (the TaskItem checkbox and `ItemActionFooter`'s Complete): on Android, long-press on the wrapped child opens an `ActionSheet` of the same options. A plain tap still does the plain action.
- **Manage view (I1)**: confirm on the emulator that Endeavours, Purposes and Tags can each be edited, archived, restored and deleted via long-press.
- Update the "Android: every hover affordance has a touch path" row in BACKLOG.md's Pattern retrofit backlog. Update CLAUDE.md's "Row hover-action menu" section: its "Known gap: touch/mobile" paragraph is now solved, so say how.

### T5. `useSwipeRow` + swipe-left Archive/Delete with Undo (gap B2; decision D2; patterns §9)
- Extract `TaskItem`'s swipe code into `useSwipeRow({ onSwipeRight?, leftActions? })`, keeping the axis lock (`|dx| > 2·|dy|` after 8px) and adding the 24dp edge exclusion. Put the gesture classification in a pure function and test it.
- `TaskItem`: swipe right still completes (`toggleTaskCompletion`). Swipe left now reveals **Archive** and **Delete**:
  - **Archive**: the task store's archive action, without a reason. Toast "Archived “X” · Undo".
  - **Delete**: `deleteTaskWithCleanup` at once, `hapticWarning()`, then toast "Deleted “X” · Undo". Undo restores the trashed entry (`restoreFromTrash`).
- That needs one rule change:
  - CLAUDE.md says `services/trash.ts` is imported only by `RecyclingBinPane`; the real reason is to keep it out of stores and `trashCapture.ts` (import cycles).
  - Change the rule to "never imported by a store or by `trashCapture.ts`", in CLAUDE.md's "Recycling Bin" section and file structure.
  - Find the entry to restore by having `moveToTrash` return the new entry's id, or by looking it up by entity id.
  - Also update any pattern test that encodes the old rule.
- Toast copy goes in `LABELS`. Pane footers keep `ItemActionDialog` (unchanged).

### T6. Toasts above the bottom chrome (gap A10; patterns §3)
On Android the toast must sit above `MobileNav` and the Tasks quick-add bar, never under them. Use CSS variables for the bars' heights (`--mobile-nav-h`, `--quick-add-h`, set where those bars are styled) and offset the toast by them. Verify the completion toast's Undo / Follow-up buttons are tappable.

### T7. `TruncatedText` on Android (patterns §6.1)
No hover reveal on Android: clamp to two lines instead of a one-line ellipsis.

### T8. Every hotkey names its touch path (decision D13; patterns §6.2)
- Add `touch: string` to `HotkeyDef` and fill it for **every** entry, as either the touch path or `'n/a: <why>'`. Use `10-gap-analysis.md` A6 for the decisions. Quick Access's path is "swipe down on the mobile header, or the header 🔍 icon" (D6), to be built in W8; write it anyway.
- Pattern test: every `HOTKEYS` entry has a non-empty `touch`.
- Update the matching BACKLOG.md retrofit row to "fully applied", and add one line to CLAUDE.md's "Hotkeys rule": new hotkeys fill `touch`.

## Out of scope
`useMasterDetail` (built with its first user, W6/W8), `useTouchDrag` (W4), the mobile header and Quick Access entry (W8), anything in W1's file list.

## Verify
- `npm run check` passes at the eslint baseline, with the new tests included.
- On the emulator via CDP:
  - Back closes, newest first: a confirm dialog over a pane, a picker over a modal, the filter sheets, the calendar side pane. Then it walks section history (and Notes' note history). Then it minimises.
  - Long-press works on: a Manage row (all actions); a Lists sidebar row; a Chronicle notebook; an Overview row; the TaskItem checkbox (completion options).
  - Long-press doesn't fire while scrolling those lists.
  - Swipe left on a task: Archive → Undo restores it; Delete → Undo restores it (check the Recycling Bin is empty afterwards); swipe right completes.
  - An edge-start swipe does nothing.
  - The toast is fully visible above the bars.
- Desktop: hover menus, `HoverOptions`, the filter dropdowns and Escape all behave exactly as before.
- Haptics: real device only. Say if not checked.
- Report verified vs not verified, plainly.

## When done
- Update `docs/android/implementation-status.md` with a "W2 — mobile primitives" section.
- In `10-gap-analysis.md`, mark A3, A4, A5, A8, A10, B1, B2, I1 done (with the date) and set W2's row to done.
- In `11-design-and-coding-patterns.md` §7, change the built primitives from Proposed to Adopted, with their real paths.
- Add an entry to `docs/features/implemented-features.md`.
- Update CLAUDE.md as listed in T1–T8.
- Set this brief's `Status:` line.
