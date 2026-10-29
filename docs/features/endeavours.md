# Endeavours, Types, Rhythms and Goals — design (not built)

Status: **Design agreed with the user 2026-10-28. Phases 1 and 2 built 2026-10-28, phases 3 to 6 (Types, Rhythms, Goals, templates and restructuring) 2026-10-29** (see the "as built" sections). All six phases are built; what's left is in each phase's "Not built". Confirmed requirements, in phases; the build order and what's open are at the end. The design discussion, with rough screen mockups (the Endeavours page, an Endeavour's home, a parent's rolled-up home, the create menu with Types, a rhythm stream's settings), is the user's design page "Endeavours, Rhythms and Goals" (claude.ai artifact, private to the user). This file is the record an agent builds from; where the two differ, this file wins.

## The problem

A student in week 6: each subject asks for different things on different rhythms (a lecture every Tuesday, a reading before each lecture, a coding exercise every third week). After a few weeks one subject's lecture is missed and another's reading isn't done, and nothing in the app says so. Building that by hand (tasks, events, records and notes, linked, and kept in step when a lecture moves) is too much work. Not specific to university: training, a work project with weekly reports and practising an instrument have the same shape.

**Aim:** setting up what you do is very easy; the app assembles where you stand without being asked; and the work connects to the goals it's for.

## The model: one question per concept

| Question | Concept | Example | Notes |
|---|---|---|---|
| Why does it matter? | **Purpose** | Health, Career, Learning | never finished; exists today |
| What result do I want? | **Goal** (new) | Distinction in GEOS215; 10 km under 50 min by June | achieved / missed |
| Where does it belong? | **Endeavour** | Degree → Semester 2 → GEOS215 | exists; gains links between Endeavours |
| What is it? | **Type** (new) | Assessment (Exam, Essay), Reading, Lecture | fields, defaults, parts |
| How do I find it? | **Tag** | #group-work | stays a plain label |

Plus **Rhythm** (Routines, generalised: what you do repeatedly) and **Records** (the evidence: tracker entries, ticks, notes).

**Splitting structure is cheap, so it needn't be right first time.** Rule of thumb shown in the app: give something its own Endeavour when it has its own goal, its own schedule, or notes you'd want to see apart; otherwise it's a rhythm inside the parent. The app may suggest a split; split, merge and move are each one action with Undo.

## Decisions (agreed with the user, 2026-10-26 to 2026-10-28)

- **General, not university-specific.** University is a template.
- **Endeavours link to each other with typed links**, starting with *part of*; **several parents are allowed** (an internship is part of Semester 2 and of Career). Not a `parentId`.
- **Archiving a parent asks** about a child that has another live parent.
- **Items belong to one Endeavour**; only Endeavours have several parents.
- **Purposes stay a separate kind of thing**, linked from Endeavours with *serves*.
- **Goals go on Endeavours only** for now ("a purpose is fulfilled by endeavours"). Store the goal's target as a typed reference so a goal on a Purpose can be added later without a migration.
- **Goal measures in v1:** by hand (check-in), consistency from a rhythm, a target from a tracker field. Completion of tasks/milestones too.
- **Routines are generalised into Rhythms**, rather than a new concept beside them.
- **Visibility is a setting per rhythm stream**, with quiet defaults, so a week isn't cluttered with 50 items.
- **No hard-coded per-week detail**: a stream's occurrences take their fields from a Type.
- **Types:** a tag that starts doing work becomes a Type. A Type has fields, defaults and parts, and can extend another (Exam and Essay extend Assessment). An assessment is a typed item with linked parts, not a mini-Endeavour.
- **Typed in v1:** tasks, events and deadlines. Notes and list items later.
- **Every Endeavour has a home** (built from what it and its children hold). Endeavours inherit their children's items (roll-up).
- **The Endeavours page is its own top-level place in the nav**, above Overview and the apps, which move down (the user, 2026-10-28). **No hotkey for now**; it will probably share 0 with Overview and may later merge into it. **On Android it goes in the tab bar.**
- **"Serves" is the existing Purpose link** (`Collection.purposeIds`): an Endeavour already lists the Purposes it serves, so no new link kind or field was added for it.
- **Phase order: Types before Rhythms**, because a stream's fields are a Type.
- **Easy creation matters most** (see below).
- **Reversibility rules** (below) apply to every phase.

## Data model (sketch)

