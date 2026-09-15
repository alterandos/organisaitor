# Android Build — Phase 2: Calendar App

**Status:** Planning document. Nothing described here is built. Implements against the
foundation in `docs/android/00-architecture.md` and follows the same reuse-vs-new methodology
established in `docs/android/01-tasks-app.md` (ADR-8) — read both first.

**Prerequisite:** `00-architecture.md` **Track A** only (§10) — same as Phase 1. Track B
(entitlements/billing/ads) is irrelevant here; Calendar is always free, never gated. The
multi-entry-point launcher mechanism (§4) is not required first either — build and test against
the default single launcher icon, same as Phase 1.

**Testing this phase:** see `00-architecture.md` §10a. Nothing Calendar-specific beyond that —
swipe-between-periods gestures (§4 below) work fine via mouse-drag simulation in the emulator.

**Scope:** every screen, interaction, and behavioural difference from desktop needed to build
the Calendar section on Android, including the Schedule sub-feature. Free tier.

---

## 1. Entry point behaviour

Same mechanism as Phase 1 §1 — the `calendar` entry-point icon calls `setActiveView('calendar')`
on cold start or via `onNewIntent` on warm re-entry, once §4 of the architecture doc is built.
Until then, unaffected — this phase doesn't depend on it. `MobileNav` includes a Calendar tab
for switching in from elsewhere in the app.

---

## 2. Screen inventory — reuse vs. new (per ADR-8)

| Screen | Decision | Why |
|---|---|---|
| Month view grid | **Reuse, touch-target fix only** | Already a responsive grid; the real gap is day-cell tap-target size (BACKLOG.md already flagged this — verify ≥44dp), not structure. |
| Week/day hourly time grid | **Reuse, touch-target + tap-to-quick-add change** | The grid layout (`timeGrid.ts` math, hour compression, overlap columns) is generic and platform-agnostic already. What changes is what tapping a row *does* — see §3. |
| View toggle (Month/Week/Day) | **Reuse unchanged** | Small segmented control, fits mobile widths natively. |
| Quick-add for events/reminders | **New mobile-specific component, see §3** | Same reasoning as Tasks' quick-add (Phase 1 §3) — desktop's answer to "add something" is opening `AddCalendarItemModal`, fine with a mouse, too slow to be the *only* path on a phone for something used constantly. |
| Full event/reminder creation (repeat config, notify-before, location, Endeavour) | **Reuse `AddCalendarItemModal`, full-screen on mobile** | Occasional/configuration-heavy — correct reuse bucket. |
| Event/reminder detail-edit (`CalendarEventPane`/`CalendarReminderPane`) | **Reuse, full-screen** (already a shell-level piece, architecture doc §5b) | Editing an existing item's less-common fields is occasional. |
| Endeavour filter picker | **Reuse logic, bottom-sheet chrome** — identical treatment to Phase 1 §5 | Same `CollectionFilterPicker` component/state, same reasoning. |
| Schedule (`ManageSchedulesPane`, `AddScheduleModal` incl. click-to-add-block grid) | **Reuse, explicitly not layout-optimised** (already decided, architecture doc §5b) | Confirmed here: stays reachable (full-screen, scrollable, may require horizontal scroll for the wide block-editor grid) but is not a mobile-UX investment for this phase. Revisit only if usage data says otherwise. |
| Day-pane (month view "+N more" overflow) | **Reuse, full-screen on mobile** instead of a floating side panel | Same content, different container — the desktop version is a fixed-position side panel that doesn't make sense at phone width. |

---

## 3. Quick-add for events and reminders

Mirrors Tasks' quick-add (Phase 1 §3) — same rationale, same pattern, adapted for calendar
items specifically.

### 3.1 Two entry paths, same destination

- **From the FAB / a persistent "+" affordance** (analogous to desktop's `AddTaskButton`
  speed-dial, Calendar-aware): opens the quick-add sheet pre-filled with today's date, no time.
