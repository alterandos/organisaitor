# Android Build — Phase 3: Records App

**Status:** Planning document. Nothing described here is built. Implements against the
foundation in `docs/android/00-architecture.md` and follows the same reuse-vs-new methodology
established in `docs/android/01-tasks-app.md` (ADR-8) — read both first, plus
`docs/android/02-calendar-app.md` for the sibling pattern this document mirrors.

**Prerequisite:** `00-architecture.md` **Track A** only (§10) — same as Phases 1–2. Track B
(entitlements/billing/ads) is irrelevant; Records is always free, never gated. The
multi-entry-point launcher mechanism (§4) is not required first either.

**Testing this phase:** see `00-architecture.md` §10a. One Records-specific addition: the
quick-log one-tap flow (§4) should be checked on a real device for haptic feel, same as Tasks'
swipe-complete (Phase 1).

**Scope:** every screen, interaction, and behavioural difference from desktop needed to build
the Records section (trackers + routines) on Android. Free tier. Explicitly lower priority than
Phases 1–2 per the user's own framing ("nearer future") — written now so the architecture is
settled, not necessarily built next.

---

## 1. Entry point behaviour

Same mechanism as Phases 1–2 — the `records` entry-point icon calls `setActiveView('records')`
on cold start or via `onNewIntent`, once architecture doc §4 is built. Until then, unaffected.
On entry, per §2's master-detail rule, Records opens to the **tracker/routine list**, not a
previously-active detail — a phone-sized screen can't show both at once, and re-deriving "which
tracker was I last looking at" from a fresh entry-point launch is more surprising than useful.
`MobileNav` includes a Records tab for switching in from elsewhere in the app.

---

## 2. Screen inventory — reuse vs. new (per ADR-8)

| Screen | Decision | Why |
|---|---|---|
| Tracker/routine list (replaces the desktop left sidebar) | **Reuse the underlying list markup, new full-screen container** | Same data (`Object.values(collections)` filtered to `kind==='tracker'|'routine'`), same `activeTrackerId`/`activeRoutineId` selection state — just its own screen instead of a permanently-visible sidebar. See §3 (master-detail collapse). |
| Tracker detail (entries list, chart if any) | **Reuse, full-screen, reached by selecting from the list** | Same component tree as desktop's tracker detail pane; just the *navigation* to reach it changes (see §3). |
| Routine detail (`RoutineChecklist` + history) | **Reuse, full-screen, reached by selecting from the list** | Same reasoning as tracker detail. |
| `RoutineChecklist` itself (steps, complete button) | **Reuse near-unchanged** | Already card-based per BACKLOG.md's existing note — this is Records' daily-use hot path, and it already suits touch well; needs touch-target/haptic polish, not a rebuild. |
| Logging a tracker entry (`AddEntryModal`) | **Split by field-schema shape — see §4** | A tracker with one boolean/rating field (the "habit tracker" archetype) gets a genuine one-tap quick-log, new component. A tracker with multiple/complex fields reuses `AddEntryModal` full-screen unchanged — it's inherently a form regardless of platform, no reduction helps. |
| Creating a tracker (`AddTrackerModal`, field-schema editor) | **Reuse, full-screen, explicitly not layout-optimised** | Same carve-out already given to Schedule's block editor (architecture doc §5b) — building a field schema is occasional, configuration-heavy, desktop-shaped work. |
| Creating a routine (`AddRoutineModal`, steps + day toggles) | **Reuse, full-screen** | Occasional setup, not daily-use — correct reuse bucket. |
| `EditTrackerPane` / `EditRoutinePane` | **Reuse, full-screen** (already a shell-level piece, architecture doc §5b) | Occasional edits. |
| Routine instance history table | **Reuse, full-screen, becomes a vertical list instead of a table** | A `<table>` doesn't fit phone width well; the same underlying instance data renders as stacked rows instead of columns — content unchanged, markup adapted. |
| Speed-dial FAB (Tracker / Entry / Routine options) | **Reuse structurally** | Same three options, mobile-styled floating button — no new interaction model needed here. |

---

## 3. Master-detail collapse (the one real structural difference from desktop)

Desktop's `RecordsView` shows the tracker/routine sidebar and the selected item's detail
side-by-side, permanently. A phone screen can't do both — so this becomes two sequential
full-screen views sharing the same underlying selection state (`uiStore.activeTrackerId`,
`activeRoutineId`), not two new pieces of state:

