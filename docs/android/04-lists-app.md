# Android Build — Phase 4: Lists App

**Status:** Planning document. Nothing described here is built. Implements against the
foundation in `docs/android/00-architecture.md` and follows the same reuse-vs-new methodology
established in `docs/android/01-tasks-app.md` (ADR-8) — read that first, plus
`docs/android/03-records-app.md` specifically, since Lists shares its exact sidebar+detail
desktop layout shape and *intends* to reuse that phase's master-detail collapse pattern.

**Correction, found by an audit of this document set:** this document's first draft claimed that
reuse was "verbatim." It isn't, yet — `RecordsView.tsx` genuinely drives its detail view from
`uiStore` (`activeTrackerId`/`activeRoutineId`, read directly via `useUIStore`), but
`ListsSection.tsx` drives its detail view from **local component `useState` (`selectedListId`)**,
only writing one-way *into* `uiStore.activeListId` (via a `useEffect`), never reading it back
out. The shared back-button consumer mechanism (architecture doc §5d) calls a screen-provided
`clearSelection()` callback that must actually change what renders — if `ListsSection` keeps
reading its own local state while the callback clears `uiStore`, back-button-driven navigation
silently does nothing. **§3 below specifies the one-time prerequisite refactor this needs before
the pattern is genuinely reusable**, per the standing rule the architecture doc now states
explicitly: any collapsible master-detail screen's selection state must live in `uiStore`, not
local `useState`.

**Prerequisite:** `00-architecture.md` **Track A** only (§10) — same as Phases 1–3. Track B
(entitlements/billing/ads) is irrelevant; Lists is always free, never gated, per ADR-4. The
multi-entry-point launcher mechanism (§4 of the architecture doc) is not required first either.

**Testing this phase:** see `00-architecture.md` §10a. Nothing Lists-specific beyond that.

**Scope:** every screen, interaction, and behavioural difference from desktop needed to build
the Lists section on Android. Free tier — the fourth and last of the always-bundled core apps
(Tasks, Calendar, Records, Lists).

---

## 1. Entry point behaviour

Same mechanism as Phases 1–3 — the `lists` entry-point icon calls `setActiveView('lists')` on
cold start or via `onNewIntent`, once architecture doc §4 is built. Until then, unaffected. Per
§3's master-detail rule below (identical reasoning to Records, Phase 3 §1), entry opens to the
**list-of-lists view**, not a previously-active list's detail. `MobileNav` includes a Lists tab.

---

## 2. Screen inventory — reuse vs. new (per ADR-8)

| Screen | Decision | Why |
|---|---|---|
| Sidebar (grouped Watchlists/Reference lists) | **Lift `selectedListId` into `uiStore` first (§3), then reuse Records' collapse pattern** | Structurally identical problem to Records — but reuse requires `ListsSection` to actually read its selection from `uiStore.activeListId`, which it doesn't today. See §3 for the required one-time refactor. |
| Watchlist card grid | **Reuse, single-column on mobile** | Already card-based; `grid-template-columns: 1fr` is the entire layout change needed. |
| Reference `<table>` | **Reuse content, stacked-row mobile list instead of a table** | Same pattern already applied to Records' routine history table (Phase 3 §2) — a `<table>` doesn't fit phone width; the same per-field data renders as stacked label/value rows instead of columns. |
| Tab bar (`ListTab`, when a list has tabs) | **Reuse, horizontal scroll** | Same treatment as `SortBar`'s mobile adaptation (Phase 1 §5) — small control, CSS-only change. No `Ctrl+PgUp`/`Ctrl+PgDn` equivalent needed (no keyboard); tapping a tab is the direct touch equivalent. |
| Adding a list item (`AddListItemModal`) | **Split — quick-add for the common case, full modal for the rest. See §4.** | Same reasoning as Tasks/Calendar/Records' quick-add: jotting down "a movie I heard about" onto a watchlist is a frequent, low-friction action that shouldn't require a full dynamic form every time. |
| Watchlist item status (want/in-progress/done) | **New: tap-to-cycle directly on the card, see §5** | A 3-state cycle is a natural one-tap-per-state interaction on a touch surface — no reason to require opening the item to change status. |
| Creating a new list (`AddListModal`, two-step type picker + field-schema editor) | **Reuse, full-screen, explicitly not layout-optimised** | Same carve-out already given to Schedule's block editor and Records' tracker field-schema editor — occasional, configuration-heavy setup work. |
| Editing an existing list item's full field set | **Reuse `AddListItemModal`, full-screen** | The "more options" escape hatch from quick-add (§4), and the only path for reference-kind items (no status, more fields on average) — occasional enough to reuse as-is. |