```
// On each Endeavour, like a task's itemLinks. A new kind is one registry entry, never a migration.
EndeavourLink { kind: 'partOf' | 'related' | …, targetId, createdAt }
// config/endeavourLinkKinds.ts
partOf  { rollsUp: true,  symmetric: false }    // the child's items show in the parent
related { rollsUp: false, symmetric: true }
serves  Endeavour → Purpose                      // same mechanism, a Purpose as the target

Goal { id, title, target: { type: 'endeavour', id }   // a typed reference: 'purpose' can be added later
       by?: date,
       measure: manual | consistency(rhythm, n of m) | target(tracker field, value) | completion(items),
       status: active | achieved | missed | dropped }

Type { id, name, icon, extends?: TypeId, fields: FieldSchema[],
       defaults { important?, notify?, visibility?, tags? },
       parts[] { kind: task | note | followUp, title, offset } }
// typeable items (tasks, events, deadlines) gain typeId and fields{} (values by field id)

Rhythm (was Routine) { endeavour, streams[] }
Stream { label, typeId?, rule: RepeatConfig | relativeTo(schedule block, offset),
         visibility: { calendar, tasks, notify }, noteTemplate?, notesGoTo? }
OccurrenceState  // stored only once touched, keyed stream@date, synced
         { status: open | done | skipped | notNeeded, movedTo?, fields{}, noteRef? }
```

The single "filed under" field trackers and routines have today (`Collection.collectionId`) is read as a `partOf` link. It stays in place (see "Reversibility").

## Rules

- **Roll-up is computed, never stored**: "everything for X" walks X's `partOf` subtree each time.
- **Filtering is inclusive by default**: Semester 2 in any Endeavour filter, Overview or Calendar includes its subjects.
- **Sets, not sums**: an item reached through two parents counts once in any combined view.
- **No loops**: refused when the link is made (as `canAddLink` does for task links).
- **Nothing is required**: an Endeavour can be just a name; its home shows panels only for what it has, plus an add row.
- **Visibility defaults by stream kind**: attend (on the calendar through the timetable), do-by (a small calendar marker; in Tasks only when close or overdue), submit (a Deadline everywhere).

## Screens (see the design page for mockups)

- **A. Endeavours page**: every Endeavour as a tree (grouped by Purpose, or plain), each with its goal progress, behind count and next item. One with two parents appears under each, marked "also in …".
- **B. An Endeavour's home**: breadcrumbs; goals; the rhythm board (weeks × streams; click a cell to tick it, 📝 to open or make that week's note; each column says where the stream shows); this week; assessments; notebook, lists, timetable; an add row ("+ Notebook + Timetable + Rhythm + Tracker + List + Goal + Endeavour inside"). Anything made here is filed here.
- **C. A parent's home**: a card per child; the children's timetables together in their colours (a parent has no timetable of its own); one "Behind" list across children, oldest first.
- **D. Create**: the + menu offers items, the person's Types and templates; choosing a Type fills the form with its fields, defaults and parts (each part a checkbox).
- **E. A rhythm stream**: its rule (including "1 day before each Lecture", following the timetable), its Type, where its notes go, and where it shows.

## Easy creation

Make it where you are (filed automatically); Types fill the form; templates set up a whole Endeavour ("University subject": notebook, timetable, weekly rhythm); copy the shape of another Endeavour (structure, no content); describe it in words (the magic wand reads a course outline into streams, to confirm); nothing mandatory; changing your mind is cheap (split, merge, move, "make this tag a type", each with Undo).

## Phases

