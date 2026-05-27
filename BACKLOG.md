# Requirements Backlog

Items here are confirmed requirements that are not yet implemented.
Format: brief description + context/motivation.

---

## Notes App — Central knowledge hub with cross-suite linking

### Vision

**Purpose:** A flexible, intelligent notes system that serves as the single source of truth for detailed notes on everything—courses, research, work, ideas—while seamlessly linking to all other apps in the suite (Tasks, Calendar, Portfolio, Records, future apps). The core differentiator is *effortless organization and discoverability*: users can find anything related to a topic without rigid folder hierarchies.

**Problem solved:** Traditional note apps force rigid structures (folder trees) or chaotic tagging (100+ flat tags). Users spend time organizing instead of thinking. Notes must make it easy to capture ideas quickly, tag them, and retrieve everything related to a concept across different areas of knowledge.

---

### Data Model

#### Core entities

**Note**
```typescript
type NoteId = string & { readonly _brand: 'NoteId' };

interface Note {
  id:                       NoteId;
  title:                    string;
  content:                  string;                           // markdown by default
  contentFormat:            'plaintext' | 'markdown' | 'richtext-json'; // extensible
  tagIds:                   TagId[];                          // many-to-many tagging
  
  // Cross-app links (denormalized for fast loading; source of truth is each app's store)
  linkedTaskIds:            TaskId[];
  linkedCalendarEventIds:   CalendarEventId[];
  linkedTrackerEntryIds:    TrackerEntryId[];
  linkedWatchlistItemIds:   WatchlistItemId[];
  linkedNoteIds:            NoteId[];                         // note-to-note references
  
  // Metadata
  createdAt:                string;                           // ISO 8601
  updatedAt:                string;
  lastViewedAt:             string | null;
  archivedAt:               string | null;                    // soft delete
  color:                    string | null;                    // user-chosen highlight color
  pinned:                   boolean;                          // quick access from landing page
  
  // User
  userId:                   string;                           // Supabase auth.user_id
}
```

**Tag** — hierarchical, scoped, typed labels
```typescript
type TagId = string & { readonly _brand: 'TagId' };

interface Tag {
  id:                       TagId;
  name:                     string;
  description:              string | null;
  
  // Hierarchy: enables "Area > Subject > Topic" structure
  // A tag with parentTagId: null is a root-level "area"
  // Tags can nest arbitrarily deep
  parentTagId:              TagId | null;
  
  // Typing: "definition", "pros", "glossary", "reference", etc.
  // Allows differentiation of note kinds *within* an area
  // E.g., "Investment Research > pros" vs "Course Notes > pros" are different tags
  // but both are type "pros"
  tagTypeId:                TagTypeId | null;
  
  // Display
  color:                    string | null;
  icon:                     string | null;                    // emoji or icon name
  order:                    number;                           // for sorting siblings
  
  // Metadata
  createdAt:                string;
  updatedAt:                string;
  userId:                   string;
}
```

**TagType** — metadata for tag categories (extensible by user)
```typescript
type TagTypeId = string & { readonly _brand: 'TagTypeId' };

interface TagType {
  id:                       TagTypeId;
  name:                     string;                           // "definition", "pros", "glossary", "reference", "example", "needs-source", etc.
  description:              string | null;
  
  // Display
  color:                    string | null;
  icon:                     string | null;
  
  // Metadata
  isBuiltIn:                boolean;                          // system-provided (e.g., "definition") vs user-created
  createdAt:                string;
  userId:                   string;
}
```

**Derived type: Area**
```typescript
// An "area" is a root-level tag (parentTagId: null) with optional metadata
interface Area extends Tag {
  // Computed properties (cached in store)
  childTagIds:              TagId[];                          // direct children (subjects, topics)
  noteCount:                number;                           // total notes tagged with this area (including recursive children)
  lastModifiedAt:           string;
  isPinned:                 boolean;                          // on landing page
}
```

---

### Architecture & Integration

#### Supabase schema

