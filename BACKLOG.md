# Requirements Backlog

Items here are confirmed requirements that are not yet implemented.
Format: brief description + context/motivation.

---

## Notes/Portfolio/Fitness Supabase sync — Notes and Portfolio built (2026-09-19); Fitness still pending

Surfaced 2026-09-19 when the user opened a freshly-built Tauri desktop app and found Notes/Portfolio empty (Tasks/Calendar/Trackers/Lists were fine) — traced to `localStorage` being origin-scoped, which only exposed the deeper issue: those two stores (and Fitness) were never wired into `syncService.ts` at all.

**Notes: built — see CLAUDE.md "Notes Supabase sync."** `notes`/`note_tags`/`structured_tag_entries` tables (migration `020_notes_sync.sql`, applied to live — see "Live migration status" in CLAUDE.md), wired into the standard sync pipeline (soft-delete tombstones, `mergeRecords()`, the `enqueue()` mutex). `noteStore` bumped to v11.

**Portfolio: built — see CLAUDE.md "Portfolio Supabase sync."** `watchlist_items`/`portfolio_tags`/`investment_purposes` tables (migration `021_portfolio_sync.sql`, applied to live — see "Live migration status" in CLAUDE.md), same pipeline. No `portfolioStore` version bump needed. `WatchlistColumn[]` (table display prefs) deliberately stays local-only — cosmetic, not portfolio data.

**Still not built — Fitness. Paused here deliberately (2026-09-19)** — Notes and Portfolio are built and verified (`tsc`/`eslint`/`npm run build` all clean); the user chose to stop and test those two live (run migrations `019`–`021` against the live Supabase project, exercise vault setup/Note encryption/Portfolio sync) before picking Fitness back up. Next session should just pick up Fitness sync directly, following the exact same pattern as Notes/Portfolio above:
- `Activity` + `ActivityType` (custom types only, same "built-ins never sync" rule `list_types` already established) — CLAUDE.md's own Fitness section already reserved the shape for this (`source`/`sourceId`/`sourceRaw` fields exist specifically so Strava-synced activities upsert cleanly once this lands).
- Confirmed to ship **plaintext** (no encryption) when built — see the encryption entry below for why Notes was the only one that got an encrypt-toggle in this pass.

---

## Client-side encryption for sensitive content — Notes and Lists built (2026-09-20); other apps not yet

**Built for Notes, comprehensively (2026-09-20) — see CLAUDE.md "Client-side encryption for Notes — comprehensive"** (title, content, abstract, extra tabs incl. names, tag attribute values, and the structured-tag entries derived from the note; one AES-GCM envelope, plaintext only in a memory cache). Originally built for `Note.content` alone on 2026-09-19 (see CLAUDE.md "Client-side encryption for Note content" for the vault itself) (`src/services/vault.ts`, `user_vault` table via `019_user_vault.sql` — applied to live — see "Live migration status" in CLAUDE.md, `AccountPane.tsx`'s vault setup/unlock UI, `NoteEditor.tsx`'s lock/encrypt wiring). Per-item opt-in (not full-schema) — see that CLAUDE.md entry for the full design reasoning (why per-item over full-schema, why the wrapping secret can't be the Supabase login password, the mandatory-recovery-code and "trust this device" decisions) and CLAUDE.md's "Notes Supabase sync" entry for how it interacts with that.

**The underlying vault/key-management core is generic and app-agnostic by design** (adding a second encryptable field later — a Task note, a Calendar event detail, a Portfolio/Fitness field — is a small, additive change once a store's sync exists at all), but the **field-level UI rollout is still narrow**: only `Note.content` (Main tab; `NoteTab.content` for additional tabs is not covered) got an actual toggle in this pass. Lists/Tasks/Calendar's existing Add/Edit UI is untouched.

**Lists built too (2026-09-20)** — per-list encryption of name/description/type/field schema/tabs and every item's title/data/notes/links; see CLAUDE.md "Client-side encryption for Lists" (including the recorded answer on whether it's strong enough for passwords/banking details: the cipher is, the practical strength depends on the passphrase). Clicking any 🔒 (notes and lists) now asks for the passphrase to permanently decrypt.

**Still open, no immediate trigger yet**:
- **Passphrase strength** — the setup form accepts 8 characters, which is weak if a cloud dump ever leaked and were attacked offline. Options: a strength meter and/or a longer minimum (or a "generate a passphrase" helper), higher PBKDF2 iterations or Argon2, and auto-relock after inactivity. Worth doing before promoting encrypted Lists as suitable for passwords/banking details.
- Lists: a per-tab or per-item encryption choice was deliberately not built (per-list only); list `kind`/`color`/`icon`, item `status`/`tabId`/`order` and item/tab counts stay plaintext.
- Lists' locked state shows a placeholder for the whole list; there's no "locked but browse titles" mode (titles are encrypted too).
- Whether/when to extend the encrypt-toggle UI to Task notes, Calendar event details, or a Portfolio/Fitness field, once those apps have sync at all.
- An OS-backed secure store for "trust this device" on Tauri (`tauri-plugin-stronghold` or the OS keychain) / Android (Keystore) — currently IndexedDB everywhere, which is convenience-only (no access boundary stronger than the browser/OS login already provides).
- **Things an encrypted note still leaks, deliberately or not yet**: notebook/tag *names* and which notebook a note is in (needed for the tree/filters); `templateId` (reveals the note type); and — the one likely to surprise — **anything created from a note in another app**: a Task made via "Create ▸ Task" keeps the selected text as its plaintext title in `tasks`. Options if that matters: warn when creating a task from an encrypted note, or offer per-task encryption once the vault is extended to Tasks.
- Encrypted notes can't be searched by *body* text while locked (by design); full-text search (still not built) would need to be client-side over the unlocked cache.
- Per-tab encryption granularity (currently a note is all-or-nothing), and hiding — rather than just disabling — the title/abstract inputs while locked.

---

## uiStore persistence — navigation/session memory built; broader scope still deferred

**Built**: `uiStore` is now persisted to localStorage (`todo-ui-session`, per-device only — no cross-device sync) via zustand's `persist` middleware with a `partialize`, scoped deliberately to **navigation/session memory**: `activeView`, back/forward history (`sectionHistory`/`sectionForwardHistory`), `activeCollectionIdByView`, `activePurposeIds`, `notesLastEditingNoteId`/`notesLastActiveTabId`, `selectedNoteTagId`, `listsLastActiveListId`/`listsLastActiveTabId`, `activeTrackerId`/`activeRoutineId`, `calendarViewMode`. See CLAUDE.md's uiStore entry for the full field list and reasoning.

**Deliberately still excluded** (matches the original "which fields" question below, now answered for this pass): every modal/pane/dropdown open-state (`openModal`, `endeavourPickerOpen`, `manageOpen`, `settingsOpen`, etc.) and one-off "currently editing X" pointers stay memory-only, so a reload never reopens a modal pointing at a possibly-deleted item. `sortField`/`sortDir` and `expandedNoteTagIds` were also left out of this pass (not asked for) — revisit if a future request wants those to survive a reload too.

**Cross-device sync remains a separate, undecided future feature** — this pass only answered "per-device only," matching `settingsStore`'s existing shape. A synced version would need a Supabase table + sync mapper, same as `taskStore`, and is a materially different feature, not an extension of this one.

---

## Endeavour filter — carry selection across sections/apps

Currently `activeCollectionIdByView` (`uiStore`) deliberately remembers a **separate** focused Endeavour per section — Tasks, Calendar, Records, and Notes each keep their own independent value, so switching sections and back restores whatever that section had (see "Endeavour focus is per-section" in CLAUDE.md's Implemented features). The user wants the opposite in practice: pick an Endeavour in Tasks, switch to Calendar, and have Calendar already be focused on that same Endeavour.

**This directly reverses a previous deliberate design decision** — implementing it means deciding what replaces per-section memory, not just adding a new field. Options to weigh when this is designed:
- A single shared `activeCollectionId` (drop the per-view map entirely) — simplest, but loses the "each section remembers its own last filter" behavior some users may rely on.
- "Sticky until explicitly overridden": switching sections carries the current Endeavour forward, but picking a different one in the new section only changes that section (needs a way to distinguish "inherited" from "explicitly set" per section).
- Keep per-section memory but seed a newly-visited section's *first-ever* value from whatever was last active elsewhere, then let it diverge independently after that.

**Architecture note (answering a question raised alongside this request):** Tasks/Calendar/Records/Lists are Sections of the same Organizer app, not separate Apps (see CLAUDE.md's terminology hierarchy) — they already share the one `uiStore` in this single-package codebase (there is no `packages/` split yet; the "shared platform layer" in CLAUDE.md's suite architecture is the target end-state, not the current reality). So carrying the filter across Tasks/Calendar/Records is just a `uiStore` change, not new cross-app plumbing. It only becomes a genuine cross-*app* concern if the same behavior should also reach Notes/Portfolio/Fitness (separate Apps) — at that point, once those are actually split into their own packages, shared cross-cutting UI state like this is exactly what belongs in the shared platform layer rather than inside any one app's package, the same way `Purpose` is meant to.

---

## Automatic local backup rotation (background, no cloud dependency)

Confirmed requirement (2026-09-15), motivated by a real incident: months of desktop-only work went un-synced because the user wasn't signed in, and it turned out the existing sync-on-login logic only auto-uploads local data when the Supabase account is completely empty (see `initSync` in `src/services/sync/syncService.ts`) — otherwise it only pulls cloud data down, silently never pushing local-only work up. A local, cloud-independent safety net would have caught this regardless of whether sync itself was working. The existing Export/Restore backup (`AccountPane`/`IntegrationsPane`, `PERSISTED_STORAGE_KEYS` in `src/config/backup.ts`) already produces a complete point-in-time JSON snapshot of every persisted store — this feature automates taking that same snapshot in the background on a schedule, keeps a small rotating history of them stored locally (never touched except by the rotation's own cleanup), and needs no account/cloud connection at all.

### Triggers — time OR change-volume, whichever comes first

Two independent conditions, either one fires a snapshot:
- **Time-based**: a snapshot is due once more than `settingsStore.autoBackupIntervalHours` (default TBD, e.g. 24h) has elapsed since the last automatic snapshot AND at least one store has changed since then (no point snapshotting unchanged data).
- **Change-volume-based**: a running "change score" accumulates as the user edits data, resetting to 0 each time a snapshot fires; once it crosses `settingsStore.autoBackupChangeThreshold` (default TBD), a snapshot fires immediately regardless of the time-based timer.

**Feasibility: straightforward, not a hard feature.** Every persisted store already funnels every mutation through Zustand's `persist` middleware, and `syncService.ts`'s `syncDiff` already has working before/after diff logic to model this on (compares `prev`/`next` record objects key-by-key). A new module (e.g. `src/services/autoBackup.ts`) would `subscribe()` to each of the 8 persisted stores (`taskStore`, `calendarStore`, `trackerStore`, `routineStore`, `noteStore`, `listStore`, `fitnessStore`, `scheduleStore`) the same way `syncService.ts` does, and on each change add to the running score via a small per-store weight:
- Record-shaped stores (tasks, collections, tags, purposes, events, reminders, tracker entries, list items, activities, schedule blocks): +1 point per item created/updated/deleted — the same shallow `Object.keys` diff `syncDiff` already does.
- Free-text content (`Note.content`, a stringified Tiptap JSON): weight by **character-length delta** of the serialized string rather than a real text diff (cheap, avoids parsing rich-text JSON) — maps directly to the user's own "200 characters changed" example.

One unified change score (not per-entity-type thresholds) is simpler to reason about and to expose as a single setting, with per-store weights as internal constants — worth confirming as v1 scope when this is built, since exposing 8 separate thresholds in Settings is more configurability than anyone likely wants.

### What a snapshot contains

Reuses `PERSISTED_STORAGE_KEYS` exactly — the same list `AccountPane`'s manual Export already uses — so this is one code path away from already-working logic, not a new backup format. Each snapshot is the same `{ exportedAt, version, ...oneKeyPerStore }` JSON shape as a manual export.

### Where snapshots are stored — the one genuinely new piece, needs a platform-aware backend

"Saved locally, never touched except by cleanup" rules out `localStorage` itself (already used *by* the stores being backed up, and far too small a quota — typically 5–10MB shared across everything — to also hold several full-app snapshots). Three targets depending on platform, each already-precedented elsewhere in this codebase:
- **Desktop (Tauri)**: real filesystem via `@tauri-apps/plugin-fs` (not yet a dependency — same pattern as `plugin-opener`/`plugin-notification`, added for exactly this kind of native-capability gap). Snapshots as individual timestamped files under the app's data dir (`appDataDir()` + `/backups/*.json`).
- **Web/PWA and Android (Capacitor webview)**: no real arbitrary filesystem without permission friction (File System Access API is Chromium-only and needs a user gesture per session — not viable for a silent background process). **IndexedDB** is the practical cross-platform answer — much larger quota than localStorage, works identically in the Vercel PWA and the Android webview. A genuinely new storage layer for this codebase (nothing uses IndexedDB today) but a standard one.
- Implies a small storage-adapter seam (`saveSnapshot`/`listSnapshots`/`deleteSnapshot`) with a Tauri-fs implementation and an IndexedDB implementation, selected the same way `usePlatform` already detects environment elsewhere. Not user-facing — an internal implementation detail, same spirit as the `StorageAdapter` swappability CLAUDE.md's suite architecture already calls for.

### Retention / rotation — tiered "grandfather" thinning

Confirmed requirement: keep a small, customizable number of snapshots (default 4) spaced at increasing intervals into the past rather than evenly — the user's own numbers: ~yesterday, ~1 week, ~2 weeks, ~1 month. This is a well-known pattern (the same idea behind Time Machine's hourly→daily→weekly thinning, or tools like `rsnapshot`) and is **algorithmically simple, not a hard problem**:

1. Define N target ages in days for N desired slots. For the default N=4: `[1, 7, 14, 30]` (the user's own numbers). For a different N, interpolate (e.g. geometrically between 1 day and a configurable max age) rather than hardcoding — needs a decision at build time on the exact interpolation formula, but any reasonable one satisfies "spaced increasingly further apart."
2. After every new snapshot is taken, run a pure `selectSnapshotsToKeep(allSnapshots: {id, createdAt}[], targetAgesDays: number[]): Set<id>`: for each target age (closest-first, so two targets can't fight over the same snapshot), assign the not-yet-claimed snapshot whose actual age is nearest that target.
3. Always force-keep the single most recent snapshot regardless of bucket math (naturally the best fit for the smallest target age anyway, but pinning it explicitly avoids an edge case where the newest snapshot is younger than every target and could otherwise lose a tie-break).
4. Delete every snapshot not selected in steps 2–3.

A pure, easily-unit-testable function — worth a standalone round-trip test before wiring it up, matching the "verify the algorithm in isolation first" approach already used successfully for `expandScheduleBlock`/timezone conversion elsewhere in this codebase, since off-by-one bucket assignment is the realistic failure mode, not the concept itself.

### Settings (user-facing, per the request)

New `settingsStore` fields (needs a version bump + cumulative migration, per the standing Zustand migration rule):
- `autoBackupEnabled: boolean` (default TBD — likely `true`, since this is a safety feature, not an opt-in power feature)
- `autoBackupIntervalHours: number` (default TBD)
- `autoBackupChangeThreshold: number` (default TBD)
- `autoBackupMaxCount: number` (default 4)
- `autoBackupTargetAgesDays: number[]` (default `[1, 7, 14, 30]`; needs a UI decision — auto-regenerate this array when the count changes, vs. let advanced users edit it directly)

UI location: likely a new subsection in `SettingsPane`, or folded into `AccountPane` alongside the existing manual Export/Restore — not decided yet.

### Explicitly not decided yet

- Exact default values for interval/threshold/weights (placeholders above — needs real-world tuning, or just a reasonable starting guess).
- Whether automatic snapshots are ever surfaced for manual restore-from-list in the UI ("Restore from an automatic backup" picker), or stay a silent insurance policy only reached by digging into app storage.
- Per-store weighting constants (the "+1 per item, +1 per N characters" scheme above is a reasonable starting guess, not a confirmed spec).
- This is a safety net for data loss, not a fix for sync itself silently failing to push (the actual root cause of the incident that motivated this feature) — worth keeping those as two separate backlog concerns rather than conflating them.

---

## Lists section — cross-suite linking (Phase 2+)

Associate List items with entities in other apps:
- Link a List item to a Note (e.g., "my notes on Inception" → the Lists entry for Inception)
- Link a List item to a Task (e.g., "watch this weekend" creates a task from a list item)
- Link a List item to a Calendar event (e.g., "cinema trip" event linked to the movie list item)
- Cross-app query: from Notes app, create/attach a list related to a Chronicle (e.g., "environmental research reading list")
- Implementation: use `cross_app_links` table pattern (same as Notes cross-app linking); event bus for in-process linking

Other Lists Phase 2+ items:
- Supabase sync for lists and list items
- Drag-to-reorder items within a list
- Bulk import items (CSV)
- Sharing / export list as JSON or markdown
- List templates: user-defined templates saved from customised lists
- Custom list types (user-defined, not just the built-in 7)
- Per-list view settings (card grid vs compact list)
- Item archiving (soft-delete, with restore)
- Full-text search within list items

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
- WYSIWYG editor (Tiptap or similar) — **done (Tiptap v3)**
- Inline tagging (highlight text → tag it) — **done (NoteTagMark + FloatingToolbar)**
- **Cross-app built-in tag types** — **superseded, see CLAUDE.md's "Cross-app linking".** Rather than a special built-in tag that fires an event-bus create on application, `FloatingToolbar` gained a "Create ▸" menu (Ctrl+Q, or the "+ Create" button) offering **Task** (fully wired), **Calendar item**, **List item**, and **Tracker entry** (currently stubs — selecting one shows a "coming soon" message rather than a dead click). The link itself is a Tiptap mark (`ArtifactLinkMark`) directly on the selected text, not an event-bus message and not the `cross_app_links` table (see CLAUDE.md for why). The reverse direction (an entity showing which note(s) it was linked from) is a generic `CrossAppRef[]` field — `Task.crossAppRefs` today, the same shape ready for the other entity types below. Cleanup on deletion (either side) is centralized in `src/services/crossAppLinkCleanup.ts` so links can never go dead. Remaining work, in the user's stated priority order (Tasks done; Calendar next; Lists after; Trackers maybe):
  - ✅ **DONE 2026-09-20 — Calendar item as a create-menu target** (see CLAUDE.md "Notes: Create ▸ Calendar item from a selection": event-vs-reminder is guessed and the modal's toggle overrides it, the linked-notes chip is the "Linked items" picker on both panes, cleanup covers both). Original spec, kept for reference: wire the "Calendar item" stub: infer whether the selection reads more like an event (has a time range / location cues) or a reminder (just a date), or offer both as sub-choices; hand off to `AddCalendarItemModal` pre-filled the same way Task hands off to `AddTaskModal` (extend `pendingArtifactLink`'s `targetType` union usage — the field already accepts any `CrossAppRefType`, only the create-menu's `enabled: false` flag and the modal hand-off need building). Add `event`/`reminder` to wherever `CrossAppRef`'s `type` is rendered (a "Linked notes"-style chip on `CalendarEventPane`/`CalendarReminderPane`) and to `crossAppLinkCleanup.ts`'s target-aware functions (currently only handle `'task'`).
  - **List item as a create-menu target** — same shape again: hand off to `AddListItemModal` pre-filled from the selection (which list to add to is the open question — probably needs a list picker in the pre-fill step, unlike Task/Calendar which have no equivalent "which container" ambiguity beyond Endeavour), a "Linked notes" chip on the list item's detail UI, and `crossAppLinkCleanup.ts` support for `'listItem'`.
  - **Tracker entry as a create-menu target** — same shape; the extra wrinkle is a Tracker's `fieldSchema` is user-defined per-tracker, so pre-fill can realistically only ever cover the couple of universal-ish fields (date, notes) rather than anything schema-specific.
  - **Reuse the existing link-inference for all three of the above, not just Task**: `FloatingToolbar.tsx`'s `extractHyperlinkUrls()` (real hyperlinks, via the selection's `link` marks) and `textToTask.ts`'s plain-URL regex are both already generic over "a selection's text/marks," not Task-specific — any target with a links-like field (List items already have one; Calendar events/reminders currently don't) should merge both sources the same way Task's prefill does, rather than only picking up plain-text URLs.
  - **The inheritance rules already built for Task must hold for all three of the above, not just Task**: (a) **Endeavour** — the created item's `collectionId` (or equivalent) defaults to the source note's own `collectionId`, falling back to the Notes section's currently-focused Endeavour; (b) **Tags** — deliberately *not* built even for Task in this pass, since Notes' `NoteTag` and the shared `Tag` entity are separate ID spaces with no mapping yet (see CLAUDE.md) — whatever tag-inheritance design gets picked (skip / match-by-name-and-create / something else) should apply uniformly once decided, not be re-litigated per target type.
  - **"Follow up on later" → Calendar Reminder** specifically (the other half of the original tag-based ask) — covered by the Calendar item item above once built; no separate mechanism needed.
  - **Manual Task ↔ Note linking UI — v1 done (`CrossAppRefPicker`), fuller spec still open.** A Task can now be manually linked to an existing note (or unlinked) from both `AddTaskModal` (while creating) and `TaskPane` (after the fact) via a shared, reusable `src/components/CrossAppRefPicker/CrossAppRefPicker.tsx` — chips for current links + a "+ Link" popover with a searchable, recent-first note list. See CLAUDE.md "Cross-app linking" → "Manual linking, both directions" for the full write-up, including two real bugs the popover-in-a-scrollable-form pattern surfaced (an Escape-listener conflict, and a scroll-clamping click-miss bug) — worth reading before building the next popover anywhere near a scrollable modal in this codebase. Deliberately scoped smaller than the original ask here, per the confirmed "nice UI element" request rather than the fuller spec below:
    - **Not yet built — tab-level granularity**: a note with multiple tabs (see `Note.tabs`) should let the user pick a specific tab, not just the note as a whole, since a tab can hold an entirely different topic. Heading-level or individual-word-level granularity was raised as a stretch idea but explicitly flagged as likely too tedious for a manual picker to be worth it — worth reconsidering only if a real use case shows up, not built speculatively.
    - **Not yet built — richer filtering beyond recent-first + title search**: filter by **Endeavour** (`Note.collectionId`, same `CollectionPicker` component used elsewhere); filter by **tag/notebook** (`Note.tagIds`); search over note *content*, not just titles (once/if full-text search — already a separate open Notes backlog item — exists).
    - **Confirmed asymmetry, not a gap**: linking from the Task side never creates a forward `ArtifactLinkMark` on the note (there's no text selection to anchor it to) — only the reverse `CrossAppRef` is recorded. A note-initiated link still gets both. This was a real decision point flagged before building, not an oversight.
    - **When Calendar/List/Tracker create-menu targets ship (below), extend `CrossAppRefPicker` itself** (its type row already shows all four, three as stubs) rather than building separate pickers per entity — it's already a generic `{ value; onChange; onNavigate? }` component, not Task-specific in its own implementation.
  - **The user's stated AI stretch goal** — background AI that proposes/creates these links automatically instead of requiring an explicit selection + Ctrl+Q/click. Still fully open; the regex/`Intl`-based inference in `textToTask.ts` is the deliberate non-AI first step this was scoped against.
- **Image tagging** — images pasted into the editor are not yet taggable (NoteTag marks apply to text/inline content; images are block nodes). To tag an image: either (a) wrap it in a custom node that accepts a tag attribute, or (b) apply a tag to the surrounding paragraph. Decision deferred. When implemented, clicking an image and pressing Ctrl+Space should open the tag picker and apply the tag to the image node.
- Tag drag-and-drop reordering
- View modes: grid, canvas (visual/spatial layout)
- Search with filters (tag, date range, content type)
- **Notes view layouts** — the current default layout is: left tree panel (expandable notebook hierarchy) + right notes list + NoteEditorPane slide-in. Future layouts to add: (a) full-width "immersive" that navigates into a notebook on click (breadcrumb-style, like the old ChronicleView), (b) grid/card layout for landing, (c) canvas/spatial layout. Layout switcher UI TBD. Only the default layout exists today.
- **Multiple chronicles** — a Chronicle is the root-level container for a set of notebooks. Currently only one exists (implicit). Future: users can create, rename, delete, and switch between multiple chronicles (e.g. "Work", "Personal", "University"). Each Chronicle is a top-level grouping; notes belong to exactly one chronicle but can be tagged across notebooks within it. Supabase: add a `chronicles` table; `note_tags.chronicle_id` FK. UI: chronicle switcher in the Notes section header or left nav.

**Phase 3: Intelligence**
- AI-powered note testing (generate Q&A from notes by tag/type)
- Glossary auto-extraction (collect all "definition" type notes) — **the Acronym structured tag type below is a first, narrower realization of this idea** (a browsable, per-instance glossary), not the general "any tag type" version this line originally meant
- Auto-linking (suggest related notes based on content/tags)
- Spaced repetition for definitions/flashcards

**Phase 4: Advanced**
- Auto-selected note templates by tag type or area (manual template picker in AddNoteModal already implemented — see CLAUDE.md "Note templates"); user-defined custom templates (beyond the built-in six)
- Nested/folding sections within a note
- Collaborative notes (shared editing, comments)
- Export formats (PDF, Markdown, HTML)
- Mobile app (already PWA-capable via Vercel)

---

### Structured tag entries — Acronym built; a generic framework for future tag types

**Built**: a "structured tag type" is a built-in annotation tag (see `NoteEditor/builtinTags.ts`'s `typeKey`) that, instead of just marking a passage of text, also creates a separate, browsable `StructuredTagEntry` record with its own fields — Acronym is the first one. Applying the Acronym tag (Ctrl+8, the `#Tag` picker, or the ✎ hover-edit on an existing one) opens a small popover: term + "Stands for" compact by default (Enter accepts as-is), with a "More options…" expansion showing Explanation, Endeavour, and (when editing) the entry's location/created/updated. See CLAUDE.md's "Structured tag entries" for the full write-up (files, data model, mark attribute, cleanup-on-delete).

**This was built as a genuine framework, not an Acronym-specific feature**, per the explicit request to keep future tag types in mind — adding a second type (Definition, Question, etc.) is:
1. One more entry in `STRUCTURED_TAG_TYPES` (`src/config/structuredTagTypes.ts`) — `key` (matching a `BuiltinTag.typeKey`), `label`, its own `fields` schema, and an optional `infer()` function.
2. One more `BuiltinTag` in `builtinTags.ts` with that `typeKey`.

Nothing else needs touching — the create popover, the hover-edit affordance, the mark's `structuredEntryId` attribute, the store actions, and the Notes `TagView` browsable-list rendering are all written generically against the registry, not against Acronym by name.

**Inference — pattern/regex-based now, LLM is the stated stretch goal.** `src/utils/acronymInference.ts` implements the non-AI heuristics requested: parenthetical patterns in either order ("X (ACRONYM)" / "ACRONYM (X)"), colon/dash patterns ("ACRONYM: X", "ACRONYM - X"), and an initials-match check (an all-caps token at the very start or end of the highlighted phrase whose letters exactly match the initials of the remaining words — treated as a *confident* match per the user's own stated rule, not just a fallback heuristic). Consistent with the rest of this app's non-AI inference (`textToTask.ts`). **Not built**: an LLM-backed fallback for cases the patterns miss (e.g. an acronym used with no expansion anywhere nearby in the note, or general-knowledge inference from just the acronym text) — flagged explicitly as the next step if the pattern-based version proves insufficient, requiring a new server-side API integration (in the vein of the Strava edge functions) rather than a client-side call, plus a real per-call cost.

**Deliberately deferred / not built in this pass:**
- **Cross-note deduplication.** Each application of the Acronym tag creates its own independent `StructuredTagEntry`, even if the exact same acronym text already has an entry elsewhere. Tagging "ASX" in three different notes today produces three separate entries, each with its own fields and note context — there's no "canonical ASX" merging, matching, or reuse-existing-entry prompt. This is a real design fork (a global glossary of unique terms vs. a per-occurrence log), not an oversight; revisit if users want a single ASX entry instead of one per tagging.
- **Editing directly from the Notes `TagView` browsable list.** Clicking a structured entry there navigates to its source note (same as every other tag-view row) rather than opening the edit popover inline — the ✎ hover-edit only exists on the note's own marked text today. A future pass could add an edit affordance directly in `TagView` if browsing-then-navigating proves too many clicks.
- **Tab-level note context.** `StructuredTagEntry.noteId` doesn't record which tab (see `Note.tabs`) the acronym was tagged in, only the note — the breadcrumb/location shown in the popover is the note's notebook path, not a tab name. Same granularity this app already accepted for the Task↔Note `CrossAppRefPicker` (see "Cross-app built-in tag types" above).
- **Deleting an entry whose note isn't currently open** strips the `StructuredTagEntry` but can't reach into that other note's stored content to unset the mark (no live editor instance to dispatch a transaction against) — the mark is left in place, pointing at a now-deleted entry, until that note is next opened and re-saved. A future pass could walk every note's raw JSON content directly (like `stripArtifactLinksFromContent` already does for `ArtifactLinkMark`) instead of requiring a live editor.
- **A dedicated "Manage" surface for structured entries** (browse/search/bulk-edit across all notes at once, independent of the tag-view grouping) — today's browsing is entirely through `TagView`, scoped by clicking the Acronym tag specifically.

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
- **Note templates:** Manual picker implemented (Blank, Meeting Minutes, Daily Journal, Book/Article Notes, Project Brief, Cornell Notes); still open — auto-suggesting a template by tag type or area
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

### Tentative events — built (Events only); a few related ideas not pursued

**Built**: `CalendarEvent.status: 'confirmed' | 'tentative'` — see CLAUDE.md "Tentative events" for the full write-up (data model, rendering, layer filter). Scoped to Events only, per the confirmed decision — Reminders and Schedule blocks don't have this field.

**Considered but not built, worth revisiting only if a real need shows up:**
- **ICS import doesn't read the source file's own `STATUS:TENTATIVE`** — `icsParser.ts`/`CalendarImportReviewModal` import every event as `status: 'confirmed'` regardless of what the source calendar had. Wiring this up would mean parsing `STATUS` in `icsParser.ts` and mapping it onto the new field — small, but not done since it wasn't asked for.
- **A "is this still happening?" follow-up notification for a tentative event whose date has arrived or passed** — the same shape as the separate "Waiting-task follow-up notifications" item above, but for tentative events instead of `kind: 'waiting'` tasks. Not built; flagged here since the two ideas are conceptually the same pattern (something left in an unresolved state past its due point) and could plausibly share a notification mechanism if both get built.
- **Reminders/Schedule blocks gaining their own tentative concept later** — deliberately not built now since neither has an obvious "not confirmed yet" meaning today (see CLAUDE.md), but if that changes, the `EventStatus` type was kept as its own named alias specifically so extending or renaming it stays a small change.

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

### External calendar sync — Google / Microsoft / other (viability analysis, 2026-09-16)

Asked: how viable is syncing in Google Calendar, Microsoft/Outlook, or other external
calendars, and how would it be architected? Short answer: **viable, and this codebase
already has a working template for exactly this shape of integration** — the Strava
integration (see "Strava integration — built" in CLAUDE.md) is architecturally almost
identical to what a Google/Microsoft calendar sync would need. The honest cost estimate
is "about as much work as Strava was, plus recurrence-rule translation, plus — only if
two-way sync is wanted — webhook subscriptions." None of it is built yet; this is
analysis only, per the request.

**Feasibility.** Both Google Calendar API and Microsoft Graph (Outlook/Microsoft 365)
are mature, well-documented REST APIs with OAuth2 Authorization Code flows, and both
support reading events, writing events, and near-real-time push notifications of
changes. CalDAV is a vendor-neutral third option (iCloud and most self-hosted calendar
servers speak it) but is a lower-level, more awkward protocol than either vendor's own
REST API — worth supporting eventually for "other," but Google/Microsoft's native APIs
should come first since they cover the large majority of real users.

**Architecture — directly reusing the Strava pattern already in this repo:**
- OAuth2 per provider: public client id inlined via `VITE_GOOGLE_CLIENT_ID` /
  `VITE_MICROSOFT_CLIENT_ID`; the client secret stays server-only in Vercel env vars
  (never `VITE_`-prefixed), same reasoning as `STRAVA_CLIENT_SECRET`.
- Token storage: a new Supabase table per provider (`calendar_google_connection`,
  `calendar_microsoft_connection`), same shape as `fitness_strava_connection` —
  `user_id` (PK), `access_token`, `refresh_token`, `expires_at`, `scope`, RLS on
  `user_id`, never read client-side directly.
- The same "redirect-identity problem" Strava solved applies identically: the OAuth
  callback is a full browser navigation with no way to attach a Supabase auth header,
  so the same fix (pass the Supabase access token through the OAuth `state` param,
  verify server-side in the callback) carries over unchanged.
- Edge functions mirroring `api/strava-oauth-callback.ts` / `strava-status.ts` /
  `strava-sync.ts`: `api/google-calendar-oauth-callback.ts` / `-status.ts` / `-sync.ts`,
  same three-endpoint shape, same "secrets never reach the client" boundary.

**Where it's genuinely harder than Strava, not just "more of the same":**
- **Read-only ingest vs. two-way sync is the real fork.** Strava is read-only by nature
  (activities are logged externally, pulled in). A calendar integration could stay
  read-only too (pull Google/Outlook events into the calendar view as a new
  non-editable layer, "open in Google Calendar" instead of an edit pane) — this is the
  cheap, low-risk option and should be Phase 1. Full two-way sync (app-created events
  pushed out, edits reconciled both directions) is a much bigger undertaking: it needs
  conflict resolution (same class of problem `mergeRecords()`/soft-delete tombstones
  solve for cross-device sync in this app, but now against a third party's own
  optimistic-concurrency model instead of Supabase), and near-real-time updates need
  push subscriptions (Google Calendar "watch" channels, Microsoft Graph
  subscriptions) — both expire and need periodic renewal, which is genuinely new
  machinery this app doesn't have anywhere yet (Strava is manual "Sync now" only, no
  webhook).
- **`CalendarEvent` needs the same extensibility fields `Activity` already has for
  exactly this reason.** `Activity.source`/`sourceId`/`sourceRaw` (added ahead of the
  Strava sync actually being built) is precisely the shape a synced `CalendarEvent`
  would need too — `source: 'default' | 'google' | 'microsoft'`, `sourceId` (the
  provider's event id, for upsert-by-source so re-syncing never duplicates), and
  `sourceRaw` (the full provider payload, so surfacing more fields later isn't a
  re-sync). None of this exists on `CalendarEvent` today; adding it is a small, safe,
  additive migration (same category as `009_task_scheduled.sql`), best done right
  before this feature actually starts, not speculatively now.
- **Recurrence model mismatch.** Google/Microsoft both use full RFC 5545 `RRULE`
  recurrence, which is considerably more expressive than this app's `RepeatConfig`
  (`freq`/`interval`/`endKind`/`count`/`until`/`daysOfWeek` — deliberately scoped down,
  see the Schedule feature's own note on cribbing a subset of RFC 5545 for the same
  reason). A read-only Phase 1 can sidestep this by having the provider expand
  recurring events into concrete instances server-side (both APIs support this) rather
  than importing the rule itself. Two-way sync can't avoid it — translating between the
  two recurrence models losslessly in both directions is real, non-trivial work.
- **Free/busy-only vs. full event detail** is a product decision, not just a technical
  one — a privacy-friendlier "just show blocked time" overlay is easy with either API's
  free/busy endpoint and avoids pulling full titles/notes/attendees at all.

**Recommended incremental path**, mirroring how Strava itself was scoped:
1. ~~Phase 1 — Google Calendar, read-only, manual sync.~~ **Built — see CLAUDE.md
   "External calendar sync."** Ended up slightly different from this original sketch in
   two ways, both confirmed with the user before building: synced events are **fully
   editable real `CalendarEvent` rows** (this app becomes the source of truth once one is
   imported), not a read-only overlay layer — and sync runs **automatically while the app
   is open** (on load + every 15 minutes), not only on a manual "Sync now" click, though
   the manual button still exists as a fallback/reassurance. `CalendarEvent.source`/
   `sourceId` became four fields (`source`/`sourceConnectionId`/`sourceCalendarId`/
   `sourceEventId`) rather than two, specifically to support multiple connections of the
   same provider (two Google accounts), a real requirement that wasn't anticipated in this
   original analysis.
2. **Phase 2 — Microsoft/Outlook via Graph API**, same shape as Phase 1. Not started.
3. **Phase 2.5 — a real server-side cron for "syncs even when the app is fully closed."**
   Deliberately not built alongside Phase 1 — it needs a Supabase **service-role**
   credential, a category of secret this app has never needed anywhere else (every
   existing edge function, Strava included, authenticates as the signed-in user via RLS).
   Worth it only if the 15-minutes-while-open cadence proves too laggy in practice.
4. **Phase 3 (much bigger, only if Phase 1/2 usage justifies it) — two-way sync**:
   push subscriptions + renewal, conflict resolution (this app *not* being the source of
   truth anymore, unlike Phase 1's model), RRULE translation (Phase 1 sidesteps this by
   asking Google to expand recurring events server-side instead).
5. **Not built, no phase assigned yet**: CalDAV support for "other" providers (self-hosted
   calendar servers, iCloud); a "mark as attended" / attendance concept (this is sync
   provenance, not Schedule commitment mode — the two are unrelated); per-connection
   configurable sync window (currently a fixed 1-month-back/6-months-forward constant).

---

---

## Desktop (Tauri) API access — built for Tauri (2026-09-19); Android equivalent still open

~~Desktop (Tauri) and Android builds can't reach `/api/*`~~ — **the Tauri half is now built, see CLAUDE.md's "Desktop (Tauri) API access" entry.** `src/utils/apiFetch.ts` routes every `/api/*` call through `@tauri-apps/plugin-http`'s native fetch (bypassing CORS entirely) against the production Vercel URL when running under Tauri; `src-tauri/capabilities/default.json`'s `http:default` scope was widened to allow it. Verified with a real `npm run tauri build` release installer.

**Still open — Android/Capacitor.** `capacitor.config.ts` has the identical "static files, no backend" shape (`webDir: 'dist'`, no `server.url`), so the same relative-`/api/*`-call problem applies there too — not investigated or fixed yet. Would need the Capacitor equivalent of `@tauri-apps/plugin-http` (likely `@capacitor/http`'s native fetch override, or a manually-registered CORS allowlist since Android's WebView CORS behavior differs from Tauri's) plus extending `apiFetch()`'s platform branch. Revisit when Android Fitness/Strava/Calendar-sync work is picked up.

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

### Tasks section: surfacing routines again (deliberately, not by accident)

Routines used to appear in a collapsible panel pinned above the task list (today's due routines only). That was unintended — removed from `TaskList.tsx` — and routines now live only in the Records section. Several candidate designs for bringing routines back into the Tasks section on purpose, presented to the user for a decision (not yet chosen):

- **Tab system**: Tasks and Routines as two tabs within the Tasks section, sharing the header/toolbar area; switching tabs swaps the list content below. Keeps both fully separate lists (no interleaving), cheap to build on top of the existing section-switching pattern already used at the app level.
- **Three-way toggle** (original proposal): Tasks only / Routines only / Both, living in the toolbar next to the existing Overview/Focused toggle; "Both" shows tasks first, routines in their own section below. Mode persisted in `settingsStore`.
- **Inline interleaving**: routines rendered as a distinct-but-adjacent row style within the same scroll (e.g. a "Today" cluster combining due routines + due-today tasks), rather than a separate section — closer to how a daily planner would present them.
- **Routines as a filter, not a section**: add "Routine" as a filterable kind alongside existing Endeavour/Purpose/Tag filters, so users who want routines visible opt in via the filter bar rather than a dedicated toggle.

Whichever direction is chosen should be logged here as a confirmed requirement before implementation.

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

- **Strava**: superseded by the dedicated **Fitness App** spec (see "Fitness App — Physical Exercise Tracking" below) — Strava import now lands as `Activity` records in that separate app, not as Records tracker entries. The two are meant to be cross-linked (`cross_app_links`) rather than merged, so a workout can show up in both a Records habit tracker and the Fitness app without duplicating data. Kept here only as a pointer so this doesn't contradict the newer spec.
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
- Strava OAuth import — moved to the **Fitness App** spec (separate app, not a Records tracker; see below)
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

## Fitness App — Physical Exercise Tracking

**Status: Phase 1 built and extended** — manual entry, a customisable activity-type registry (8 built-in types, user-editable name/icon/color/custom fields, delete-guarded for built-ins), and add-on-app architecture (code-split + gated) are all live. See CLAUDE.md "Fitness App" for the full implementation writeup — this section stays as the spec/history record, CLAUDE.md is authoritative for current behaviour. **Strava import (the "Strava integration architecture" section below) is not built** — blocked on registering a Strava API application, a manual/external prerequisite; see the setup guide at the end of this section. Raised as a new suite app, analogous to Portfolio and Notes — lives in the "extras" nav group below the `<hr>` divider, not inside the Organizer, and is the first app built against the add-on tier (see "Add-on app architecture" below). Name "Fitness" shipped as-is (not just a placeholder anymore, but still just one line in `src/config/labels.ts` to rename).

### Vision

A place to track physical activity (runs, hikes, and beyond), either logged manually or imported automatically from Strava. Started deliberately narrow — two activity types (Run, Hike), three visible fields (distance, moving time, average speed) — then extended once real usage showed the narrowness needed an escape hatch: activity types are now a user-customisable registry (8 built-ins, add/edit/delete custom types, per-type custom fields), not a closed union. Everything Strava provides beyond the three visible stats (elevation, heart rate, splits, GPS route, kudos...) is still captured and stored from day one so surfacing it later is a UI change, not a re-sync.

### Terminology

Fits the existing Suite → App → Section → View → Tool → Entity hierarchy (see main CLAUDE.md):
- **App**: Fitness
- **Entity**: `Activity` — one logged workout (a run, a hike). Deliberately named to match Strava's own vocabulary, minimizing translation friction in the sync code.

### Data model (Phase 1)

**As built:** not an actual separate npm package (the suite isn't a literal monorepo yet — that part of the architecture doc is aspirational; Notes/Lists/Portfolio aren't separate packages either). Followed the real established pattern instead: own type file (`src/types/fitness.ts`, not re-exported through `src/types/index.ts` — same as Lists/Portfolio), own store (`src/store/fitnessStore.ts`, localStorage via `persist`, no Supabase table yet — same "start local" choice already made for Notes/Lists), own branded `ActivityId`. Nothing here required a change to `taskStore`, `trackerStore`, or any Organizer type. Supabase tables are Phase 2, arriving alongside the Strava sync work below (which needs one for OAuth tokens regardless).

```typescript
type ActivityId = string & { readonly _brand: 'ActivityId' };
type ActivityTypeId = string & { readonly _brand: 'ActivityTypeId' };

// Extensible — new sources (Garmin, Apple Health, Google Fit, CSV import...) just add
// a union member and a new sync function; the Activity shape itself doesn't change.
type ActivitySource = 'manual' | 'strava';

// User-customisable registry, not a closed union — built (see "as extended" below).
// Built-ins use fixed ids ('run', 'hike', ...) so Strava's sport_type maps directly;
// custom types get a random id.
interface ActivityType {
  id: ActivityTypeId; name: string; icon: string; color: string | null;
  tracksDistance: boolean;             // Distance field shown/hidden per type (fixed a
                                        // real bug — Yoga/Strength don't have a distance)
  fieldSchema: ActivityFieldSchema[];  // Fitness-local field schema, same shape family
                                        // as Records' FieldSchema but not shared with it
  isBuiltIn: boolean; archivedAt: string | null; createdAt: string; updatedAt: string;
}

interface Activity {
  id:                ActivityId;
  type:              ActivityTypeId;          // references ActivityType above
  title:             string;                  // defaults to the Strava activity name, editable
  startedAt:         string;                  // ISO 8601 timestamp
  timezone:          string | null;

  // Canonical units are SI (meters, seconds, m/s) regardless of display preference —
  // conversion to km/mi or min/km etc. happens at render time only.
  distanceMeters:    number | null;
  movingTimeSeconds: number | null;
  elapsedTimeSeconds: number | null;           // stored now, not shown in UI until Phase 2
  averageSpeedMps:   number | null;

  // Keyed by ActivityFieldSchema.id — now genuinely populated by the selected
  // ActivityType's custom fields (as extended, below), plus still the extensibility
  // valve for Phase 2+ Strava-only fields (elevation gain, heart rate, splits...).
  data:              Record<string, unknown>;

  notes:             string | null;
  purposeIds:        PurposeId[];              // cross-app Purpose tagging (shared platform layer)

  // Import tracking
  source:            ActivitySource;
  sourceId:          string | null;            // e.g. Strava activity id; null for manual entries
  sourceRaw:         Record<string, unknown> | null; // full raw payload from the source, verbatim —
                                                 // lets Phase 2 surface new fields without re-syncing

  archivedAt:        string | null;             // same sunset pattern as Collection/Purpose, not delete
  createdAt:         string;
  updatedAt:         string;
  userId:            string;
}
```

`(source, sourceId)` needs a uniqueness constraint (app-side and DB-side) so re-running a sync never creates duplicates — re-syncing an already-imported activity should update it in place, not insert a second row.

### Cross-linking to Records (futureproofing, not built in Phase 1)

The explicit ask: manual Fitness entries and Records trackers should be linkable later, without redesigning either. This uses the **same `cross_app_links` mechanism already specified for the Notes app** — a normalized table (`source_type`, `source_id`, `target_type`, `target_id`, `link_type`), not denormalized ID arrays on either entity. Concretely: a Records "Gym" tracker entry and a Fitness `Activity` could be linked via a `cross_app_links` row with no schema change to either app — the only requirement is that `Activity` has a stable typed ID today, which it does. Nothing else needs to be built now; this section exists so Phase 1 doesn't accidentally close off the option (e.g. by embedding activity data as a blob inside a tracker entry, which the old Records backlog spec used to suggest before this app existed — corrected above).

### UI scope — Phase 1 only

- [x] New top-level nav item, "extras" group (below the divider, with Portfolio) — hotkey `7` / `Ctrl+7`.
- [x] Activity list (all activities, newest first) showing: type icon, title, date, **distance, moving time, average speed** — nothing else, even though more is stored.
- [x] Manual "Add activity" form: type, title, date, distance, moving time. Built as auto-computed-only (not separately editable) — average speed shows as a live "Average speed: X km/h" preview derived from distance/time, no override field. Simpler than the original "editable" wording here; revisit if a real need for manual override shows up (e.g. importing a GPS-corrected speed that doesn't match distance/time exactly).
- [x] Editing/deleting an activity works the same regardless of `source` — a synced activity can be edited or deleted locally like a manual one (edits are **not** pushed back to Strava; this is one-way import only). Not yet exercised with real Strava data since import isn't built, but the modal already branches on `editingActivity.source === 'strava'` to show a badge.
- [x] **Extended beyond original Phase 1 scope**: activity type is now a customisable registry, not just Run/Hike. 8 built-in types (Run, Hike, Walk, Ride, Swim, Strength, Yoga, Other); the create/edit form shows the top-3-by-usage as pills plus a "More…" dropdown of everything; a Customise (⚙) button opens per-type editing (name/icon/color/custom fields), mirroring `EditTrackerPane`'s field editor. See CLAUDE.md for the full writeup.
- [x] **Bug fix — per-type `tracksDistance`**: the first cut of the customisable-types work still showed Distance on every type, including Yoga and Strength, which don't have one. Added `ActivityType.tracksDistance: boolean` (seed defaults: `false` for Strength/Yoga, `true` for everything else), user-editable via a checkbox in `EditActivityTypeModal`; the Distance field is now conditionally rendered in `AddActivityModal`, not just optional. Moving time stays universal. `fitnessStore` bumped to v3 for the backfill.
- [x] **`N` (no modifier) now also triggers the section-aware new-item hotkey**, alongside the existing `Space` and `Ctrl+N` — app-wide, not Fitness-specific, but requested alongside this app's other changes. See CLAUDE.md hotkeys table.
- [x] A "Connect Strava" action and a manual "Sync now" button, in `FitnessSection`'s `StravaConnect` subcomponent. Built — see "Strava integration architecture" below for what shipped and what's still outstanding.

### Strava integration architecture (built)

Followed the planned shape: the Portfolio app's ticker data proxy through Vercel Edge Functions (`api/ticker-quote.ts` etc.) was the existing pattern, extended with a token **exchange** step (authorization code → access + refresh token) that has to happen server-side since it needs the app's client secret.

**Vercel Edge Functions** (`api/*.ts`, `export const config = { runtime: 'edge' }`):
- `api/_lib/strava.ts` — `exchangeStravaCode`/`refreshStravaToken` (POST to Strava's token endpoint with `STRAVA_CLIENT_SECRET` — a plain, non-`VITE_`-prefixed Vercel env var, so it never reaches the client; `VITE_FMP_API_KEY` remains the cautionary example of what not to do) and `mapSportType()` (Strava `sport_type` → our built-in `ActivityTypeId`s, unrecognised → `'other'`).
- `api/_lib/supabaseEdge.ts` — `getUserClient(accessToken)` / `bearerToken(req)` helpers shared by the three endpoints below.
- `api/strava-oauth-callback.ts` — receives the `code` Strava redirects back with, identifies the user via the access token carried in the OAuth `state` param (see below), exchanges the code for tokens, upserts `fitness_strava_connection`, redirects to `/?strava=connected` or `/?strava=error&reason=…`.
- `api/strava-status.ts` — Bearer-authenticated GET, returns connection metadata only (never tokens).
- `api/strava-sync.ts` — Bearer-authenticated POST, called by "Sync now". Refreshes the token if near-expired, fetches the 200 most recent activities from Strava, maps and returns them — does not touch Supabase or localStorage itself; the client does the upsert.
- The "Connect Strava" button is a plain link to Strava's authorize URL (built client-side in `src/services/strava.ts`), no server code needed for that half.

**The redirect-identity problem, solved:** Strava's callback is a full browser navigation, so there's no way to attach a Supabase `Authorization` header to it. Fixed by passing the user's current Supabase access token through the OAuth **`state`** parameter — `api/strava-oauth-callback.ts` reads it back out, calls `supabase.auth.getUser()` to identify the user, and writes as that user, so RLS applies normally. No service-role key anywhere in this codebase.

**Supabase table — built and applied to live:**
- `fitness_strava_connection` (`supabase/migrations/012_fitness_strava.sql`) — one row per user: `user_id`, `athlete_id`, `access_token`, `refresh_token`, `expires_at`, `scope`, timestamps. RLS scoped to the owning user. **This migration has been written but not yet executed against the live Supabase project** — that's the one remaining step before Connect will work end-to-end.

**Deviation from the original plan — no `fitness_activities` Supabase table (yet):** the original spec called for a second table mirroring `Activity` server-side. What actually got built keeps activities exactly where they already lived — `fitnessStore`, localStorage-only — and `syncStrava()` just upserts synced activities into that same local store via the pre-existing `upsertBySource()`. Simpler for Phase 1 (matches "start local, Supabase sync is a later phase" already true of `noteStore`/`listStore`), but it means synced activities don't survive a `localStorage.clear()` or show up on a second device without a re-sync. Revisit alongside whenever Fitness gets real Supabase sync (see "Not yet done" below).

**Verification status:** everything client-side (button rendering, signed-out guard, `?strava=connected`/`?strava=error` query-param handling, auto-navigation to the Fitness section on redirect) was build-verified and Playwright-tested against the local dev server. The edge functions themselves only execute on an actual Vercel deployment — the real OAuth round-trip and token exchange have **not** been tested end-to-end yet.

**Not yet done:**
- Run `012_fitness_strava.sql` against the live Supabase project (blocks Connect from working at all right now)
- Real end-to-end OAuth test against the Vercel deployment
- Supabase sync for `Activity`/`ActivityType` records themselves (see deviation note above)

**Phase 2+ (not now):** Strava webhook subscription (push instead of manual sync — needs a validation handshake endpoint and a public receiver, `api/strava-webhook.ts`), automatic throttled sync on app load, mapping additional Strava `sport_type` values onto the activity-type registry beyond what's covered today, promoting `ActivityFieldSchema` into the shared platform layer if Records ever wants the same shape (not needed yet — Lists' `ListFieldSchema` has stayed independent too, so there's no pressure to do this preemptively), exercise plans (structure likely mirrors `RoutineTask[]` + `RepeatConfig` from Routines — a plan is an ordered template, not a log entry), imports from other sources (Garmin, Apple Health, Google Fit, manual CSV).

### Add-on app architecture (built)

Fitness is the first app built against the suite's future "core bundle (nav items 1–5) + optional/paid add-ons (Portfolio, Fitness, below the nav divider)" model. `src/config/apps.ts` defines `APP_TIERS` and `isAppEnabled(view)` — the single gating point NavSidebar, App.tsx's routing, and the `6`/`7` hotkeys all check. `isAppEnabled` always returns `true` today (no entitlement backend exists), but every caller already treats it as something that can say no, so wiring a real purchase/entitlement check later is a one-function change. `PortfolioSection` and `FitnessSection` are also now `React.lazy()`-loaded (confirmed via build output: separate chunks, ~200KB off the main bundle) instead of statically bundled — the "code-splitting ensures each app's bundle only loads when needed" line in the suite architecture doc was aspirational until this; it's now real for the two add-on apps. See CLAUDE.md "Add-on app architecture" for the full writeup.

### Strava API setup guide (for the user — external prerequisite)

Needed before any of the Strava integration architecture above can be built or tested:

1. Go to https://www.strava.com/settings/api (requires a Strava account, log in first).
2. Fill in the "My API Application" form:
   - **Application Name**: anything recognizable, e.g. "Organisaitor Fitness" (shown on Strava's consent screen when connecting).
   - **Category**: pick whatever fits closest (e.g. "Training").
   - **Club**: leave blank.
   - **Website**: the deployed app URL (Vercel production URL).
   - **Authorization Callback Domain**: the bare domain only, no `https://` and no path (e.g. `my-todo.vercel.app`, not `https://my-todo.vercel.app/api/strava-oauth-callback`) — Strava enforces this format.
3. Submit. Strava issues a **Client ID** (safe to share, not secret) and a **Client Secret** (treat like a password).
4. Client ID: fine to paste in chat when ready to build the OAuth pieces. Client Secret: do **not** paste it in chat — add it directly as a Vercel environment variable (Project Settings → Environment Variables) once told the exact variable name to use; it must **not** have a `VITE_` prefix, or it ships to the browser.
5. ✅ Done — Client ID `270097` registered, `VITE_STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` set in Vercel and deployed. This unblocked the OAuth build above.

### Decisions (resolved)

1. **OAuth scope**: start with `activity:read` (public activities only). `activity:read_all` (private activities included) is an explicit future expansion, not a Phase 1 blocker — re-running the OAuth connect flow with a wider scope is a small change when wanted.
2. **Display units**: metric (km, km/h) by default. Stored data is SI (meters, m/s) regardless, so an imperial toggle later is a render-layer-only change.
3. **Sync trigger for Phase 1**: manual "Sync now" button only. No automatic/throttled background sync in Phase 1.

### Remaining prerequisites (not decisions — actions needed before/while building)

4. ~~**Strava API app registration**~~ — done (client id `270097`, env vars set in Vercel).
5. **Run `012_fitness_strava.sql` against the live Supabase project** — the table doesn't exist yet, so "Connect Strava" will fail at the token-upsert step until this runs.
6. **Tauri desktop OAuth**: the callback endpoint is a Vercel URL, which works naturally for the web/PWA build. Since tokens live in Supabase (not local device storage), the intended answer is "connect once via the web app, and the desktop build picks up the same connection through the synced `fitness_strava_connection` row" — flagged here so it's a deliberate decision, not an oversight, when this gets built.

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

### Suite-wide "Quick Access" pane (recently/frequently/pinned) — v1 built

**Built.** `Ctrl+G` opens a search-and-jump overlay (`src/components/QuickAccessPane/`) from anywhere in the suite — search by title across Notes, Notebooks, Tasks, Lists, Endeavours, Trackers, and Routines, or (empty query) browse Recent/Frequent visit history with a user-adjustable "Show N" count (`settingsStore.quickAccessRecentCount`, 3–20, default 8). Full design/architecture is documented in CLAUDE.md's Implemented Features list under "Suite-wide Quick Access pane" — see there for the provider-registry shape (`src/utils/quickAccess.ts`), the visit-tracking store (`src/store/recentItemsStore.ts`), and exactly which app actions record a visit.

**Deliberately not built in v1 (genuine future work, not oversights):**
- **Pinning.** The original ask's third leg ("pinned items") isn't built — only recent + frequent. `Note.pinned` already exists as a field (unused by this feature); Tasks/Lists/Endeavours/Trackers/Routines have no pin concept at all yet. Adding it means: a pin flag per entity type (or a separate lightweight `pinnedItemsStore` mirroring `recentItemsStore`'s shape, which would generalize better across types that don't already have a `pinned` field), a pinned section in `QuickAccessPane` above Recent/Frequent, and a way to pin from *outside* the pane too (e.g. a pin icon on task/list/note rows), not just from within it.
- **Granular in-entity targets.** Today a "destination" is a whole Note/Task/List/etc., not a specific Calendar event, Portfolio ticker, Fitness activity, a specific Tracker entry, or a specific List item/Records entry. Extending this is additive, not a redesign: one new `QuickAccessProvider` + one new `QuickAccessTargetType` union member per type (see the provider registry in `src/utils/quickAccess.ts`) — this extensibility was a deliberate design goal of v1, not left for a rewrite.
- **Portfolio/Fitness coverage** — no provider for tickers or activities yet, same "add a provider" extension path as above.
- **Android/touch entry point.** `Ctrl+G` isn't reachable on Android (no physical Ctrl key); `closeTopmostMobileOverlay()` already knows how to close the pane (for the hardware back button), but nothing opens it from touch UI yet — needs a button somewhere in `MobileNav`/`MobileMoreSheet`.
- **Fuzzy matching.** Search today is a plain case-insensitive substring match on title, per type, capped at 6 results per type. No ranking by match quality/recency, no matching on subtitle/notes/content.

**Motivating example from the user:** they have a specific List they want faster access to than going through Lists → navigating the list hierarchy each time.

**Why deferred:** Needs UX and data-model design decisions (above) before implementation; raised as a confirmed want, not yet scoped.

---

## Dark Mode — Suite-wide

### Vision

Full dark mode for the entire suite implemented via CSS custom properties (design tokens). No individual component needs conditional logic — the theme is applied as a `data-theme` attribute on `<html>` and all CSS modules reference token variables. Theme choice stored in `settingsStore`. **On Android, dark mode is the default.** On desktop/web, defaults to `'system'` (follows OS preference).

---

### 1. Design Tokens

**New file: `src/styles/tokens.css`**

Import once in `src/main.tsx` before any component styles:
```typescript
import './styles/tokens.css';
```

Full token set — every hardcoded color in every CSS module must be replaced with one of these:

```css
:root {
  /* ── Backgrounds ── */
  --bg-primary:           #ffffff;
  --bg-secondary:         #f8f8f8;
  --bg-tertiary:          #f0f0f0;
  --bg-overlay:           rgba(0, 0, 0, 0.40);

  /* ── Surfaces (cards, modals, panes, sidebars) ── */
  --surface-0:            #ffffff;   /* modal / topmost layer */
  --surface-1:            #f8f8f8;   /* pane / sidebar */
  --surface-2:            #f0f0f0;   /* card / list item */
  --surface-hover:        #ebebeb;
  --surface-active:       #e0e0e0;

  /* ── Borders ── */
  --border-subtle:        rgba(0, 0, 0, 0.06);
  --border-default:       rgba(0, 0, 0, 0.12);
  --border-strong:        rgba(0, 0, 0, 0.24);

  /* ── Text ── */
  --text-primary:         #111111;
  --text-secondary:       #555555;
  --text-tertiary:        #999999;
  --text-placeholder:     #bbbbbb;
  --text-disabled:        #cccccc;
  --text-on-accent:       #ffffff;

  /* ── Accent / brand ── */
  --accent:               #4f46e5;
  --accent-hover:         #4338ca;
  --accent-muted:         #ede9fe;
  --accent-subtle-border: #c4b5fd;

  /* ── Semantic ── */
  --color-danger:         #ef4444;
  --color-danger-muted:   #fee2e2;
  --color-success:        #22c55e;
  --color-success-muted:  #dcfce7;
  --color-warning:        #f59e0b;
  --color-warning-muted:  #fef3c7;
  --color-info:           #3b82f6;
  --color-info-muted:     #dbeafe;

  /* ── Navigation (left sidebar + mobile bottom bar) ── */
  --nav-bg:               #f4f4f4;
  --nav-border:           rgba(0, 0, 0, 0.08);
  --nav-item-text:        #444444;
  --nav-item-hover:       #e8e8e8;
  --nav-item-active-bg:   #e0e0e0;
  --nav-item-active-text: #111111;

  /* ── Input ── */
  --input-bg:             #ffffff;
  --input-border:         rgba(0, 0, 0, 0.15);
  --input-border-focus:   #4f46e5;
  --input-placeholder:    #aaaaaa;

  /* ── Scrollbar ── */
  --scrollbar-thumb:      rgba(0, 0, 0, 0.20);
  --scrollbar-track:      transparent;

  /* ── Shadow ── */
  --shadow-sm:            0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md:            0 4px 12px rgba(0, 0, 0, 0.10);
  --shadow-lg:            0 8px 24px rgba(0, 0, 0, 0.12);
}

[data-theme="dark"] {
  /* ── Backgrounds ── */
  --bg-primary:           #0f0f0f;
  --bg-secondary:         #161616;
  --bg-tertiary:          #1f1f1f;
  --bg-overlay:           rgba(0, 0, 0, 0.60);

  /* ── Surfaces ── */
  --surface-0:            #1e1e1e;
  --surface-1:            #161616;
  --surface-2:            #242424;
  --surface-hover:        #2a2a2a;
  --surface-active:       #333333;

  /* ── Borders ── */
  --border-subtle:        rgba(255, 255, 255, 0.05);
  --border-default:       rgba(255, 255, 255, 0.10);
  --border-strong:        rgba(255, 255, 255, 0.20);

  /* ── Text ── */
  --text-primary:         #eeeeee;
  --text-secondary:       #aaaaaa;
  --text-tertiary:        #666666;
  --text-placeholder:     #555555;
  --text-disabled:        #444444;
  --text-on-accent:       #ffffff;

  /* ── Accent ── */
  --accent:               #6366f1;
  --accent-hover:         #818cf8;
  --accent-muted:         #1e1b4b;
  --accent-subtle-border: #3730a3;

  /* ── Semantic ── */
  --color-danger:         #f87171;
  --color-danger-muted:   #3b0a0a;
  --color-success:        #4ade80;
  --color-success-muted:  #052e16;
  --color-warning:        #fbbf24;
  --color-warning-muted:  #3a1a00;
  --color-info:           #60a5fa;
  --color-info-muted:     #172554;

  /* ── Navigation ── */
  --nav-bg:               #111111;
  --nav-border:           rgba(255, 255, 255, 0.06);
  --nav-item-text:        #999999;
  --nav-item-hover:       #1f1f1f;
  --nav-item-active-bg:   #2a2a2a;
  --nav-item-active-text: #eeeeee;

  /* ── Input ── */
  --input-bg:             #1e1e1e;
  --input-border:         rgba(255, 255, 255, 0.12);
  --input-border-focus:   #6366f1;
  --input-placeholder:    #555555;

  /* ── Scrollbar ── */
  --scrollbar-thumb:      rgba(255, 255, 255, 0.15);
  --scrollbar-track:      transparent;

  /* ── Shadow ── */
  --shadow-sm:            0 1px 3px rgba(0, 0, 0, 0.30);
  --shadow-md:            0 4px 12px rgba(0, 0, 0, 0.40);
  --shadow-lg:            0 8px 24px rgba(0, 0, 0, 0.50);
}
```

---

### 2. settingsStore changes

Add to settingsStore shape:
```typescript
theme: 'light' | 'dark' | 'system';
```

**Default logic in initial state:**
```typescript
import { Capacitor } from '@capacitor/core';
const defaultTheme = Capacitor.getPlatform() === 'android' ? 'dark' : 'system';
```

Bump settingsStore version and add migration that backfills `theme: 'system'` for existing web users (existing Android users don't have a prior save, so the initial state default handles them).

---

### 3. Theme application (App.tsx)

Add a theme effect that runs on every `theme` value change:

```typescript
const theme = useSettingsStore(s => s.theme);

useEffect(() => {
  const applyTheme = (isDark: boolean) => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    // StatusBar sync handled here too — see Android section
  };

  if (theme === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches);
    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  } else {
    applyTheme(theme === 'dark');
  }
}, [theme]);
```

**Prevent flash of wrong theme (FOUC):** Add an inline script to `index.html` `<head>` that reads `settingsStore` from localStorage and sets `data-theme` synchronously before React hydrates:

```html
<script>
  (function() {
    try {
      var s = JSON.parse(localStorage.getItem('todo-settings') || '{}');
      var t = (s && s.state && s.state.theme) || 'system';
      var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    } catch(e) {}
  })();
</script>
```

---

### 4. CSS Modules migration

Every `.module.css` file in `src/` must have its hardcoded color values replaced with design tokens. Run this grep to find all instances before starting:

```
grep -rn "#[0-9a-fA-F]\{3,6\}\|rgb[a]\?(" src/ --include="*.css"
```

**Common replacements:**
| Hardcoded value | Token |
|-----------------|-------|
| `#fff`, `#ffffff`, `white` | `var(--surface-0)` or `var(--bg-primary)` (context-dependent) |
| `#f8f8f8`, `#f5f5f5`, `#f0f0f0` | `var(--bg-secondary)` or `var(--surface-1)` |
| `#111`, `#222`, `#333` (as text) | `var(--text-primary)` or `var(--text-secondary)` |
| `#999`, `#aaa` (as text) | `var(--text-tertiary)` |
| `rgba(0,0,0,0.4)` overlays | `var(--bg-overlay)` |
| `rgba(0,0,0,0.1)` borders | `var(--border-default)` |
| `rgba(0,0,0,0.06)` subtle borders | `var(--border-subtle)` |
| `box-shadow: 0 1px...` | `var(--shadow-sm)` |
| Any hardcoded blue/purple (accent) | `var(--accent)` |

**Do not change:** Dynamic colors passed via `style={{ background: color }}` (user-chosen entity colors). These are intentionally inline and correct as-is.

---

### 5. Desktop Settings UI

In SettingsPane, add an "Appearance" section at the top:
- Label: "Theme"
- Control: three-option segmented control or radio group — **Light / Dark / System**
- Maps directly to `settingsStore.theme`
- Changing immediately applies — no reload needed
- "System" is selected by default on web

---

## Android App — Capacitor

> **Superseded for architecture decisions** by `docs/android/00-architecture.md` — that document
> is now the source of truth for the Android build (vehicle, entry points, monetization,
> entitlements) and reconciles this section with the Fitness app, Schedule feature, and the
> add-on-tier system, none of which existed when this section was first written. The
> notifications spec below (§6) is still materially correct and is being carried forward into
> `docs/android/05-notifications.md`; read it here until that file exists. Sections 1–5 and 7–8
> below (setup commands, file manifest, mobile layout, native polish, build/release) remain
> useful reference detail, just no longer the top-level architecture record.

### Vision

The existing Vite/React codebase compiles to both the Vercel PWA and a native Android app via Capacitor. A single Google Play Store listing ships the full Organisaitor suite with a mobile-optimised layout and native capabilities: local notifications, haptic feedback, status bar control, and Play Store distribution. All business logic, Zustand stores, Supabase sync, and entity types are shared without modification. The desktop will always ship more advanced configuration UX; mobile is optimised for consumption, quick-capture, and daily logging.

**Scope for Android MVP:** Full suite available (Tasks, Calendar, Records, Lists, Notes, Portfolio). Complex setup flows (building tracker field schemas, complex routine creation, Portfolio chart deep-dive) are accessible but not layout-optimised — that's acceptable. Notification system is the primary Android-native capability.

**Android-only indefinitely** — iOS is not in scope.

---

### 1. Prerequisites & One-time Setup

**System requirements:**
- Java 17+
- Android Studio (for SDK, emulator, release signing)
- Android SDK API level 23 minimum target; API 34+ as target SDK (Play Store requirement)

**Install Capacitor packages:**
```
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/local-notifications
npm install @capacitor/app
npm install @capacitor/status-bar
npm install @capacitor/splash-screen
npm install @capacitor/haptics
npm install @capacitor/keyboard
```

**Initialise Capacitor (one-time, run from project root):**
```
npx cap init "Organisaitor" "com.organisaitor.app" --web-dir dist
npx cap add android
```

The `android/` directory is committed to git. Add only build artifacts to `.gitignore`:
```
android/.gradle/
android/app/build/
android/build/
android/.idea/
```

**`capacitor.config.ts` (project root):**
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.organisaitor.app',
  appName: 'Organisaitor',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher_foreground',
      iconColor: '#6366f1',
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0f0f0f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f0f0f',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
```

**`package.json` scripts to add:**
```json
"build:android": "npm run build && npx cap sync android",
"open:android": "npx cap open android",
"sync:android": "npx cap sync android"
```

---

### 2. New Files & Modified Files

**New files:**
```
capacitor.config.ts
android/                                    — generated Android project (git-tracked)
src/
  hooks/
    usePlatform.ts                          — platform detection
    useNotificationSync.ts                  — store-aware notification scheduler
  services/
    notifications/
      notificationService.ts               — schedule / cancel / sync logic
      notificationHelpers.ts               — ID hashing, payload builders
  utils/
    haptics.ts                             — guarded haptic wrappers
  styles/
    tokens.css                             — design tokens (see Dark Mode section)
  components/
    MobileNav/
      MobileNav.tsx                        — bottom tab bar
      MobileNav.module.css
    MobileMoreSheet/
      MobileMoreSheet.tsx                  — "More" bottom sheet (Lists, Portfolio, Settings)
      MobileMoreSheet.module.css
```

**Modified files:**
```
src/App.tsx                                — platform branch for nav/layout, theme effect, deep link listener
src/main.tsx                               — import tokens.css
index.html                                 — FOUC prevention script
src/store/settingsStore.ts                 — add theme, notification preferences
src/store/taskStore.ts                     — add reminderTime to Collection; bump to v6
src/components/NavSidebar/NavSidebar.tsx   — hide on Android
src/components/TaskPane/                   — full-screen on mobile
src/components/NoteEditorPane/             — full-screen on mobile
src/components/EditTrackerPane/            — full-screen on mobile
src/components/CalendarEventPane/          — full-screen on mobile
src/components/CalendarReminderPane/       — full-screen on mobile
src/components/SettingsPane/               — add Appearance section + Notifications section (Android-gated)
src/components/EditRoutinePane/ (if exists) or AddRoutineModal — add reminderTime field (Android-gated)
+ every *.module.css file                  — replace hardcoded colors with token variables
```

---

### 3. Platform Detection

**`src/hooks/usePlatform.ts`:**
```typescript
import { Capacitor } from '@capacitor/core';

export function usePlatform() {
  const platform = Capacitor.getPlatform();
  return {
    isAndroid: platform === 'android',
    isNative: Capacitor.isNativePlatform(),
    isWeb: platform === 'web',
  };
}
```

**Body class in App.tsx (applied once on mount):**
```typescript
useEffect(() => {
  if (Capacitor.getPlatform() === 'android') {
    document.body.classList.add('platform-android');
  }
}, []);
```

CSS modules can use `:global(.platform-android) .myClass { }` for Android-specific overrides in addition to `@media (max-width: 768px)` responsive breakpoints.

---

### 4. Mobile Layout System

#### 4a. App.tsx layout restructure

```tsx
const { isAndroid } = usePlatform();

return (
  <div className={cx(styles.app, isAndroid && styles.appMobile)}>
    {!isAndroid && <NavSidebar />}
    <main className={cx(styles.main, isAndroid && styles.mainMobile)}>
      {/* section content unchanged */}
    </main>
    {!isAndroid && <Sidebar />}       {/* right filter sidebar — hidden on mobile */}
    {isAndroid && <MobileNav />}
    {/* all modals and panes unchanged */}
  </div>
);
```

`.appMobile` / `.mainMobile`: removes left margin (no sidebar), adds `padding-bottom: calc(56px + env(safe-area-inset-bottom))` so content clears the bottom tab bar.

#### 4b. Bottom Tab Bar (MobileNav)

`position: fixed; bottom: 0; width: 100%; height: 56px`. Background: `var(--nav-bg)`. Top border: `1px solid var(--nav-border)`. Bottom padding: `env(safe-area-inset-bottom)` for Android gesture navigation.

Five tabs:

| Index | Label | Section key | Notes |
|-------|-------|-------------|-------|
| 0 | Tasks | `'tasks'` | |
| 1 | Calendar | `'calendar'` | |
| 2 | Records | `'records'` | |
| 3 | Notes | `'notes'` | |
| 4 | More | — | Opens MobileMoreSheet |

Active tab: icon + label in `var(--accent)`. Inactive: icon only (no label) in `var(--text-tertiary)`. Tapping the active tab scrolls current view to top (`window.scrollTo({ top: 0, behavior: 'smooth' })`).

Uses `useSettingsStore` / `uiStore.setActiveView` to switch sections — same action as NavSidebar.

#### 4c. MobileMoreSheet

Bottom sheet that slides up over a backdrop when "More" is tapped. Pattern: same overlay + sheet structure as existing modals (bottom-sheet on mobile). Contains:

- **Lists** — calls `setActiveView('lists')`, closes sheet
- **Portfolio** — calls `setActiveView('portfolio')`, closes sheet
- **Settings** — calls `openSettings()`, closes sheet
- **Account** — calls `openAccount()`, closes sheet

Backdrop tap and swipe-down dismiss the sheet. Escape key closes it (for stylus/keyboard users).

#### 4d. Slide-in panes → full-screen on mobile

All panes (TaskPane, NoteEditorPane, EditTrackerPane, CalendarEventPane, CalendarReminderPane, EditRoutinePane, SettingsPane, AccountPane) must become full-screen on Android.

In each pane's CSS module, add:
```css
@media (max-width: 768px) {
  .pane {
    width: 100% !important;
    height: 100%;
    top: 0;
    border-radius: 0;
  }
}
```

Or apply via `:global(.platform-android) .pane { }` if media query conflicts with existing fixed widths.

The × close button stays top-right. Back-button behaviour on Android: hook `@capacitor/app`'s `backButton` event to call the active pane's close action before defaulting to system back:

```typescript
App.addListener('backButton', () => {
  // check for open modals/panes in uiStore; close the topmost one
  // if nothing is open, allow default back (minimize app)
});
```

#### 4e. Section-specific layout notes

**Tasks:**
The right Sidebar (collection/purpose/tag filters) is hidden. Access via a filter icon (funnel) in the Tasks section header → opens a bottom sheet with the same filter controls. SortBar stays visible. Routines collapsible panel stays as-is.

**Calendar:**
- Month view: works at mobile widths; verify day cell tap targets ≥ 44px.
- Week view: show 3 columns (days) on phone (< 480px wide), 7 on tablet. Horizontal swipe to advance days. The 7-column layout can use `overflow-x: auto` with snap scrolling as a simpler alternative.
- Day view: single-column timeline; no layout changes needed.
- View toggle (Month/Week/Day) moves into the section header on mobile.

**Records:**
Left tracker/routine sidebar is replaced by a header-level picker: a dropdown or horizontally scrollable chip list showing the user's trackers and routines. Selecting one sets `activeTrackerId`. Tracker detail fills full width. RoutineChecklist cards stack vertically (already card-based; no change needed). AddEntry FAB stays.

**Notes:**
ChronicleView tag tree becomes drill-down navigation: tapping an area shows its children full-screen (back button to go up). Breadcrumb stays in the header. NoteEditorPane is full-screen — stylus input works natively in the WebView textarea with no additional code.

**Lists:**
Left sidebar → header picker (same approach as Records). Card grid → 1 column on phone (`grid-template-columns: 1fr`).

**Portfolio:**
WatchlistView table → `overflow-x: auto` (horizontal scroll). Reduce default visible columns on phone to: Name, Price, Daily Change %. Column picker button remains accessible. Chart view → chart fills full width; right sidebar (tickers list) hidden behind a toggle button tap. This section is read-heavy on mobile; complex configuration stays functional but is not layout-optimised.

---

### 5. Native Polish

#### StatusBar

Sync with active theme in the theme effect (App.tsx):
```typescript
import { StatusBar, Style } from '@capacitor/status-bar';

if (isAndroid) {
  const isDark = /* resolved theme === 'dark' */;
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  await StatusBar.setBackgroundColor({ color: isDark ? '#0f0f0f' : '#ffffff' });
}
```

#### SplashScreen

Hide after app finishes initial data hydration:
```typescript
import { SplashScreen } from '@capacitor/splash-screen';
// In App.tsx, after stores are hydrated from localStorage:
if (isAndroid) await SplashScreen.hide();
```

#### Haptics (`src/utils/haptics.ts`)

```typescript
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const native = () => Capacitor.isNativePlatform();

export const hapticLight   = () => native() && Haptics.impact({ style: ImpactStyle.Light });
export const hapticMedium  = () => native() && Haptics.impact({ style: ImpactStyle.Medium });
export const hapticSuccess = () => native() && Haptics.notification({ type: NotificationType.Success });
export const hapticWarning = () => native() && Haptics.notification({ type: NotificationType.Warning });
```

Wire `hapticLight()` to: task completion toggle, routine step toggle, list item status toggle, any checkbox-style interaction. Wire `hapticMedium()` to destructive confirmations (delete task, delete tracker entry). Wire `hapticSuccess()` to completing a full routine.

#### Keyboard

Config in `capacitor.config.ts` (`resize: 'body'`) handles most cases automatically. For NoteEditorPane (full-screen editor), optionally listen for `keyboardDidShow` to add bottom padding equal to `info.keyboardHeight` so the editor content clears the keyboard.

#### App icon

Generate using Android Studio's Image Asset Studio (right-click `res/` → New → Image Asset). Source: a single 1024×1024 PNG of the Organisaitor icon. This auto-generates all required `mipmap-*` density directories. The launcher icon must be a `.png` placed at `android/app/src/main/res/mipmap-*/ic_launcher.png`.

---

### 6. Notifications

#### 6a. Permissions

Request on first meaningful interaction (not cold open). Show an explainer first, then:

```typescript
import { LocalNotifications } from '@capacitor/local-notifications';

export async function requestNotificationPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted';
}
```

Store result in `settingsStore.notificationsEnabled`. If denied: show a nudge in the Notifications settings section — "Open Android Settings to enable notifications." with a button that calls `NativeSettings.open()` (or `@capacitor/app`'s `openUrl` with the settings intent).

All `LocalNotifications` calls must be wrapped in `if (!Capacitor.isNativePlatform()) return` — the plugin is a no-op on web but may log warnings if called unguarded.

#### 6b. settingsStore additions

```typescript
notificationsEnabled: boolean;             // master switch; default false until granted
notifTaskDeadlines: boolean;              // default true
notifCalendarEvents: boolean;             // default true
notifCalendarEventMinutesBefore: number;  // 15 | 30 | 60 | 1440; default 30
notifRoutineReminders: boolean;           // default true
notifRoutineDefaultTime: string;          // HH:MM; default '20:00'
notifWaitingTaskOverdue: boolean;         // default true
```

**Per-routine reminder time:** add `reminderTime: string | null` (HH:MM) to the `Collection` interface (in `src/types/index.ts`). `null` means use `settingsStore.notifRoutineDefaultTime`. This requires a **taskStore migration to v6**: backfill `reminderTime: null` on all existing collections.

#### 6c. Notification ID strategy

Capacitor local notification IDs are 32-bit positive integers. Derive a stable ID from entity ID + notification kind using a djb2-variant hash:

```typescript
// src/services/notifications/notificationHelpers.ts
export type NotifKind =
  | 'task-deadline'
  | 'calendar-event'
  | 'calendar-reminder'
  | 'routine-logging'
  | 'waiting-task-overdue';

export function notifId(entityId: string, kind: NotifKind, suffix = 0): number {
  let hash = 5381;
  const str = `${kind}:${entityId}:${suffix}`;
  for (let i = 0; i < str.length; i++) {
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return (hash % 2_000_000_000) + 1;
}
```

For routine logging notifications (one per scheduled day-of-week), call `notifId(routineId, 'routine-logging', dayOfWeek)` for `suffix` values 0–6. Reserve 7 IDs per routine.

#### 6d. Notification triggers per entity type

**Task deadlines (`notifTaskDeadlines`):**
- Condition: task has `deadline` set AND `completedAt === null`
- Schedule: 09:00 on the deadline date (one-shot)
- Title: `"Task due today"` / Body: `task.title`
- Cancel on: task completed, deadline removed, task deleted
- Skip if deadline is in the past

**Calendar events (`notifCalendarEvents`):**
- Condition: CalendarEvent with a date/time
- Schedule: `notifCalendarEventMinutesBefore` minutes before event start
- Title: `"Upcoming event"` / Body: `event.title`
- Recurring events: schedule the next 12 occurrences only (re-schedule on each app open)
- Cancel and reschedule on edit; cancel on delete

**Calendar reminders (`notifCalendarEvents`):**
- CalendarReminder entities already have a specific time — schedule at that time
- Title: reminder title / Body: blank or notes if present
- Same 12-occurrence limit for recurring reminders

**Routine logging reminders (`notifRoutineReminders`):**
- Per routine with `kind === 'routine'`
- Days: `repeatConfig.daysOfWeek` (or every day if empty/undefined)
- Time: `routine.reminderTime ?? settings.notifRoutineDefaultTime`
- Scheduling approach: on each app open, for each active routine, schedule the next 4 occurrences of each due day-of-week. Cancel all existing routine notifs for that routine first, then reschedule. This keeps notifications fresh without requiring always-on background processes.
- Title: `"Routine reminder"` / Body: `"Time to log ${routine.name}"`
- Cancel all (7 possible IDs) on routine deleted

**Waiting task overdue (`notifWaitingTaskOverdue`):**
- Condition: task with `kind === 'waiting'` AND `deadline` set
- Schedule: 09:00 on the deadline date
- Title: `"Waiting task overdue"` / Body: `"Follow up: ${task.title}"`
- Cancel on: task completed, deadline changed (reschedule), task deleted

#### 6e. Notification service (`src/services/notifications/notificationService.ts`)

Exports the following functions (all guarded with `if (!Capacitor.isNativePlatform()) return`):

```typescript
scheduleTaskDeadlineNotif(task: Task, settings: SettingsState): Promise<void>
cancelTaskDeadlineNotif(taskId: TaskId): Promise<void>

scheduleCalendarEventNotif(event: CalendarEvent, settings: SettingsState): Promise<void>
cancelCalendarEventNotif(eventId: CalendarEventId): Promise<void>

scheduleCalendarReminderNotif(reminder: CalendarReminder): Promise<void>
cancelCalendarReminderNotif(reminderId: CalendarReminderId): Promise<void>

scheduleRoutineNotifs(routine: Collection, settings: SettingsState): Promise<void>
cancelRoutineNotifs(routineId: CollectionId): Promise<void>

// Full sync — called on app start. Diffs pending notifs against store state.
syncAllNotifications(
  tasks: Task[],
  calEvents: CalendarEvent[],
  calReminders: CalendarReminder[],
  routines: Collection[],
  settings: SettingsState
): Promise<void>
```

`syncAllNotifications` implementation:
1. Call `LocalNotifications.getPending()` to get currently scheduled IDs.
2. Compute the full set of IDs that *should* be scheduled given current store state.
3. Cancel IDs that are scheduled but should not be (stale from deleted/completed entities).
4. Schedule IDs that should be but are not yet scheduled.
This ensures correctness after Supabase sync brings in changes made on desktop.

Notification payloads include `extra: { url: string }` for deep linking (see section 6g).

#### 6f. useNotificationSync hook (`src/hooks/useNotificationSync.ts`)

Mounted once in App.tsx, Android-only. Runs a full sync on mount (after stores hydrate from localStorage), then handles incremental updates by calling individual schedule/cancel functions when specific entities change.

```typescript
export function useNotificationSync() {
  const { isAndroid } = usePlatform();
  const settings = useSettingsStore();

  useEffect(() => {
    if (!isAndroid || !settings.notificationsEnabled) return;
    const tasks = Object.values(useTaskStore.getState().tasks);
    const events = useTaskStore.getState().calendarEvents;
    const reminders = useTaskStore.getState().calendarReminders;
    const routines = Object.values(useTaskStore.getState().collections)
      .filter(c => c.kind === 'routine');
    syncAllNotifications(tasks, events, reminders, routines, settings);
  }, []); // full sync on mount only
}
```

For incremental updates, existing store actions (completeTask, deleteTask, updateCollection, etc.) call the appropriate schedule/cancel function after mutating state. Keep these calls in App.tsx or a thin wrapper around the store actions — do not import the notification service inside the Zustand store itself (keep stores platform-agnostic).

#### 6g. Deep linking from notification tap

When a notification is tapped and the app opens, navigate to the relevant entity. Notification `extra` field carries a URL:

- Task: `organisaitor://tasks/{taskId}`
- Calendar event: `organisaitor://calendar/{eventId}`
- Calendar reminder: `organisaitor://calendar/{reminderId}`
- Routine: `organisaitor://records/{routineId}`

URL scheme `organisaitor://` must be registered in `android/app/src/main/AndroidManifest.xml` via an `<intent-filter>` — Capacitor's `@capacitor/app` plugin handles the boilerplate when correctly configured. Refer to Capacitor `appUrlOpen` docs for the exact manifest entry.

In App.tsx:
```typescript
import { App as CapApp } from '@capacitor/app';

useEffect(() => {
  if (!isAndroid) return;
  const handle = CapApp.addListener('appUrlOpen', ({ url }) => {
    try {
      const u = new URL(url);
      const [, section, id] = u.pathname.split('/');
      if (section === 'tasks' && id) {
        setActiveView('tasks');
        openTaskPane(id as TaskId);
      } else if (section === 'calendar' && id) {
        setActiveView('calendar');
        openCalendarEventPane(id as CalendarEventId);
      } else if (section === 'records' && id) {
        setActiveView('records');
        setActiveTracker(id);
      }
    } catch {}
  });
  return () => { handle.then(l => l.remove()); };
}, []);
```

#### 6h. Notifications section in SettingsPane

Visible only on Android (`isAndroid`). Controls:

- **Master toggle** — "Enable notifications". On toggle-on, calls `requestNotificationPermission()`. If granted, sets `notificationsEnabled: true`. If denied, shows inline message directing user to Android Settings.
- **Task deadlines** — toggle `notifTaskDeadlines`
- **Calendar events** — toggle `notifCalendarEvents` + inline picker for minutes before (options: 15 min, 30 min, 1 hour, Day before)
- **Routine reminders** — toggle `notifRoutineReminders` + time picker for `notifRoutineDefaultTime` (HH:MM)
- **Waiting task follow-up** — toggle `notifWaitingTaskOverdue`

**Per-routine reminder time:** In EditRoutinePane (or wherever routines are edited), add a "Custom reminder time" field (`reminderTime` on Collection) visible only on Android. Shows a time picker; "Default" option sets it back to `null`.

---

### 7. Build & Release

#### Development workflow

```bash
npm run build:android    # Vite build + cap sync
npx cap open android     # open Android Studio
```

For live-reload during dev, temporarily add to `capacitor.config.ts` (do NOT commit):
```typescript
server: { url: 'http://YOUR_LOCAL_IP:5173', cleartext: true }
```

#### Release build

1. In Android Studio: Build → Generate Signed Bundle/APK → **Android App Bundle (.aab)** (required for Play Store).
2. Create a signing keystore one-time:
   ```
   keytool -genkey -v -keystore organisaitor.jks -alias organisaitor -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Store the `.jks` file and its passwords **outside the git repo** (e.g. a password manager or secrets manager).
4. Configure signing in `android/app/build.gradle` using environment variables for CI safety.

#### Play Store setup

- Google Play Console account ($25 one-time fee).
- Upload `.aab` to **Internal Testing** track first; promote to Production after verification.
- Required assets: app icon (512×512 PNG), feature graphic (1024×500 PNG), ≥2 screenshots per form factor.
- App ID `com.organisaitor.app` is permanent — cannot be changed after first publish.
- Target SDK: API 34+ (Play Store requirement as of 2024).
- Privacy policy required (Supabase auth collects email address; host a simple policy page and link it in the Play Console listing).

---

### 8. Implementation order (for agent)

Complete dark mode first (steps 1–6) — it benefits desktop immediately and is a prerequisite for the Android StatusBar integration.

1. Create `src/styles/tokens.css` with full token set.
2. Import `tokens.css` in `src/main.tsx`.
3. Add `theme` to `settingsStore` + migration; set Android default to `'dark'`.
4. Add theme effect + StatusBar sync to `App.tsx`; add FOUC script to `index.html`.
5. Add Appearance section to `SettingsPane` (desktop immediately usable).
6. Audit and migrate all `*.module.css` files — replace every hardcoded color with tokens. Run the grep command in section 4 of Dark Mode to find them all.
7. Install Capacitor packages; run `cap init` + `cap add android`.
8. Create `capacitor.config.ts`.
9. Create `src/hooks/usePlatform.ts`; add body class in `App.tsx`.
10. Create `MobileNav` component (bottom tab bar).
11. Create `MobileMoreSheet`.
12. Modify `App.tsx` for platform layout branching (hide NavSidebar/Sidebar, show MobileNav).
13. Make all slide-in panes full-screen on mobile (CSS).
14. Wire Android back button via `@capacitor/app` `backButton` listener.
15. Section-specific layout passes: Tasks filter sheet, Records/Lists header picker, Calendar week view responsive, Portfolio horizontal scroll.
16. Create `src/utils/haptics.ts`; wire haptic calls to task/routine/list completion actions.
17. StatusBar + SplashScreen integration (already configured, add hide() call).
18. Add `reminderTime: string | null` to `Collection` type in `src/types/index.ts`; bump taskStore to v6 with migration.
19. Add notification preference fields to `settingsStore`.
20. Build `notificationHelpers.ts` (ID hashing, payload builders).
21. Build `notificationService.ts` (schedule/cancel/sync functions).
22. Build `useNotificationSync.ts`; mount in `App.tsx` (Android-gated).
23. Wire incremental schedule/cancel calls at task/calendar/routine action sites.
24. Wire deep linking: `appUrlOpen` listener in `App.tsx`; add `extra.url` to notification payloads.
25. Add Notifications section to `SettingsPane` (Android-gated); add per-routine reminder time to EditRoutinePane (Android-gated).
26. Generate app icon via Android Studio Image Asset Studio.
27. Test end-to-end on Android emulator API 34: all notification types fire correctly, deep links navigate correctly, theme switching works, all sections accessible and usable.
28. Create signing keystore; build release `.aab`; upload to Play Store Internal Testing.

---


---

## Roll the shared item-actions pattern out to the remaining apps — not built

`src/components/ItemActions/` (footer, dialogs, hook, banner, icons) currently backs Task, Calendar event and Calendar reminder panes. Still on their own patterns / without archive-delete parity: Notes (`Note.archivedAt` exists in the model but has no UI; delete is `window.confirm`), List items and Lists (`window.confirm`), Portfolio watchlist items, Records trackers/entries/routines (`EditTrackerPane`/`EditRoutinePane` use `window.confirm`), Fitness activities (`window.confirm`), Schedules. Each needs `archivedAt`/`archiveReason` (+ migration + store bump) where archiving makes sense, otherwise just the shared delete confirmation.

## Android back button should use the same overlay stack as Escape — not built

`closeTopmostMobileOverlay()` (`src/store/uiStore.ts`) closes overlays by a *fixed priority list* of store flags, not by which was opened most recently, so it has the same class of inconsistency Escape used to have. Now that every overlay registers with `useEscapeClose` (`src/hooks/useEscapeClose.ts`), the back button could call a `closeTopOverlay()` exported from that module instead (and fall through to `mobileBackConsumer`/section history/minimise when the stack is empty). Needs an on-device check — Android wasn't exercised in the Escape work.