---

## 3. Master-detail collapse — requires a prerequisite refactor first

Unlike Records (Phase 3 §3), this pattern is **not** immediately verbatim-reusable here — see
the correction at the top of this document. Two steps, in order:

### 3.1 Prerequisite: lift selection state into `uiStore`

`ListsSection.tsx` today: `const [selectedListId, setSelectedListId] = useState<ListId | null>(null)`,
with a `useEffect` that calls `setActiveListId(selectedListId)` whenever it changes — write-only,
one-way, into a `uiStore.activeListId` field that already exists but that `ListsSection` itself
never reads. Fix: delete the local `useState`; read `selectedListId` **from**
`useUIStore((s) => s.activeListId)` instead, and change every place that currently calls
`setSelectedListId(...)` to call `setActiveListId(...)` directly. After this change,
`uiStore.activeListId` is the single, genuine source of truth — exactly the shape Records'
`activeTrackerId`/`activeRoutineId` already has. This is a small, mechanical, low-risk refactor
(swapping which hook a handful of reads/writes go through, no behavioural change to desktop,
which doesn't care whether the state is local or global) but it is a real prerequisite step, not
optional polish — do it before attempting anything below.

### 3.2 The collapse itself, once 3.1 is done

Identical structure to Records (Phase 3 §3): a **list view** (`activeListId === null`) showing
every list as a tappable row, grouped the same way desktop's sidebar already groups them by
kind; a **detail view** reached by tapping a row, calling `setActiveListId(id)`; **back
navigation** registers a `mobileBackConsumer` (architecture doc §5d) on mount that calls
`setActiveListId(null)` and returns `true`, cleared on unmount. Entry via the `lists` entry-point
icon (§1) always lands on the list view, matching Records' identical launch-state reasoning.

---

## 4. Quick-add for list items

Same structure as Tasks (Phase 1 §3) and Calendar (Phase 2 §3) — reused pattern, not a new
concept, adapted fields.

- **Title only, autofocus, immediate submit** — calls `listStore`'s add-item action with just a
  title and the list's default field values (blank/`null` for everything else), exactly mirroring
  `AddListItemModal`'s own minimum-viable submission today.
- **One-tap chip row, watchlist-kind lists only:** a **Status** chip (Want/In progress/Done,
  defaulting to Want) — the single field worth setting inline, since it's the one field every
  watchlist item has that reference-kind items don't. No chip row at all for reference-kind
  lists — their fields are too varied per list-type to usefully generalise into quick chips;
  reference items go through "More options" (below) for anything beyond a bare title.
- **"More options…"** opens `AddListItemModal` full-screen, pre-filled with title/status-so-far,
  for tab assignment, dynamic per-list-type fields, notes, and links.
- **Tab pre-fill:** if opened while a specific tab is active (not "All"), the quick-add
  pre-assigns that tab, matching how the full modal's tab picker already defaults contextually.

### New files

```
src/components/MobileListQuickAdd/MobileListQuickAdd.tsx
src/components/MobileListQuickAdd/MobileListQuickAdd.module.css
```

---

## 5. Tap-to-cycle status (new, watchlist-kind only)

A watchlist item's card gets a status badge that cycles Want → In progress → Done → Want on tap,
calling the same update action `AddListItemModal`'s status picker already calls — no new store
logic, just a faster trigger for an existing field. Fires `hapticLight()` on each cycle, same
convention as every other quick-toggle interaction across the suite (Tasks' swipe-complete,
Records' quick-log). Reference-kind items have no status field and show no badge — unchanged
from desktop, where the status picker is already conditionally hidden for reference lists. As
with Records' rating quick-log (Phase 3 §4), the badge must call `e.stopPropagation()` on tap so
it never also triggers the card's row-navigation tap target.

---

## 6. Touch and gesture spec

- **Touch targets:** watchlist cards' status badge (§5) and any per-item action buttons need the
  44×44dp minimum, same standard applied throughout Phases 1–3.
- **Swipe-to-delete on list items** (both watchlist cards and reference table rows, once
  converted to a stacked list per §2): identical pattern to Tasks (Phase 1 §4) and Records
  (Phase 3 §5) — swipe left reveals delete, requires an explicit confirm tap.
- **No swipe-to-cycle-status** — status cycling is a tap on the badge (§5), not a swipe; swiping
  is reserved for delete, keeping one consistent gesture vocabulary across the whole suite
  (swipe = destructive/reveal, tap = the fast common action) rather than overloading swipe with
  two different meanings on the same row.

---

## 7. Notifications

None. Lists has no deadline/reminder concept on desktop today, and nothing in this phase
introduces one. No cross-reference needed to `docs/android/05-notifications.md`.

---

## 8. Explicitly deferred / out of scope for this phase

- **A `photo`/image field type for list field schemas.** A strong candidate — many Reference
  list types are literally things worth photographing (a Credentials list entry, a membership
  card, a physical document backing a Research note) — but `ListFieldSchema` is its own
  independent copy of the field-type concept (per CLAUDE.md: deliberately not shared with
  Records' `FieldSchema`, matching the project's no-cross-app-type-coupling convention), so this
  would need its own schema addition, separate from Records' equivalent deferred idea (Phase 3
  §7) even though the underlying capability (camera → store) is identical. Flagged, not built.
- **Any change to list-type definitions or the 12 built-in templates** — only the mobile
  presentation of existing screens is in scope here.
- **Bulk actions** (multi-select delete/move-tab across several items at once) — not a desktop
  feature either; out of scope unless requested independently of the Android build.

---

## 9. File manifest for this phase

**New files:**
```
src/components/MobileListQuickAdd/MobileListQuickAdd.tsx
src/components/MobileListQuickAdd/MobileListQuickAdd.module.css
```

**Modified files:**
```
src/components/ListsSection/ListsSection.tsx   — §3.1's prerequisite refactor (selectedListId
                                                  local state → uiStore.activeListId), then the
                                                  mobile master-detail collapse (§3.2), plus
                                                  single-column card grid and reference table →
                                                  stacked list on mobile
src/components/ListsSection/ListsSection.module.css
src/components/AddListItemModal/               — no functional change; confirm full-screen reuse
                                                  works as the quick-add's "more options" target
```

No store, type, or Supabase changes in this phase (the deferred photo field type, if pursued
later, would be the one that needs them — see §8).

---

## 10. Build order for this phase

1. **§3.1's prerequisite refactor first**: lift `ListsSection`'s selection state from local
   `useState` into `uiStore.activeListId`, verifying desktop behaviour is unchanged before
   building anything mobile-specific on top of it.
2. Build the mobile master-detail collapse for `ListsSection` (§3.2), reusing the exact approach
   already built for `RecordsView` in Phase 3 — if both phases are implemented close together,
   consider factoring the shared collapse logic (list/detail branch + `mobileBackConsumer`
   registration) into one small hook both sections call, rather than duplicating it twice; if
   built far apart in time, duplicating is fine too (it's a small pattern, not worth forcing a
   premature abstraction across unrelated components — see the project's own standing convention
   on this).
3. Single-column watchlist card grid; reference table → stacked-row list, on mobile (§2).
4. Build `MobileListQuickAdd` (§4): bare-title path, then the watchlist-only status chip.
5. Wire tap-to-cycle-status on watchlist cards (§5), with haptic feedback and the
   `stopPropagation()` guard.
6. Swipe-to-delete on list items (§6), reusing the same gesture-handling approach as Tasks/
   Records for consistency.
7. Horizontal-scroll tab bar adaptation (§2).
8. Confirm `AddListModal`'s two-step type picker and field-schema editor remain reachable and
   usable at phone width — no optimisation work, same "doesn't break" check already applied to
   Schedule (Phase 2) and tracker creation (Phase 3).
9. Manual end-to-end test pass: confirm the `lists` entry-point icon (once architecture doc §4
   exists) opens to the list-of-lists view, never a stale detail; confirm the Android back
   button actually navigates from detail to list (the specific failure mode §3.1's refactor
   exists to prevent); confirm quick-add creates correct items with the right default
   tab/status; confirm status-cycle tap updates the same field the full modal's picker would
   without also opening the item; confirm swipe-to-delete requires the confirm tap; confirm
   reference-kind lists show no status badge and no status chip in quick-add.