- **From tapping a row in week/day view** (reusing the exact desktop feature already built —
  `handleColumnClick`'s pixel-to-time-of-day math, see CLAUDE.md's "clicking a row prefills the
  time" entry): opens the **same quick-add sheet**, pre-filled with the tapped date *and* time —
  not the full `AddCalendarItemModal` the desktop click currently opens. This is the one
  behavioural change from desktop's existing logic: same time-computation math, different
  (faster) destination component on mobile. Tapping the header/day-name row still pre-fills date
  only, no time — identical rule to desktop, unchanged.

### 3.2 Quick-add sheet fields

Minimal by design:
- **Title** (autofocus, keyboard up immediately)
- **Event/Reminder toggle** (two-way switch, defaults to Event — matches
  `AddCalendarItemModal`'s existing `kind` toggle, same underlying values)
- **Date** (pre-filled per §3.1; tappable to change)
- **Time** (pre-filled per §3.1 when opened from a week/day row; optional otherwise — tapping
  reveals a compact time picker, reusing the existing `TimeInput` component's value contract)
- **Submit** — calls `calendarStore.addEvent()`/`addReminder()` directly with these fields plus
  every other field at its default (no repeat, no notify-before override, no location, no
  Endeavour) — identical default values `AddCalendarItemModal` already uses for a bare-minimum
  submission.

**"More options…"** opens `AddCalendarItemModal` full-screen with title/date/time/kind
pre-filled from the sheet, for repeat config, location, notify-before, or Endeavour — same
"escape hatch to the full form" pattern as Tasks' quick-add (Phase 1 §3.2).

### 3.3 New files

```
src/components/MobileCalendarQuickAdd/MobileCalendarQuickAdd.tsx
src/components/MobileCalendarQuickAdd/MobileCalendarQuickAdd.module.css
```

---

## 4. Touch and gesture spec

- **Touch targets:** month-view day cells and week/day-view hourly grid rows must meet the
  44×44dp minimum — audit both (BACKLOG.md already flagged month cells specifically; extend the
  same check to the hourly grid's row-hit zones, which currently exist for mouse-hover
  highlighting and may be sized differently than a comfortable tap target).
- **Swipe between periods (new, no desktop equivalent):** swipe left/right on the calendar body
  advances/retreats one period, matching the current view — a month in month view, a week in
  week view, a day in day view. This calls the exact same `desktopNext()`/`desktopPrev()`
  functions the nav arrow buttons already call — purely a new gesture trigger for existing
  navigation logic, not new navigation logic. The nav buttons stay visible too; swipe is
  additive. Implementation: plain touch-event handling (no Capacitor plugin needed), same
  approach as Tasks' swipe gestures (Phase 1 §4).
  **Edge-gesture conflict, must be handled explicitly:** a naive full-width horizontal swipe
  listener collides with Android's own system back gesture, which captures left/right swipes
  starting within a strip near either screen edge (exact width varies by device/gesture-nav
  settings, but is a well-known standard Android affordance, not something this app controls).
  Do not attach the swipe-to-navigate listener to the full width of the calendar body — exclude
  roughly the outer 24dp on each edge from the gesture's *start* detection (a swipe that starts
  in the excluded zone is ignored by this handler and left to the system), so a user's attempt to
  go back to the home screen via the OS gesture is never intercepted as "go to next period."
  Verify this specifically on a real device with gesture navigation enabled (not 3-button nav) —
  emulators don't always reproduce edge-gesture capture behaviour faithfully.
- **Tapping a week/day-view row** → quick-add with time prefill, per §3.1 (behavioural change
  from desktop's current "open full modal" — see that section for the exact reasoning).
- **Tapping a month-view day cell** (not on an item pill) → quick-add with date only, no time
  (a day cell has no time-of-day meaning, matching the existing header-row rule).
- **Tapping an existing item pill** (task/event/reminder/schedule) → unchanged from desktop:
  opens the relevant detail pane/popover. Nothing about tapping an *existing* item changes on
  mobile — only tapping empty space to create something new gets the new quick-add behaviour.

---

## 5. Filters

Endeavour filter — identical treatment to Tasks (Phase 1 §5): same `CollectionFilterPicker`
component/state, bottom-sheet container instead of header dropdown, triggered by a funnel icon.
Calendar has no Purpose filter on desktop today (that's Tasks-only per CLAUDE.md), so nothing to
adapt there.

---

## 6. External links (locations, Google Maps)

`CalendarEventPane`'s location field renders a 🗺 link that opens Google Maps (or ↗ if the
stored value is already a URL) via the shared `openExternalLink()` utility. Per the fix flagged
in `00-architecture.md` §5d (found while speccing this phase), that utility needs an Android
branch using `@capacitor/browser` — implement it once, there, not specifically for Calendar.
Once fixed, this screen needs no Calendar-specific change; it already calls the shared utility.

---

## 7. Notifications (cross-reference only)

Calendar event and reminder notifications are specified in `docs/android/05-notifications.md`
(once written; until then, BACKLOG.md §6d "Calendar events"/"Calendar reminders"). Schedule
occurrence notifications are a new kind not covered by that earlier draft — flagged in
`00-architecture.md` ADR-6 as a gap to close when that document is written. Nothing further to
add here.

---

## 8. Explicitly deferred / out of scope for this phase

- **Photo-driven event creation** (e.g. snapping a photo of a physical flyer/invite and having
  it parsed into an event) and **screenshot-to-schedule import** (uploading a timetable photo to
  auto-populate Schedule blocks) are both real, previously-identified ideas — the latter was
  explicitly discussed and scoped as "needs a server-side vision/LLM API call, a genuinely
  separate integration" (see CLAUDE.md's Schedule section, "Known gaps / deliberately
  deferred"). Both fit ADR-8's "native capability, small new component + existing store action"
  pattern once built, but neither is in scope for this phase — flagged here so they aren't
  forgotten, not built now.
- **Pinch-to-zoom on the week/day hourly grid** (e.g. to see more/fewer hours at once) — a
  plausible future touch enhancement, not requested, not built here. The existing
  hour-compression behaviour (empty hours collapse, active hours expand) already does most of
  what zoom would achieve.
- **Any change to Schedule's actual recurrence/conflict logic** — only its screen's mobile
  reachability is discussed here (§2); the underlying behaviour is unchanged from desktop, and
  it remains explicitly non-layout-optimised per architecture doc §5b.

---

## 9. File manifest for this phase

**New files:**
```
src/components/MobileCalendarQuickAdd/MobileCalendarQuickAdd.tsx
src/components/MobileCalendarQuickAdd/MobileCalendarQuickAdd.module.css
```

**Modified files:**
```
src/components/CalendarView/CalendarView.tsx        — mobile touch-target sizing, swipe gesture
                                                        handlers, row/cell tap routes to quick-add
                                                        instead of AddCalendarItemModal on mobile
src/components/CalendarView/CalendarView.module.css  — companion CSS, day-pane full-screen on mobile
src/components/CollectionFilterPicker/               — bottom-sheet container variant (shared with
                                                        Phase 1, same component)
src/utils/links.ts                                   — Android branch in openExternalLink()
                                                        (tracked as a Track-A/foundational fix in
                                                        00-architecture.md §5d, not Calendar-only)
```

No store, type, or Supabase changes in this phase.

---

## 10. Build order for this phase

1. Touch-target audit on month-view day cells and week/day hourly grid rows — fix sizing first.
2. Build `MobileCalendarQuickAdd` (title/kind/date/time fields, §3.2), wired to a new FAB/"+"
   affordance pre-filled with today's date.
3. Change week/day-view row tap and month-view cell tap to open `MobileCalendarQuickAdd`
   (pre-filled per §3.1/§4) instead of `AddCalendarItemModal`, on mobile only — desktop's
   existing click behaviour is unchanged.
4. Wire swipe-left/right-to-navigate-period on the calendar body (§4), calling the existing
   `desktopNext()`/`desktopPrev()` functions.
5. Bottom-sheet container for the Endeavour filter picker (§5) — likely shareable code with
   Phase 1's equivalent work, build once if both phases land close together.
6. Add the Android branch to `openExternalLink()` (§6) — do this once, verify it also fixes
   Notes/Tasks/Lists links, not just Calendar's location link.
7. Convert the month-view day-pane (overflow "+N more") to a full-screen mobile container (§2).
8. Confirm Schedule's `ManageSchedulesPane`/`AddScheduleModal` remain reachable and usable
   (scrollable, no broken layout) at phone width — no optimisation work, just a "doesn't break"
   check.
9. Manual end-to-end test pass: confirm the `calendar` entry-point icon (once §4 of the
   architecture doc exists) opens directly to this section; confirm quick-add from both entry
   paths creates correctly-timed events/reminders; confirm swipe navigation advances the correct
   period for the active view; confirm tapping an existing item still opens its detail pane/
   popover unchanged; confirm the Maps link opens the native Maps app via the fixed
   `openExternalLink()`.
