# Requirements Backlog

Items here are confirmed requirements that are not yet implemented.
Format: brief description + context/motivation.

---

## Notifications & Reminders

### Waiting-task follow-up notifications
When a task has `kind = 'waiting'` and a deadline passes, the user should
receive a notification prompting them to follow up. The notification should
be surfaced in-app (and eventually as a system/push notification).
- Triggered by: deadline expiry on a waiting task
- Expected behaviour: remind once at deadline, then allow snooze/dismiss
- Context: "wait for response from private health insurance" type tasks need
  automatic prompting so nothing slips through

---

## Workflow & Task Dependencies

### Task contingency / sequencing
Some sub-tasks are only actionable after a predecessor is complete
(e.g. "book specialist" requires "get referral" to be done first).
Implement a dependency model: a task can list `blockedBy: TaskId[]`.
UI would show blocked tasks greyed out with a lock icon.

---

## Projects (Collection kind = 'project')

### Milestone tasks (`kind = 'milestone'`)
Tasks that represent key anchor events in a project rather than actionable
deliverables — e.g. "Presentation to board", "Trial begins". These are
distinct from regular task deadlines in that they *happen to* you rather
than being completed by you. See architectural decision note below.

### Project completion flow
When all tasks in a project are done, prompt the user to mark the project
as complete (with a completion date).

---

## Architecture: Calendar Integration

### Decision: unified app with calendar view vs. separate calendar app
The to-do app will be the source of truth for all time-anchored data
(task deadlines, project milestones, waiting-task follow-ups). The calendar
layer reads from this data rather than maintaining its own event store.

**Confirmed near-term:**
- A calendar view inside this app, populated directly from tasks and
  milestones. No separate app needed for this layer.

**Confirmed future:**
- Ingest of external calendar events (Google Calendar, iCal) so that
  meetings, appointments and project events live alongside tasks in one
  place. The `Milestone` type's `source` field is already open for a
  `'calendar-event'` origin to support this without schema changes.

**Open decision:**
- Whether the calendar view becomes a sibling route in this app or a
  standalone app that shares the same data store via the planned
  StorageAdapter layer. Recommend revisiting once the calendar feature
  spec is defined — the StorageAdapter abstraction should keep both paths
  open until then.

### Mini-calendar toggle in the task list view
A setting (in the Settings pane) to display a condensed calendar alongside
the to-do list — the two panels sit side by side. Useful for seeing
upcoming deadlines in context while managing tasks.
- Trigger: toggle switch in Settings → Display section
- Layout: task list narrows; mini-calendar fills remaining horizontal space
- Mini-calendar is read-only (no add from this surface)
- Persisted in settingsStore as `miniCalendarEnabled: boolean`

### Weekly and daily calendar views
Ability to switch between monthly (current), weekly, and daily views in the
calendar. Monthly is the default; weekly and daily show finer time-slot
detail useful for scheduling events.

---

---

## AI Agent Integration

### Notes-dump → tasks
Ability to paste or speak a block of free-form text (e.g. meeting notes,
a brain-dump) and have an AI agent parse it into structured tasks. The agent
should infer titles, priorities, deadlines, and collection assignments where
possible, then present the parsed tasks for review before adding them.

### Voice control
Hands-free task creation and navigation via voice commands. The agent
interprets spoken input and maps it to app actions (add task, set deadline,
mark complete, etc.).

### Custom agent integration
Allow users to connect their own AI agent/workflow endpoint. The agent has
read/write access to the task store and can perform batch operations,
re-prioritisation, and smart scheduling on behalf of the user.

**Architecture note:** all three features share a common "agent interface"
layer — a well-defined API surface over the Zustand stores. Design that
interface before building any individual feature so each agent type can use
the same underlying operations.

---

## Daily Planner View

A dedicated "plan my day" view that sits alongside the task list and calendar.

