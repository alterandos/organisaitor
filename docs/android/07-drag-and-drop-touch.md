# Android — touch support for drag-and-drop features

## Status: needs investigation + implementation (this is active work, not a maybe)

Three features added to the web/desktop build (commit `abfe2b9`, "Added List tab
drag-and-drop reordering, Chronicle tree drag-and-drop nesting, some Notes nav-column
polish, a Tauri dragDropEnabled fix") use the native HTML5 drag-and-drop API
(`draggable`, `dragstart`/`dragover`/`dragleave`/`drop`/`dragend`). That API is a
mouse-input model — Chromium-based mobile WebViews (which is what Capacitor's Android build
runs on) do not translate touch gestures into these events on their own. **Assume these
three features do not currently work by touch on Android at all** until you've verified
otherwise on the AVD — this has not been tested either way yet, only reasoned about from
how the API works.

This doc's job is to get you oriented on exactly what exists today, not to hand you a
finished implementation — the actual touch-interaction approach is a real design decision
(see "Approach" below) that should be confirmed with the user before you commit to it,
per this project's standing instruction not to assume on genuine ambiguity.

---

## The three affected features, as they exist today

All three follow the same shape: an element gets the `draggable` attribute plus
`onDragStart`/`onDragOver`/`onDrop`(/`onDragLeave`/`onDragEnd`) handlers, with a ref
mirroring the "currently dragging" id so `onDrop` never reads a stale closure value (a
convention already established in this codebase before these three, see e.g.
`runTableCmd`'s `editorRef` pattern in `NoteEditor.tsx`).

1. **`src/components/NoteEditor/NoteEditor.tsx`** (pre-existing, not new this batch, but
   its Tauri desktop build was only just unblocked by the `dragDropEnabled: false` fix in
   `src-tauri/tauri.conf.json` — so it's realistic this is the first time anyone's looked
   at whether it works on touch at all) — reordering a note's tabs. `draggable={renamingTabId
   !== tabId}` (~line 1171), handlers ~1172–1211. Left/right drop zones only (a tab bar is
   one-dimensional) — computed from cursor X relative to the target tab's midpoint.
   State: `draggingTabId`/`dragOverInfo` (React state, for re-render) mirrored into
   `draggingTabIdRef`/`dragOverTabIdRef`/`dragOverSideRef` (refs, for `onDrop`'s stale-closure
   safety). `.tabDragging`/`.tabDragBefore`/`.tabDragAfter` CSS classes.

2. **`src/components/ListsSection/ListsSection.tsx`** (new this batch) — reordering a
   list's tabs. Same left/right-only shape as #1, deliberately modelled on it (per its own
   comment: "same left/right-side-drop convention as NoteEditor's note-tab drag-and-drop").
   `draggable` (~line 578), handlers ~579–598, commits via `handleTabDrop()` →
   `updateList(id, { tabs })`. `.listTabDragging`/`.listTabDragBefore`/`.listTabDragAfter`
   CSS classes (`ListsSection.module.css`) mirror NoteEditor's naming.

3. **`src/components/ChronicleView/ChronicleView.tsx`** (new this batch) — dragging one
   notebook onto another to re-nest it (Explorer-style), complementing the pre-existing
   ↳/↰ indent/outdent buttons rather than replacing them. This one is **more complex** than
   #1/#2: it's a 3-zone model (before / after / inside — "inside" = drop onto the target to
   make it a child, computed via `zoneForOffset(cursorY, rowHeight)` splitting the row into
   thirds), and drops are validated before being accepted (`canAcceptZone()` refuses a
   self-drop or a drop that would create a cycle via `isDescendantOf()` walking
   `parentTagId`). `draggable` (~line 228), handlers ~229–267. State is lifted to
   `ChronicleView` itself (not the individual tree node) since a drag can cross between
   completely different branches of the recursive tree — `draggingTagIdRef`,
   `dragOverZoneRef`, threaded down through `TreeNodeProps`.
   `.treeNodeDragging`/`.treeNodeDropTarget`/`.treeNodeDropBefore`/`.treeNodeDropAfter` CSS
   classes.

Read all three in full before starting — the point of listing them together is that
whatever touch mechanism you build should ideally serve all three through one shared piece
of code, not three independent one-off touch implementations, given how similar their
shapes already are.

---

## Approach — confirm with the user before building

Two realistic paths, with real tradeoffs. **Ask the user which they'd prefer (or whether
they want a quick spike of both before deciding) rather than picking one and building it
silently:**

**Option A — a small dependency.** Libraries like `drag-drop-touch` (a widely-used polyfill
that listens for touch events and synthesizes the corresponding native `DragEvent`s, so
existing `onDragStart`/`onDragOver`/`onDrop` handlers fire unchanged) exist specifically for
this problem. If one fits, this could mean **zero changes to the three components above** —
just importing/initializing the polyfill, conditionally on Android (or unconditionally,
since it should no-op when native touch-drag isn't needed... verify that claim against
whichever library you pick, don't assume it's fully passive on desktop). Fastest to ship,
but adds a runtime dependency and needs verifying it doesn't subtly misbehave (wrong
`clientX`/`clientY` translation, wrong `dataTransfer` emulation) with this codebase's
specific zone-computation logic (especially Chronicle's 3-zone before/after/inside split,
which is the most position-sensitive of the three).

**Option B — hand-rolled touch handlers.** Add `onTouchStart`/`onTouchMove`/`onTouchEnd`
alongside the existing `onDragStart`/etc. on each draggable element (or on a shared wrapper
component/hook the three could all use), with:
- A long-press-or-movement threshold to distinguish "starting a drag" from "just tapping"
  or "scrolling the list" (a raw `touchstart` firing an immediate drag would make normal
  scrolling on that list/tree impossible).
- `touchmove` tracking position and using `document.elementFromPoint(x, y)` to find what's
  under the finger (there's no native "what am I hovering" signal from touch the way
  `dragover`'s target gives you for free) — this is the piece that has to call into each
  component's existing zone logic (`zoneForOffset` for Chronicle, the left/right midpoint
  check for List/Notes tabs) with the touched element instead of a `DragEvent`.
- `touchend` invoking the same drop-commit logic each `onDrop` handler already has.

More code, more surface to get subtly wrong across three different zone models, but no new
dependency and full control over exactly how it feels (e.g. deciding the long-press
threshold, visual feedback during drag).

Whichever is chosen, this is a good candidate for a small shared utility (e.g.
`src/hooks/useTouchDragFallback.ts`) rather than three separate implementations — but don't
force a shared abstraction if the three zone models turn out awkward to unify; three small,
clear implementations beat one contorted generic one, per this project's own stated
"no premature abstraction" convention (see `CLAUDE.md`'s Coding conventions).

---

## Before writing any code

1. **Verify the problem is real** on the AVD, via this project's established CDP-based
   testing method (see `docs/android/00-architecture.md` and `06-web-session-catchup.md`'s
   intro for exactly how) — attempt a touch-drag on all three features and confirm none of
   them currently work, rather than assuming from first principles. It's possible one of
   them partially works by accident (some Android WebView versions have started adding
   limited touch-to-drag support) — know the actual starting state before planning the fix.
2. **Bring the two-option choice above to the user** before implementing either one.
3. Only then build, and verify each of the three features works by touch on the AVD
   afterward — a code review is not sufficient, per this project's testing philosophy.

---

## Acceptance checks (once an approach is chosen and built)

- On the AVD, via a real touch gesture (not a mouse click simulated as a tap): reorder a
  note's tabs in NoteEditor by dragging one past another; confirm the order actually
  changes and persists.
- Same for a list's tabs in ListsSection.
- In Chronicle, drag one notebook onto another; confirm it becomes a sub-notebook (the
  "inside" zone) — and separately, drag a notebook just above/below a sibling; confirm it
  reorders instead of nesting (the "before"/"after" zones). Confirm dragging a notebook onto
  its own descendant is correctly refused (no cycle created).
- Confirm normal touch-scrolling in the Chronicle tree, the list-tab bar, and the note-tab
  bar still works normally — a broken long-press threshold could make one look like it
  fixed dragging while breaking ordinary scroll.
- Confirm desktop (mouse-based) drag-and-drop for all three is **completely unaffected** —
  this must be purely additive.

---

## When you're done

Same requirement as `docs/android/06-web-session-catchup.md`: update `CLAUDE.md`'s "Android
build — implementation status" section (and remove/rewrite the bullet in its "Not built
yet" list that currently points at this doc) with what was actually built and verified. If
you only get partway, say so honestly rather than leaving stale status behind.