- **List view** (`activeTrackerId === null && activeRoutineId === null`, or a new explicit "on
  the list screen" mobile-only flag if that null-check proves ambiguous with existing desktop
  logic) — shows every tracker/routine as a tappable row/card, grouped as desktop's sidebar
  already groups them.
- **Detail view** — reached by tapping a row, calls the same `setActiveTracker(id)`/routine
  equivalent action desktop's sidebar click already calls. Shows the exact same detail component
  tree desktop renders in its detail pane, full-screen.
- **Back navigation** (Android back button, or an in-header back arrow) clears the active
  selection, returning to the list view. This reuses the existing Android back-button handling
  already wired for closing modals/panes (architecture doc §5d) — Records' list↔detail is just
  another thing that handler needs to check before falling through to system back/minimize.

This pattern — same state, same components, sequential full-screen presentation instead of
side-by-side — is the general answer for any future desktop sidebar+detail layout ported to
mobile; Records is simply the first place in this build where it's needed.

---

## 4. Quick-log for single-field trackers (new)

**Applies only to a tracker whose `fieldSchema` has exactly one field, and that field's type is
`boolean` or `rating`.** This is the recognisable "habit tracker" shape (e.g. "Meditated today?"
as boolean, "Mood" as a 1–5 rating) — the Records analogue of Tasks/Calendar's quick-add, for
the same reason: logging something you do daily should never require opening a full form.

- **Boolean field:** the tracker's row in the list view (§3) gets a trailing tap-to-toggle
  checkmark. Tapping it directly calls `addEntry()` for today's date with that field set to
  `true`/`false` — no navigation into detail, no modal. Fires `hapticLight()` on toggle, same as
  Tasks' swipe-complete.