### Human-driven planning
The user manually selects tasks from the task list and drags them into time
slots for the current day. The view shows a timeline (e.g. 8am–10pm) with
configurable slot sizes (15 min, 30 min, 1 hr). Time-intensity metadata on
tasks (`low | medium | high`) is used to suggest slot durations.

Key behaviours:
- Drag-and-drop from the task list into the timeline
- Overflow warning if the day is over-scheduled
- Carry-forward: tasks not completed roll over to the next day's plan
- The plan is persisted (daily plan store) so the user can return to it
- Tasks with an existing deadline show a visual anchor in the timeline

### Agent-driven planning (future, depends on AI agent integration)
The AI agent takes the current task list, user-specified time budget, and
any calendar events for the day, then proposes an optimised plan. The user
can accept, edit, or regenerate. The agent considers:
- Task priority, time-intensity, deadlines
- Calendar events (blocks of unavailable time)
- User preferences (e.g. deep-work blocks in the morning)

**Architecture note:** the human-driven planner is a prerequisite — the
agent-driven planner is an enhancement on top of the same data model.
Build the planner store (dayPlan: Record<date, DayPlan>) and timeline UI
first; add agent generation later.

---

## Architecture: Note-taking Integration

### Bidirectional link between tasks and notes
Tasks and notes have a natural, tight relationship:

- A task such as "Read paper X" produces notes as its output. Those notes
  should be linkable to the originating task so the work product is
  traceable.
- Conversely, when taking notes it is common to identify follow-up actions.
  The note-taking interface should allow inline task creation that lands
  directly in this task store.

**Implications for this app:**
- Tasks should be able to reference one or more note documents
  (`noteIds: NoteId[]` or a links-style approach via the existing `links`
  field as a stopgap).
- The shared data layer (StorageAdapter) must be accessible to both apps,
  or both must be views within the same app.
- Purposes are a natural cross-cutting concern — a note and a task about
  the same research project should share the same Purpose, reinforcing the
  case for a unified or tightly federated app rather than two isolated tools.

**Open decision:** same unified-vs-federated question as calendar. Recommend
deciding the overall app architecture (single app with multiple views vs.
micro-apps sharing a common store) before building the note-taking surface.

---

## Records — Tracking & Personal Logs

### Overview

**Records** is a top-level section of the app (alongside Tasks and Calendar) for
logging and tracking anything the user wants to measure or remember over time.
It surfaces in the nav sidebar at the same level as the existing sections.

The guiding principle is "opinionated defaults, open-ended extension": a small
set of built-in tracker templates covers the most common use cases out of the
box, while a custom tracker builder allows users to define entirely new schemas
(e.g. scuba dives, wine tasting notes, race results).

---

### Terminology decisions

| Term | Definition |
|------|-----------|
| **Records** | The section name. Chosen over "Tracking" (passive) or "Journal" (diary-specific). |
| **Tracker** | An individual tracking list with its own field schema. E.g. "Books", "Workouts". |
| **Entry** | A single logged item inside a tracker. E.g. one book, one workout session. |

---

### Architecture: Tracker as a third CollectionKind

Trackers extend the existing `Collection` type with `kind = 'tracker'`. This
means:

1. Trackers appear in the Endeavours sidebar (grouped separately from Projects
   and Lists) so tasks can be linked to them.
2. All collection-level fields (name, color, icon) apply to trackers.
3. Entries are a new entity type (`TrackerEntry`) referencing the tracker's
   `CollectionId`.

**Rationale:** Treating trackers as collections avoids duplicating the
collection concept. A "Books" tracker and a "Books" list are the same idea —
one just has rich structured entries instead of tasks.

**Extensibility note:** The `CollectionKind` union is already documented as
extensible. Adding `'tracker'` requires no breaking changes to existing data.

---

### Data model changes

#### 1. Extend `CollectionKind`

```typescript
type CollectionKind = 'project' | 'list' | 'tracker'
```

#### 2. Extend `Collection`

