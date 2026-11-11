# 08 — Linking: one registry, one picker, one field, one way to open

Status: Done 2026-11-10 — all six tasks built: the registry (services/linkTargets.ts), one picker dialog (components/ItemPickerModal), one Linked items field (components/LinkedItemsField), one opener (services/openItem.ts), one "what links here" (services/linksTo.ts), and the two rules recorded with the user's yes (rows for every link; a deleted item's links stay, hidden, until it's deleted forever). Feature entry: "Linking: one registry, one picker, one field, one opener" in docs/features/implemented-features.md. Not checked in the app yet (brief written 2026-11-07; the plan was agreed with the user the same day).

The app links things to each other in many places: a task to notes, lists, other tasks and
calendar items; a calendar item to notes, lists and tasks; a list to notes; note text to almost
everything. Each new pair of things has been built with its own picker dialog, its own field and
its own way of opening the linked item. Trackers will be linkable next, and the user doesn't want
a seventh copy of everything. This brief turns the linking code into a few shared pieces, so that
a new kind of thing to link to is one entry, and every place that links looks and behaves the same.

---

## 1. Getting up to speed (do this first, read only what's listed)

The product is **Organisaitor**, a suite of apps (Tasks, Calendar, Records, Lists, Notes, Portfolio,
Fitness, plus Endeavours and Overview) built as one React 19 + TypeScript + Zustand codebase, shipped
as a desktop app (Tauri), a web app and an Android app (Capacitor). Supabase syncs data.