```sql
-- Notes table
create table notes (
  id text primary key,
  title text not null,
  content text not null,
  content_format text default 'markdown' check (content_format in ('plaintext', 'markdown', 'richtext-json')),
  tag_ids jsonb default '[]',                    -- TagId[]
  linked_task_ids jsonb default '[]',            -- TaskId[]
  linked_calendar_event_ids jsonb default '[]',  -- CalendarEventId[]
  linked_tracker_entry_ids jsonb default '[]',   -- TrackerEntryId[]
  linked_watchlist_item_ids jsonb default '[]',  -- WatchlistItemId[]
  linked_note_ids jsonb default '[]',            -- NoteId[]
  created_at timestamp default now(),
  updated_at timestamp default now(),
  last_viewed_at timestamp,
  archived_at timestamp,
  color text,
  pinned boolean default false,
  user_id uuid not null references auth.users(id) on delete cascade,
  unique(id, user_id)
);

-- Tags table (hierarchical)
create table tags (
  id text primary key,
  name text not null,
  description text,
  parent_tag_id text references tags(id) on delete restrict,  -- prevent orphaning
  tag_type_id text references tag_types(id) on delete set null,
  color text,
  icon text,
  "order" int default 0,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unique(id, user_id),
  unique(name, parent_tag_id, user_id)  -- tag name unique within a parent
);

-- Tag types (extensible)
create table tag_types (
  id text primary key,
  name text not null,
  description text,
  color text,
  icon text,
  is_built_in boolean default false,
  created_at timestamp default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unique(id, user_id)
);

-- RLS policies: all tables filtered by user_id
```

#### Zustand store (`noteStore.ts`)

```typescript
interface NotesStoreState {
  // Entities
  notes:               Record<NoteId, Note>;
  tags:                Record<TagId, Tag>;
  tagTypes:            Record<TagTypeId, TagType>;
  
  // UI state
  selectedTagIds:      TagId[];           // current filter (can be multiple)
  searchQuery:         string;            // full-text search
  viewMode:            'list' | 'grid' | 'canvas';  // extensible
  sortBy:              'updated' | 'created' | 'title' | 'custom';
  expandedTagIds:      Set<TagId>;        // which tag tree branches are open
  
  // Actions
  createNote:          (title: string, content: string, tagIds?: TagId[]) => NoteId;
  updateNote:          (id: NoteId, updates: Partial<Note>) => void;
  deleteNote:          (id: NoteId) => void;
  archiveNote:         (id: NoteId) => void;
  
  createTag:           (name: string, parentTagId?: TagId, tagTypeId?: TagTypeId) => TagId;
  updateTag:           (id: TagId, updates: Partial<Tag>) => void;
  deleteTag:           (id: TagId, cascade?: boolean) => void;  // cascade = reassign notes to parent?
  reorderTags:         (tagIds: TagId[]) => void;
  
  createTagType:       (name: string, color?: string, icon?: string) => TagTypeId;
  updateTagType:       (id: TagTypeId, updates: Partial<TagType>) => void;
  
  linkNoteToTask:      (noteId: NoteId, taskId: TaskId) => void;
  unlinkNoteFromTask:  (noteId: NoteId, taskId: TaskId) => void;
  // ... similar for calendar, tracker, portfolio
  
  toggleTag:           (tagId: TagId) => void;  // add/remove from selectedTagIds
  setViewMode:         (mode: string) => void;
  toggleTagExpanded:   (tagId: TagId) => void;
}
```

**Persistence:**
- Persist to localStorage with version + migration support (like taskStore)
- Sync with Supabase when online
- Mappers in `services/sync/mappers.ts`: `noteToRow`, `rowToNote`, `tagToRow`, `rowToTag`

#### Cross-app integration

**One-way links from other apps:**
- `Task` gains `linkedNoteIds: NoteId[]`
- `CalendarEvent` gains `linkedNoteIds: NoteId[]`
- `TrackerEntry` gains `linkedNoteIds: NoteId[]`
- `WatchlistItem` gains `linkedNoteIds: NoteId[]`