1. **Links and roll-up.** Endeavour links (`partOf`, `related`, `serves`), loops refused, inclusive filtering in every picker, filter and Overview, the "filed under" field read as a link. **First: a safety snapshot taken automatically before any store migration runs.** Migration (add-only).
2. **The Endeavour home and the Endeavours page** (screens A–C, from Overview's engine scoped to a subtree); the page as a top-level nav place above Overview.
3. **Types** (fields, defaults, parts, extends; "make this tag a type"; screen D).
4. **Rhythms** (routines generalised; streams with rules, visibility, typed occurrences, synced occurrence state; the board and Behind; screens B, C, E). This is what fixes week 6.
5. **Goals.**
6. **Templates and restructuring** (templates, copy the shape, split / merge / move, the wand for course outlines, suggestions).

## Phase 1 as built (2026-10-28)

- **Links:** `Collection.links?: EndeavourLink[]` (`{ kind: 'partOf' | 'related', targetId, createdAt }`); the kinds' meaning is `config/endeavourLinkKinds.ts`; the rules are `utils/endeavourGraph.ts` (`parentsOf`, `childrenOf`, `endeavourSubtree`, `endeavourAncestors`, `canAddEndeavourLink`: no self, repeat or loop; `inEndeavourScope`). The old "filed under" field (`collectionId`, trackers and routines) is read as `partOf` and left in place. A link to a deleted Endeavour is ignored. Store: `taskStore.addEndeavourLink` (returns why it was refused, or null) and `removeEndeavourLink` (a symmetric link from whichever end holds it).
- **No store migration**: `links` is absent until an Endeavour's first link, and the mapper sends the column only then (`linksColumn`, as `encrypt_contents`), so everything without links syncs before migration **059** has run.
- **Inclusive filtering everywhere**: `hooks/useEndeavourScope.ts` gives the chosen Endeavour plus everything part of it, and every filter tests `inEndeavourScope(scope, item.collectionId)`: Tasks (`TaskList`), Calendar (`CalendarView`, every kind and Schedules), Records (`RecordsView`), Notes (`ChronicleView`, `NoteList`, `MobileNotes`, `getVisibleNoteTagIds` now takes the scope) and Overview (`overview/engine.ts`, so an Endeavour's own Overview includes its parts). Pattern test "Endeavour filters include what is part of the Endeavour".
- **Editing:** "Part of" and "Related to" in the Endeavour editor (`components/EndeavourLinksField`, in `AddCollectionModal`): editing, a change applies at once (a refused loop says why); creating, the picks are made once it exists. It shows what the Endeavour contains. Only finishable and ongoing Endeavours are offered.
- **An Endeavour with parts counts as in use** (`services/inUse.ts`), so deleting it asks.
- **The safety snapshot before store migrations** (`services/upgradeSnapshot.ts`, `utils/persistFirstRead.ts`): the storage layer remembers what each store held when the app opened; once the stores have loaded, any store whose stored version changed is kept, as it was, in a "Before an app update" snapshot (Settings → Backups), the last 3 kept apart from the normal rotation (`SnapshotKind` in `autoBackupStorage.ts`). No store had to change for it.
- **Not built in phase 1:** the archive prompt for a parent whose child has another live parent (archiving never cascades to children today, so there's nothing to ask yet; it comes with phase 2's homes); indenting children under their parent in the Endeavour pickers; agent commands reading or making links.
- **Demo:** a "Semester 2" Endeavour that the two assignments and Uni admin are part of.

## Phase 2 as built (2026-10-28)

- **The Endeavours section** (`AppView` `'endeavours'`, `components/EndeavoursSection/`): first in the nav rail, above Overview, no hotkey; first in the phone's tab bar. `uiStore.endeavourHomeId` (persisted, uiStore **v11**) is the home open, or null for the page; `openEndeavourHome(id | null)` goes there, each home a history stop (`NavPlace.endeavourId`, `describePlace`). Quick Access and Go to now open an Endeavour's home (they used to show Tasks filtered to it).
- **The Endeavours page** (`EndeavoursPage.tsx`, screen A): every ongoing and finishable Endeavour as a tree, or grouped by the Purposes its top Endeavour serves; an Endeavour with several parents appears under each, marked "also in …"; each row shows how far behind it is (rolled up) and the next thing.
- **An Endeavour's home** (`EndeavourHome.tsx`, screens B and C): the trail of parents (the first one's, with "also in" the others), its status (behind or on track), due date and description; Edit, Open in Calendar (Calendar filtered to it, which includes its parts), Open as Overview; panels for **Behind**, **This week**, **Coming up** (rolled up from its parts; each row says which part it's from, can be ticked done, and opens the item); a card per part; and its own notebooks, lists, timetables, trackers and routines. A panel shows only when there's something in it. **The add row** (task, calendar item, notebook, list, timetable, tracker, routine, an Endeavour inside) files what's made under this Endeavour: in this section the open home is the active Endeavour (`selectActiveCollectionId`), which the task, calendar, tracker and routine forms already started from; notebooks, lists and timetables now do too (`AddNoteTagModal`, `AddListModal`, `AddScheduleModal`), and a new Endeavour made from a home starts as part of it.
- **Where an Endeavour stands is worked out from Overview's rows** (`utils/endeavourSummary.ts`: `isBehind` = a task past its date, or a deadline or reminder gone by, never an event that has happened; `summarizeRows`; `rowsOfEndeavour`), all rows computed once per screen (`useEndeavourRows`), so a home and an Overview never disagree.
- **N / Space**: on the page a new Endeavour; on a home a task filed under it (`services/newItem.ts`).
- **Layout tweaks (2026-10-29, the user's review):** Behind, This week and Coming up share one height (the tallest's, up to 22rem), each scrolling inside, so a long week doesn't tower over the others (`.summaryPanels`).
- **Adding to an Endeavour (2026-10-30, the user's review; replaces the A-to-Z row of 2026-10-29):** the + button on a home is a speed dial of the five things made there most often (Task, Calendar item, Goal, Notebook, an Endeavour inside), as every section's + is (on the page: a new Endeavour, or one from a template); the add row at the foot stays as the full list, in labelled groups (Plan, Keep, Track, Shape), A to Z within each. Why: a speed dial keeps to a handful of actions (Material's guidance is three to six), and small labelled groups scan faster than ten equal pills. N still makes a task.
- **Not built in phase 2:** the archive prompt (still no archive cascade to ask about); goals (phase 5) and rhythms (phase 4) on the page and homes; a drawn week of the parts' timetables (the home's "Open in Calendar" shows them, filtered); reordering or hiding panels; the setting to hide the section (the reversibility rule's "new screens behind a setting": phase 2 stores no data, only the open home, so nothing to protect).
- Tests: `EndeavoursSection.test.tsx`, `endeavourSummary.test.ts`, `newItem.test.ts`, `quickAccess.test.ts`.

## Phase 3 as built (2026-10-29)

- **A Type** (`ItemType`, `types/index.ts`; "Type" in the UI): name, icon (`IconField`), what it's a kind of (`extendsId`), defaults (`makeAs`: what one is usually made as, task / event / Deadline; `important`; `tagIds`, tasks only), fields (`FieldSchema[]`, the trackers' field system) and parts (`TypePart`: a task due N days before the item, or a follow-up N days after). One extending another has everything that one has, then its own; its own defaults win. Store: `itemTypeStore` (`item-types-storage`, synced as `item_types`, migration **060**), delete through the Recycling Bin. Rules (pure): `utils/itemTypes.ts` (`typeChain`, `resolveItemType`, `canExtend`: no self or loop; `partDue`, `fieldValuesText`). Applying one: `services/itemTypes.ts`, the only way forms and panes set a Type.
- **Typed items:** tasks, events and Deadlines gain optional `typeId` and `typeFields` (values by field id; `TypedItem`). Absent on anything untyped, so **no store migration**, and the mapper sends the columns only once an item has had a Type (`typeColumns`), so untyped items sync before 060 runs. A cleared Type is `null`, sent as null. Values of fields a Type no longer has are kept, so changing back loses nothing. A deleted Type leaves its items' values in place, hidden until it's restored.
- **Parts** are made with the item (`applyItemType`): ticked in the form (all by default), each dated from the item. On an event or Deadline a task part is "preparation for" it and a follow-up "follow-up of" it (task links to events, so they move when it moves); on a task, task parts are its sub-tasks and a follow-up links back. Nothing is made without a date to count from.
- **Screen D, the create menu:** the Tasks and Calendar speed dials list the person's Types (up to six, above the section's own options); choosing one opens the form for what it's usually made as with the Type chosen (`uiStore.showAddTyped`, `pendingItemTypeId`), titled "New Exam", its defaults applied (Important; a task's priority goes to high and its tags are added). Every task and calendar form (not reminders) has the Type field (`components/ItemTypeField`); the task, event and Deadline panes show it to change the Type or its values (`ItemTypePaneField`; not on a task's own scheduled event or Deadline: the task has the Type). The field shows nothing until the person has a Type.
- **Managing Types:** Manage → Types (`ManagePane`): list, edit (`components/ItemTypeModal`), archive, delete (asks; Types extending it then stand alone). **No built-in Types** (decided with the user 2026-10-29): "Add a starter set" adds the University set (Assessment; Exam and Essay extending it; Reading; Lecture: `config/typeStarters.ts`) on request, skipping names already there. Phase 6's "University subject" template will use the same set.
- **Make this tag a Type** (a tag row's options in Manage and the Tasks sidebar): a Type named after the tag that keeps adding it, given to every task carrying the tag that has no Type yet; the tag stays; Undo in the toast takes it all back. Refused, with a toast, when a Type of that name exists.
- **Shown:** a task row's Type pill (its values as the tooltip). Not yet on calendar entries, Overview rows or Endeavour homes.
- **Shared on the way:** `components/FieldInput` (moved out of `AddEntryModal`: THE input for one `FieldSchema` field, trackers and Types) and `config/fieldTypes.ts` (the field kinds offered, moved out of `EditTrackerPane`).
- **Not built in phase 3:** note parts (`kind: 'note'`; a part is a task or a follow-up today); the `notify` and `visibility` defaults (with Rhythms); Types on reminders, notes and list items; filtering or grouping by Type (Overview, Tasks); the Type on calendar entries and Overview rows; agent commands for Types; the way back (copying values into notes as text) as a button; moving tracker columns, list fields, activity types or Glossary types onto Types.
- Tests: `utils/itemTypes.test.ts`, `services/itemTypes.test.ts`, `components/ItemTypeField/ItemTypeField.test.tsx`, `mappers.test.ts` (Type, typed task and event), the demo test.
- **Demo:** the University starter set; the mid-semester exam an Exam, the climate essay an Essay (with its Proofread part), the lab worksheet an Assessment, and the IPCC reading a Reading.

## Phase 4 as built (2026-10-29)

- **A rhythm is a routine with streams** (`Collection.streams?: RhythmStream[]`, kind `routine`; column `streams`, migration **061**, sent only once set). A stream: name, kind (`attend` / `doBy` / `submit`: `config/streamKinds.ts`, which also gives where each shows by default), its Type, its rule (its own repeat from its start, or N days from a timetable class: `StreamRule`), a start date (nothing before it is behind), a time, where it shows (`StreamVisibility`: calendar none / mark / item, Tasks never / near / always, notify) and the notebook its notes go in. **A routine never given streams is read as one stream** (`legacyStream`: its own id, name and days, showing nowhere new), so nothing stored changes until it's edited; the routine's own stream takes its name and days from the routine's Repeat.
- **Ticks are tracker entries of the rhythm**, not a new table (decided while building: the routine's completions already were, so they sync, show in Records, and old completions read as done on the routine's own stream with no change). An entry's `data` holds `_stream` (left out for the routine's own stream), `_status` (`done` / `skipped` / `notNeeded`, or `open` when kept only for its fields or note), `_note`, and the Type's field values. Rules: `utils/rhythms.ts` (`streamDates`, `tickIndex`, `occurrenceState`, `rhythmOccurrences`, `showsInTasks`, `boardWeeks`); changes: `services/rhythms.ts` (`setTick`, `toggleDone`, `setTickField`, `openOccurrenceNote`, `saveStreams`). Undoing a tick that holds nothing else deletes its entry without a Recycling Bin entry; ticking the routine's own stream keeps its day's checklist in step (`routineStore.reopenRoutine`).
- **Behind**: an occurrence past its date and not dealt with, for **two weeks** (`BEHIND_DAYS`); older ones are let go ("missed" on the board, counted nowhere).
- **Screen E, the stream editor**: Streams in the routine's edit pane (`components/RhythmStreamsField`).
- **Screen B, the board**: on an Endeavour's home, one per rhythm part of it (`components/RhythmBoard`): weeks (three back, two ahead) by streams, each column saying where it shows; a click ticks an occurrence; right-click (a long-press on Android) offers skip, not needed, its note (made in the stream's notebook, filed under the rhythm's Endeavour) and its Type's fields.
- **Screen C, a parent's home**: a new Overview source, `rhythm` (rhythms given streams; two weeks back, a week ahead), so an Endeavour's Behind and This week (and any Overview) include its rhythms' occurrences, rolled up from its parts; ticked from there too (`overview/done.ts`). A rhythm's ticks are left out of the tracker-entry source so they aren't listed twice.
- **Where a stream shows**: Tasks (`RhythmDueList` above the task list, under the Endeavour filter: behind, today and close for "near", the next two weeks for "always"); the calendar (a `rhythm` entry, small for "mark"; a click ticks it); notifications (`plan.ts`: at its time, or 09:00 on the day; the bell offers Done, Open, OK; Android gets Got it and opens on tap).
- **Not built in phase 4:** renaming Routine to Rhythm in the UI (the user's call); a stream "following" a moved lecture beyond the timetable (an exception on the class drops that occurrence); a drawn week of the parts' timetables on a parent's home; a rhythm's own creation flow ("+ Rhythm" still makes a routine, streams added in its pane); moving an occurrence (`movedTo`); the way back (a rhythm flattened to a routine) as a button; agent commands for rhythms; Android's own Done button on a rhythm notification.
- Tests: `utils/rhythms.test.ts`, `services/rhythms.test.ts`, `components/RhythmBoard/RhythmBoard.test.tsx`, `overview/sources.test.ts`, `services/notifications/plan.test.ts`, the demo test.
- **Demo:** "GEOS215 each week" (part of Semester 2): Lecture (from the timetable), Reading (the day before each, a Reading Type, notes in the GEOS215 notebook), Tutorial quiz (each Friday at 17:00, notifies); ticked for the last fortnight, one reading missed.

## Phase 5 as built (2026-10-29)

- **A goal** (`Goal`, `types/index.ts`): what's wanted, its target (`{ type: 'endeavour', id }`: a typed reference, so a goal on a Purpose needs no migration), an optional "by" date, its measure, check-ins, and a status (`active` / `achieved` / `missed` / `dropped`). Store: `goalStore` (`goals-storage`, synced as `goals`, migration **062**), delete through the Recycling Bin. **Settling it is the person's call**: the app suggests (reached: "Mark it achieved?"; past its date without: "Mark missed"), never sets the status.
- **Four measures** (`GoalMeasure`), progress worked out each time and never stored (`utils/goals.ts` `goalProgress`): **by hand** (the latest check-in's value against a target, at least or at most; a unit); **keeping up a rhythm** (at least N of the last M occurrences of one stream or any, an occurrence marked not needed not counting); **a tracker** (a number, duration or rating field: its latest, its best, or its total this week, this month or all time, against a target; a duration entered in hours); **getting its tasks done** (the share of the Endeavour's and its parts' top-level tasks done, not archived ones; or only milestones).
- **Where they show:** an Endeavour's home, above Behind / This week (`GoalsPanel`: a card per goal with a bar, its line, days left, the suggestion, "+ Check in" for one measured by hand, and edit); its add row has "+ Goal"; the Endeavours page shows each Endeavour's active goals as one figure (the mean of those with something to go on), the lines in its tooltip. The editor is `components/GoalModal` (uiStore `showAddGoal(endeavourId)`, `openEditGoal(id)`), which also settles or reopens a goal.
- **A goal whose Endeavour is deleted is hidden, not deleted** (only an Endeavour's own goals are listed); restoring the Endeavour brings them back. A measure whose rhythm or tracker is gone says so.
- **Not built in phase 5:** goals on Purposes; goals in Overview (by date) and in an Endeavour's Behind; a chart of check-ins over time; a measure from a Type's field across items (marks of Assessments); notifications as a date nears; agent commands.
- Tests: `utils/goals.test.ts`, `components/GoalModal/GoalModal.test.tsx`, `mappers.test.ts`, the demo test.
- **Demo:** on Semester 2, "Average a distinction this semester" (by hand, two check-ins, 71 against 75), "Keep up with the GEOS215 readings" (5 of the last 6), "10 hours of study a week" (the Study hours tracker); on the climate essay, "Get every essay task done" by its due date.

## Phase 6 as built (2026-10-29)

- **What's filed under an Endeavour is one registry** (`services/endeavourFiling.ts`, `FILED_KINDS`): tasks (top-level; sub-tasks and a task's own calendar entries go with it), events, reminders and Deadlines (not a task's own), notes, notebooks, Glossary terms, lists, timetables, trackers and routines, goals. Each kind lists what's filed directly under an Endeavour and files one elsewhere (`filedUnder`, `moveFiled`, which returns how to put them back). Pattern test: every type with a `collectionId` is in it, or named as not filed.
- **Restructuring** (`services/endeavourRestructure.ts`, `components/RestructureModal`, from a home's "Restructure…"), each one action with Undo in the toast:
  - **Merge into…** another Endeavour (not itself or one of its parts): everything filed under it moves, its parts become parts of the other, and it is archived (restorable).
  - **Split off a part…**: a new Endeavour, part of this one, with the things chosen moved into it (nothing leaves this one's views, since they include its parts).
  - **Copy its shape…**: a new one set up the same way and empty: its parts (copied the same way), notebooks, lists without items, timetables, trackers and rhythms without entries (a stream on a copied timetable follows the copy), goals without check-ins (measured from the copies); each part of copying can be left out. Part of the same Endeavours as the original.
  - **Move** was already editing "Part of" (phase 1).
- **Templates** (`config/endeavourTemplates.ts`: a form of inputs (including **rows**: a list the person adds to, each row with its own fields, some shown only when they apply) and a pure `plan`; `services/endeavourTemplates.ts` `applyTemplate` makes a plan under one new Endeavour, `planLines` previews it; `components/EndeavourTemplateModal`, from the Endeavours page or a home's add row, part of that home). Undo deletes everything it made for good, Types it added included. **University subject** (rebuilt 2026-10-30 at the user's request, for flexibility: a template speeds things up but can't foresee a course): **regular classes** (one row a session: type (Lecture, Tutorial, Seminar, Workshop, Lab, Practical, Studio, Exercise class, Other), day, time, place; the timetable), **one-off classes** (a lab, a field trip: on a date or a teaching week's day; calendar events), **routine tasks** (what, to do or to hand in, every week / every 2 weeks on a day and time, or N days before or after each class of a type, what it's worth, its Type; a rhythm's streams, a stream after a class type following every class of that type: `StreamRule.blockIds`), **assessments and one-off tasks** (a Type, what it's worth, and a date: fixed, a teaching week, or so long before or after teaching's start or end or a one-off class: "2 weeks after Lab 1"; Deadlines with their Type, weight and parts), the mark aimed for (a goal); adds the University Types (the starter set's other way in, as decided in phase 3). The fixed "reading before each lecture" box and weekly-quiz day are gone: both are routine-task rows. **Training plan** (sessions as a rhythm, the aim and keeping it up as goals), **Project** (milestones as tasks, a goal of reaching them).
- **Described in words**: the University subject's magic wand reads a pasted course outline (`utils/courseOutline.ts` `readCourseOutline`), adding rows to the form; everything is shown before it's made. It reads labelled lines ("Course number⇥701-1253-00L", "Time & Location⇥Thursday 16.15-18.00, HG D 5.2": the user's ETH outline, 2026-10-30, which the first version missed), codes like `GEOS215` or `701-1253-00L`, links stripped; regular classes one a day, several day-and-time pairs on a line, a class line without a class word read as a lecture; one-off classes (a class with a date or teaching week); readings (a routine row before each lecture); assessments by date or teaching week, weight and kind. A bare "12-13" is a time only on a line about a class or a day. It's a rule-based reader and will miss outlines it hasn't seen; the AI reader (BACKLOG "Magic wand readers through the AI") is the real answer, through the same wand.
- **Not built in phase 6:** suggestions ("this looks like it wants its own Endeavour"); merging two whole subtrees' parts into one; the wand for the other templates; a person's own templates (saving an Endeavour's shape as a template: copying the shape covers it for now); templates that make trackers.
- Tests: `services/endeavourRestructure.test.ts`, `services/endeavourTemplates.test.ts`, `utils/courseOutline.test.ts`, `components/EndeavourTemplateModal/EndeavourTemplateModal.test.tsx`, `patterns.test.ts`.

## Phase 7 (design, agreed with the user 2026-10-30): Schedules rebuilt, one repeating model, the subject editor

Raised by the user after trying the University template twice: too many fields per row, nothing to say "almost weekly", no way to cancel or change one lecture, and a subject made from a template couldn't be edited in that template's editor.

**Decisions (the user, 2026-10-30):**
- **One repeating model: the calendar's.** Everything that repeats in a subject (lectures, tutorials, quizzes, readings) is a repeating calendar item, and one occurrence is edited, cancelled or given its own notes the way any calendar item's is ("only this one", "this and following"). The user: a lecture can carry its own agenda.
- **Schedules stay, by name, but are rebuilt on that model.** A Schedule is a named set of repeating calendar items (its *items*: "GEOS215 lecture, Wed 12:15–14:00, weekly"), with its period, breaks, colour and on/off. Not a separate set of blocks drawn only on the calendar. The subject template feeds a Schedule.
- **Rhythms fold into it.** Repeating work (a reading before each lecture, a weekly quiz) is repeating calendar items too; the rhythm board and Behind read the Endeavour's repeating items. Overlaps the routines overhaul (BACKLOG).
- **Every item has notes**, for what can't be foreseen ("best 8 of 9 count").
- **The teaching period and breaks are inherited live** from a semester to its subjects (and so to their Schedules), and can be changed per subject (a summer subject).
- **No AI yet**; the outline wand stays rule-based.

**Model:**
- **A repeat can be a list of dates** (`RepeatConfig` freq `dates`, the dates listed): the "almost weekly" quiz, an outline's dated list. Shown and edited in the one `RepeatField`.
- **A repeat can follow another item** ("1 day before each GEOS215 lecture"): stored as its dates plus what it follows and the offset, kept in step by one watcher when the followed item moves or changes (as `initEventTaskFollow` keeps linked tasks in step), so every reader of repeats stays pure.
- **A Schedule's items are calendar items with `scheduleId`**; its period and breaks are applied to them as their bounds and skipped dates (a break added, moved or removed changes its items' skipped dates; the person's own skips are kept apart). A Schedule on an Endeavour takes the Endeavour's teaching period and breaks unless given its own.
- **Teaching period and breaks** live on an Endeavour (`period?: { start, end, breaks[] }`), read from the nearest Endeavour above that has them unless set on this one.
- **The subject editor** is the Endeavour's own editor for a subject: its details and period, then two lists, **Schedule** (what you go to) and **Work** (what you do or hand in), each item one line with "+ Add"; clicking one opens a small editor (title, type, time, place or worth, notes, Repeat). It shows the Endeavour's real items, so a change made in the calendar shows there; an Endeavour remembers the template it came from, so Edit opens it.
- **A semester** (a template, and an Endeavour kind of use, not a new type): its period, breaks and exam period; "+ Subject", each inheriting them; suggested: an admin list, a weekly planning rhythm, a goal for the average.

**Built so far (2026-10-30): (a) and (b)** (see below). **Build order:** (a) repeats as a list of dates and repeats that follow another item, in the calendar and `RepeatField`; (b) period and breaks on Endeavours, inherited; (c) Schedules rebuilt on calendar items, existing ones converted (see Open); (d) the subject editor and the semester template, the University template replaced by them; (e) the rhythm board and Behind reading repeating items, rhythm streams retired or converted.

**Converting existing Schedules: automatic** (the user, 2026-10-30), on the first load of the build that has (c), after the safety snapshot. **Commitment mode** (a gym class you don't always go to; the user, 2026-10-30): the item is tentative; going to one confirms that date (that occurrence, taken out of the series as "only this one", confirmed). Replaces the block's committed-dates list.

### Phase 7 (a) and (b) as built (2026-10-30)

- **(a) A repeat on a list of dates** (`RepeatConfig.freq` `'dates'`, `dates`: every occurrence, the item's own date the first; skipped dates still go in `exceptions`). In the one `RepeatField` as "On these dates": the dates as chips to take off, a date field to add one; no "every" or end. `utils/recurrence.ts` reads it like any rule, so the calendar, notifications, Overview and rhythms need nothing. Summaries: `repeatSummary`, `formatRepeatRule` ("On 4 dates").
- **(a) A repeat that follows other events** (`RepeatConfig.follows`: the events and the days before or after): its dates are the followed events' dates moved by the offset (`utils/repeatFollow.ts` `followedDates`, `inStep`), counting a followed lecture's skipped dates out and its occurrences taken out and moved ("only this one", "this and following") at their own dates; a series with no end is followed a year ahead. **One watcher** (`services/repeatFollow.ts` `initRepeatFollow`, started in App.tsx; skipped while sync merges) keeps every follower in step whenever an event changes: its dates, and its own date as the first (an event keeping its length). `RepeatField` says what it follows ("1 day before each Lecture") and offers to stop, keeping the dates. Nothing makes a following repeat yet but code (the subject editor will).
- **(b) Period and breaks on an Endeavour** (`Collection.period?: EndeavourPeriod`: start, end, breaks; column `period`, migration **063**, sent once set). Without its own, an Endeavour takes the nearest one above it, live (`utils/endeavourPeriod.ts` `effectivePeriod`), and its own replaces it whole. `breakDates`, `teachingWeek` (week 1 the week of the start, a break still numbered). In the Endeavour editor (`components/PeriodField`, applies at once): the inherited one with "Set its own", or its own dates and breaks with "Take <above>'s instead". Nothing applies the breaks to items yet: that's (c).
- Tests: `utils/repeatFollow.test.ts` (dates repeats, following, the watcher), `RepeatField.test.tsx`, `utils/endeavourPeriod.test.ts`, `PeriodField.test.tsx`, `mappers.test.ts`.

## Reversibility and migrations

| Phase | Stores | Way back |
|---|---|---|
| 1 Links | a list of links on each Endeavour | ignore or drop them; nothing else depends on them |
| 2 Homes | nothing new | none needed |
| 3 Types | type definitions; type and field values on items | field values copied into the item's notes as text |
| 4 Rhythms | streams on routines (061); ticks as tracker entries | drop the streams: the routine reads as one stream again; ticks already are tracker entries |
| 5 Goals | new, separate records (062) | drop them; nothing else reads them |

- **Migrations only add** (new columns and tables). `Collection.collectionId` and routines' steps (`routineTasks`) stay and are still read. Old fields are removed only in a later, separate clean-up migration once a phase has proved itself and the user agrees.
- **Upgrade on read, not by rewriting**: an old routine is shown as a one-stream rhythm; its stored data is untouched until edited.
- **Older app versions keep working**: an upsert touches only the columns it sends, so a device on an older build can't wipe new fields.
- **A safety snapshot before every store migration** (phase 1).
- **New screens behind a setting** until they're ready; the data model can land first.
- **Visible changes that aren't data loss:** inclusive filtering makes a saved Overview for a parent show its children's items; routine ticks start syncing (device-only today), so two devices on different builds can briefly disagree. Test with both devices.

## Risks

Too many concepts (each answers one question; Goals, Types, Rhythms optional) · the biggest data change yet (phase 1 touches every Endeavour picker, filter, Overview, the agent commands and sync; add-only, with pattern tests for inclusive filtering) · multiple parents confusing (possible but quiet) · counting twice (sets) · Routines users losing something (a routine is a one-stream rhythm) · a fifth field system (Types are built so tracker columns, list fields, activity types and Glossary types can move onto them later) · slow roll-ups (cache the item-to-Endeavour index per load if needed).

## Open

- ~~Which ready-made Types ship~~: decided 2026-10-29, none built in; a starter set added on request now, and by the "University subject" template in phase 6 (see "Phase 3 as built").
- **What a goal on a Purpose would mean**, when that comes (the reference is already typed for it).
