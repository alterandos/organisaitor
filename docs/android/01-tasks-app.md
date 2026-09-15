# Android Build — Phase 1: Tasks App

**Status:** Planning document. Nothing described here is built. Implements against the
foundation in `docs/android/00-architecture.md` — read that first, especially ADR-8 (shared
data layer, not shared UI) and ADR-3/§4 (entry points), before this file.

**Prerequisite:** `00-architecture.md` **Track A** (§10) only — Capacitor installed,
`usePlatform`, native polish, and the mobile layout shell (`MobileNav`/`MobileMoreSheet`/
full-screen panes). **Track B (entitlements/billing/ads) is not required** — Tasks is always
free, never gated, and this phase touches none of that code. The multi-entry-point launcher
mechanism (§4 of the architecture doc) is also *not* required first — this phase can be built
and fully tested against Capacitor's default single launcher icon; wiring the real `tasks`
entry-point icon can happen in parallel or afterward (see the architecture doc's note at the top
of §4).

**Testing this phase:** see `00-architecture.md` §10a for the full workflow (live-reload dev
loop, AVD setup, emulator-vs-real-device caveats). Nothing Tasks-specific to add beyond that —
touch gestures (§4 below) work fine in the emulator via mouse simulation; haptics (`hapticLight`
on swipe-complete) should additionally be confirmed on a real device before considering this
phase done.

**Scope:** every screen, interaction, and behavioural difference from desktop needed to build
the Tasks section of the Organizer app on Android. Free tier — always enabled, no entitlement
gating (per `00-architecture.md` ADR-4/ADR-5).

---

## 1. Entry point behaviour

Once the multi-entry-point mechanism (architecture doc §4) is built, the `tasks` entry-point
icon launches the app and calls `setActiveView('tasks')` before first render; on warm re-entry
via `onNewIntent`, the same call fires and the visible section switches immediately — no reload,
no state loss elsewhere in the app. **Until then**, the app's default single launcher icon opens
to whatever `activeView` the app would normally start on (unchanged desktop/PWA behaviour) —
that's fine for building and testing everything else in this document; nothing here depends on
entry-point routing existing yet.

The `MobileNav` bottom tab bar (architecture doc §5b) includes a Tasks tab so a user who entered
via a different icon (Calendar, say) can still reach Tasks without returning to the home screen.

---

## 2. Screen inventory — reuse vs. new (per ADR-8)

