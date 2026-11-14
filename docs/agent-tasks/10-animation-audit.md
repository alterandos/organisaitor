# 10 — Where small animations would make the suite nicer to use

Status: Done 2026-11-14 — the user chose 1–8, 10, 12, 13 and 14 (built, see "Animations from the 2026-11-14 sweep" in implemented-features.md); 9 waits for goals to be settled; 11 not chosen

## The problem

The user wants the app to feel livelier ("zazz it up a bit") with small, delightful animations, without making it slower or noisier. The first one was built on 2026-11-11: completing a task pops its checkbox and sends a few sparks out (`src/animations/completionBurst.ts`, through `services/taskCompletion.ts` `onTaskCompleted`); since 2026-11-13 the completed row also stays a moment and folds away (`src/animations/settle.ts`). Motion (the `motion` package, approved by the user 2026-11-11) is installed for this and loaded only when an animation first plays.

## What to do

1. ~~Walk through every section and list the moments where an animation would say something~~ — done 2026-11-14 (below).
2. **Build only the ideas the user has signed off**, and write here which those are (the user picks from the list in the 2026-11-14 session report; the numbers below match it).

## Rules any animation must keep

- `prefers-reduced-motion: reduce` turns it off (`reducedMotion()` in `src/animations/completionBurst.ts`); a highlight that doesn't move may stay.
- It never delays the change itself or blocks input; the data changes at once and the animation plays over it.
- Colours from the design tokens, in both themes; layers at `--z-celebrate`.
- It lives in `src/animations/`, one file per animation, and loads Motion only through `await import('./motionLib')`, so the first load stays small (pattern test).
- It's started from the one place the change happens (a service's listener, like `onTaskCompleted`), never from each button.
- Under ~400 ms, except a celebration (up to ~600 ms).

## Shared building blocks (make the one an idea needs first)

- **`src/animations/flash.ts` `flashArrival(el)`**: a one-off highlight on an element that just appeared or came back: its background fades from `--color-primary-subtle` to nothing over ~700 ms, with a 4 px rise (translateY 4px → 0, 180 ms ease-out). CSS keyframes in `flash.module.css` (no Motion); with reduced motion, the highlight without the rise. If it's off screen, `el.scrollIntoView({ block: 'nearest' })` first.
- **`src/animations/flip.ts` `flipFrom(el, before: DOMRect)`**: the FLIP technique for one thing that moved: measure its rect before the change, let React (or ProseMirror) render, then in `requestAnimationFrame` animate it from the old place to the new with Motion's `animate(el, { x: [dx, 0], y: [dy, 0] }, { type: 'spring', stiffness: 500, damping: 40 })`. Reduced motion: nothing. Only where one thing moves at a time; a whole list reordering would need `motion/react`'s layout animation (a larger import: make the case to the user first).
- **Events**: where an idea needs "it was restored / created / removed", add a small listener set beside the action that does it (as `onTaskCompleted` is in `services/taskCompletion.ts`), with a test, and have the row listen for its own id.

## Build instructions, one per idea