```typescript
interface Collection {
  // ... existing fields unchanged ...

  // Only populated when kind === 'tracker'
  trackerTemplate?: TrackerTemplate   // which built-in template, or 'custom'
  trackerFields?:   FieldSchema[]     // field definitions (custom trackers)
  trackerView?:     TrackerViewMode   // default view for this tracker
}

type TrackerTemplate = 'habit' | 'books' | 'movies' | 'custom'
type TrackerViewMode = 'list' | 'grid' | 'heatmap' | 'chart'
```

#### 3. New: `FieldSchema`

Defines a single column in a custom tracker.

```typescript
type FieldType =
  | 'text'        // free text
  | 'number'      // numeric with optional unit
  | 'date'        // calendar date picker
  | 'duration'    // HH:MM or minutes
  | 'rating'      // 1–5 stars (or configurable max)
  | 'select'      // single choice from options list
  | 'multiselect' // multiple choices
  | 'boolean'     // yes/no checkbox
  | 'url'         // link field

interface FieldSchema {
  id:        string      // stable nanoid — used as key in entry.data
  name:      string      // display label
  type:      FieldType
  required?: boolean
  options?:  string[]    // for select / multiselect
  unit?:     string      // for number fields, e.g. "kg", "m", "kcal"
  max?:      number      // for rating fields (default 5)
}
```

#### 4. New: `TrackerEntry`

```typescript
type TrackerEntryId = string & { readonly _brand: 'TrackerEntryId' }

interface TrackerEntry {
  id:          TrackerEntryId
  trackerId:   CollectionId
  date:        string                     // YYYY-MM-DD (primary sort key)
  data:        Record<string, unknown>    // keyed by FieldSchema.id
  notes:       string | null
  linkedTaskIds?:  TaskId[]              // future: cross-link to tasks
  linkedNoteIds?:  NoteId[]             // future: cross-link to notes
  createdAt:   string
  updatedAt:   string
}
```

`entry.data` is a flexible key-value map. Values are typed by the corresponding
`FieldSchema.type` (enforced in the UI, not at the type level). This design
means adding new field types to an existing tracker is non-breaking — old
entries simply don't have the new key.

#### 5. DB table (Supabase)

