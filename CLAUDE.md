# My ToDo — Claude Instructions

Standing rules for all work on this codebase. Read before making any change.

---

## Tech stack

- **React 19** + **Vite 8** + **TypeScript** (strict)
- **Zustand 5** for state (`persist` middleware, localStorage)
- **CSS Modules** — no Tailwind, no inline styles except dynamic values
- **Supabase** for auth + optional cloud sync
- `nanoid` for ID generation; branded ID types for all entities
- Path alias `@/` → `src/`

---

## Architecture

### CollectionKind
`Collection` is the internal type. The UI calls it "Endeavour". `kind` determines what it is:
- `'project'` — completable, has deadline
- `'list'` — ongoing, never completes
- `'tracker'` — records tracker; has `fieldSchema: FieldSchema[]`
- `'routine'` — repeating checklist; has `routineTasks: RoutineTask[]` + `repeatConfig`

### Stores
| Store | Persisted | Purpose |
|-------|-----------|---------|
| `taskStore` | localStorage + Supabase | tasks, collections, tags, purposes |
| `trackerStore` | localStorage + Supabase | tracker entries |
| `routineStore` | localStorage only | daily routine instances (transient) |
| `uiStore` | memory only | all UI state |
| `settingsStore` | localStorage | user preferences |
| `authStore` | memory only | Supabase session |

### Zustand migration
When adding fields to a persisted store's shape, bump `version` and write a cumulative `migrate` function that backfills defaults. Current versions:
- `todo-app-storage` (taskStore): v5
- `todo-tracker` (trackerStore): v1
- `todo-routines` (routineStore): v1

### Supabase sync
Mappers live in `src/services/sync/mappers.ts`. Every new column on a persisted type needs:
1. A mapper update (`xToRow` + `rowToX`)
2. A migration in `supabase/migrations/NNN_description.sql`

---

## Coding conventions

- **No comments** unless the *why* is non-obvious (hidden constraint, workaround, subtle invariant).
- **No abstractions** beyond what the task requires. Three similar lines beats a premature helper.
- **No error handling** for scenarios that can't happen. Trust Zustand and framework guarantees.
- Prefer editing existing files to creating new ones.
- CSS: all styles in `.module.css` files. Class names in camelCase.
- All user-facing terminology lives in `src/config/labels.ts` — rename concepts there, not in logic.

---

## Hotkeys rule

**Whenever a hotkey is added or changed**, make two edits — no more, no less:

1. **`src/config/hotkeys.ts`** — add/update the `HotkeyDef` entry. This is the single source of truth for display data. The settings panel reads from it automatically; no third file to touch.
2. **`src/App.tsx`** — add/update the `keydown` handler logic.

Do **not** hardcode hotkey labels in `SettingsPane.tsx` or anywhere else.

### New-item hotkey behaviour (view-aware)
- Tasks view → `showAddTask()`
- Calendar view → `showAddCalendarItem()`
- Records view (tracker selected) → `showAddEntry(activeTrackerId)`
- Records view (no tracker selected) → `showAddTracker()`

---

## Labels / terminology

All UI strings that might be renamed are in `src/config/labels.ts`. "Collection" is the internal name; the UI shows "Endeavour". Don't hardcode these strings elsewhere.

---

## Things that must be consistent across the app

- **Tags, purposes, collections can always be associated with each other** — when adding a new entity type that can be filtered or grouped, wire it to the existing tag/purpose system.
- **Trackers and routines** both live under the Records view (view 3).
- **Routines** appear in the TaskList under a collapsible "Routines" section (today's due routines only), and also in the RecordsView sidebar.
- **All new modals** should follow the overlay + bottom-sheet (mobile) / centred (≥520px) pattern already used by AddTaskModal, AddTrackerModal, etc.
- **Edit panes** (slide-in from right) follow the EditTrackerPane pattern.