**1. Checklist and routine ticks.** Where: `RoutineChecklist` (a step's checkbox), a checklist list's items (`ListsSection`, the item card's checkbox), `LinkedChecklists`. Add `src/animations/tickPop.ts` `tickPop(checkbox)`: the checkbox's spring pop from `completionBurst.ts` (scale 0.7 → 1, stiffness 600, damping 11) without ring or sparks; the item's text gets its strike-through drawn left to right (a `linear-gradient(currentColor, currentColor)` background, 1 px high at mid-height, sized 0 → 100% width over 200 ms, on a class added for the moment). Start it from the toggle action (`services/taskListLinks.ts` `toggleChecklistItemWithTasks`; the routine store's check action) through a listener. Test the listener.

**2. A routine finished for the day.** Where: `RoutineChecklist` `handleComplete`. When Complete runs, play `completionBurst` at the Complete button (it takes any anchor) and fade the card's done state in (opacity 0 → 1, 200 ms). If a streak or count is shown, tick the number up (the old number slides up and out, the new one in, 150 ms).

**3. Undo brings it back where you can see it.** Where: `services/undoableActions.ts` (swipe-delete and the right-click deletes' Undo), `services/trash.ts` `restoreFromTrash` / `restoreAllFromTrash`, the Completed toast's Undo (`taskCompletion.ts`). Add `onRestored(kind, id)`, fired by those; rows that can come back (`TaskItem`, a list item card, `CalItemLine` / `CalItemBlock`) listen for their own id and call `flashArrival` on their row the frame after it's back.

**4. Something new lands where you can see it.** Where: creating a task (`AddTaskModal`, the phone's quick-add bar), a list item (`AddListItemModal`), a calendar item (`AddCalendarItemModal` on Create). In a sorted list the new item often lands out of view. Fire `onCreated(kind, id)` from the create path (after the store call) and have the row call `flashArrival` (it scrolls into view first).

**5. A calendar item moved to a new time glides there.** Where: `CalendarView` (drag-and-drop in the week and day grids, and the month view's cells), notification Postpone (`services/notifications/actions.ts`), Skip this one (`services/recurringTasks.ts` `skipOccurrence` for a task with a calendar entry). Before the store change, measure the item's block (give `CalItemBlock` / `CalItemLine` a `data-cal-item="<id>"` if they lack one); after it, `flipFrom` on the block at its new place. Touch: the same after a long-press drag.

**6. The Overview Runway's drops settle.** Where: `OverviewRunway` drags (applied by `overview/edit.ts`, each with Undo). As 5: measure the bar before `edit.ts` applies the change, `flipFrom` after. Undo plays it back the other way for free (it's another move).

**7. A block's part slides to its new place.** Where: `NoteEditor/extensions/blockParts.ts` (Alt+↑ / Alt+↓, Move up / down, a drag). Today the moved part flashes in its new place. Before dispatching, measure the part's DOM (`view.nodeDOM(pos)`); after, `flipFrom` on its new DOM, and a small `flipFrom` on the part it swapped with. Under 200 ms (typing speed); skip while a key repeats (the last move under 150 ms ago).

**8. Quick Access and Go to open with a quick zoom.** Where: `QuickAccessPane`. CSS only: on mount, the panel from `opacity: 0; transform: scale(0.97)` to normal over 120 ms (`cubic-bezier(0.2, 0.7, 0.3, 1)`), the backdrop fading in over 120 ms; no animation on close (closing must feel instant). The `popIn` keyframes in `NoteEditor/extensions/BlockDesigns.module.css` are the model; if a second pane takes it, move it to `index.css` as a shared keyframe.

**9. A goal reached.** Where: `goalStore.setGoalStatus` to achieved (the person's click), shown in `GoalModal` and the Endeavour home's goal card. Play `completionBurst` at the goal's progress bar, bigger (add options to `completionBurst.ts`: `{ sparks: 16, spread: 1.6 }`), and fill the bar's last stretch with a 300 ms ease-out width transition. Start from a listener on `setGoalStatus`, never from `goalProgress` (it runs on every render).

**10. The bell nods when something new arrives.** Where: `NotificationCenter`'s header bell. When the unread count goes up (compare with the previous value; CLAUDE.md "An effect that reacts to a change skips the first run"), rock the bell icon −12° → 10° → 0 over 400 ms (CSS keyframes) and pop the badge (scale 0.6 → 1). Not on first load, not when the count goes down.

**11. Sync shows it's working, then done.** Where: Account's sync badge (`AccountPane`, and the header's account button if it shows sync state). While a push or load runs, the sync icon turns slowly (CSS rotate, 1.2 s linear, infinite); when it ends, a check pops (spring) and fades after 1.5 s. Read the state the badge already reads; nothing new in `syncService.ts`.

**12. A swiped-away row folds up (Android).** Where: `useSwipeRow` users (`TaskItem`, list items) on a swipe-left delete: today the row vanishes and the rows below jump up. Hold the row a moment with `settle.ts` `useSettling` (on a "removed" event, as `TaskList` does for completions) and give it `leavingClass` (fade and fold, 280 ms); the store change still happens at once.

**13. A note block's design changes with a crossfade.** Where: `NoteEditor/extensions/designCycle.ts` (Ctrl+] / Ctrl+[) and the pill's design buttons (`designButtons` in `blockDesigns.ts`). Wrap the dispatch in `withViewTransition('design', …)` (`utils/viewTransition.ts`), give that block's DOM a `view-transition-name` (`block-design`) for the moment, and add the `design` kind's `::view-transition` rules in `index.css` (a 150 ms crossfade). Skip for a block taller than the window (it reads as a flicker).

**14. A card's kind changes with a colour wash.** Where: `services/glossary.ts` `changeGlossaryKind`. Every card of the record (`[data-entry-id="<id>"]`, set by `GlossaryCard.ts`) gets a class for 400 ms that transitions `--card-accent` from the old kind's colour to the new one (register it with `@property … { syntax: '<color>' }` so it can animate). CSS only.

## How to verify

Run the app (`npm run dev`), try each built moment in both themes and with reduced motion on (the OS setting, or DevTools → Rendering → Emulate CSS prefers-reduced-motion). Each listener (restored, created, removed, goal reached, ticked) gets a unit test like `settle.test.ts`.

## When done

Set the Status line, list which ideas were built here, and log them in `docs/features/implemented-features.md` (and CLAUDE.md "Animations" if a shared building block was added).
