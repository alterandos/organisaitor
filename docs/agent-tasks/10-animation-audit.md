# 10 — Where small animations would make the suite nicer to use

Status: Not started

## The problem

The user wants the app to feel livelier ("zazz it up a bit") with small, delightful animations, without making it slower or noisier. The first one was built on 2026-11-11: completing a task pops its checkbox and sends a few sparks out (`src/animations/completionBurst.ts`, through `services/taskCompletion.ts` `onTaskCompleted`). Motion (the `motion` package, approved by the user 2026-11-11) is installed for this and loaded only when an animation first plays.

## What to do

1. Walk through every section (Endeavours, Overview, Tasks, Calendar, Records, Lists, Notes, Portfolio, Fitness) and the suite-wide panes (Quick Access, Go to, Settings, toasts, the pad), on desktop and on Android.
2. List the moments where an animation would **say something** (an action completed, something moved, appeared or went, a state changed) rather than decorate. Good candidates to look at: a tick on a checklist or routine step, a list item moving between tabs, a note opened from a Mosaic tile, an Overview row dragged on the Runway, a goal reaching its target, a streak kept up, Quick Access opening, the Recycling Bin restoring something, a block's design switching, a calendar item dropped on a new time.
3. For each, propose: the moment, what moves and how (spring or ease, roughly how long: keep it under ~400 ms), why it helps, the touch version, and the cost (Motion's `animate`, its layout animation (`motion/react`, a larger import, only where a list reorders), or CSS alone).
4. Rank them (most value for least noise first) and give the user the list to choose from. **Build nothing before they choose.**

## Rules any animation must keep

- `prefers-reduced-motion: reduce` turns it off (`reducedMotion()` in `src/animations/completionBurst.ts`).
- It never delays the change itself or blocks input; the data changes at once and the animation plays over it.
- Colours from the design tokens, in both themes; layers at `--z-celebrate`.
- It lives in `src/animations/` and loads Motion with a dynamic `import('motion')`, so the first load stays small.

## How to verify

Run the app (`npm run dev`), try each proposed moment in both themes and with reduced motion on (the OS setting, or DevTools → Rendering → Emulate CSS prefers-reduced-motion).

## When done

Set the Status line, put the user's chosen list in BACKLOG.md (or build it if they ask), and log what was built in `docs/features/implemented-features.md`.