1. **Read `CLAUDE.md` in full.** It's the rulebook: patterns you must follow, the type system, the
   stores, the "Single entry points" table, testing rules and the end-of-session report format.
   Pay particular attention to these sections, which this work touches:
   - "Documentation Protocol" (where things get written down) and "Pattern governance" (a new
     pattern is recorded, applied, audited, and ships with a pattern test).
   - "Never swap working files under the running app": **never `git stash`, `git checkout --` or
     `git reset`**. The user runs the dev app against real data while you work.
   - Type system → "ItemLink (task links)" (including "Links to an event, a Reminder or a
     Deadline"), and "Single entry points" (rows for opening, picking and linking).
   - Component patterns → "Pickers suggest by keywords", "Modals", "Escape key", "Ctrl+Enter",
     "Floating panels", "Row options menu", "Bottom sheets and touch gestures (Android)",
     "Inline objects in notes (`\`)" (the `ARTIFACT_TYPES` registry is a model for this work).
   - "Agent command layer": agents link through `src/agent/access.ts`; keep link rules in one
     place both the UI and the agent call.
2. **Then read only these, and only the parts named.** Don't read `docs/` top to bottom: search
   by name (Grep), and read with offset/limit.
   - `docs/features/implemented-features.md`, search for these entries: "Cross-app linking"
     (the original design of `crossAppRefs`), "Task links: waiting on / follow-up of / related",
     "Lists: links from tasks, calendar items and notes; linked checklists", and the 2026-11-07 entries "New task form laid out by kind; a task linked to
     a calendar item", "The open calendar item is outlined" and "Choosing which dates of a
     repeating calendar item". These say what exists and why.
   - `docs/features/notes-objects.md`: only if you touch how links in note text are drawn.
   - `docs/android/11-design-and-coding-patterns.md` §5–6: before changing anything a person taps.
   - `docs/architecture/file-structure.md`: only if a search doesn't find something.
   - **Not needed:** the migration record (this work needs no migration; if you think it does,
     stop and ask), BACKLOG.md beyond its "Pattern retrofit backlog" table, the Android plan.
3. **Read the code below before designing anything.** Section 2 lists where each piece is.

**Working habits that matter here:** many files use CRLF line endings, and on this machine `sed -i`
quietly rewrites them as LF; prefer the Edit tool, and check endings if you script a change. Run
`npx tsc -b`, `npx vitest run` and `npx eslint <changed files>` as you go (`npm run check` is the
full gate; eslint has a known baseline, so lint only what you changed). Write user-facing strings
in `src/config/labels.ts`.

---

## 2. What exists today

### Three ways a link is stored

| Model | Stored on | Means | Rules |
|---|---|---|---|
| **Cross-app reference** (`CrossAppRef`, `crossAppRefs`) | tasks, calendar items, lists | a plain "see also" to a **note** or a **list** | `types/index.ts`; removed when the target is deleted (`services/crossAppLinkCleanup.ts`); a note's "Linked from" bar derives the other side (`store/noteBacklinks.ts`) |
| **Task link** (`ItemLink`, `itemLinks`) | tasks only | a typed relation from a task to a **task**, **event**, **reminder** or **deadline**; it *does* something (waiting on blocks completion; preparation and follow-up set and follow the task's dates) | kinds in `config/itemLinkKinds.ts`; task-to-task rules in `utils/taskLinks.ts`; task-to-calendar rules in `utils/eventTaskLinks.ts` and `services/eventTaskLinks.ts`; a link to a deleted item is ignored and hidden, not removed (a restore brings it back); one date of a repeating item is `occurrence`, and a task can hold a link per date |
| **Links in note text** | the note's content | marks and blocks (`\` objects, note links, Glossary terms, hubs) | `components/NoteEditor/objects/` (`ARTIFACT_TYPES`), `extensions/NoteLink.ts`, `services/noteHubs.ts`; **out of scope** here except for sharing the "open it" function |

Lists and tasks also link through linked checklists (`services/taskListLinks.ts`, `components/LinkedChecklists`).

### Six picker dialogs, each a copy of the same shell

`components/NotePickerModal` (tab-aware ranking of its own), `ListPickerModal`, `TaskPickerModal`,
`CalendarItemPickerModal` (adds "how it relates" and a second step for a repeating item's dates),
`HubPickerModal`, `InboxPickerModal`. Each repeats: the portal and overlay, the search box,
ranking through `utils/suggestRank.ts`, the "Suggested from…" and "Recent" sections, arrow keys,
Enter, a capture-phase Ctrl+Enter listener, Escape through `useEscapeClose`, and the shared CSS
from `NotePickerModal.module.css`.

### The "linked items" fields

- `components/CrossAppRefPicker`: chips for notes and lists, "+ Note", "+ New note", "+ List"; an
  `extraAdds` prop (2026-11-07) lets a host add a button to its row. Used by `TaskPane`,
  `AddTaskModal`, `CalendarItemForm/CalendarItemFields` and `ListsSection/ListLinksBar`.
- `components/TaskLinks/TaskCalendarLinks`: a task's links to calendar items, drawn as rows
  under the chips, its "+ Calendar item" passed into `CrossAppRefPicker` through `extraAdds`.
- `components/LinkedChecklists`: a linked list's items under the field (TaskPane).
- `components/TaskLinks/TaskLinksField`: task-to-task links (a separate "Task links" section: the
  user wants this kept apart from Linked items).
- `components/TaskLinks/EventTasksField`: the other side, the tasks linked to a calendar item.

The task pane alone uses three components to draw what the person sees as one "Linked items" field.

### Opening a linked item

`services/openCrossAppTarget.ts` `openArtifactTarget(type, id, occurrence?)` switches section,
goes to the date and opens the pane. It's used in about 17 places, but others open panes by hand
(`openCalendarEventPane`, `openTaskPane` and the note opener are called directly from components,
and `TaskPane` has its own `navigateToCrossAppRef`). One of those (2026-11-07) opened an event's
pane while the task pane stayed on top, so the click looked like it did nothing. `setActiveView`
doesn't close the task pane.

### "What links here"

Worked out separately on each side: `noteBacklinks.ts` (notes), `tasksLinkedTo` in
`utils/eventTaskLinks.ts` (calendar items), `taskRelations` in `utils/taskLinks.ts` (tasks), the
list's `ListLinksBar`.

---

## 3. The work

Do the tasks in this order. Tasks 1, 2 and 4 belong together; Task 3 builds on them. Before
starting each one, record the pattern it adopts in CLAUDE.md ("Pattern governance": the rule, why,
how to apply it), and add its pattern test in `src/test/patterns.test.ts`.

### Task 1 — one registry of things that can be linked to

**Problem:** what a linkable kind *is* (its icon, its name, how to find it, whether it still
exists or is locked, how to open it, what a picker searches and shows for it) is spread across
components, so adding a kind (trackers next) touches many files.

**Build:** `config/linkTargets.ts` (or `services/linkTargets.ts` if it needs stores), modelled on
`ARTIFACT_TYPES` and `services/endeavourFiling.ts` `FILED_KINDS`: one entry per kind (note, list,
task, event, reminder, deadline; tracker entry later) with:
- `icon` (from `config/itemIcons.ts`, never typed in a component) and `label` (from `LABELS`);
- `resolve(id)`: its title and context line, whether it exists, whether it's locked (encrypted
  notes and lists read through `noteView` / `listView`; locked ones show as locked, never their text);
- `open(id, occurrence?)`, through Task 4's function;
- `picker`: its candidates, its ranking fields for `suggestRank`, its meta line, and whether it
  has dates to choose (`repeat`), so the picker can offer the dates step;
- which storage it uses (reference or task link) and the functions that add and remove one.

**Done when:** every picker, field and "linked" row reads kinds from the registry, and adding a
kind is one entry plus its labels. **Verify:** a test that every `CrossAppRefType` and
`ItemLinkTargetType` has an entry; a pattern test that no component spells out a kind's icon or
opener for a link.

### Task 2 — one picker dialog

**Problem:** six copies of the picker shell (section 2) drift in keyboard handling and look.

**Build:** `components/ItemPickerModal` taking a kind (or several) from the registry: the shell
once (portal, search, ranking, sections, arrows, Enter, Ctrl+Enter in the capture phase, Escape,
`suggestFrom`), with slots for a kind's extras: a row of options above the list (the calendar
picker's "how it relates"), a second step (a repeating item's dates: none ticked, 20 at a time,
"All dates", already-linked dates ticked), and "+ New…" where a kind offers it. Move the pickers
onto it one at a time, keeping each one's tests green. `NotePickerModal`'s tab-aware ranking and
its `place` mode stay as an extension of the note kind, not a reason to keep the copy. Hub and inbox
pickers serve note blocks; move them if they fit, otherwise write down why not (an exception in
CLAUDE.md, as the pattern rules ask).

**Done when:** the six dialogs are one component plus per-kind configuration. **Verify:** the
existing picker tests pass against the new component (`CalendarItemPickerModal.test.tsx` is the
most complete); the pattern test "Pickers suggest by keywords" still holds; a pattern test that no
other component builds a picker overlay (`createPortal` with the picker's CSS).

### Task 3 — one "Linked items" field

**Problem:** the person sees one field; the code is `CrossAppRefPicker` + `TaskCalendarLinks` +
`LinkedChecklists`, with calendar links drawn as rows and notes as chips.

**Build:** `components/LinkedItemsField` for tasks, calendar items and lists (and notes later):
one row of "+ Note · + New note · + List · + Calendar item · (+ Tracker entry later)" from the
registry, each host saying which kinds it offers; every link drawn one way (decide chips or rows
with the user if unsure; a link that carries a relation, such as "Prepares for", shows it); one
way to remove (unlink icon, with Undo where it removes a task link's dates) and open (Task 4). A
create form holds its picks until Save, as `AddTaskModal` does today (`calendarLinks` state). Keep
**Task links** (task-to-task) a separate section: the user asked for that on 2026-11-07. Keep
`LinkedChecklists` below the field. It shows a list's items, which isn't a link row.

**Done when:** `TaskPane`, `AddTaskModal`, the calendar item form/panes and `ListLinksBar` use it,
and `CrossAppRefPicker` and `TaskCalendarLinks` are gone (grep the docs for their names and fix
every mention, per CLAUDE.md rule 4). **Verify:** a test per host kind (task: notes, lists,
calendar items with a date; calendar item: notes, lists; list: notes), including the create form's
held picks; check it in the app on desktop and narrow width (the row wraps only when out of room).

### Task 4 — one way to open any item

**Problem:** components open panes by hand; one left the task pane covering the calendar item.

**Build:** make `openArtifactTarget` (renamed if clearer, e.g. `openItem`) the only way to open a
linked item: it closes whatever item pane is in front (task, event, reminder, deadline, note pane)
before switching, goes to the date for a calendar item, and opens a note at a tab/passage. Move
`TaskPane`'s `navigateToCrossAppRef`, `TaskLinksField`'s and `EventTasksField`'s row clicks and
`SeriesLinkBar` onto it where they open something in another section (opening a pane in the same
section, as the calendar grid does, can stay direct; say which in the pattern).

**Done when:** a click on any linked item lands on it, visibly. **Verify:** add it to CLAUDE.md's
"Single entry points" table; a pattern test that components outside the calendar and task sections
don't call `openCalendar*Pane` / `openTaskPane` directly; a test that opening from an open task
pane closes it (`TaskCalendarLinks.test.tsx` has the template).

### Task 5 — one "what links here" lookup

**Problem:** each side derives its backlinks its own way.

**Build:** `services/linksTo.ts` `linksTo(type, id)`, reading both storage models (references and
task links, with their relation and date), used by the note's "Linked from" bar, `EventTasksField`,
the list's links bar and a task's incoming links. Derived, never stored (as now).

**Done when:** those places read it. **Verify:** unit tests over a fixture with every kind linked
to every kind it can be.

### Task 6 — write down two rules (needs the user's yes first)

1. **Which storage:** a link that *does* something (blocks, moves dates) is a task link; a plain
   "see also" is a reference. Record it in CLAUDE.md.
2. **A link whose item is deleted:** task links are left and hidden (a restore brings them back);
   references are removed by `crossAppLinkCleanup.ts`. The recommendation is left-and-hidden for
   both. **Ask the user before changing the reference behaviour**, since it changes
   `crossAppLinkCleanup.ts` and what a restore brings back.

**Not part of this work:** merging the two storage models into one. That's a data migration with
sync risk; log it in BACKLOG.md as a possible later step with the reasons.

---

## 4. Rules for the whole piece of work

- **No new dependency, no migration.** If you think one is needed, stop and ask.
- **Behaviour stays the same unless a task says otherwise.** Pickers, ranking, keyboard, Escape,
  the dates step and the add-task form's prefill of dates must all still work; the existing tests
  are the regression suite (search `*.test.ts(x)` beside each file you change).
- **Android:** every new control has a touch path (a tap, not a hover); pickers and fields are
  already tap-friendly, so keep them that way. Check `docs/android/10-gap-analysis.md` only if you
  add a hover or drag affordance.
- **Demo account:** if the field's look changes, check `docs/agent-tasks/07-demo-account.md`
  (the demo's tasks link to notes, lists and the field trip event).
- **The agent command layer** (`src/agent/`): if a link rule moves, the agent must still call the
  same one function the UI does.

---

## 5. When done

- Set this brief's Status line (`Done YYYY-MM-DD — outcome`), or `In progress` with what's left.
- Record each adopted pattern in CLAUDE.md (and its row in "Single entry points"), its pattern
  test, and its retrofit entry in BACKLOG.md's "Pattern retrofit backlog" (the check to re-run, the
  sites left, or "fully applied <date>").
- Add a feature entry at the bottom of `docs/features/implemented-features.md` (what, why, files,
  decisions, what was verified in the app and what wasn't), and update the 2026-11-07 entries named
  in section 1 where they now describe code that changed.
- Update `docs/architecture/file-structure.md` for new and removed components.
- Finish with CLAUDE.md's end-of-session report (the summary table, then anything the user must
  decide).
