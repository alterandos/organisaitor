# Android catch-up — bringing the app up to date with the 2026-09-16 web session

## Purpose and how to use this doc

A large batch of work landed on the web/desktop build in one session (2026-09-16): Supabase
sync for Schedules and Lists, task deadlines becoming real synced `CalendarReminder` rows
with a calendar layer toggle, several state-preservation fixes, a new `Ctrl+T` tab
convention, `Backspace` app-section history, and a first version of customizable hotkeys.
Full detail on all of that is already in `CLAUDE.md` (search for "Task Calendar Items",
"Customizable hotkeys", "Backspace", "State preservation", "Supabase sync for Schedules and
Lists") — **read those sections first**, this doc does not repeat their rationale, only
the Android-specific delta.

Because this is a single Capacitor-wrapped codebase (Android runs the same React/TS bundle
in a WebView — see `CLAUDE.md`'s "Multi-app suite architecture" and "Android build" for the
overall model), **most of that session's work applies to Android automatically, for free,
with zero code changes.** This doc exists only for the genuine gaps: places where
Android-specific code (a separate mobile component, or a platform-conditional branch)
either needs the same treatment the desktop path just got, or needs new platform-specific
wiring that has no desktop equivalent at all.

**Two design decisions were already clarified with the user before this doc was written —
do not re-ask, just implement them as specified:**
1. Android's hardware/gesture back button **should** step back through the new
   app-section history (same mechanism `Backspace` uses on desktop) — see Task 2.
2. The new Calendar Layers picker **should** get an Android-appropriate touch sheet
   variant, matching the existing `CollectionFilterPicker`/`PurposeFilterPicker` pattern —
   see Task 3.

If you hit any OTHER genuine ambiguity while working through this — a UX call that isn't
already decided below, a case this doc doesn't cover — **stop and ask the user. Do not
assume.** That instruction carries over from how this doc was commissioned.

**Testing**: this project's established Android testing method (see `CLAUDE.md`'s "Android
build — implementation status" intro paragraph) is a Play Store-flavoured API 35 AVD,
verified via Chrome DevTools Protocol against the app's WebView (`chrome://inspect`-style,
over `adb forward` to the `webview_devtools_remote_<pid>` socket) rather than blind
`adb shell input tap` coordinate guessing — touch coordinates must be computed from the
WebView's real viewport rect (`Page.getLayoutMetrics` / the `/json/list` endpoint's
`description` field), since the WebView does not span the full physical screen (Android's
gesture-nav strip sits outside it). Use this same method for every acceptance check below.
Every task below should be verified this way, not just code-reviewed — this project has
been burned before by changes that looked right and weren't (see CLAUDE.md's own
"Bug caught by the user" entries under the Timezone and Clock-format features for examples
of exactly this pattern).

---

## What needs ZERO Android-specific work (context, not action items)

Listed so you don't waste time re-verifying settled things, and so it's clear what was
actually checked before this doc was written vs. assumed:

- **Supabase sync for Schedules and Lists** (`scheduleStore.ts`, `listStore.ts`,
  `syncService.ts`, `mappers.ts`, migration `014_schedules_and_lists.sql`) — pure
  store/service-layer code, no UI, runs identically in the Android WebView. Nothing to do.
- **Task Calendar Items core logic** (`Task.calendarReminderId`, `AddTaskModal.tsx`,
  `TaskPane.tsx`, `calendarStore.ts`, `taskStore.ts`, `useNotificationChecker.ts`,
  `taskCalendarBackfill.ts`, migration `015_task_calendar_layers.sql`) — also shared code.
  `taskCalendarBackfill.ts`'s idempotent catch-up pass runs from `App.tsx`'s mount effect,
  which is not platform-gated, so it runs on Android too. Nothing to do here **except**
  Task 1 below, which is a genuine gap in an Android-*only* component that bypasses this
  shared logic.
- **Calendar: bold titles** (`CalendarView.module.css`'s `.calItemTitle`/
  `.weekTimeBlockTitle`) — these classes are shared across every view, Android included.
  Nothing to do.
- **Calendar: inline notes preview in day/week grid blocks** — Android already forces the
  real desktop time-grid view on (`:global(.platform-android) .desktopView { display: flex
  !important; }`, from the Phase 2 Android work — the old flat mobile-agenda fallback is
  disabled), so this renders on Android today with no code change. **Worth a look during
  Task 3/4's testing pass** (see Task 4) purely to confirm it doesn't look cramped on a
  phone-width grid block — not assumed broken, just unverified on a real viewport.