- **Rating field:** the tracker's row gets an inline star row (matching the rating display
  style `AddEntryModal` already uses for this field type). Tapping a star logs today's entry
  with that rating directly from the list — again, no navigation, no modal. **Tap-zone
  consideration:** up to five individually-tappable ~44dp star targets sitting inside the same
  row that's also a full-width tap target for row-navigation is tight on a phone width and a
  real mis-tap risk if not handled deliberately. The star row's container must call
  `e.stopPropagation()` on tap (the same pattern already used elsewhere in the codebase for a
  small interactive control nested inside a larger clickable row, e.g. `TaskItem`'s completion
  checkbox) so a star tap never also triggers row-navigation, and the star row should sit in its
  own clearly bounded trailing zone (not overlapping the row's main text) rather than floating
  freely. If five separate ~44dp targets don't comfortably fit the available row width on a
  narrow phone even with this stopPropagation guard, fall back to a single tap-and-hold-free
  compact control (e.g. a horizontal 1–5 stepper, one tap advances, one tap on an already-max
  value resets) rather than forcing five undersized star targets into too little space.
- **Already-logged-today state:** if an entry already exists for today, show its value
  pre-filled (checkmark already ticked / stars already filled) rather than blank — tapping again
  updates today's entry rather than creating a duplicate, matching `AddEntryModal`'s existing
  edit-vs-create logic keyed on `(trackerId, date)`.
- **Every other tracker shape** (multiple fields, or a single field of any other type) shows no
  inline quick-log affordance on its list row — tapping the row navigates to detail as normal
  (§3), and logging goes through `AddEntryModal` full-screen, unchanged from desktop's dynamic
  field-rendering behaviour.

### New files

```
src/components/RecordsTrackerRow/RecordsTrackerRow.tsx    — list row, with the conditional
                                                              inline quick-log affordance
src/components/RecordsTrackerRow/RecordsTrackerRow.module.css
```

---

## 5. Touch and gesture spec

- **Touch targets:** `RoutineChecklist`'s step checkboxes and complete button, and the new
  quick-log checkmark/stars (§4), all need the 44×44dp minimum — audit alongside Tasks'
  equivalent audit (Phase 1 §4), same standard.
- **Swipe-to-delete on tracker entries** (wherever a tracker's detail view lists past entries):
  same pattern as Tasks' swipe-left-to-reveal-delete (Phase 1 §4) — swipe left reveals a delete
  action, requires an explicit tap to confirm, matching the project's standing rule about
  confirming destructive actions. No swipe-right equivalent here (there's no "complete" state
  for a tracker entry the way there is for a task).
- **Routine history list:** no swipe gestures — it's a read-only historical record, not
  something users edit inline.

---

## 6. Notifications (cross-reference only)

Routine logging reminders are specified in `docs/android/05-notifications.md` (once written;
until then, BACKLOG.md §6d "Routine logging reminders") — including the per-routine custom
reminder time field (`Collection.reminderTime`, which does not exist yet). **Correction: BACKLOG's
draft says implementing it means bumping `taskStore` "to v6" — that version number is stale.**
`taskStore` is at **v8** today (confirmed in `src/store/taskStore.ts`, and documented in
CLAUDE.md's migration history), so adding this field when phase 5 is actually built means
bumping to **v9** with a cumulative migration backfilling `reminderTime: null`, not v6. Nothing
else Records-specific to add here beyond confirming that field's edit UI lives in
`EditRoutinePane`, which is already
a full-screen reuse per §2 — no new mobile-specific UI needed for that field.

---

## 7. Explicitly deferred / out of scope for this phase

- **A `photo` field type for trackers.** A real, recognisable use case (meal photos, progress
  photos for a fitness/weight tracker) and a strong candidate for ADR-8's "native capability, new
  component + existing store action" pattern — but `FieldType` has a fixed set today
  (`text|number|date|rating|select|boolean|url|duration`) with no image type, and adding one
  means a schema addition (new `FieldType` value, `AddEntryModal`/`EditTrackerPane` field-editor
  support, a Supabase Storage integration for the actual image bytes). Flagged as a good future
  idea, not built now — consistent with how Tasks' photo-attachment idea (Phase 1 §7) and
  Calendar's photo-driven creation idea (Phase 2 §8) were each deferred rather than assumed.
- **Chart/stats views for trackers** — already an unimplemented desktop feature per BACKLOG.md's
  "Not yet implemented" list (habit heatmap, tracker chart/stats views); no Android-specific
  work to plan until the desktop feature itself exists.
- **Any change to routine scheduling/repeat logic, or to how `RoutineInstance` is computed** —
  only the mobile presentation of existing screens is in scope here.

---

## 8. File manifest for this phase

**New files:**
```
src/components/RecordsTrackerRow/RecordsTrackerRow.tsx
src/components/RecordsTrackerRow/RecordsTrackerRow.module.css
```

**Modified files:**
```
src/components/RecordsView/RecordsView.tsx      — mobile master-detail collapse (§3), list/detail
                                                   full-screen branch on isAndroid
src/components/RoutineChecklist/                — touch-target sizing, haptic wiring
src/components/AddEntryModal/AddEntryModal.tsx  — no functional change; confirm full-screen reuse
                                                   works for multi-field trackers (§4's "every
                                                   other shape" path)
```

No store, type, or Supabase changes in this phase (the deferred photo field type, if pursued
later, would be the one that needs them — see §7).

---

## 9. Build order for this phase

1. Touch-target audit on `RoutineChecklist`'s checkboxes/complete button — Records' daily-use
   hot path, fix this first.
2. Build the mobile master-detail collapse in `RecordsView` (§3): list view, detail view, back
   navigation clearing selection.
3. Build `RecordsTrackerRow` with the conditional quick-log affordance (§4) — boolean and rating
   cases, plus the "already logged today" pre-filled state.
4. Wire haptic feedback (`hapticLight()`) to quick-log taps and routine step/complete toggles.
5. Swipe-to-delete on tracker entries (§5), matching Tasks' existing swipe-gesture
   implementation approach (Phase 1 §4) for consistency — consider sharing the underlying
   gesture-handling code between the two phases if built close together.
6. Convert the routine instance history table to a stacked-row mobile list (§2).
7. Confirm `AddTrackerModal`/`EditTrackerPane`'s field-schema editor and `AddRoutineModal`
   remain reachable and usable (scrollable, no broken layout) at phone width — no optimisation
   work, same "doesn't break" check already applied to Schedule in Phase 2.
8. Manual end-to-end test pass: confirm the `records` entry-point icon (once architecture doc §4
   exists) opens to the list view, never a stale detail; confirm quick-log correctly creates/
   updates today's entry for boolean and rating single-field trackers without opening any modal;
   confirm multi-field trackers still route to full `AddEntryModal`; confirm back navigation
   from detail returns to the list and Android system back doesn't skip past it; confirm
   swipe-to-delete on an entry requires the confirm tap before actually deleting.