| Screen | Decision | Why |
|---|---|---|
| Task list (main view) | **Reuse `TaskList`/`TaskItem`, adapted layout** | Fundamentally a scrollable list — HTML/CSS already degrades to single-column reasonably. Needs touch-target and density adjustments (§4), not a rewrite. |
| Quick-add (bare title) | **New mobile-specific component — see §3, corrected** | Desktop's `QuickAddInput` *looks* like a plain fast-path input but isn't one in practice for a mouse/touch user — see §3.1's correction. Mobile needs its own clean implementation of the same end behaviour (title-only → `addTask()`, no modal), not a verbatim reuse. |
| Quick-add with common fields (deadline/priority/Endeavour) | **New mobile-specific expansion, see §3** | Desktop's answer to "I want more fields while adding" is opening the full `AddTaskModal` (fast enough with a mouse + hotkeys). On mobile, a chip-based inline expansion beats forcing a full modal open for the common cases. |
| Full task creation (subtasks, links, time intensity, tags, notes) | **Reuse `AddTaskModal`, full-screen on mobile** | Genuinely occasional/configuration-heavy — matches the "reuse responsively" bucket. |
| Task detail/edit (`TaskPane`) | **Reuse, full-screen** (already planned in architecture doc §5b shell pieces) | Editing an existing task's less-common fields is occasional; the high-frequency action (toggle complete) happens on the list itself, not by opening this pane. |
| Endeavour/Purpose filter pickers | **Reuse `CollectionFilterPicker`/`PurposeFilterPicker` wholesale, new outer container — see §5, corrected** | Same components/state (`uiStore.activeCollectionIdByView`, `activePurposeIds`) — the existing components render unmodified *inside* a bottom sheet wrapper, not "same logic, new chrome" (there's no separable logic layer to extract, see §5). No hotkey equivalent needed (no keyboard). |
| Sort controls (`SortBar`) | **Reuse as a horizontal scrollable chip row** | Already a small, low-complexity control; CSS-only adaptation. |
| Overview/Focused toggle | **Reuse unchanged** | Already a compact segmented control; fits mobile widths natively. |
| Manage view (Endeavours/Purposes/Tags admin) | **Reuse, full-screen** | Occasional/administrative — correct bucket for reuse. |
| Subtask add/reorder (inside `TaskPane`) | **Reuse unchanged** | Already list-based, simple; the full-screen pane gives it enough room. |

---

## 3. Quick-add — the primary mobile-specific investment for this app

This is the single highest-value new interaction for Tasks on Android, per the explicit ask
that adding things be "easy and fast" on phone.

### 3.1 Bare-title fast path

**Corrected — this document's first draft claimed desktop's `QuickAddInput` (the `+ Add a
task…` bar at the top of the list) was a plain fast-path input that could be "reused, not
rebuilt." Verified against the actual component and that's not accurate.** `QuickAddInput.tsx`
intercepts clicks on the wrapper/input: *any* click while the input is empty calls
`showAddTask()` and opens the full `AddTaskModal` — the plain-input, no-modal path only ever
continues if the field already has text in it, which for a mouse/touch user is unreachable,
since the very first click (when it's necessarily empty) always redirects to the modal. In
practice, for anyone who doesn't reach the field via keyboard `Tab`-focus (which never fires a
`click` event and is a desktop-only, keyboard-driven path with no touch equivalent), this
component **always opens the full modal** — it is not, in practice, the fast bare-title path
this section's whole premise assumed. There is no existing fast path to reuse.

**Mobile therefore gets its own clean implementation**, not adapted from `QuickAddInput` — same
end goal (title → `taskStore.addTask({ title, collectionId })`, no modal), deliberately without
`QuickAddInput`'s click-intercept behaviour:

- Anchor the input **at the bottom of the screen** (thumb-reachable), styled as a persistent bar
  above `MobileNav`, rather than at the top of a scrolling list (a top-anchored input requires a
  reach-and-scroll gesture every time on a tall phone — the wrong ergonomics for something meant
  to be used constantly).
- Tapping the bar focuses the input directly and raises the keyboard — **no click-to-open-modal
  interception of any kind**, unlike the desktop component. This is the one deliberate behavioural
  difference from desktop, not an oversight: desktop's version is the correct call for a
  mouse-and-hotkey user (a fast keyboard shortcut already reaches the full modal, so the visible
  bar can afford to just be a bigger visual target for the same destination); mobile has no
  equivalent fast route to the full modal, so the bar has to be genuinely functional on its own.
  The system keyboard's mic/dictation icon (Gboard etc.) is available for free on this input — do
  not build any custom voice-input feature.
- On submit (Enter/keyboard "Done"), the task is created via `taskStore.addTask()` directly, the
  input clears, and focus is retained — so a user can add several tasks back-to-back without
  re-tapping the bar each time.

### 3.2 One-tap field expansion (new)

Below the bare-title bar, once text is entered, reveal a single row of tappable chips for the
fields a user most commonly wants to set *while* adding, without opening the full modal:

- **Due** — tap opens a compact date-quick-pick (Today / Tomorrow / This weekend / Pick a
  date…), not the full calendar widget.
- **Priority** — tap cycles or opens a 4-option inline picker (None/Low/Med/High), same values
  `AddTaskModal` already uses.
- **Endeavour** — tap opens the same `CollectionPicker` component already used elsewhere, in a
  small popover/sheet.

Selecting a chip value visually marks it (colour fill, matching the existing selected-state
styling conventions from `AddTaskModal`'s own priority buttons) and is included when the task is
submitted — still one tap to submit, chips are additive, never required. Leaving all chips
untouched and just hitting submit reproduces the exact bare-title behaviour from §3.1. This row
collapses back to hidden once the input is cleared/submitted.

**Explicitly not in this row:** subtasks, links, notes, tags, time intensity, task kind
(action/waiting/milestone). Those stay behind "Full task creation" (§2) — reachable via an
"More options…" affordance on the quick-add bar that opens `AddTaskModal` full-screen with the
title/chips-so-far pre-filled, for the minority of cases that need them.

### 3.3 New files

```
src/components/MobileQuickAddBar/MobileQuickAddBar.tsx    — the bottom-anchored bar + chip row
src/components/MobileQuickAddBar/MobileQuickAddBar.module.css
```

Mounted in the Tasks section's mobile layout branch, replacing (not alongside) the desktop
top-anchored inline input when `isAndroid` — same underlying `taskStore.addTask()` call either
way, per ADR-8.

---

## 4. Task list layout on mobile

- **Touch targets:** the completion checkbox, and any row-level tap targets, must be at least
  44×44dp (Android accessibility/Material guideline minimum) — audit `TaskItem`'s checkbox
  hit-area on mobile widths; the existing desktop hit-area (sized for a mouse pointer) is very
  likely smaller than this and needs a CSS bump under `:global(.platform-android)` or the
  existing `@media` breakpoint, not a new component.
- **Density:** desktop's `TaskItem` shows several pills (deadline ❗, scheduled 🕐, waiting ⏳,
  tags, subtask progress) inline in one row that can wrap awkwardly at narrow widths. On mobile,
  allow this row to wrap onto a second line (it already can via existing flex-wrap patterns used
  elsewhere in the calendar work) rather than forcing single-line truncation — consistent with
  the project's general "there's room, let it wrap" stance already applied to calendar pills.
- **Swipe gestures (new, no desktop equivalent):**
  - **Swipe right on a task row → toggle complete.** Fires `hapticLight()` (already planned in
    the architecture doc's native-polish section) on completion. Swiping an already-complete
    task back reopens it (same toggle, both directions).
  - **Swipe left on a task row → reveal a delete action** (a red action button slides in from
    the right edge, tap to confirm delete — matches the common "swipe to reveal actions"
    pattern; do not auto-delete on swipe-release alone, deletion is destructive and needs the
    explicit tap per the project's standing rule about confirming destructive actions).
  - Implementation: plain touch-event handling (`onTouchStart`/`onTouchMove`/`onTouchEnd`) or a
    small, well-maintained gesture library — **no Capacitor plugin needed**, this is pure
    web/React interaction, works identically whether wrapped by Capacitor or not.
  - Both gestures are **additive** to the existing tap-to-open-detail and tap-checkbox-to-toggle
    interactions already present — nothing currently on desktop is removed or changed by adding
    these.
  - **Disambiguating a horizontal swipe from vertical list-scroll**, and from the pill row's own
    wrap behaviour (§4 below allows the pill row to wrap rather than scroll, which avoids one
    conflict but not all of them): only treat a touch gesture as swipe-right/left once its
    horizontal displacement clearly exceeds its vertical displacement past a small threshold
    (a standard "lock the gesture axis early" technique — check `Math.abs(dx) > Math.abs(dy) * 2`
    or similar after a few pixels of movement, not on every frame) — otherwise let it fall
    through to normal vertical list scrolling. This is a real, standard implementation detail for
    any swipeable-row list on touch, not optional polish; get it wrong and the row either eats
    scroll gestures or never triggers its own swipe reliably.
- **Pull-to-refresh:** a standard mobile affordance for "make sure I have the latest data,"
  wired to call the existing Supabase sync/pull function (whatever the current sync service
  exposes for an on-demand refresh) rather than any new sync logic. Cosmetic/UX addition only.

---

## 5. Filters and sort on mobile

**Corrected framing:** the reuse here is "render the existing component's output inside a new
outer container," not "extract shared logic into a new layer" — `CollectionFilterPicker.tsx` and
`PurposeFilterPicker.tsx` are each one self-contained component (trigger button + dropdown
markup together, no separated hook/logic layer for building the endeavour-option list or wiring
selection). There is nothing to split out, and this document doesn't ask for that refactor.

Concretely: add a `variant?: 'dropdown' | 'sheet'` prop to both components. `'dropdown'`
(default, unchanged) renders exactly what they render today. `'sheet'` renders the same
option-list markup and the same `onChange`/selection wiring, just wrapped in a bottom-sheet
container instead of a positioned dropdown — driven by the same `uiStore` actions
(`activeCollectionIdByView`, `activePurposeIds`) either way, so no store change of any kind.
A funnel/filter icon in the Tasks section's mobile header opens the `'sheet'` variant of both,
in place of the desktop header's dropdown trigger. No `E`/`Ctrl+E`/`P`/`Ctrl+P` hotkey
equivalents are needed (no physical keyboard) — the funnel icon is the sole entry point on
mobile, and tapping it is the direct touch equivalent of pressing `E`.

`SortBar` becomes a horizontally scrollable chip row directly in the section header (below the
title, above the list) — same sort keys/directions as desktop, CSS-only layout change.

---

## 6. Notifications (cross-reference only)

Task deadline notifications are specified in `docs/android/05-notifications.md` (once written;
until then, see BACKLOG.md §6d "Task deadlines"). Nothing Tasks-app-specific needs to be added
here — the trigger condition, schedule time, and cancel-on-complete/delete rules are already
fully specified there and apply unchanged.

---

## 7. Explicitly deferred / out of scope for this phase

- **Photo/file attachments on tasks.** No `Task` field exists for this today (no
  `attachments`/`imageUrl` in the type). A camera-driven "attach a photo to a task" feature is a
  plausible future mobile-only capability (per architecture doc ADR-8's "native capabilities are
  first-class" principle) but requires a schema addition (new nullable field, a Supabase
  migration, a mapper update) that hasn't been requested for Tasks specifically — flagged as a
  candidate idea for a future pass, not built now. If pursued: same pattern as any other new
  field — add it to `Task`, bump `taskStore`, migrate Supabase, and the *capture* side is a small
  new mobile-only component calling `@capacitor/camera` then `updateTask(id, { attachment })}` —
  no parallel data model needed.
- **Drag-to-reorder tasks/subtasks via touch.** Not currently a desktop feature either (task
  ordering is via `sortOrder` and the existing `SortBar`, not manual drag) — out of scope unless
  requested as its own feature, independent of the Android build.
- **Any change to Focused/Overview mode's actual filtering logic** — only its container
  (segmented control) is discussed here; the underlying behaviour is unchanged from desktop.

---

## 8. File manifest for this phase

**New files:**
```
src/components/MobileQuickAddBar/MobileQuickAddBar.tsx
src/components/MobileQuickAddBar/MobileQuickAddBar.module.css
```

**Modified files:**
```
src/components/TaskList/TaskList.tsx           — mobile layout branch (bottom-anchored quick-add
                                                  instead of top inline input, when isAndroid)
src/components/TaskItem/TaskItem.tsx           — touch-target sizing, swipe gesture handlers,
                                                  pill-row wrap behaviour on mobile
src/components/TaskItem/TaskItem.module.css    — companion CSS for the above
src/components/CollectionFilterPicker/ ,
src/components/PurposeFilterPicker/            — bottom-sheet container variant for mobile
                                                  (same underlying list/select markup)
src/components/SortBar/SortBar.module.css      — horizontal-scroll chip layout on mobile
```

No store, type, or Supabase changes in this phase — everything here is UI-layer only, per §7's
explicit deferral of the one feature (attachments) that would require a schema change.

---

## 9. Build order for this phase

1. Touch-target and density audit on `TaskItem`/`TaskList` at mobile widths — fix checkbox/pill
   sizing first, since everything else in this phase renders inside this list.
2. Build `MobileQuickAddBar` (bare-title fast path only, §3.1) and wire it into `TaskList`'s
   mobile layout branch, replacing the desktop inline input when `isAndroid`.
3. Add the one-tap field-expansion chip row (§3.2) to `MobileQuickAddBar`.
4. Wire swipe-right-to-complete and swipe-left-to-reveal-delete on `TaskItem` (§4).
5. Bottom-sheet container for `CollectionFilterPicker`/`PurposeFilterPicker` on mobile (§5),
   triggered by a new funnel icon in the Tasks section's mobile header.
6. `SortBar` horizontal-scroll adaptation (§5).
7. Pull-to-refresh wired to the existing sync/pull function (§4).
8. Manual end-to-end test pass on an emulator: confirm the `tasks` entry-point icon opens
   directly to this list; confirm quick-add (bare and with chips) creates correct tasks; confirm
   swipe gestures fire haptics and behave correctly in both directions; confirm filter/sort
   bottom sheets reflect and correctly mutate the same `uiStore` state desktop uses; confirm
   `TaskPane`/`AddTaskModal` still work full-screen for the "more options" path.