- **State preservation** (Calendar view mode, Notes' active tab, Lists' selected list+tab,
  all now living in `uiStore`/`settingsStore` instead of component-local `useState`) —
  `MobileNav.tsx` and `MobileMoreSheet.tsx` already call the same `setActiveView()` action
  every desktop nav control uses, so `uiStore.sectionHistory` (see Task 2) and the other
  preserved fields build up identically regardless of how the section switch was
  triggered. Nothing to do.
- **`Ctrl+T` new-tab in Notes/Lists** — keyboard-only, meaningless without a physical or
  Bluetooth keyboard. Both surfaces already have a touch-usable `+` button that creates a
  tab (`NoteEditor.tsx`'s `handleAddTab`, `ListsSection.tsx`'s header `+`), and both of
  those now also auto-enter the rename prompt as part of this session's work — Android
  users get that improvement for free through the existing button, no separate work
  needed. (Lists has no dedicated Android phase build at all yet regardless — see
  `docs/android/04-lists-app.md` — that's a pre-existing, unrelated gap, not something
  this catch-up should try to close.)
- **Customizable hotkeys (Settings UI)** — renders inside `SettingsPane`, which already
  gets the full-screen Android pane treatment from Track A. Rebinding requires an actual
  `keydown` event, so it's only meaningfully usable with an external/Bluetooth keyboard —
  a real scenario (tablets with keyboard cases, Samsung DeX) but inherently reduced value
  on a typical phone. This is a property of the feature, not a defect — **no functional
  fix needed**, just the narrow visual check folded into Task 4.