```sql
create table tracker_entries (
  id           text    primary key,
  user_id      uuid    not null references auth.users(id) on delete cascade,
  tracker_id   text    not null,   -- references collections.id
  date         text    not null,
  data         jsonb   not null default '{}',
  notes        text,
  created_at   text    not null,
  updated_at   text    not null
);
alter table tracker_entries enable row level security;
create policy "users_own_tracker_entries" on tracker_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

### Built-in tracker templates

Templates are pre-configured `FieldSchema[]` arrays. When a user creates a
tracker with a built-in template, the fields are pre-populated and can be
added to or customised.

#### Habits

The Habit tracker is differentiated by its view: a **heatmap** calendar
showing daily completion, with streak count displayed prominently.

Pre-configured fields:
| Field | Type | Notes |
|-------|------|-------|
| Completed | `boolean` | Primary field |
| Quantity | `number` | Optional (e.g. "10 pages", "30 minutes") |

Computed (not stored): current streak, longest streak, completion rate.

#### Books

Status field enables both "read" log and "want to read" watchlist in one tracker.

Pre-configured fields:
| Field | Type | Notes |
|-------|------|-------|
| Title | `text` | Required |
| Author | `text` | |
| Status | `select` | Options: `want to read`, `reading`, `read` |
| Rating | `rating` | 1–5 stars |
| Date finished | `date` | |
| Genre | `select` | Options: user-editable |

#### Movies & Shows

Pre-configured fields:
| Field | Type | Notes |
|-------|------|-------|
| Title | `text` | Required |
| Type | `select` | Options: `movie`, `series`, `documentary` |
| Platform | `text` | Netflix, etc. |
| Status | `select` | Options: `want to watch`, `watching`, `watched` |
| Rating | `rating` | 1–5 stars |
| Date watched | `date` | |

#### Custom

No pre-configured fields. The user defines their own schema using the field
builder. Example use case: scuba dives with fields for location, duration,
max depth, visibility, buddy.

---

### Watchlist / "want to" lists

The `status` select field on Books and Movies handles both retrospective logs
("read") and forward-looking wishlists ("want to read") in a single tracker.
In the Records view, tabs or a filter control separate the two states.

A future enhancement: a task can optionally reference a tracker entry
(e.g. "Finish reading Book X" links to that book's entry), surfacing the
entry as context in the task pane.

---

### Third-party integrations (future)

- **Strava**: import workouts automatically via OAuth. Each imported activity
  creates a tracker entry in a linked Workout tracker. Field mapping is
  configurable. Requires a dedicated Strava integration pane.
- **Goodreads / OpenLibrary**: book metadata autofill (cover image, author,
  genre) when a title is typed.
- **MyFitnessPal**: nutrition data import.

These are deferred. The data model is designed so that imported entries look
identical to manually created ones — no special fields needed.

---

### UI requirements

#### Records nav item
- Top-level nav item in NavSidebar, same level as Tasks and Calendar.
- Icon: a bookmark or ledger symbol (consistent with the nav style).

#### Tracker list view (Records home)
- Shows all user trackers as cards with name, color, entry count, last updated.
- "New tracker" button → picker to choose template or start custom.
- Trackers grouped by template type (Habits / Books / Movies / Custom).

#### Tracker detail view
- Tabbed or filtered views depending on tracker type:
  - **Habits**: heatmap calendar + streak stats + list of recent entries.
  - **Books/Movies**: tab strip for "All / Want to / In progress / Done".
  - **Custom**: list/grid toggle, sortable by any field.
- Floating "Add entry" button → opens an entry form matching the tracker's
  field schema.
- Click an entry → inline expand or side pane for editing/notes.

#### Entry form
- Dynamically rendered from the tracker's `FieldSchema[]`.
- Date defaults to today.
- Required fields are validated before save.

#### Custom tracker builder
- Step 1: name + color + icon.
- Step 2: field editor — add, reorder, configure fields.
- Field types are selectable from the `FieldType` union.
- Fields can be deleted only if no entries exist (or with a confirmation
  that data for that field will be lost).

---

### Sidebar integration

Trackers appear in the Endeavours sidebar under a "Trackers" group (below
Projects and Lists). Clicking a tracker in the sidebar filters the Tasks
view to show tasks linked to that tracker (future: via `linkedTaskIds` on
entries). This mirrors the behaviour of clicking a Project or List.

---

### Notes integration (future)

When the Notes section is built, `TrackerEntry.linkedNoteIds` enables
attaching notes to entries (e.g. a reading journal entry attached to a
book in the Books tracker). The foreign key is already reserved in the
data model to avoid a breaking migration later.

---

### Phase plan

**Phase 1 — Core (MVP)**
- `kind = 'tracker'` on Collection, `trackerTemplate`, `trackerFields` fields
- `TrackerEntry` entity + store + Supabase table
- Records nav section
- Tracker list view (home)
- Built-in templates: Habits, Books, Movies/Shows, Custom
- Tracker detail: list view + add/edit entry form
- Habit heatmap view + streak calculation
- "Want to" vs "completed" filter tabs on Books/Movies

**Phase 2 — Enrichment**
- Custom field builder (full field type support)
- Chart/stats views (entries over time, completion rate)
- Grid view for non-habit trackers
- Tracker search and sort

**Phase 3 — Cross-linking**
- Link tracker entries to tasks (`linkedTaskIds`)
- Link tracker entries to notes (`linkedNoteIds`)
- Sidebar filter: clicking a tracker shows linked tasks
- Task pane: show linked tracker entry as context

**Phase 4 — Integrations**
- Strava OAuth import
- Book metadata autofill
- Nutrition data import

---