**Bidirectional sync via shared event bus:**
```typescript
// When a note is linked to a task (from either side)
eventBus.emit('note:linked-to-task', { noteId, taskId });

// Organizer app listens:
eventBus.on('note:linked-to-task', ({ noteId, taskId }) => {
  useTaskStore.getState().updateTask(taskId, { linkedNoteIds: [..., noteId] });
});

// Notes app listens to reciprocal:
eventBus.on('task:linked-to-note', ({ taskId, noteId }) => {
  noteStore.linkNoteToTask(noteId, taskId);  // ensures both sides in sync
});
```

#### Package structure

```
packages/notes/
  src/
    store/
      noteStore.ts           -- all notes/tags/tagTypes state + persistence
    types/
      notes.ts               -- all TypeScript interfaces
    components/
      NotesLanding/          -- home page: recent, favorites, quick add
      NotesView/             -- main view: tag sidebar + note list/grid + editor
      NoteEditor/            -- WYSIWYG/markdown editor
      TagTree/               -- hierarchical tag browser
      QuickAddModal/         -- Ctrl+Space modal
    services/
      noteSync.ts            -- sync mappers (noteToRow, rowToNote, etc.)
    integrations/
      notesEventBus.ts       -- cross-app event handlers
```

---

### UI / UX

#### Landing page
- **Left sidebar:** Favorite/pinned areas (root tags), quick navigation
- **Main area:** 
  - Grid of recent areas (showing last-modified date, note count, icon)
  - "Quick add" button (or Ctrl+Space)
  - Search bar
  - Recent notes list below
- **Top bar:** Settings, user menu (no "Create" button — use Ctrl+Space instead)

#### Main notes view (after clicking an area)
- **Left sidebar:** Tag hierarchy (collapsible tree, showing all subjects/topics under the area)
- **Center:** Note list or grid (filtered by selected tags)
  - Click a tag = add to filter (cumulative AND logic)
  - Cmd+click a tag = replace filter
- **Note row shows:** Title, tags, last-modified, preview snippet
- **Right panel:** Note editor (slides out when note selected)

#### Tag management
- Context menu on tags: edit, move (change parent), delete
- Drag-and-drop to reorder siblings
- "Create subtag" / "Create sibling" inline options
- Tag type assignment via dropdown (built-in or custom types)

#### Quick add modal (Ctrl+Space)
- Text input for quick note content
- Tag picker (searchable, multi-select)
- "Save & close" / "Save & keep open" / "Save & edit" buttons
- Optional: pre-populate with clipboard content

#### Inline tagging (Phase 2)
- Ctrl+Space within note editor = open tag menu
- Select text, Ctrl+Space, tag it (stores selection as linked reference? or just tags the note?)
- Highlight tagged passages inline

---

### Features — MVP vs future

**Phase 1: MVP**
- CRUD notes, tags, tag types
- Hierarchical tag organization
- Landing page with areas list
- Main view: tag-filtered note list
- Simple markdown editor (no WYSIWYG yet)
- Ctrl+Space quick add
- Cross-app note linking (denormalized foreign keys)
- Sync with Supabase

**Phase 2: Polish**
- WYSIWYG editor (Tiptap or similar)
- Inline tagging (highlight text → tag it)
- Tag drag-and-drop reordering
- View modes: grid, canvas (visual/spatial layout)
- Search with filters (tag, date range, content type)

**Phase 3: Intelligence**
- AI-powered note testing (generate Q&A from notes by tag/type)
- Glossary auto-extraction (collect all "definition" type notes)
- Auto-linking (suggest related notes based on content/tags)
- Spaced repetition for definitions/flashcards

**Phase 4: Advanced**
- Custom note templates (by tag type or area)
- Nested/folding sections within a note
- Collaborative notes (shared editing, comments)
- Export formats (PDF, Markdown, HTML)
- Mobile app (already PWA-capable via Vercel)

---

### Design consistency across suite

**Shared design system (backlog item: "Suite design system")**
- All apps use same CSS variables (colors, spacing, typography, radii)
- Modal/pane patterns: bottom-sheet on mobile, centered card on desktop
- Tag system: same color/icon vocabulary across Notes, Portfolio, Tasks
- Hotkey system: Space/Ctrl+Space for "add item", S for settings, Esc to close
- Sidebar patterns: left nav for categories, right panel for details