- **Notification changes** (task-linked reminders replacing direct task notifications,
  the completed/archived guard, Done/Archive actions on the notification card) — this
  changes *which* code produces a `PendingNotification` and what a bell-icon click does;
  it does not touch anything Android-specific. Separately, and pre-existing: real native
  OS notifications on Android are not built at all yet (`@capacitor/local-notifications` is
  not installed — see CLAUDE.md's "Android build" Phase 5 note). `fireOSNotification()`
  (`src/services/notificationService.ts`) only special-cases Tauri; on Android it falls
  through to the plain Web Notification API, which does not reliably produce a real system
  notification in a Capacitor WebView. **This is unrelated to this session's changes and
  out of scope for this doc** — it's Phase 5, tracked separately. Do not attempt it here.

---

## Task 1 — MobileQuickAddBar: wire deadline → shadow CalendarReminder

**File**: `src/components/MobileQuickAddBar/MobileQuickAddBar.tsx`

**The gap**: `AddTaskModal.tsx` and `TaskPane.tsx` were both updated this session so that
setting a task's `deadline` also creates/updates/deletes a linked `CalendarReminder`
(`Task.calendarReminderId`, `reminderType: 'task'` — mirrors the pre-existing
`scheduledAt`/`calendarEventId` pattern exactly; see CLAUDE.md's "Task Calendar Items"
entry for the full rationale). `MobileQuickAddBar` is a **third, independent** task-creation
path (Android-only, deliberately not a reuse of desktop's `QuickAddInput` — see its own
top-of-file comment) and it was not touched during that work. Its `submit()` function
currently calls:

```ts
addTask({
  title: title.trim(),
  collectionId: (collectionId ?? activeCollectionId) as never ?? null,
  deadline: dueDate,
  priority,
});
```

— setting `deadline` directly with no linked reminder. A task quick-added on Android with a
"Due" date chip therefore gets `deadline` set but `calendarReminderId: null`.

**Why this matters in practice, not just in principle**: `taskCalendarBackfill.ts` (which
runs on every app mount) will eventually catch and fix this — it's idempotent and checks
`task.deadline && !task.calendarReminderId` — but only on the *next* app reload. Until then,
a task created this way: (a) will not appear correctly filtered by the "Task deadlines"
calendar layer toggle (no backing reminder row exists yet to filter by `reminderType`), and
(b) will not fire a deadline notification (the old direct-task-notification trigger was
deleted this session — see CLAUDE.md — so a task with no linked reminder now has *no*
notification path at all until the backfill runs).

**The fix** — mirror `AddTaskModal.tsx`'s `handleSubmit` exactly:

```ts
import { useCalendarStore } from '@/store/calendarStore';
import type { CalendarReminderId } from '@/types';
// ...
const addReminder = useCalendarStore((s) => s.addReminder);
// ...
const submit = () => {
  if (!title.trim()) return;
  let calendarReminderId: CalendarReminderId | null = null;
  if (dueDate) {
    calendarReminderId = addReminder({
      title: title.trim(),
      date: dueDate,
      reminderType: 'task',
    });
  }
  addTask({
    title: title.trim(),
    collectionId: (collectionId ?? activeCollectionId) as never ?? null,
    deadline: dueDate,
    calendarReminderId,
    priority,
  });
  reset();
  inputRef.current?.focus();
};
```

**`handleMoreOptions` needs no change** — it hands off to the full `AddTaskModal` via
`showAddTaskWithPrefill({ title, priority, collectionId, deadline: dueDate })`, and
`AddTaskModal`'s own submit handler already creates the reminder correctly when that
prefilled form is actually submitted. Only the bar's own direct `submit()` path has the gap.

**Note**: `MobileQuickAddBar` has no time-of-day field today (only a date chip, no time
picker), so `deadlineTime`/the reminder's `time` field naturally stay `null` here — that's
consistent with the component's existing scope, not something to add as part of this fix.

**Acceptance check** (on the AVD, via CDP): create a task through the Android quick-add bar
with a "Due: Today" chip set. Confirm, *without reloading the app*:
1. `useCalendarStore.getState().reminders` gained a new entry with `reminderType: 'task'`
   whose `date` matches.
2. The new task's `calendarReminderId` points at that reminder's id.
3. Switching to the Calendar section shows the task's deadline pill, and toggling the
   "Task deadlines" layer off in the Layers picker (see Task 3) correctly hides it.

---

## Task 2 — Android back button: integrate app-section history

**File**: `src/App.tsx` (the `CapApp.addListener('backButton', ...)` handler)

**Decision** (confirmed with the user, see top of this doc): yes, wire it in.

**Current state** — the handler is a fixed priority chain:

```ts
const handle = CapApp.addListener('backButton', () => {
  if (closeTopmostMobileOverlay()) return;
  const { mobileBackConsumer } = useUIStore.getState();
  if (mobileBackConsumer?.()) return;
  void CapApp.minimizeApp();
});
```

`closeTopmostMobileOverlay()` (`src/store/uiStore.ts`) closes the topmost open
modal/pane/sheet if any exists, in a fixed priority order. `mobileBackConsumer` is a slot a
screen with its own internal back-relevant navigation can register (not currently used by
anything shipped — see CLAUDE.md's Track A notes; reserved for a future master-detail
screen). If neither applies, the app minimizes.

**The fix** — insert `navigateBack()` (the same action `Backspace` calls on desktop,
`uiStore.ts`) as a new tier, after `mobileBackConsumer` and before minimizing:

```ts
const handle = CapApp.addListener('backButton', () => {
  if (closeTopmostMobileOverlay()) return;
  const { mobileBackConsumer, sectionHistory, navigateBack } = useUIStore.getState();
  if (mobileBackConsumer?.()) return;
  if (sectionHistory.length > 0) { navigateBack(); return; }
  void CapApp.minimizeApp();
});
```

This reads `uiStore.getState()` directly (not a hook), matching the existing
`mobileBackConsumer` read in the same handler — both are one-off reads inside an event
callback, not something that needs to re-render the component the effect lives in.

**Why this ordering**: `mobileBackConsumer` represents "this specific screen wants to
handle back itself" (e.g. a hypothetical detail view that should return to its list first)
— that's a more specific, more local back-target than "go to the previous app section," so
it should keep taking priority if it's ever actually registered by something. Overlays
closing first is unchanged and already correct — you don't want a back-press to both close
a modal *and* switch sections in one tap.

**Acceptance check** (on the AVD, via CDP): from a clean state (no modals open, empty
`sectionHistory`), tap through Tasks → Calendar → (open the More sheet) → Notes. Press the
hardware/gesture back button and confirm: 1st press → Calendar, 2nd press → Tasks, 3rd press
→ app minimizes (history is now empty, matches desktop's `MAX_SECTION_HISTORY = 6` cap
semantics). Separately, confirm pressing back while any modal/pane is open still only closes
that modal on the first press (must not regress — `closeTopmostMobileOverlay()` still runs
first, unchanged).

---

## Task 3 — CalendarLayersPicker: Android touch-sheet variant

**Files**: `src/components/CalendarLayersPicker/CalendarLayersPicker.tsx` and
`.module.css`; one call-site change in `src/components/CalendarView/CalendarView.tsx`.

**Decision** (confirmed with the user, see top of this doc): yes, build this.

**Current state**: `CalendarLayersPicker` is a small header dropdown — click a "👁 Layers"
button, a `position: absolute` panel with 4 checkboxes (Events / Reminders / Task scheduled
/ Task deadlines) appears anchored `top: 100%; right: 0` of the trigger. It was built this
session with **no** platform-conditional variant at all, unlike its closest siblings.

**The reference pattern to copy** — `src/components/PurposeFilterPicker/PurposeFilterPicker.tsx`
already solves exactly this problem for a near-identical "multi-select checkbox list behind
a header trigger" component. Read that file and its `.module.css` in full before starting;
the plan below is a direct port of its shape:

1. Add a `variant?: 'dropdown' | 'sheet'` prop to `CalendarLayersPicker`, default
   `'dropdown'` (desktop behaviour must stay pixel-identical to today).
2. Extract the current checkbox-list JSX (the `.map()` over `LAYERS` rendering each
   `<button role="option">`) into a local `listContent` variable/expression, computed once,
   reused by both variants — **do not duplicate the JSX**, this is exactly the
   "no logic duplication" pattern `PurposeFilterPicker.tsx`'s own comment calls out.
3. `'dropdown'` variant: today's existing JSX, unchanged, driven by `listContent`.
4. `'sheet'` variant (new): 
   - A compact icon-only trigger button — `PurposeFilterPicker`'s sheet trigger is a bare
     "◎" glyph at `min-width: 44px; min-height: 44px`; use "👁" the same way (no "Layers"
     text label, no `(n/4)` count suffix — keep it minimal, matching the sibling's style).
   - `position: fixed; inset: 0` backdrop (`.sheetOverlay`) that closes on backdrop tap,
     containing a `.sheetPanel` sliding up from the bottom (`width: 100%; max-height: 70vh;
     overflow-y: auto; border-radius: var(--radius-lg) var(--radius-lg) 0 0`), a
     `.sheetHeader` label ("Calendar layers"), and `listContent` rendered inside a
     `.sheetList` wrapper.
   - Copy `PurposeFilterPicker.module.css`'s `.sheetTrigger` / `.sheetTriggerActive` /
     `.sheetOverlay` / `.sheetPanel` / `.sheetHeader` / `.sheetList` rules essentially
     verbatim into `CalendarLayersPicker.module.css` (same class names for consistency, or
     rename if you prefer — just keep the actual CSS values, they're already tuned).
     Critically, keep the `.sheetList .item { min-height: 44px; font-size: 0.95rem; }`
     override — the 44px touch-target floor is the part that actually matters here.
   - Like `PurposeFilterPicker`'s sheet variant, keep the sheet **open** after toggling a
     checkbox (this is a multi-select picker — closing on every tap would make toggling
     more than one layer needlessly slow). It closes via backdrop tap, Escape, or an
     explicit close affordance if you add one — match whichever of those
     `PurposeFilterPicker` already implements.
5. In `CalendarView.tsx`, find `<CalendarLayersPicker />` (in the "Unified header" block,
   next to the `🗓 Schedules` button) and change it to
   `<CalendarLayersPicker variant={isAndroid ? 'sheet' : 'dropdown'} />`. `isAndroid` is
   already destructured from `usePlatform()` at the top of `CalendarView.tsx` (it's already
   used there to route `openCreateAt` between `showCalendarQuickAdd` and
   `showAddCalendarItem`) — no new import needed.

**One thing to actually verify, not assume**: `CalendarView.tsx`'s own internal header (the
one this picker lives in — prev/today/view-toggle/Schedules/Layers) is a *different* header
from the outer `App.tsx`-level one `CollectionFilterPicker`/`PurposeFilterPicker` live in
(that outer one already gets `variant={isAndroid ? 'sheet' : 'dropdown'}` wiring from
Track A). This inner header already has its own Android CSS
(`:global(.platform-android) .header { flex-wrap: wrap; row-gap: 0.5rem; }`, from Phase 2) —
confirm during testing that the new sheet trigger button sits sensibly within that wrapped
layout rather than getting squeezed or clipped, and adjust spacing/order if it doesn't (the
`🗓 Schedules` button right next to it is the thing to visually match).

**Acceptance check** (on the AVD, via CDP): open Calendar on Android, tap the Layers
trigger. Confirm a bottom sheet opens (not a small dropdown that could render partially
off-screen), all 4 checkboxes are comfortably tappable (real tap, not just visually present
— verify via the WebView's real viewport rect, per this doc's testing note), toggling one
immediately filters the calendar and the sheet stays open, and the setting persists
(`settingsStore.calendarLayerVisibility`) the same way it does on desktop.

---

## Task 4 — Visual verification pass (fix only if actually broken)

Do this last, after Tasks 1–3, using the same AVD+CDP method. These are **not** presumed to
be broken — they're flagged because they're plausible risk areas this session's changes
touch, and nobody has looked at them on a real Android viewport yet. Only make a code
change if you actually observe a problem; don't add complexity pre-emptively.

1. **Day/week grid notes preview** (`.weekTimeBlockNotes` in `CalendarView.module.css`) —
   open Calendar's Week or Day view on the AVD with an event/reminder/task that has notes
   set. Confirm the notes preview text doesn't visually overflow its block or make an
   already-compressed hour row unreadable at phone width. If it does, the fix is scoped to
   `CalendarView.module.css` only (e.g. a `:global(.platform-android)`-scoped smaller
   `font-size` or a stricter line-clamp on `.weekTimeBlockNotes`) — no JS/logic change
   should be needed either way.
2. **SettingsPane "Keyboard shortcuts" table** — open Settings on the AVD, scroll to
   Keyboard shortcuts. Confirm the table (now with clickable rebind buttons and a per-row
   ↺ reset icon added this session) doesn't overflow the screen width or clip the reset
   icon. If it does overflow, wrap the `<table className={styles.hotkeys}>` in a
   `overflow-x: auto` container — this project's own convention (see CLAUDE.md's
   Responsive guidance) is that a wide table scrolls inside its own container rather than
   the page scrolling horizontally.
