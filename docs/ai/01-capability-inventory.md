# AI agent integration — capability inventory

Status: **reviewed and being built** (drafted 2026-09-20). Chunk A of the build (everything except notes) exists as of 2026-09-22: see [`02-command-layer.md`](02-command-layer.md) for what was built and how it works. This document remains the reference for what is left and why; entries below marked **done** have been built.

Everything below comes from **reading the code** (stores, services, utils, and every `Add*`/`Edit*` submit handler). Nothing was run. Where a finding is an inference rather than something the code states outright, it is marked *(unverified at runtime)*.

## 0. Decisions this inventory builds on

Agreed in discussion, not re-litigated here:

- **The agent lives inside the app.** The user talks to an in-app chat; the app calls the model API (the user's own key, later a local model). There is no external agent driving the app, so **the executor is always the client** and commands run against the Zustand stores.
- **A command layer** sits between the agent and the stores: named, schema-validated operations with a risk tier. It wraps existing store actions/services so their invariants come for free, and pulls logic out of components where it currently lives (section 5).
- **Agents never delete.** Archive is the only removal, because it's reversible. Delete stays a user-only, confirm-first action.
- **Encrypted notes/lists are invisible to agents**, even while the vault is unlocked. Reads filter them out and writes refuse them. Their existence isn't revealed either.
- **Staged review for bulk changes**, and **revert batches** (snapshot before write) for everything an agent does.
- **~20–30 intent-level tools**, tuned by evals.
- No server-side executor, so the earlier "can it run on the server" column is dropped.

### Legend

| Tier | Meaning |
|---|---|
| **R** | Read only |
| **C** | Creates new data |
| **M** | Modifies existing data |
| **A** | Archives / restores (reversible removal) |
| **X** | Never exposed to an agent |

`Logic lives` says where the rule is enforced today: **store** (safe to wrap), **service** (safe to wrap), **UI** (must be extracted first, see section 5).

---

## 1. Findings that change the plan

1. **Note content has no store-level editing API.** `updateNote(id, { content })` takes a whole Tiptap JSON string and everything else (formatting, headings, tables, marks) happens inside the editor component. "Append this fact under the right heading" needs a new, editor-independent content module (markdown → Tiptap JSON, find heading, append/replace under heading). `utils/noteContent.ts` (a pure JSON-tree walk) is the precedent. This is the largest single piece of new work.
2. **Writing to a note that's open in the editor is unsafe today.** `NoteEditor` loads content only when the note id changes or the lock state changes (`NoteEditor.tsx` around lines 770–825). It never reloads on an external store change, and its own debounced save later writes its copy back. So an agent's edit to the open note is silently overwritten. **The main case is same-device, not multi-device:** the chat panel lives in the same app, so "dictate a fact into the note I'm looking at" hits it directly. The cross-device case (note open on the laptop, agent used on the phone, sync pulls the change in) is the same bug arriving by a different route, and it exists today for a human editing on two devices. Whole-note last-writer-wins by `updatedAt` is an accepted limitation there and not AI-specific. **Decision:** make the editor reload from the store when an external change arrives and it has no unsaved edits; if it does have unsaved edits, keep the user's version and surface the conflict rather than clobbering either side.
3. **(done 2026-09-21) Task ⇄ calendar shadow logic was duplicated in three components and enforced nowhere in the store.** `AddTaskModal`, `TaskPane` and `MobileQuickAddBar` each create/update/delete the shadow `CalendarEvent` (scheduled) and `CalendarReminder` (deadline) by hand. `taskStore.updateTask` knows nothing about them. An agent calling `updateTask({ deadline })` would silently break the link. Needs one `setTaskDates` command that all four callers share.
4. **Title sync and shadow deletion (revised after testing):**
   - **RESOLVED 2026-09-21 — both (a) and (b) below are fixed** by `services/taskCalendarLinks.ts` (see CLAUDE.md, "Task ⇄ calendar shadow entries"): task is the source of truth, edits on either side mirror, deleting a task's scheduled event un-schedules the task, and G-1 below is done. The original analysis is kept for context.
   - **(a) Title sync: user reports it works both ways; I found no code that does it.** Neither `saveTitle` (`TaskPane`) nor its `CalendarEventPane` counterpart writes the other side's title, and nothing subscribes across the stores. The likely explanation is that a *deadline* pill is drawn straight from the task (opens `TaskPane`), so it is trivially the same title. A *scheduled* task has a separate shadow event holding its own copy of the title. **Unresolved — needs a quick test:** give a task a scheduled date (not a deadline), rename it in the task pane, and check the calendar entry (and the reverse). If they diverge, the shared task-dates command should own title propagation; if they don't, there's a mechanism I missed and this item goes away.
   - **(b) Known minor issue, future fix:** deleting a task's shadow event from `CalendarEventPane` calls `deleteEventWithCleanup`, which doesn't clear `task.calendarEventId`. Later edits to the task's scheduled date then update a non-existent event instead of recreating it. Rare, low impact, not blocking anything here.
5. **Store-level `delete*` is not safe delete.** `deleteTask` only unregisters from the parent; the cascade (sub-tasks, shadows, note marks) lives in `deleteTaskWithCleanup`. `deleteCollection` detaches tasks and deletes tracker entries but leaves dangling `collectionId` on events, reminders, notes, notebooks, schedules, and child trackers/routines, and leaves routine instances (the UI callers delete those separately). Agents won't delete, but revert and archive must not assume these cascades exist.
6. **Archive coverage is uneven.** Tasks, events, reminders, Endeavours and Purposes can be archived. Notes have an `archivedAt` field but no action or UI. Lists, list items, schedules (only an `active` toggle), Portfolio items and Fitness activities have nothing. **Decision:** all of these need archive eventually, but it does **not** have to come first. The command layer takes a typed `archive_item`, so supporting a new type later is additive. First slice: agents create and modify those types but cannot remove them (revert can undo an agent's own creations, and revert is a user action). Add archive per entity, roughly notes → lists/items → schedules → Portfolio/Fitness, each with its store action, `ItemActions` UI and migration, alongside the agent work rather than before it.
7. **`updatedAt` is load-bearing.** Sync merges by `updatedAt`, so every command must go through store actions, which stamp it. A raw `set()` (or a revert that restores an old snapshot including its old `updatedAt`) can lose to a stale remote copy. Revert must write restored entities with a fresh `updatedAt`.
8. **Encryption leak vectors beyond the obvious.** Reads must not expose an encrypted note through: search hits; counts ("34 notes" including encrypted ones); a task's `crossAppRefs` (a chip carrying the linked note's title); `StructuredTagEntry` rows derived from an encrypted note (they're encrypted too); recents / Quick Access. Tasks created *from* an encrypted note already hold plaintext (a known, accepted limitation in CLAUDE.md), so those are visible to the agent as ordinary tasks. **Design rule:** every agent read goes through one choke point (an "agent view" filter) that drops encrypted/locked rows, computes counts *after* filtering, omits cross-app refs that point at encrypted notes entirely, and feeds `search` only from the filtered set. Test it with a planted-secrets harness (as was done for the crypto code) asserting no read command ever returns a planted string. This matters more than it looks: anything a read command returns is sent to a third-party model provider, so a leak is a privacy failure, not just a display bug.
9. **Read commands must be side-effect free.** `touchNote` (sets `lastViewedAt` and records a recent visit) and `uiStore.open*` actions record "visits". An agent reading fifty notes must not reshuffle the user's recents. Instead the agent's reads are recorded in a separate **agent audit log** (see section 7), so "when did the agent last look at this" is answerable without touching the user's own `lastViewedAt`.
10. **Several conventions are enforced only in the UI**: sub-task inherits parent's priority; list-type templates copy their field schema into a new list; tracker templates copy fields; reference-list items derive their title from the first non-empty string field; the "0 is stripped from list item data" cleanup; the birthday-event rules; linked end-time computation. Full list in section 5.

---

## 2. Entity glossary

| Entity | Store | Persist / sync | Agent-visible? | Traps for a model |
|---|---|---|---|---|
| **Task** | `taskStore` | localStorage + Supabase | Yes | `deadline` (due) vs `scheduledAt` (day you plan to work on it) are different fields with different calendar shadows. `kind`: action / waiting / milestone. Sub-tasks via `parentId`; only top-level tasks list. |
| **Endeavour** (`Collection` kind `project`/`list`) | `taskStore` | Yes | Yes | UI word is "Endeavour"; code word is Collection. A *tracker* and a *routine* are also `Collection`s but are separate things to a user. |
| **Tracker / Routine** (`Collection` kind) | `taskStore` (+ `trackerStore`, `routineStore`) | tracker entries sync; routine instances **local only** | Yes | Routine ≠ Schedule. Routine = daily habit checklist in Records. Completing a routine creates a tracker entry. |
| **Purpose**, **Tag** | `taskStore` | Yes | Yes | Purposes are cross-cutting "why" labels (archivable); Tags are plain labels (no archive). Not the same as note tags. |
| **CalendarEvent** | `calendarStore` | Yes | Yes | Has time span; `eventType` default/birthday/**task**; `status` confirmed/tentative; `important`. Task-derived shadow events (`eventType 'task'`) belong to their task. |
| **CalendarReminder** | `calendarStore` | Yes | Yes | Point in time; `reminderType` default/**task** (deadline shadow). Untimed reminders notify via `notifyDaysBefore`/`notifyAtTime`. |
| **Schedule** (`ScheduleTemplate` + `ScheduleBlock[]`) | `scheduleStore` | Yes | Yes | Recurring **weekly** timetable layer with a colour and an `active` switch. Blocks hold `daysOfWeek`, `interval` (weeks), `intervalAnchor`, `exceptions`, and commitment mode (`requiresCommitment`, `committedDates`). Not a Routine, not repeating events. |
| **TrackerEntry** | `trackerStore` | Yes | Yes | `data` is keyed by the tracker's `FieldSchema.id`, not field names. |
| **Note** | `noteStore` | Yes | **Only if not encrypted** | Content is Tiptap JSON (`doc > section+ > blocks`). Has tabs (a Main tab + extras), notebooks (`tagIds`), `collectionId`, `parentId`, and its own annotation tags. |
| **NoteTag** (`kind 'area'` = notebook, `'tag'` = annotation label) | `noteStore` | Yes | Yes (names are plaintext) | Notebook ≠ Tag ≠ app-wide `Tag`. Three distinct concepts. |
| **StructuredTagEntry** | `noteStore` | Yes | **Only if its note is unencrypted** | Created from a marked passage (Acronym today). |
| **List / ListItem / ListType** | `listStore` | Yes | **Only if not encrypted** | `kind` watchlist (status + cards) vs reference (table). `fieldSchema` per list, optional per-tab schema. Only custom `ListType`s sync. |
| **Activity / ActivityType** | `fitnessStore` | **localStorage only today** | Yes | SI units stored (metres, seconds). `tracksDistance` per type. Strava-imported rows are `source: 'strava'`. |
| **WatchlistItem / PortfolioTag / InvestmentPurpose** | `portfolioStore` | Yes (`columnConfig` local-only) | Yes | Not `Purpose`. Investment purposes are Portfolio's own entity. |
| Settings, hotkeys, auth, vault, notifications, recents, UI state | various | mixed | **No** (context read only) | See section 6. |

---

## 3. Operation catalogue

Proposed command names are provisional. **Touches** lists every entity the command writes, which is also the revert snapshot scope.

### 3.1 Tasks

| Command | Does | Key inputs | Logic lives | Invariants / side effects | Tier | Touches |
|---|---|---|---|---|---|---|
| `createTask` | New task (optionally a sub-task) | title; notes, priority, kind, timeIntensity, collectionId, tagIds, purposeIds, parentId, deadline(+time), scheduledAt(+time), links | store `addTask`/`createTask` **+ UI** (shadow creation in `AddTaskModal`) | Registers on parent's `subtaskIds`; URLs in notes merged into `links`; **must create shadow reminder/event if dates set**; sub-task should inherit parent's priority/Endeavour (UI only today) | C | task, parent, shadow event, shadow reminder |
| `updateTask` (fields) | Edit title/notes/priority/kind/intensity/tags/purposes/links/Endeavour | any subset | store `updateTask` | `updatedAt` stamped; notes edit merges *new* URLs only. **Title change should propagate to shadows (currently doesn't, see 1.4a)** | M | task, shadows |
| `setTaskDates` | Set/clear deadline and scheduled date/time | deadline, deadlineTime, scheduledAt, scheduledTime | **UI only** (`TaskPane`, `AddTaskModal`, `MobileQuickAddBar`) | Create/update/delete shadow reminder and event to match (finding 3) | M | task, shadow event, shadow reminder |
| `setTaskStatus` | Complete / reopen | id, completed | store `toggleTask` | Sets/clears `completedAt`; shadows are intentionally *not* touched (notifications look up the task) | M | task |
| `archiveTask` / `restoreTask` | Archive with optional reason / restore | id, reason | store | Cascades to sub-tasks under one `archivedAt` stamp; restore only restores that stamp's group. Hides from list, calendar, milestones | A | task + sub-tasks |
| `reorderTasks` | Manual order | ids | store (`sortOrder`) | `addTask` assigns `sortOrder = task count` (not max+1; can collide after deletes) | M | tasks |
| *(delete)* | | | `deleteTaskWithCleanup` | Sub-tasks, shadows, note marks | **X** | |

### 3.2 Endeavours, Purposes, Tags

| Command | Does | Logic lives | Notes | Tier |
|---|---|---|---|---|
| `createEndeavour` | project or list; name, color, description, deadline, purposeIds | store `addCollection` | `completed` exists in the model but **no UI or action sets it** (no "complete project" flow yet) | C |
| `updateEndeavour` | rename, recolour, description, deadline, purposes | store `updateCollection` | Edit modal only edits name/description/color/deadline; store allows more | M |
| `archiveEndeavour` / `restore` | set/clear `archivedAt` | store `updateCollection` | No cascade; existing references keep working | A |
| `createPurpose` / `updatePurpose` / `archivePurpose` | | store | Archive hides from pickers only | C / M / A |
| `createTag` / `updateTag` | | store | Tags have **no archive** and no `updatedAt` (merge is remote-wins) | C / M |
| *(delete endeavour / purpose / tag)* | | store (partial cascades, finding 5) | | **X** |

### 3.3 Calendar events and reminders

| Command | Does | Key inputs | Logic lives | Invariants / side effects | Tier | Touches |
|---|---|---|---|---|---|---|
| `createCalendarItem` | Event or reminder | kind, title, date; endDate, startTime, endTime, notes, location, collectionId, repeat, status(tentative), important, notify settings | store `addEvent`/`addReminder` **+ UI** rules | `endDate` only if later than `date`; **birthday** events: no times, repeat yearly forever; end time after start (auto-derived in UI via `computeLinkedEndTime`); `notifyBeforeValue` null = no notification (opt-in); reminders default `notifyDaysBefore` 1 / `notifyAtTime` 17:00 | C | event/reminder |
| `updateCalendarItem` | Edit fields | any subset | store | `updatedAt` stamped. Task shadows shouldn't be edited directly (they belong to their task) | M | event/reminder |
| `editOccurrence` | this only / this and following | skip, endBefore, detach, split | store (`skip*`/`endBefore*`/`detach*`/`split*`) + `utils/recurrence.ts` | Exceptions live inside `repeat`; `count` still counts skipped dates; detach/split create a new item with cleared cross-app refs | M | original + new item |
| `archiveCalendarItem` / `restore` | whole series | store | Hidden from calendar and notifications | A | item |
| *(delete)* | | `deleteEventWithCleanup` etc. | Strips note marks. **Does not clear the owning task's `calendarEventId`** (finding 4b) | **X** | |

### 3.4 Schedules

| Command | Does | Key inputs | Logic lives | Invariants / side effects | Tier | Touches |
|---|---|---|---|---|---|---|
| `createSchedule` | Whole timetable with blocks | name, color, startDate, endDate, collectionId, blocks[] | store `addSchedule` **+ UI** | **`addSchedule` ignores `blocks`** (always `[]`); the modal then calls `updateSchedule(id, { blocks })`. Block ids are `nanoid(8)` made in the UI; defaults `interval 1`, `intervalAnchor = startDate ∥ today`, `exceptions []`, `requiresCommitment false`, `committedDates []` | C | schedule |
| `updateSchedule` | Patch metadata; add/update/remove blocks; set active | patch | store `updateSchedule` (**whole `blocks` array committed at once**) | A model that edits one block should read-modify-write the full array. `active` false = hidden layer, not archived | M | schedule |
| `manageOccurrences` | skip / unskip a date; commit / uncommit dates (commitment-mode blocks) | scheduleId, blockId, dates | store (`addException`, `commitOccurrences`, …) | Commit → notification 30 min before. Skip = cancelled, different from "not yet committed" | M | schedule |
| `findScheduleConflicts` | Given candidate blocks, report overlap with existing active schedules | blocks | `utils/scheduleOccurrences.ts` (`blocksMayConflict`, `countTemplateConflicts`) | Conservative: shared weekday + overlapping time, ignoring interval alignment | **R** | none |
| `previewSchedule` | Expand a block/schedule into concrete dates | id or blocks, range | `expandScheduleBlock` | Honours interval/anchor/exceptions/template date bounds | **R** | none |
| *(delete)* | | store | | **X** | |

Schedules have **no archive**; the reversible equivalent is `active: false`.

### 3.5 Records: trackers, routines, entries

| Command | Does | Logic lives | Invariants / side effects | Tier | Touches |
|---|---|---|---|---|---|
| `createTracker` | name, color, purposes/tags, Endeavour, **template or fieldSchema** | store `addCollection` **+ UI** | Template fields copied from `TRACKER_TEMPLATES` by the modal, not the store. Modal then selects the new tracker (nav) | C | collection |
| `updateTrackerSchema` | add/rename/remove fields | store `updateCollection` (`fieldSchema`) | Entry `data` is keyed by field id: removing a field orphans values; renaming is safe | M | collection |
| `logEntry` | date, data, notes | store `addEntry` | `data` keys must be `FieldSchema.id`s; types: text/number/date/rating/select/boolean/url/duration(**seconds**) | C | entry |
| `updateEntry` | | store | | M | entry |
| `createRoutine` | name, steps, days of week, Endeavour | store `addCollection` **+ UI** | `repeatConfig` built by `buildRepeatConfig(daysOfWeek)` in the modal; empty days = every day | C | collection |
| `checkRoutineStep` / `completeRoutine` | Tick a step for a date / finish it | store **+ UI** (`RoutineChecklist.handleComplete`) | Completing creates a `TrackerEntry` (routine id as tracker id) *then* stores its id on the instance. Instance is created on first read (`getOrCreateInstance` writes). Locate the entry by scanning entries for the same tracker+date | M | routine instance, entry |
| *(delete tracker/routine/entry)* | | store + **UI** (`RecordsView` deletes instances separately) | | **X** | |

Routine instances are **local-only** today. That doesn't matter for an in-app agent but does for revert persistence.

### 3.6 Notes and notebooks

| Command | Does | Logic lives | Invariants / side effects | Tier | Touches |
|---|---|---|---|---|---|
| `createNote` | title, optional markdown body, notebook(s), Endeavour, template | store `addNote` **+ UI** | Endeavour inherited from notebook when not passed (store). Template content built in `config/noteTemplates.ts`. **Body must be valid `doc > section+` Tiptap JSON** (finding 1); wrong shape is wrapped on load, invalid JSON is not | C | note |
| `appendToNote` | Add markdown at end of note/tab, or under a named heading | **does not exist** | Needs the new content module. **Refuse if note is encrypted; coordinate with the open editor** (finding 2) | M | note |
| `replaceNoteSection` | Replace text under a heading | **does not exist** | Same | M | note |
| `getNoteOutline` | Headings, tabs, size (so the agent can choose where to write) | **does not exist** | Read via `noteView`, no `touchNote` | **R** | none |
| `updateNoteProperties` | title, abstract, notebooks, Endeavour, colour, pinned | store `updateNote` | `updateNote` accepts *any* `Note` field: the command must whitelist. `pinned`/`color` are plain | M | note |
| `addNoteTab` / `renameNoteTab` / `updateNoteTabContent` | | store | `tabOrder` must contain `'__main__'` and each tab id (bootstrapped by `addNoteTab`); tab content same JSON rules | M | note |
| `createNotebook` / `updateNotebook` | name, parent, Endeavour, icon, colour | store `addNoteTag` **+ UI** | Sub-notebook Endeavour seeded from parent **in the UI only**. `order` is fractional; indent sets 999, outdent `parent.order + 0.5` | C / M | note tag |
| `moveNote` (indent/outdent) | Make a sub-note | store `indentNote`/`outdentNote` | | M | note |
| `archiveNote` | | **no action or UI** (field exists) | needs decision (section 7) | A | |
| Structured tag entries, note annotation tags (`applyTag`) | | **UI / editor only** | Marks live inside content; not in the first slice | — | |
| *(delete note / notebook)* | | `deleteNoteWithCleanup` | Strips reverse refs, deletes structured entries, orphans child notes | **X** | |
| encrypt / decrypt note | | store + vault | | **X** | |

### 3.7 Lists

| Command | Does | Logic lives | Invariants / side effects | Tier | Touches |
|---|---|---|---|---|---|
| `createList` | name, type (movies, credentials, custom…), colour, icon, fieldSchema, tabs | store `addList` **+ UI** | Modal copies the chosen type's `fieldSchema` into the list; store does not. `kind` derived from type. **Never expose "encrypt on create"** | C | list |
| `updateList` | | store | Must refuse encrypted lists (they're invisible). Tab names live in the list | M | list |
| `addListItem` | title, status, tab, `data` by field id, notes, links | store **+ UI** | Reference lists derive title from the first non-empty string field (UI). Modal strips empty **and `0`** values from `data`. `status` only meaningful for watchlist kind. Refused for a locked encrypted list | C | item |
| `updateListItem`, `setListItemStatus`, `moveListItem(tab)` | | store | | M | item |
| `removeListTab` | | store | Reassigns affected items to no tab | M | list, items |
| *(delete list / item / type)* | | store | | **X** | |

Lists have **no archive**.

### 3.8 Fitness and Portfolio (later slices)

| Command | Logic lives | Notes | Tier |
|---|---|---|---|
| `logActivity` / `updateActivity` | store **+ UI** | `averageSpeedMps` computed in the modal from distance and moving time (`computeAverageSpeedMps`); title defaults to the type name; distance nulled when the type doesn't track it; SI units; type must be an existing `ActivityTypeId` (fixed ids `run`, `hike`…) | C / M |
| `addWatchlistItem` / `updateWatchlistItem` | store **+ UI** | `heldAt` only when `status === 'holding'`; `dateAdded` default set by the modal | C / M |
| Strava sync, Google Calendar sync, price quotes, ticker lookups | services | Network side effects the agent must not trigger | **X** |

### 3.9 Cross-app links

| Command | Logic lives | Invariants | Tier |
|---|---|---|---|
| `linkItems(a, b)` | `taskStore`/`calendarStore` `crossAppRefs` | Manual link records only the **reverse** ref (no text to anchor a mark to). Only note targets are wired. **Refuse if the note is encrypted.** | M |
| `unlinkItems` | `unlinkCrossAppRef` | Strips the reverse ref **and** the note's `ArtifactLinkMark` (only if the note is unlocked) | M |
| createTask *from a note selection* | UI (Notes toolbar) | Not an agent operation; the agent creates the task directly and may link it | — |

### 3.10 Reads and context (all tier R, all side-effect free)

| Command | Purpose | Source today |
|---|---|---|
| `getContext` | today's date, weekday, resolved timezone, Endeavour/Purpose/Tag names + ids, current section, terminology glossary | `settingsStore`, `utils/timezone.ts`, `uiStore` (read only) |
| `search` | keyword across notes (title + optional body), tasks, events/reminders, lists/items, Endeavours, notebooks | `utils/quickAccess.ts` providers cover note/notebook/task/list/endeavour/tracker/routine; **events, reminders, schedules, list items, note body are not searchable yet** |
| `list` / `get` (typed) | compact summaries with ids + full detail by id | stores; **must go through `noteView`/`listView`/`itemView` and drop locked/encrypted rows** |
| `getCalendarRange` | everything on the calendar between two dates, expanded (repeats, schedule occurrences, task deadlines) | `CalendarView` builds this inline (`itemsByDate`); **needs extracting**, plus `expandRepeat`, `expandScheduleBlock` |
| `findScheduleConflicts`, `previewSchedule`, `getNoteOutline` | see above | |

---

## 4. Invariants register

Rules that must hold whoever writes the data. **Enforced in**: store / service / UI / nowhere.

| # | Invariant | Enforced in |
|---|---|---|
| I-1 | A task with `scheduledAt` has a linked `CalendarEvent` (`eventType 'task'`) whose date/time/title track the task; cleared when the date is cleared or the task is deleted | **UI (3 places)** + backfill for `eventType` only. Title sync missing |
| I-2 | A task with `deadline` has a linked `CalendarReminder` (`reminderType 'task'`), same rules | **UI** + `backfillTaskCalendarLinks` (creates missing, never repairs stale) |
| I-3 | Task shadow entities are never rendered twice (the reminder is skipped in the calendar builder) and don't notify once the task is completed/archived | UI (`CalendarView`), `useNotificationChecker` |
| I-4 | A sub-task is registered on its parent's `subtaskIds` | store |
| I-5 | Archiving a parent archives its active sub-tasks under one `archivedAt`; restore only restores that group | store |
| I-6 | Deleting a task deletes its sub-tasks, shadows, and strips note marks that pointed at it | service `deleteTaskWithCleanup` (not `deleteTask`) |
| I-7 | Text typed into a task's notes has its *new* URLs copied into `links` | store + service |
| I-8 | Sub-tasks inherit the parent's priority (and Endeavour at creation) | **UI** |
| I-9 | Cross-app links are two-sided: mark in note content ⇄ `crossAppRefs` on target. Unlinking from either side removes both; manual links only add the reverse ref | service (`crossAppLinkCleanup`), locked notes can't have marks stripped |
| I-10 | Deleting an event/reminder/note strips the counterpart refs/marks; deleting a note also deletes its `StructuredTagEntry`s and orphans its child notes to top-level | service |
| I-11 | An encrypted note/list has blanked stored fields; plaintext exists only in the memory cache; all writes route through `editNote`/`editList`/`editItem`; edits to a locked one are refused | store + service |
| I-12 | Read encrypted content only via `noteView`/`listView`/`itemView` | convention (not enforceable by types) |
| I-13 | Note content is `doc > section+ > blocks`; heading numbering follows raw heading level (templates use level 1) | editor (`parseContent`) |
| I-14 | `tabOrder` contains `'__main__'` + every tab id | store (`addNoteTab`, `removeNoteTab`) |
| I-15 | A new note inherits its Endeavour from its notebook(s) when none is given | store `addNote` |
| I-16 | Repeat exceptions live inside `RepeatConfig`; `count` counts skipped dates; detach/split reset cross-app refs and external-sync provenance | store + `utils/recurrence.ts` |
| I-17 | Schedule blocks are committed as a whole array; block ids unique within the schedule | store (whole-array), **UI** (id generation) |
| I-18 | `intervalAnchor` decides which weeks count; occurrences before it are excluded even for `interval 1` | `expandScheduleBlock` |
| I-19 | Dates are `YYYY-MM-DD`, times `HH:MM` **24-hour, wall-clock in the account timezone** (not UTC). `todayIso()` is *machine-local*, not zone-aware | convention; use `todayIsoInZone(resolveTimezone(...))` for "today" |
| I-20 | Changing the timezone re-stamps all timed data | service `timezoneMigration` (settings action, never the agent) |
| I-21 | Imported (Google/ICS) events: sync only creates, never updates; `importedSourceKeys` blocks resurrection of locally deleted ones | store (local-only ledger) |
| I-22 | Completing a routine creates a `TrackerEntry` then links its id on the instance; routine instances are keyed `${routineId}_${date}` and created on read | **UI** + store |
| I-23 | Tracker `data` keys are `FieldSchema.id`; `duration` is seconds | convention |
| I-24 | Deleting an Endeavour: detaches tasks, deletes tracker entries; **does not** clean events/reminders/notes/notebooks/schedules/child trackers | store (incomplete); routine instances cleaned by UI |
| I-25 | Archived Endeavours/Purposes remain valid references and are hidden from pickers only | store + UI filters |
| I-26 | Sync merges by `updatedAt` (newer wins); every write must stamp it. Tags, note tags, list types, portfolio tags have no `updatedAt` (remote-wins) | store actions |
| I-27 | Reads must not record visits (`touchNote`, `recordVisit`) | convention |
| I-28 | Reference-list item titles derive from the first non-empty string field; empty and `0` values are stripped from item `data` | **UI** |
| I-29 | Fitness stores SI units; average speed = distance ÷ moving time computed at write time | **UI** |
| I-30 | Task `sortOrder` = number of tasks at creation | store (collision-prone) |

---

## 5. Logic in the wrong place (must move into commands before an agent can use it)

| # | Where | What has to be extracted |
|---|---|---|
| G-1 **(done 2026-09-21)** | `AddTaskModal`, `TaskPane`, `MobileQuickAddBar`, `taskCalendarBackfill` → now `services/taskCalendarLinks.ts` | One `setTaskDates`/`createTask` implementation owning shadow create/update/delete, including title propagation and clearing `calendarEventId` when the shadow is deleted (I-1, I-2, finding 4) |
| G-2 **(done 2026-09-22)** | `TaskPane.handleAddSubtask`, `AddTaskModal` | Parent inheritance (I-8) → now in `addTaskWithCalendar` (`services/taskCalendarLinks.ts`), used by `TaskPane` and the agent |
| G-3 **(mostly done 2026-09-22)** | `AddCalendarItemModal`, `MobileCalendarQuickAdd`, `CalendarEventPane` | `AddCalendarItemModal` now uses `utils/calendarItemInput.ts`; the Android quick-add and the event pane still build their own inputs. Originally: birthday rules, `endDate` only when after `date`, linked end time, notification defaults/opt-in |
| G-4 **(done 2026-09-22)** | `AddScheduleModal` | `utils/scheduleBlocks.ts` (`createScheduleBlock`) and `addSchedule` now accepts blocks. `computeAllOccurrenceDates` (the skip-checklist helper) stays in the modal, as the agent does not need it. Originally: Block factory (id, defaults, anchor), the `addSchedule` + `updateSchedule` two-step, and `computeAllOccurrenceDates` (used to list occurrences) |
| G-5 | `RoutineChecklist` | Complete-routine flow and the entry lookup (uses a scan because it wrongly believes `addEntry` returns void, when it actually returns the entry) |
| G-6 | `RecordsView`, `EditRoutinePane` | Routine-instance cleanup on delete (not needed for agents, but revert + future `archive` must know it) |
| G-7 | `AddTrackerModal`, `AddRoutineModal`, `AddListModal`, `AddListItemModal` | Template/type field copying, `buildRepeatConfig`, reference-title derivation, value cleaning |
| G-8 | `AddActivityModal` | Average-speed computation, default title, distance nulling |
| G-9 | `AddNoteModal`, `AddNoteTagModal` | Template content; notebook → Endeavour seeding |
| G-10 | `NoteEditor` | **All content editing.** Needs a headless content module and an "external content changed" path (finding 2) |
| G-11 | `CalendarView.itemsByDate` | Calendar expansion (repeats + schedule occurrences + task deadlines + layer rules) for `getCalendarRange` |
| G-12 | `quickAccess.ts` | Extend beyond seven types for `search`; drop encrypted rows |
| G-13 | `deleteCollection` + UI callers | Complete cascade (only if delete is ever exposed; otherwise document) |

Most modals also do trivial trimming and defaulting (`title.trim()`, `|| null`); the stores already trim titles, so this is low risk.

---

## 6. Never exposed (per decisions)

- **All deletes**, including hard delete of Endeavours/Purposes/Tags.
- **Encryption**: encrypt, decrypt, unlock, lock, vault setup, recovery code, trusted device, and any read of encrypted content or its existence.
- **Account and auth**: sign in/out, Force upload, export/restore backups, sync controls.
- **Settings**: theme, clock format, **timezone** (triggers a bulk re-stamp), hotkeys, per-section toggles, calendar layer visibility.
- **Integrations**: Google Calendar connect/sync, Strava connect/sync, ICS import (a bulk import belongs in the staged-review flow, not a free tool), notification actions, price/quote fetching, speech.
- **UI navigation state** as an operation. (Possibly a later *"show me this"* command that opens an item, kept out of the first slice.)
- Editing **list types**, **activity types**, **note tag field schemas**, structured tag entries and annotation-tag application (all UI/editor-bound today).

---

## 7. Proposed tool set (~30, intent-level)

Marked **★** = first vertical slice (Schedules, Tasks, Calendar, note search + append).

**Read (7)**
1. ★ `get_context`
2. ★ `search`
3. ★ `list` (typed: task, calendar item, schedule, note, notebook, list, list item, tracker, routine…)
4. ★ `get` (typed by id; notes return outline + markdown, never touch `lastViewedAt`)
5. ★ `get_calendar_range`
6. ★ `find_schedule_conflicts`
7. ★ `preview_schedule`

**Tasks (4)**
8. ★ `create_task`
9. ★ `update_task` (incl. dates via the shared shadow logic)
10. ★ `set_task_status`
11. `reorder_tasks` (lower priority)

**Calendar (3)**
12. ★ `create_calendar_item`
13. ★ `update_calendar_item`
14. `edit_occurrence`

**Schedules (3)**
15. ★ `create_schedule` (staged review by default)
16. ★ `update_schedule` (blocks patch; `active`)
17. ★ `manage_schedule_occurrences`

**Notes (5)**
18. ★ `create_note`
19. ★ `append_to_note`
20. `replace_note_section`
21. `update_note_properties`
22. `create_notebook`

**Records and Lists (5)**
23. `create_tracker` / 24. `log_tracker_entry`
25. `complete_routine`
26. `create_list` / 27. `add_list_item` (+ `update_list_item`)

**Organisation and links (3)**
28. `create_endeavour` / `create_purpose` / `create_tag` (small, could merge into one typed tool)
29. `link_items` / `unlink_items`
30. `archive_item` / `restore_item` (typed: task, calendar item, Endeavour, Purpose; extended as archive support is added)

Later: `log_activity`, `add_watchlist_item`, `move_note`.

**Agent audit log**: append-only, local, capped. One row per command call: timestamp, session and batch id, command, entity type + id(s), outcome (ok / refused / failed). Reads log the ids returned, never content. Powers the "what did the agent do" view, per-item "agent last viewed at" lookups and created-by-agent attribution, and is the spine revert snapshots hang off.

**Cross-cutting mechanics (not tools)**: staged proposals with a review UI (reusing the `CalendarImportReviewModal` pattern); batch ids and before-snapshots for revert; a risk-tier gate on every command; provenance (`createdBy: 'agent'`, `batchId`) on written entities.

---

## 8. Open questions for review

1. ~~**Archive gaps (finding 6).**~~ **Resolved:** create/modify only for the first slice; add archive per entity later, in parallel with the agent work.
2. ~~**Open-note writes (finding 2).**~~ **Resolved:** the editor reloads on external changes when it has no unsaved edits.
3. ~~**Fix the broken-link bugs (finding 4) first?**~~ **Resolved:** no. 4a needs a test to see whether it exists at all; 4b is a noted minor future fix. The shared task-dates command is still needed for the agent regardless (duplicated logic, finding 3), but nothing gates on it.
4. ~~**Revert storage.**~~ **Resolved: local.** A new persisted store added to `PERSISTED_STORAGE_KEYS`; revert works on the device that ran the agent.
5. **`search` scope.** Decided: keyword + structure for now. Built for tasks, calendar items, schedules and Endeavours; note text comes with Chunk B. Recommendation: v1 = structure (Endeavour/notebook filters) + keyword search over titles, headings and body text of unencrypted notes, with the model choosing among a short candidate list. Semantic (embedding) search only if the evals show misses at scale.
6. ~~**Provenance / history.**~~ **Resolved in principle:** keep a full **agent audit log** (every command the agent runs, reads included, with ids only for reads, plus which batch each write belongs to), and record whether an item was created by the agent or the user. Still open: whether attribution must also show on *other* devices (would need a small synced table or a per-entity field) or is fine as local-only for now.
7. **Projects.** `Collection.completed` exists but nothing in the app sets it (no "complete project" flow, already listed under not-yet-implemented). **Proposal:** the agent doesn't complete projects in any slice; `archive_item` on an Endeavour is the nearest equivalent. Low importance: revisit when the app gets a real completion flow, then add a command for it.

## 9. Next steps once this is reviewed

1. ~~Settle the open questions~~ done, apart from cross-device attribution (a small synced table, later).
2. ~~Run the scheduled-task title test~~ done: verified by the user.
3. ~~Build the command layer skeleton and the first-slice commands~~ **done 2026-09-22 (Chunk A)** — see `02-command-layer.md`.
4. **Next (Chunk B):** the headless note-content module, the editor's external-change handling, and the note commands.
5. Draft the agent manual from the schemas, and start the eval scenarios (the first three come from our discussion: timetable screenshot → schedule, pasted course schedule → update-or-create, dictated fact → append to the right note).