**Implementation:**
- Move shared styles to `src/styles/design-system.css` (root CSS variables)
- Each app imports from shared layer
- Components follow same naming/pattern conventions (e.g., `.modal`, `.pane`, `.sidebar`)
- Icons/emojis sourced from a shared icon set or Noto emoji standard

---

### Future integrations

- **AI automated testing:** Given notes tagged with "definition" or "glossary", generate an exam, track score by area, prompt weak spots
- **Spaced repetition:** Integration with Records trackers (create a "study" tracker from glossary terms)
- **Note templates:** By tag type or area (e.g., "Meeting notes" template with date, attendees, action items)
- **Voice notes:** Capture audio, transcribe, store alongside markdown
- **Obsidian sync:** One-way import of existing notes; export to maintain offline access
- **Citation/bibliography:** Auto-generate from "source" links; export BibTeX for papers

---

## Portfolio

### Chart view — user-adjustable chart height

In the chart view, the chart occupies all horizontal space to the left of the tickers/info sidebar. The vertical split between the tickers list and the info pane on the right is currently fixed at 75%/25%. Both values should be user-adjustable:

- A drag handle between the chart and the right sidebar to resize the sidebar width
- A drag handle between the tickers list and the info pane to change the 75/25 split
- Preferences persist in `settingsStore` (e.g. `chartSidebarWidth: number`, `chartTickersPct: number`)

For now the layout is fixed; add the drag-handle resize interaction when the chart view UI matures.

---

### Named Watchlists

#### Problem with the current approach

The app currently has a single flat list of tracked items. Tags provide ad-hoc grouping but are insufficient as a watchlist substitute:

- Tags have no ordering — you cannot rank items within a group by conviction, review date, or custom priority.
- Tags carry no list-level metadata — a watchlist might have a description, a benchmark, or a target allocation; a tag has only a name and colour.
- Tags are cross-cutting — the same tag can mean different things in different contexts. A user may want *different notes per list* for the same item (e.g. "High conviction — buy on dip" in one watchlist, "Hedge position" in another). Tags cannot hold per-membership data.
- The mental model doesn't match — users expect named watchlists the way a brokerage presents them, not a filter bar.

Tags remain useful *within* watchlists (sector labels, risk tier, theme) but should not replace the list concept.

#### Data model

```typescript
type WatchlistId = string & { readonly _brand: 'WatchlistId' };

interface Watchlist {
  id:          WatchlistId;
  name:        string;
  description: string | null;
  color:       string | null;
  order:       number;           // user-defined display order in sidebar
  createdAt:   string;
  updatedAt:   string;
}

interface WatchlistMembership {
  watchlistId: WatchlistId;
  itemId:      WatchlistItemId;
  order:       number;           // item's position within this specific watchlist
  notes:       string | null;   // per-membership notes (distinct from item.notes)
  addedAt:     string;
}
```

`WatchlistItem` gains `watchlistIds: WatchlistId[]` as a derived/convenience field but the membership table is the source of truth. An item can belong to zero or more watchlists; items not in any watchlist are still visible from an "All" view.

#### UI

- **Sidebar** — named watchlists replace (or sit alongside) the current flat list. A default "All" entry shows every item regardless of membership.
- **Watchlist switcher** — clicking a watchlist in the sidebar scopes the main view to that list's items, in that list's order.
- **Item reordering** — drag-and-drop within a watchlist to change `WatchlistMembership.order`.
- **Add to watchlist** — when adding or editing an item, a multi-select picks which watchlists it belongs to (same UX as tags/purposes today).
- **Watchlist management** — create, rename, reorder, delete watchlists. Deleting a watchlist removes memberships but not the underlying items.
- **Per-membership notes** — accessible from the item's edit pane when viewed within a specific watchlist context.

#### Chart view integration

The right-sidebar tickers list in chart view should respect the active watchlist scope. When "All" is selected, all items appear; when a named watchlist is active, only its members appear (already filtered by the watchlist before any tag/exchange/cap-tier filters are applied).