3. **NotificationCenter's Done/Archive on a task-linked reminder** — trigger a task
   deadline notification (or fast-forward by editing `notifiedLog`/system clock if that's
   easier in the AVD), open the bell icon panel, and confirm the Done/Archive buttons on a
   deadline notification correctly complete/archive the underlying task (this session's new
   `linkedTask` lookup in `NotificationCenter.tsx`) and that the panel itself is usable at
   phone width (this is pre-existing UI, not changed this session, but worth a glance since
   its *behavior* did change).

---

## Out of scope for this doc (do not attempt)

- Phase 5 (native Android push notifications via `@capacitor/local-notifications`) —
  tracked separately in CLAUDE.md, unrelated to this session's changes.
- Phase 3 (Records) and Phase 4 (Lists) Android UX — pre-existing, unbuilt, unrelated to
  this session.
- Multi-entry-point launcher icons (Track A step 8) — pre-existing, deliberately deferred.
- Any deeper "should Lists get real Android phase treatment now" scoping question — out of
  scope; if it comes up, that's a separate conversation with the user, not something to
  fold into this catch-up.

---

## When you're done — this is not optional

This repo's `CLAUDE.md` has a standing "Documentation Protocol" that applies to every
feature change made in this codebase, this one included: **the work is not done until
`CLAUDE.md` is updated to reflect it.** Do not leave this doc's tasks marked as a plan while
the actual status lives only in code or in your own head.