#### Migration / backwards compatibility

Existing items have no watchlist memberships. On first launch after migration, all items are implicitly in "All" — no data is lost. Users can then create watchlists and assign items manually, or a one-time prompt can offer to convert existing tags into watchlists.

#### What stays as tags

Tags remain the right tool for cross-cutting labels: sector, theme, risk tier, asset class overrides. The filter panel in chart view (and the toolbar in table view) continues to use tags as sub-filters *within* whatever watchlist is active.

---

### Watchlist — manual groups (static named sections)

Users can create named, ordered sections within a watchlist — e.g. "Quantum computing", "ASX small caps", "AI infrastructure". These are distinct from tags: a group is a curated position within a specific watchlist, not a cross-cutting label. An item belongs to at most one group within a given watchlist (unlike tags, which are M:M).

#### Data model

```typescript
type WatchlistGroupId = string & { readonly _brand: 'WatchlistGroupId' };

interface WatchlistGroup {
  id:          WatchlistGroupId;
  watchlistId: WatchlistId;      // which watchlist this group belongs to
  name:        string;
  order:       number;           // group order within the watchlist
}
```

`WatchlistMembership` gains `groupId: WatchlistGroupId | null`. Items with `groupId: null` appear in an "Ungrouped" section at the bottom.

#### UI

- In the tickers list (chart view sidebar) and full table view, a **"Groups"** option will be added to the existing "Group by" panel once this feature is built — the panel already exists for dynamic groupings (tags, size, exchange, sector).
- A **"Manage groups"** action in the watchlist options menu lets users create, rename, reorder, and delete groups.
- **Drag-and-drop** moves items between groups.
- Groups are collapsible; collapsed state is persisted in `settingsStore` (keyed by `groupId`).

#### Why distinct from tags

Tags are cross-cutting labels shared across all views and watchlists (sector, theme, risk tier). Manual groups are watchlist-specific, manually ordered containers. The same item can be in the "Mega-cap AI" group in one watchlist and the "Long-term holds" group in another.

---

### Watchlist — customisable row density

A setting in the Settings pane to control watchlist row size (e.g. Compact / Normal / Comfortable). Currently fixed at a compact density (~15% smaller than the original default). The setting should adjust row padding and font size globally for the watchlist table.

---

## Notifications & Reminders

### Records — Habit / tracker reminders

Users can create one or more **reminder schedules** attached to the Records section. Each reminder is independent and configurable:

- **Scope**: which trackers (or routines) are included in this reminder
- **Frequency**: daily, specific days of the week, weekly, etc.
- **Time**: what time of day the notification fires
- **Calendar opt-in**: optional toggle to surface the reminder as a calendar event so it appears in the Calendar view. The user can turn this on or off at any time; toggling it off removes the calendar event without affecting the reminder schedule itself.

Multiple reminders can coexist (e.g. a daily morning reminder for habits, a weekly Sunday reminder for a workout log). Each reminder's params are fully editable after creation.

**Key distinctions from calendar reminders:**
- These live in the Records section, not the Calendar section
- They are scoped to tracker/routine logging, not general events
- The calendar appearance is opt-in and derived, not primary

**Architecture notes to consider:**
- Reminder schedules are a new entity (not a `CalendarReminder`) but can produce `CalendarReminder` entries when the calendar opt-in is enabled
- Notification delivery will depend on whatever push/system notification mechanism is implemented for waiting-task reminders — share that infrastructure
- The `repeatConfig` type already exists on routines and calendar items; reminder schedules can reuse it for frequency definition

---

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
- Whether the Calendar section stays inside the Organizer app or eventually splits into its own app package. The suite's single-deployment monorepo model keeps both paths open — if split, it becomes a new route in the same build. Recommend revisiting once the feature spec matures.

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

**Decision (confirmed):** Notes will be a separate package in the suite, following the same separate-package / shared-platform-layer architecture as the Portfolio app (see below). The shared Purposes entity and cross-app event bus are the integration points — a note and a task about the same research project share the same Purpose; inline task creation in notes posts to the Organizer's task store via the shared layer's event bus.

---

## Records — Routines UX improvements

### Tasks section: tasks / routines / both toggle

Currently routines appear at the top of the task list (collapsible panel). Eventually the user should be able to toggle between three modes:
- **Tasks only** — routines section hidden entirely
- **Routines only** — only today's due routines shown
- **Both** — tasks first, routines below (current behaviour, but moved below tasks rather than above)

The toggle should live in the toolbar area of the Tasks section (alongside the existing Overview / Focused toggle). The active mode is persisted in `settingsStore`.

### Records section: routine success calendar / heatmap

When a routine is selected in the Records section, a calendar-style heatmap view shows how well the user has stuck to the routine over time. Design intent:

- Each day is a cell; cells are coloured by outcome:
  - Completed → green (intensity could reflect partial vs full completion)
  - Missed a day or two → yellow / amber
  - Three or more consecutive misses → orange → red (darkening with streak)
  - No instance for the day (app not opened / routine not due) → neutral grey
- A month-at-a-time grid is the default; navigation arrows to step back through months
- The heatmap sits below (or alongside) the history table already implemented in RoutineDetail

**Architecture note:** all the data needed is already in `routineStore.instances` keyed by `${routineId}_${date}`. The heatmap is a pure read-only rendering component; no new store changes needed.

### Streak functionality for habit trackers

For trackers using the Habit template (`trackerTemplate === 'habit'`), compute and display:
- **Current streak** — consecutive days where a Habit entry exists and the primary boolean field is `true`
- **Longest streak** — all-time record
- **Completion rate** — entries marked complete / total days since first entry

These are computed on the fly from `trackerStore.entries` (no stored state). Display them as stat chips in the TrackerDetail header, similar to fitness app habit trackers.

The streak breaks if: no entry for a day, or entry exists but boolean field is `false`. Days where the tracker has no `repeatConfig` day constraint (i.e. it runs every day) are always counted; days outside the schedule are ignored.

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

## Portfolio — Market Data API Integration

### Overview

The Portfolio watchlist currently stores all data manually. The next major phase is connecting live market data so the Price column (and future columns) populate automatically.

### Architecture

- API calls must go through a **server-side proxy** (Supabase Edge Function or Vercel serverless function) to keep API keys off the client.
- Live price/fundamental data is **never stored in the database** — it is fetched on demand and held in memory (React Query or a lightweight cache). Only user-entered data (ticker, name, market cap tier, investment purpose, tags, date added, notes) persists.
- The column config system (already implemented) is designed to accept any new field returned by the API — adding a new column requires: (1) extending `WatchlistColumnId` in `src/types/portfolio.ts`, (2) adding a default column entry in `portfolioStore.ts`, (3) adding a `renderCell` case in `WatchlistView.tsx`. No schema migration needed.

### Planned data sources

| Asset class | Provider candidates |
|-------------|---------------------|
| Equities / ETFs | Polygon.io, Alpha Vantage, Financial Modeling Prep |
| Crypto | CoinGecko, CoinMarketCap |
| FX / Commodities | Same equity providers or dedicated APIs |

**Decision (confirmed):** Use **Financial Modeling Prep (FMP)** free tier initially. Batch quote endpoint (`/quote/AAPL,MSFT,...`) means all watchlist tickers = 1 API call per refresh. Free tier (250 req/day) is sufficient for 60-second intervals with active-window-only refresh. Upgrade to a paid plan if refresh frequency or ticker count grows significantly.

Price refresh pauses automatically when the portfolio section is not visible or the window loses focus (Page Visibility API + window blur/focus events). Default refresh interval: 60 seconds.

### Data fields planned (from API)

First phase — price data:
- `price` — current price
- `dailyChange` — absolute change today
- `dailyChangePct` — % change today

Second phase — fundamentals:
- `marketCapValue` — actual market cap (to validate / replace user-entered tier)
- `peRatio`, `eps`, `dividendYield`
- `week52High`, `week52Low`
- `avgVolume`

Third phase — extended data:
- Analyst consensus / price targets
- News headlines (feeds into the future News view)
- Earnings dates (cross-app event bus → create calendar event in Organizer)