Concretely, before you consider this finished:

1. Update `CLAUDE.md`'s **"Android build — implementation status"** section (near the end
   of the file) with what was actually built — follow the exact pattern already used there
   for Phase 1 ("Tasks") and Phase 2 ("Calendar"): a short prose summary of what's covered,
   then a file manifest (new files + modified files), then what was verified on-device via
   the AVD+CDP method vs. anything left unverified.
2. Remove or rewrite the bullet in `CLAUDE.md`'s **"Not built yet"** list (under that same
   Android section) that currently points at this doc — once the gaps below are closed,
   that line describing them as outstanding is no longer accurate and must not be left
   stale.
3. In **this doc**, mark each task's heading `[x] Task N — ...` once done, and add a short
   "what actually happened" note under any task whose real fix ended up differing from the
   plan below (e.g. if Task 4's visual pass turned up a real bug — say what it was and how
   it was fixed, not just "fixed").
4. If you discover along the way that this doc's premise was wrong about something (a file
   path that's moved, a component that behaves differently than described), fix the
   inaccuracy in this doc too, not just in your own understanding — the next reader needs
   the corrected version.

If you finish some tasks but not all of them (e.g. you get through Tasks 1–2 but not 3–4),
still update `CLAUDE.md` to reflect the partial state accurately — "partially done, here's
exactly what's left" is the correct status to leave behind, not silence.