### Phase plan

| Phase | Scope |
|-------|-------|
| **Current** | Manual entry only; price column shows "—" |
| **Phase 1** | Server-side proxy + on-demand price fetch for visible tickers |
| **Phase 2** | Background refresh on a configurable timer; daily change column |
| **Phase 3** | Full fundamentals; column chooser UI |
| **Phase 4** | Earnings/options dates → cross-app event bus → Organizer calendar |

---

## Architecture: Portfolio App (suite app 2)

### Decision: separate package, single deployment

The portfolio tracker is a purpose-built investment tool — it is **not** embedded in the Organizer app. It is a separate package in the monorepo with hard code boundaries; the suite deploys as a **single Vite build, single Vercel deployment, and single Tauri binary** so users install one app for the whole suite. Route-based navigation handles switching between apps (`/organizer`, `/portfolio`, etc.). Code-splitting ensures portfolio code loads only when needed.

**Rationale for keeping portfolio a separate package:**
- The domain is fundamentally different (investment decisions vs. task management). Merging them into one package would make both harder to evolve independently.
- The portfolio app will eventually need specialised dependencies: real-time price feeds, charting libraries, broker API connectors. These have no place in the Organizer package.

**Shared platform layer** (a package imported by all apps):
- **Supabase auth** — single session; same Supabase project, separate domain tables.
- **Purposes** — cross-app tagging entity; a Purpose can be associated with tasks, tracker entries, and portfolio watchlist items alike.
- **Cross-app event bus** — a typed in-process event emitter in the shared package. No network hop needed since all apps run in the same browser context. Portfolio emits typed intents; Organizer (and other apps) subscribe and handle them using their existing store actions. No Supabase table required.
- **Design system** — shared UI primitives (to be extracted when the second app is built).
- **Notes** (future) — same pattern; Notes app will also emit and consume via the shared layer.

### Portfolio tracker — planned feature scope

**Watchlists**
- Organise and layer positions/candidates by user-defined categories (sector, thesis, conviction level, etc.).
- Each item on a watchlist can have notes (reasons for inclusion, thesis summary) — these will link to the Notes app when it exists.

**Portfolio tracking**
- Aggregate holdings across multiple investing platforms (manual entry initially; broker API import is a future phase).
- Track cost basis, current value, unrealised P&L at position and portfolio level.

**Relevant news** (future phase)
- Highlight news affecting companies in the watchlist or portfolio, plus macro/economy-level events.

### Integration points with the Organizer (cross-app via event bus)

| Trigger in Portfolio app | Result in Organizer |
|--------------------------|---------------------|
| User flags a research item | Creates a task: "Read up on developments at company X" |
| Options expiry date on open position | Creates a calendar event on that date |
| Earnings release date for portfolio holding | Creates a calendar event on that date |
| User attaches a note to a watchlist item | Note (Notes app) linked via shared Purposes / cross-app layer |

### What NOT to build in the Organizer package

Do not add any portfolio domain logic, watchlist state, or price data to the Organizer. The only Organizer-side work triggered by portfolio integration is handling inbound cross-app intents (create task, create calendar event) — which use existing store actions and require no new domain concepts here.

---

## Proposed Ideas

Items here are not confirmed requirements — they are sensible ideas raised during design discussions, held here for future consideration.

---

### Portfolio — Preferred Market Setting

When a user types a ticker that exists in multiple markets (e.g. VMM on NASDAQ and LSE), a disambiguation dropdown is shown. A **preferred market** setting would let users declare their home exchange (e.g. LSE / XLON) so that:
- If only one result matches the preferred market, auto-fill without showing the dropdown.
- If multiple results exist, the preferred market result floats to the top of the disambiguation list.

**Where it would live:** Portfolio settings pane (to be built), stored in `settingsStore` as `portfolioPreferredMic: string | null` (MIC = Market Identifier Code, e.g. `'XLON'`, `'XNAS'`, `'XNYS'`).

**Why deferred:** Only valuable once a meaningful number of global tickers are in the watchlist and disambiguation is a recurring friction point.

---
