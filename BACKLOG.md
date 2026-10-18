# Requirements Backlog

Items here are confirmed requirements that are not yet implemented.
Format: brief description + context/motivation.

**Priority (added 2026-10-13, at the user's request):** an entry may carry **`Priority: High`**, **`Medium`** or **`Low`** on its first line. No mark means not yet prioritised; the user will fill these in over time. Don't infer a priority the user hasn't given.

**Audited 2026-10-14** against the code and `docs/features/implemented-features.md` (the user's instruction of 2026-10-09). Built entries were removed or cut down to what is still open; the long original specs for features that are now built (the Notes data model, Records, Fitness, Dark mode, the Android plan, the external-calendar analysis) were removed, or moved verbatim where they still hold reference detail (Fitness → `docs/features/fitness.md`, external calendar analysis → `docs/features/external-calendar-sync.md`, the Android plan → `docs/android/12-original-capacitor-plan.md`). Everything removed is in git history. Removed as fully built: navigation granularity, automatic backups, editor focus/wrapping, the series link, Task rich text and inheritance, weekly/daily calendar views, desktop/Android API access, the task ↔ note link, milestone tasks, backup restore across devices, the Android back button, dark mode, the notification-actions audit. **Records is on hold** (decided 2026-10-04, `docs/android/10-gap-analysis.md` §D-hold): ask before starting any Records item.

---

## Fitness Supabase sync — not built (Notes and Portfolio sync built 2026-09-19)

Notes and Portfolio sync are built ("Notes Supabase sync", "Portfolio Supabase sync" in implemented-features.md). Fitness is the one domain left with no cloud copy:
- `Activity` + `ActivityType` (custom types only; built-ins never sync, the rule `list_types` follows). Upsert by `(source, sourceId)` so Strava-imported activities never duplicate (`docs/features/fitness.md`).
- Plaintext, no encryption (confirmed 2026-09-19).
- Needs: a migration with its own grant, mappers, the five sync touch points in CLAUDE.md "How sync works", and `fitnessStore` added to `clearSyncedLocalData()` in the same change.
- Paused 2026-09-19 so the user could test Notes and Portfolio sync live; nothing has blocked it since.

---

## Client-side encryption — Notes and Lists built (2026-09-20); other apps not yet

Built: "Client-side encryption for Note content", "Client-side encryption for Notes — comprehensive" and "Client-side encryption for Lists" in implemented-features.md. The vault (`services/vault.ts`) is app-agnostic; only Notes and Lists have the toggle.

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

## uiStore — what a reload doesn't remember

Built: navigation and session memory (CLAUDE.md "uiStore"; `docs/architecture/ui-store.md`). Modal/pane open state and "currently editing" pointers are deliberately not persisted. Open:
- `sortField` / `sortDir` aren't remembered (never asked for).
- Syncing UI state across devices is undecided; it would need a Supabase table and mapper, like `taskStore`.

---

## Endeavour filter — carry selection across sections/apps

Currently `activeCollectionIdByView` (`uiStore`) deliberately remembers a **separate** focused Endeavour per section — Tasks, Calendar, Records, and Notes each keep their own independent value, so switching sections and back restores whatever that section had (see "Endeavour focus is per-section" in CLAUDE.md's Implemented features). The user wants the opposite in practice: pick an Endeavour in Tasks, switch to Calendar, and have Calendar already be focused on that same Endeavour.

**This directly reverses a previous deliberate design decision** — implementing it means deciding what replaces per-section memory, not just adding a new field. Options to weigh when this is designed:
- A single shared `activeCollectionId` (drop the per-view map entirely) — simplest, but loses the "each section remembers its own last filter" behavior some users may rely on.
- "Sticky until explicitly overridden": switching sections carries the current Endeavour forward, but picking a different one in the new section only changes that section (needs a way to distinguish "inherited" from "explicitly set" per section).
- Keep per-section memory but seed a newly-visited section's *first-ever* value from whatever was last active elsewhere, then let it diverge independently after that.

**Architecture note:** every section of every app reads the one `uiStore` (one package; there is no shared platform layer), so carrying the filter across Tasks, Calendar, Records, Notes and the rest is one `uiStore` change. **Needs a decision** on which option before building.

---

## Lists — what's left

Built: Lists, their sync ("Supabase sync for Schedules and Lists"), and links between lists and tasks, calendar items and notes ("Lists: links from tasks, calendar items and notes", 2026-09-28). Not built:
- Linking a single list *item* to a note, task or event (the `listItem` ref type is a stub; see Overview step 2 under "Workflow & Task Dependencies").
- Drag to reorder items within a list; bulk import (CSV); export a list as JSON or Markdown; user-saved list templates; a per-list view setting (cards vs compact); full-text search within items.
- Custom list types and item archiving: see "Existing stores/actions with no UI" and "Roll the shared item-actions pattern out to the remaining apps".

---

## Nav columns — keyboard row navigation outside Notes and Lists

Built 2026-09-24 to 2026-10-05: focus follows a click in Notes and Lists, the row options menu (CLAUDE.md "Row options menu"), full names on hover (`TruncatedText`), item counts in the notebook tree. Still open: `Sidebar`, `ManagePane` and `RecordsView` have no keyboard row navigation, and there is no shared convention for it yet.

---

## Notes — from the comparison with other note apps (logged 2026-10-13)

- **Version history for notes** — **Priority: Low.** See and restore earlier versions of a note (Notion, Craft, Evernote). The user's view: the automatic backups are enough for now; logged because it's a real safety net.
- **Handwriting (ink) in notes** — not prioritised yet; the user: "very important, but a future thing". OneNote, Goodnotes and Apple Notes are the references. Needs its own design pass (pen input on Android and touch screens, storage, search).
- ~~**A mind-map view of how notes and everything else link to each other**~~ — **v1 built 2026-10-13** as the **Map** Place (see "The Notes Map" in implemented-features.md). Agreed with the user: a Place like the Glossary, not a section. Next, not built:
  - Colour or group nodes by notebook; filter by notebook or tag.
  - Arrange it yourself and keep the arrangement (a canvas: drag notes, add free boxes and arrows), possibly sharing the Diagram block's drawing (Obsidian Canvas, Heptabase whiteboards).
  - Glossary terms and idea hubs as nodes; links between items of other apps (task links).
  - A smaller map of the open note in its side panel.
- ~~**Marking a definition and the cards look different**~~ — **settled 2026-10-13**: the popover is retired; marking selected text makes a card (see "Marking text as a definition makes a card" in implemented-features.md).
- ~~**Typed links between notes with backlinks, and embedding a passage from another note**~~ — **built 2026-10-13** (see "Links between notes, embedded passages" in implemented-features.md). Next, not built:
  - Typing after `[[` filters right there in the text (Obsidian-style), instead of in the picker.
  - Linking to a passage inside a block (a list item, a quote's text, a timeline entry); today a passage is a paragraph or a heading.
  - Unlinked mentions that also catch a note's other names (aliases), and a "Link all" button.
  - A link that names a passage which has since gone offers to relink it (today the card says it's gone).
  - Editing an embedded passage in place (today it's read-only, with "Copy as text here").

---

## Notes — open items

- **Progress and points for Notes (gamification): decided in outline 2026-10-17, not designed or built.** The user's decisions: **opt-in**; points come from **what is in the notes now** (worked out from the content, not counted from actions, so deleting something takes its points away): a very simple block earns very little, and blocks that link to each other and carry many extra parts add up and then **multiply**, so well-built, connected notes earn far more; farming isn't a worry (the app serves the person's own learning); points, levels and streaks **sync across devices**; all of it lives in **its own separate part of the app**, a progress view, not mixed into the notes. Still to design: the scoring formula (what each block, part, link and card is worth, and the multipliers), what a level is, what keeps a streak (a day with something added?), where the separate part sits (its own section, or a Place), and the storage for streak history (a synced table and a migration). Quizzes on your own notes, one of the ways to earn, aren't built yet.

- ~~**Notes side by side**~~ Built 2026-10-16 ("Inline Glossary chips, block categories, notes side by side…" in `docs/features/implemented-features.md`). Was: A **View ▾** in the ribbon: one note, two side by side, three (two quadrants and a column), four quadrants. One ribbon, acting on the note last clicked in; each pane its own small header (title, tabs, close); a note added to a pane through the note picker (suggestions and search); the layout remembered. Desktop only (Android gap F31). **First:** the editor assumes it is the only one open: `services/liveNoteEditor.ts` holds one slot (read by about 9 modules: editing a note from outside, link previews, passage checks, Review), NoteEditor reads the open note from `uiStore.editingNoteId` and has about 9 document/window key listeners that would all fire twice. So: a registry of open editors (an approved pattern), NoteEditor taking its note as a prop, and its listeners answering only for the focused pane.
- **Organising notes without folders** (the user, 2026-10-16; Phase 0 built 2026-10-17: the views registry and browse model, CLAUDE.md "Notes views"; Phase 1 built 2026-10-17: the view switcher (Tab cycles) and the Mosaic, the view in history and remembered. Phase 2 the same day: the Map as blobs (circle packing), the Mosaic's peek. Map ideas not built: links that follow notes as they fan out, a minimap, remembering the zoom per place. Next: more views (Desk, Lenses, River), each one registry entry; a phone Mosaic (Android gap F32); possibly the Mosaic as the default view once it has settled in (the user's call). The notebook tree is a folder hierarchy, which the suite moved away from (Endeavours, Purposes and Tags). Agreed so far: the current tree and list become one *view option*; there may be no left column at all; the look should be creative and modern, not a plain list or table. Ideas on the table: notebook tiles that open out ("explode") into their sub-notebooks and notes on hover, animated (the user's); further ideas proposed 2026-10-17 in the session report. Next: pick a direction and mock it up before building.
- **Detecting blocks with AI** (suggested future feature, the user 2026-10-16). Blocks are offered as you type from simple text patterns today (`utils/blockOffers.ts`: quote, types, pros and cons; acronyms in `utils/acronymInference.ts`). An AI reading of a paragraph could spot the bigger blocks patterns can't (a timeline in a run of dated sentences, a cycle, a comparison, a hierarchy), offered through the same chip (`typingOffer.ts`). Needs: when to ask (a paragraph finished, not every key), cost and privacy (never for encrypted notes, like the agent layer), and a way to turn it off.
- **More block offers from patterns** (2026-10-16): candidates after quote, types and pros/cons: a timeline ("In 1066 …, in 1215 …"), a conclusion ("Therefore …" after reasons), a question ("Q: …").
- **Stick a passage or block from another note on the screen** (the user, 2026-10-16: later). Would build on sticky notes (`services/stickyNotes.ts`) with the `\embed` machinery.
- **The question's Inline design** (agreed 2026-10-16: every card-category block goes inline after text or on a bullet). The Glossary cards have it (a chip pointing at the record). A question's content lives in the note itself, not a record, so its chip has to carry that content, moved between the block and the chip rather than copied. Open: whether the question becomes a record like the Glossary's (then it works as the cards do) or the chip holds the text.
- **The "unsure" card** (asked for 2026-10-16): like the question, but flagging that what's written needs checking later. Waiting on what it should be by default (the request was cut off at "by default this should be").
- **Ribbon tidy-up** (raised 2026-10-16, to discuss): the Notes ribbon keeps growing; group or fold its buttons.

The original Notes design (the 2026-09 data model, Supabase schema, `packages/notes/` structure and event bus) was superseded by what was built: notebooks and annotation tags are `NoteTag` kinds, links are `crossAppRefs`, and there is no package split or event bus (CLAUDE.md "Suite architecture"). What that spec asked for that still isn't built:
- **Linking**
  - Create ▸ List item and Create ▸ Tracker entry from a selection (stubs in the Create menu; Overview step 2, and the list item and tracker entry `\` kinds).
  - Starting a link from inside a note, for any type (the note shows and inserts links made elsewhere); linked checklists inside the calendar panes (they get the plain link only); an agent completing a task doesn't reset a reusable list; a list restored from the Recycling Bin comes back without its links.
  - One link per item per note only; no link to a tab the note doesn't have yet.
  - The note picker: filter by Endeavour and by notebook or tag.
  - AI that proposes links by itself (the user's stretch goal; `textToTask.ts` is the non-AI first step).
- **Tagging a picture** (wrap it in a node with a tag attribute, or tag its paragraph). Decision deferred.
- **Layouts**: a card grid landing, a canvas, an immersive view; a layout switcher.
- **Multiple chronicles** (Work / Personal / University): a `chronicles` table, `note_tags.chronicle_id`, a switcher.
- **Search with filters** (tag, date range, content type).
- **Templates suggested** by notebook or tag type (the manual picker is built; custom templates are "Custom note and tab templates" below).
- **Collaborative notes** (shared editing, comments); **export** as PDF, Markdown, HTML.
- **Study from notes** (generated questions, spaced repetition): see Flashcards under "Glossary and Important — follow-ups". Obsidian import/export and citations (BibTeX from sources; the quote block's "copy as citation") are ideas, not designed.

### ~~Structured tag entries~~ — superseded by the Glossary (2026-10-07) and Glossary cards (2026-10-13)

The framework (`STRUCTURED_TAG_TYPES`) stands. Its popover was retired 2026-10-13; deleting a record clears its links in every note (`services/glossaryDelete.ts`); the Glossary view is the place to browse. Its open items are under "Glossary and Important — follow-ups" (one term in two notes, editing from the Glossary view). One more: an entry records its note but not the tab it's in (`StructuredTagEntry` has no `tabId`).

### Right-click menus — built 2026-10-06 (rows, note rows, the Notes editor); next places

Built: see CLAUDE.md "Right-click menus" and the 2026-10-06 entry in `docs/features/implemented-features.md`. Places that have no right-click menu yet: each is one `useContextMenuScope` (or one provider), nothing else.
- ~~**Tasks:** TaskItem rows~~: built 2026-10-14 (the `task-row` scope). Not yet: the completion alternatives ("Complete + add follow-up", "with the N it's waiting on") as a submenu.
- **Calendar:** events, reminders and deadlines on the grid (open / archive / delete / duplicate); an empty slot (new event here).
- **Notes:**
  - Note tabs (rename / delete / reorder; "Save tab as template" once templates exist).
  - Annotation tags in text (edit / remove).
  - Links (open / edit / copy / remove).
  - Tables (the table commands).
- **Lists:** items (edit / tick / delete).
- **Records:** entries.
- **Overview:** rows (open in its app).
- **Section-wide menus** (a `section` provider, e.g. "New notebook" on empty Chronicle space).
- Possible menu features as needs arise: checkable items, a header row naming the item, items revealed while holding a modifier.

### Inline objects in notes (`\`) — Reminder built 2026-10-06; next kinds and custom objects

Built: see CLAUDE.md "Inline objects in notes (`\`)" and the 2026-10-06 entry in `docs/features/implemented-features.md`. The user's direction: this will be extended to almost every kind of thing, with Reminder as the trial that settles the UX. Confirmed next:
- **More built-in kinds**, each one `NoteObjectKind` in `components/NoteEditor/objects/` plus an entry in `NOTE_OBJECT_KINDS`:
  - ~~**Event**~~: built 2026-10-06 (`eventKind.ts`, `EventBody`). Not handled from the pane: multi-day events (end date), an event's birthday/travel type (set via ↗).
  - ~~**Deadline**~~: built 2026-10-06 (`deadlineKind.ts` via `datedKindFactory.ts`; `NoteBacklinks` lists deadlines now).
  - **Task**: `inferTaskFromSelection`; the create path must go through the task store's own rules (shadow calendar entries via `taskCalendarLinks`).
  - **List item and tracker entry**: the Ctrl+Q stubs.
- **Custom objects** (the user's own things; proposed 2026-10-06 and agreed as the direction, to design later):
  - **Lists:** `\groceries milk` adds an item to that list.
  - **Trackers:** `\weight 72.4` logs an entry.
  - **Annotation tags:** `\important` tags what's typed next.
  - Likely shape: the registry gains kinds generated from the user's lists/trackers/tags at menu time (a `dynamicKinds()` source next to `NOTE_OBJECT_KINDS`).
  - Open questions:
    - Keyword collisions with built-ins: built-ins win, and the menu shows both?
    - Encrypted lists: never offered while locked.
    - Whether a tag is an "object" at all, or a separate `\` mode.
- **Menu order by use**: rank kinds by how often each is picked (agreed 2026-10-06). Deferred while there was one kind; there are now three object kinds and a dozen blocks, so it's worth reconsidering. Needs a small persisted usage count (a new persisted key → `PERSISTED_STORAGE_KEYS`).
- ~~**Editing from the pane**~~: built 2026-10-06 for reminders and deadlines (click-to-edit date/time in the heading; notes, links and Endeavour in the expanded body; flags in the right-click menu). Still to do: a `Body` and `editWhen` for **tasks and events** (their panes offer only done/open today; a task's date must go through its store rules for the shadow calendar entries), and per-type extras like a reminder's whole-day notify time.
- **Note text vs. item title**: the text is the title at creation. Renaming the item elsewhere (or editing the text) doesn't update the other. Options: show the item's title in the pane when they differ, or a "use this title" action; a full two-way sync is probably too clever.
- **Parser misses seen in testing (2026-10-06)**, in `utils/textToTask.ts` (shared with Ctrl+Q, so add a test in `textToTask.test.ts` with each fix):
  - ~~"pay rent every month on the 1st"~~ and ~~"yesterday"~~: fixed 2026-10-14 ("the 1st", "by the 15th" read as the next time that day comes round).
  - A trailing "important" sets the flag but stays in the title — **fixed for `\` 2026-10-06** (`tidyObjectTitle`); still so for Ctrl+Q, on purpose. Only a *leading* "Important:" is stripped, on purpose, so prose like "this is important" survives Ctrl+Q; stripping a trailing cue word needs care for the same reason.
- ~~**`NoteBacklinks` doesn't list deadlines**~~ — fixed 2026-10-06 with the `\deadline` kind.
- **Default view setting**: whether new links start inline or as cards (settingsStore field; default inline today).

### ~~Types block~~ and ~~identification key~~ — built 2026-10-15
See "Types, identification key, conclusion reasons…" in implemented-features.md. Follow-ups, not built:
- Types: linking a type to another block (raptors → a types block of raptors; a species → its own card): waits on "Links from a block to another block" below.
- Key: a "walk through it" mode (one step at a time, answering as you go) for study; a flowchart design drawn from the steps' go-tos (through the diagram widget's layout).

### Conclusion block — follow-ups (built 2026-10-14; reasons and the funnel 2026-10-15)
- **Linking existing text or blocks into a conclusion as its reasons** (the user, 2026-10-15), so they look like they feed it: waits on "Links from a block to another block" below. Reasons written in the block itself are built.
- More designs if wanted: an "=" result line; a highlighted box with ⟹.
- A frame's fit doesn't count the arrow design's line reaching up above the block.

### ~~Links from a block to another block~~ — built 2026-10-15
Every block and every block's part has a lasting id, so `[[`, Ctrl+\, Link to a note… and `\embed` reach them ("Blocks you can link to…" in implemented-features.md). Words inside a block's fields could already be linked to the Glossary or to a note, with the hover card. Next, not built:
- A part pointing at a block in one click (a small ↗ on a type, opening the picker), rather than selecting its name and linking it.
- A conclusion listing linked reasons, drawn feeding it (its reasons can link already; the drawing doesn't treat a linked one differently).
- Making hubs from these links automatically (the user, 2026-10-15: "down the line").

### Links from a block to another block (raised 2026-10-15) — the discussion, kept
The user: a type in a types block linking to another types block (raptors → types of raptor), or to a card about it; reasons linked into a conclusion. Today a passage is found by a lasting `blockId` on paragraphs and headings only (`extensions/BlockIds.ts`), and links/embeds (`noteLink`, `\embed`) point at those. Proposal put to the user 2026-10-15: give note blocks (and their parts) the same lasting id, so the existing note-link machinery (link, hover preview, open at, "linked from") reaches blocks with no new kind of link; then a part can hold a link to a block (a small ↗ on the type), and a conclusion can list linked reasons drawn feeding it.

### ~~A card for a thing~~ — built 2026-10-15 as the Profile (`\profile`)
Not built: sections of its own (headed parts beyond About); a template of facts per kind of thing (a species' Family / Habitat / Size, a person's Born / Known for), offered when a profile starts.

### A card for a thing (raised 2026-10-15) — the discussion, kept
A definition card fits a term, not a bird species. Proposal put to the user: a **profile card** (an infobox, like an encyclopaedia's side panel): a picture, a name, a one-line summary, then key facts as label / value rows the user names (Family, Habitat, Size, Diet…), and optional sections. One record per thing, like a Glossary entry, so the same species can be shown in several notes and linked to from a types block.

### ~~Alternatives / options block~~ — built 2026-10-15 as `\options`
Not built: scores read from the pros and cons' weights (today the score is set by hand); a decision matrix design (options × criteria), which overlaps the comparison's Table.

### Alternatives / options block (raised 2026-10-15) — the discussion, kept
"Different ways to reach one outcome" (policies for a goal), each with pros and cons: distinct from breakdown (parts) and types (kinds). Designs proposed to the user 2026-10-15: Fork in the road; Option cards with pros/cons and a verdict; Decision matrix.

### ~~Pros and cons vs comparison~~ — built 2026-10-15 (`\proscons`; the comparison lost its Pros / cons design and its scales icon)

### Pros and cons vs comparison (raised 2026-10-15) — the discussion, kept
Whether to split a pros-and-cons block out of `\compare` (which today has a pros/cons-like design and the scales as its icon). Recommendation put to the user 2026-10-15.

### ~~A hotkey to cycle a block's designs~~ — built 2026-10-15: Ctrl+] / Ctrl+[ (the user's choice)

### A hotkey to cycle a block's designs (raised 2026-10-15) — the discussion, kept
Ctrl+Tab cycles note tabs; Ctrl+←/→ moves by word in text. Recommendation put to the user 2026-10-15.

### ~~Add to dictionary~~ — built 2026-10-15
Not built: a tap path to a word's meaning on a phone (Android gap F29); a word's other forms (plurals, -ing) counting as the word; choosing which dictionary (or language) to ask; refreshing a meaning that came back wrong (today: edit it in the list).

### Add to dictionary (raised 2026-10-15) — the discussion, kept
Mark a word or phrase to add it to a built-in "Dictionary" list in Lists, its meaning fetched from the internet unless the user writes one, and hovering the word anywhere shows it. Open: the source of definitions (an outside service: which, and its terms), how the word is marked in notes, whether it's offered in every note.

### Note blocks (`\timeline`, …) — Timeline built 2026-10-06, sorted by date + horizontal style 2026-10-07; more styles and more blocks

Built: see CLAUDE.md "Note blocks" (under "Inline objects in notes") and "Note blocks: Timeline" in `docs/features/implemented-features.md`. The user asked for `\` to make note-taking structures as well as app items, starting with a simple timeline that can be extended later.
- **More timeline styles.** Each is a value in `TIMELINE_VARIANTS` (`extensions/Timeline.ts`) plus its CSS under `[data-variant="…"]` and an icon in `STYLE_ICONS`; the content never changes, so switching style is safe. Choosing is built (the pill at the top right and the right-click menu, 2026-10-07). Candidates from other apps:
  - **Alternating**: entries left and right of a centre line (the classic history-book layout; collapses to the rail on a narrow screen).
  - **Compact**: When and text on one line, the When in a fixed-width column (changelogs, meeting logs).
  - ~~**Horizontal**~~: built 2026-10-07, entries alternating above and below the line. Follow-up ideas: year markers on the line where the year changes; spacing proportional to time (a true scale) as an option.
  - **Cards**: each entry in a soft box on the rail (Linear/GitHub activity feeds).
- **Per-entry options**: an entry's dot colour or icon (a milestone, a warning), and marking an entry as "now" for a project timeline.
- ~~**Ordering**~~: sorting by date built 2026-10-07 (`utils/timelineWhen.ts`, see "Timeline: sorted by date, and a horizontal style"). Still to do: moving entries by hand (Alt+Shift+↑/↓, drag on the dot) for "As typed" timelines; telling the user when a When couldn't be read (today it silently stays put); a per-timeline setting for day-first vs month-first dates when the locale guess is wrong.
- **Turning a list into a timeline** (and back): a bulleted list whose items start with a date ("1914 – …") is the obvious source.
- ~~**Code and maths blocks**~~: built 2026-10-09 (`\code`, `\maths`; see "Code and maths blocks" in implemented-features.md). Follow-ups: referring to a numbered equation from the text ("see (3)"); a code block that runs ("Running code in notes" under Proposed Ideas); more languages than lowlight's common set (each is one grammar import); maths in other fields (a task's notes) and in search (the LaTeX isn't searched today).
- **More blocks**, each one node in `extensions/` + a `*Block.ts` in `objects/` + one `NOTE_BLOCK_KINDS` entry: a callout (`\callout`: an icon, a tint, text), a toggle/collapsible section, a pros/cons table, a definition list (`\term`), ~~a quote with source~~ (built 2026-10-07, `\quote`), a kanban-like board.
- **Quote follow-ups:** a default style for new quotes in Settings (the user first suggested Settings; per-quote choice was built instead); quotes of more than one paragraph (today Shift+Enter line breaks); a Link field that opens the source; a "copy as citation" action (APA / MLA from the fields).

### Block designs — how to develop them (the pattern, and ideas; logged 2026-10-07)

The pattern is in CLAUDE.md "Block designs". The user asked for it to be named and kept here so every future block is built the same way.

**How to add a design to a block:**
1. Add a value to the block's `*_VARIANTS` (`extensions/<Block>.ts`).
2. Add an entry to its `*_DESIGNS`: the label in `LABELS.noteBlocks.<block>`, and a 16×16 line-drawing icon (strokes in currentColor; circles filled).
3. Write its CSS block under `[data-type="<block>"][data-variant="<id>"]` in `NoteEditor.module.css`. Shared parts (cards, placeholders, the pill) stay outside it.
4. Anything the design needs that the content doesn't hold is computed in the block's decorations (positions, colours, counts as CSS variables), never stored.
5. Test it: switching to it round-trips through JSON and HTML, and its widgets render. Then check it in the real app, light and dark, and with many and few parts.

**How to add a block:** the Note blocks checklist in CLAUDE.md, with at least two designs from the start, using `blockPill` / `designButtons` / `designMenuItem`.

**Design ideas not built yet:**
- **Timeline:** Alternating (left and right of a centre line), Compact (When in a column, one line each), Cards on the rail.
- **Quote:** Speech bubble; Minimal (just a rule and the text); Tweet-style card with the speaker's picture (needs pictures, below).
- **Cycle:** Spiral (each round a little further out, for iterations); Orbit (stages as dots on the ring, labels outside); Two-way (a back-and-forth pair of stages, for a cycle of exactly two).
- **Hierarchy** (built 2026-10-07 with Tree, Columns, Outline): Radial (the root in the middle, levels as rings); Bracket (a tournament-style tree); collapsing a branch; dragging an item onto another to re-parent it. Built from the Glossary: see "Glossary auto-linking — follow-ups".
- **Pyramid** (built 2026-10-07 with Pyramid, Funnel, Stacked): a 3-D look (shaded sides); notes on alternate sides; numbers on the layers.
- **Frames:** colours (swatches + custom), shapes (square, rounded, pill, circle for square blocks), line style and thickness built 2026-10-09. Ideas: a gradient shade; a frame title (a label set into the outline); the same palette for the blocks' own part colours.
- **A default design per block in Settings** (new quotes start as Card, …), if the per-block choice turns out to be repetitive.

### Special characters — more sets (logged 2026-10-08)
**Shortcuts built 2026-10-14** (the user's list): `-->` →, `<--` ←, `<=` ≤, `>=` ≥, `!=` ≠, `^2` ² (digits continue: `^23` ²³), replaced as typed, Backspace straight after undoes. Not in code, URL, email or search fields. Ideas not built: a setting to turn shortcuts off; `_2` for subscripts (left out: underscores are common in names); `==>` ⇒.
Built: Greek (2026-10-08), and arrows, maths symbols and super/subscript digits (2026-10-14), all in `src/specialChars/charSets.ts` (CLAUDE.md "Special characters"). Still to do: a card listing every name (today `//` alone lists only the Greek alphabet); more sets as wanted (currency, fractions, accented letters).

### Charts in notes (logged 2026-10-07; built the same day)

The user asked whether a chart library would do this out of the box (yes), and wanted the trade-offs before choosing. The options laid out, with a future data/spreadsheet app in mind:
- Chart.js (small, simple);
- Recharts (React, SVG);
- Apache ECharts (the most capable: large data, many chart types, a dataset/transform model).
**Decided 2026-10-07: Chart.js, kept neutral; built** ("Charts in notes" in `docs/features/implemented-features.md`, CLAUDE.md "Charts"). As planned:
- The chart block should store a library-neutral spec (type, labels, series, options) and render through one adapter module, so the library can be swapped or a second added without touching stored notes.
- The library should be lazy-loaded, so notes without charts never pay for it.
**Not built yet** (charts): data labels on the bars; a second value axis; sorting and filtering the data; combining types in one chart (a line over columns); a chart from a List or a Tracker's entries (the spec makes this a source mapping, like an Overview source); waterfall subtotals part-way through; resizing a chart's height; ECharts-only kinds (heatmap, sankey, treemap), which would be the case for a second adapter.

### Pictures and icons in note blocks (logged 2026-10-07)

The user asked how hard it would be to drop small icons or pictures into blocks, resizable and reshapable. **Built now (quick):** each cycle stage has an icon slot. It takes an emoji (a picked grid or any typed one) or a picture: dropped on the slot, or chosen with "Choose a picture…", which is the touch path. The picture is centre-cropped to a 160 px square (`squareIconDataUrl`), with shape (circle / rounded / square) and size (S / M / L) chosen for the whole cycle.
**Not built (bigger):**
- The same slot in other blocks: the timeline's dots, and the quote card's avatar instead of initials. The slot is now shared (`extensions/blockIcons.ts`, 2026-10-15; the types block uses it), so each is a few lines.
- ~~**Free resizing and cropping of a picture**~~ — built 2026-10-07 for pictures in the note text ("Note pictures: resize like a word processor, and crop" in `docs/features/implemented-features.md`). Not for the cycle's icon slots, which stay block-wide shape and size. Follow-ons: the crop isn't carried into copied HTML (another app gets the whole picture, at its width and height); rotate and flip; a crop to a fixed shape (square, circle); wrapping text around a picture.
- An icon library (searchable line icons, not only emoji), and pasting a picture into a slot.

### Glossary auto-linking — follow-ups (logged 2026-10-07)

Built: "Linking to the Glossary as you type" (see `docs/features/implemented-features.md`).
- **Definitions linking to definitions.** The user's suggestion: Foraminifera's definition mentions eukaryote, so link it back. Partly automatic already: typing a term inside another term's definition gets the same offer, which links the passage to the term. Still to do: offer it when a definition is created from text that already mentions a term (the new card could list "Mentions: Eukaryote — link?"), and show a term's "related terms" in its card and in the Glossary.
- **A hierarchy of linked concepts** (the user, 2026-10-07): eventually concepts linked into a hierarchy ("Eukaryote" under "Cell", "Foraminifera" under "Eukaryote"), from which a breakdown or hierarchy block could be built in one go ("Insert as a hierarchy"). The parent link is built: a Concept's "Part of" field (`parentId`, type `parent`, in `config/structuredTagTypes.ts`), with sub-concepts derived. Still to do: "Insert as a hierarchy", and re-parenting by dragging in the Glossary view.
- **A setting to turn auto-link offers off**, or to only offer terms from the same notebook.
- **Smarter matching:** stemming beyond -s / -es ("eukaryotic"), and a term's alternative names (an "Also called" field).
- **Touch:** the offer chip is tappable; the hover card isn't reachable on a phone (gap F16).

### Glossary and Important — follow-ups (logged 2026-10-07)

Built: CLAUDE.md "Annotations" and the two 2026-10-07 entries in `docs/features/implemented-features.md` ("The Glossary…", "Important, built out…").
- **Existing plain Definition/Concept marks** (made before 2026-10-07) have no record, so they aren't in the Glossary. Offer "Add to the Glossary" on them (right-click), or convert them on first open.
- **Glossary cards and records — what's left after 2026-10-09** (built: "Glossary cards, richer records, acronyms as you type" in `implemented-features.md`).
  - **Flashcards and testing yourself.** The records are ready for it. Study state (next due, step, results) goes on the record, in `fields`, reusing Review's intervals (`REVIEW_INTERVALS`), so one review system covers passages and terms. Not stored yet: nothing uses it until the flashcards exist.
  - **"Other forms"** (irregular plurals and spellings: mitochondrion/mitochondria, colour/color) for linking as you type. The user thought it overkill unless argued for; `GlossaryAutolink` already takes regular plurals (-s, -es), so it's only for irregular forms. Not built; revisit if links are missed.
  - **The Glossary view** shows the term and meaning only; pictures, key points and sub-concepts show on the card. Show them there, and nest sub-concepts under their parent.
  - **A record whose card was removed before it was named** stays as an empty record (hidden from the Glossary). Clean these up, e.g. on the note's next save.
  - **Recording an acronym as you type** offers only the "Long form (ABC)" pattern; "ABC (long form)" and "ABC - long form" are found when you mark the text, not offered as you type.
- **One term defined in two notes** stays two entries. Merge, or show them as one term with two definitions.
- **Edit a term from the Glossary view** (today: go to its note and edit the card).
- **The margin label's hover card on touch**: a tap goes straight to the definition, so the meaning isn't seen on a phone. Log in `docs/android/10-gap-analysis.md` when Notes editing on Android (W7) is planned.
- **Key points across a note's tabs** (the outline only sees the open tab), and across notes (an Overview source for Important passages).
- **Review**: keyboard shortcuts in the Review view (avoid the bare digits, which navigate sections); a daily notification or badge when passages are due; an SM-2 style ease factor if the fixed ladder proves too blunt.
- ~~**Retrofit: `services/crossAppLinkCleanup.ts` writes stored note content without checking `liveNoteEditorFor`**~~ Done 2026-10-09: it goes through `editNoteContent`. (it predates the rule in CLAUDE.md "Annotations"), so stripping a dead link from the note that's open can be overwritten by the editor's next save. Route it through the live editor like `services/noteReview.ts` does.

### Custom note and tab templates (requested 2026-10-05, design proposed, not built; request text was cut off)

**The use case.** Each subject is a notebook. Inside it, a "Lectures" note gets one new tab per lecture. Setting up that note, and each lecture tab, is repeated per lecture and per subject. The user suggested reusable custom templates, shown in the new-note pane next to the built-in six, carrying every field a note has (notebook tags, annotation tags, Endeavour). Created from wherever you are, they would inherit that place's tags and Endeavour, and "New note template" would join the + speed dial. The request ends mid-sentence ("But in particular, …"), so ask what came next before building.

**Proposed design (awaiting the user's answers):**
- **One `NoteTemplate` entity, two scopes.** `scope: 'note'` is a whole note: title pattern, main-tab content, optional tabs (each with name and content), tags, Endeavour, colour. `scope: 'tab'` is one tab's name pattern and content. The lecture case is mostly a *tab* template.
- **Name patterns** with a few tokens, e.g. `Lecture {n} — {date}`. `{n}` is the next number among the note's tabs; `{date}` is today.
- **Making one:** "Save as template" from a note's menu (and from a tab's right-click menu) captures what's there. "New note template" in the speed dial starts empty, prefilled with the current notebook and Endeavour.
- **Using one:**
  - AddNoteModal shows a "My templates" group above the built-ins. Choosing one prefills tags and Endeavour, still editable.
  - A tab template is used from the tab bar's + (a menu: Blank tab / each tab template), or from `Ctrl+T`.
  - A note could name its default tab template, so + on "Lectures" makes the next lecture tab directly.
- **Storage:** a new persisted, synced store or a `noteTemplates` record in `noteStore`. A new Supabase table means a migration with its own grant. Encrypted notes can't become templates in v1 (the template would be plaintext).
- **Open questions:**
  - What came after "But in particular,"?
  - Is a per-note default tab template wanted?
  - Should a template be editable after creation in its own editor, or only re-saved from a note?

### PDF / PowerPoint side-by-side annotation note-taking (logged 2026-09-24 — large, needs its own architecture pass)

The big one from the 2026-09-24 request: attach a PDF or slide deck, view it on one side with a notes pane on the other (or overlaying it), and save the result into a note (existing or new). Greenfield — zero existing infrastructure (`NoteEditor.tsx`'s only non-text embed is `ResizableImage`; no attachment/file node type, no split-pane content layout, no PDF viewer anywhere in the app) and not previously scoped anywhere in this file (the one PDF mention, "Export formats (PDF, Markdown, HTML)" above, is about exporting a note *to* PDF — unrelated).

Real sub-problems that need deciding before implementation starts, not just building:
- **Rendering**: PDF.js (mature, client-side, the standard web choice) for PDFs. PowerPoint has no good client-side renderer — realistically needs server-side conversion (e.g. to PDF or per-slide images) via an edge function, which is a meaningfully bigger lift than the PDF half alone. Consider shipping PDF-only first.
- **Storage**: note content today is inline base64 (images) and the notes store already hit the old 5 MB localStorage ceiling once because of exactly that pattern (see "Local storage headroom" in the Pattern retrofit backlog below) — a multi-MB PDF cannot go the same route. Needs the "images as separate blobs" direction already flagged there (IndexedDB/Supabase Storage, referenced by id), done for real this time rather than deferred again.
- **Layout**: a genuinely new UI shape — nothing in this app currently splits a content pane into "external document" + "editor" side by side (Chronicle's tree/list/editor columns are navigation, not this).
- **Annotation anchoring**: how a note's text ties back to a location/page in the source document — the actual "annotate as you read" mechanic, and the hardest part to get right.

Recommend scoping as its own multi-phase brief (`docs/agent-tasks/`) once the rendering/storage/anchoring decisions are made, not a single change.

**Raised again 2026-10-08 (for discussion, not confirmed):** bring in a PDF or other document by upload *or by a link to it*; the document becomes a kind of background the user writes notes over or in. Two shapes to choose between: (a) the document as the note's page, with notes as an overlay layer anchored to page positions (closest to "over the top of it"), or (b) the side-by-side view above, with anchors tying passages to pages. A link (URL, Google Drive) avoids storing the file but breaks if the link moves and needs a CORS-friendly fetch (an edge-function proxy). Pairs with pen input below.

### Pen and handwriting input (raised 2026-10-08 — for discussion, not confirmed)

Tablets and some laptops have pens (Apple Pencil, Surface Pen, S Pen). The user asks whether Notes can take drawing and handwriting, especially over an imported document (above). Technically reachable: Pointer Events give pen pressure and tilt (`pointerType === 'pen'`) in the browser, WebView2 (Tauri) and Android's WebView, and ink can be stored as vector strokes (small, scalable) in a note block (`\sketch`: a canvas block like the chart, strokes as data) or as a layer over a document page. Questions: a drawing block inside the text, or a free page; handwriting recognition to text (needs a service or an on-device model; not in the browser natively); palm rejection (pen-only drawing with touch scrolling is the usual answer). A drawing block is the small first step and fits "Block designs".

### Android: Notes on a phone — built 2026-10-09 ("Notes on a phone" in implemented-features.md)

Still open: what the side panel holds may grow (tabs, contents, key points, linked from, details today); search and sort on the home screen; moving notes between notebooks on a phone.

---

## Portfolio

### Chart view — the tickers / info split

The chart's right sidebar resizes by dragging its edge (`usePaneWidth`, id `portfolio-chart-sidebar`, 2026-10-14). Still fixed: the split between the tickers list and the info pane (75% / 25%). A drag handle between them would persist its share in `settingsStore`, like `paneWidths`.

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

**Waits for Records (on hold).** This is N7 in `docs/android/05-notifications.md`. That plan named migration `044` and `taskStore` v14 for it; both have since been used (series links; recurring tasks), so it takes the next free numbers. Its rules go in `services/notifications/plan.ts` like every other notifying kind.

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

The rule belongs in `services/notifications/plan.ts` (CLAUDE.md "Notifications"). A tentative event whose date has passed ("is this still happening?", under "Calendar") is the same shape and could share it.

---

## Workflow & Task Dependencies

### Overview — next steps (logged 2026-10-01; step 1 built, see `docs/features/overview.md`)
Agreed with the user in the design conversation of 2026-10-01. Order confirmed.
- **Step 2 — Notes → Create ▸ List item** (the existing disabled stub in `FloatingToolbar`'s Create menu). Pick the list and pre-fill fields from the selection (dates, numbers, percentages — reuse `utils/textToTask.ts`'s inference). The passage gets an `ArtifactLinkMark` (`targetType: 'listItem'`), and the list item needs its own `crossAppRefs` (new field + migration) so it shows "Linked from" the note. This replaces the earlier "note record types" idea: a list with typed fields *is* the record type.
- **Step 2 — List date fields on the Calendar**: a per-field flag on `ListFieldSchema` (default on), rendered as a calendar layer. A Lists feature, so it works for any list with dates, not just ones filled from notes.
- **Step 3**: "Save this note as a template" (user templates beside the built-in `NOTE_TEMPLATES`); Notes → Create ▸ Tracker entry; an Overview embedded as a live block inside a note; more display styles (timeline, board); editing simple properties inline from an Overview (click through for everything else).
- **Idea (user, 2026-10-01, spitballing — not agreed): a list feeding Records.** E.g. an "Exercises" list whose items become a routine's steps, with Records logging whether that day's list was done. Note: Routines (Records) already are "a checklist of steps, ticked daily, each completion logged as a tracker entry" — so the likely shape is "a routine's steps come from a list" rather than a new mechanism. Discuss before building.
- **Not in step 1**: the header Endeavour picker isn't used in Overview (it has its own); portfolio watchlist items and fitness activities have no source yet (add-on apps — add sources when wanted); no agent commands read Overviews; Overview on Android is reachable only from the More sheet; the row hover menu (✎/✕) has the same touch gap as every `RowHoverActions` site.

### Task links — follow-ons (logged 2026-10-01)
- ~~**Recurring tasks**~~ — built 2026-10-07 (see "Recurring tasks" in `docs/features/implemented-features.md`). Follow-ons not built: ~~(a) a repeat rule on specific weekdays (`daysOfWeek`, as routines have) and "every last Friday"-style rules~~ (built 2026-10-18 for tasks and calendar items alike: `daysOfWeek`, `monthWeekday`, see "Calendar import rebuilt"); (b) reopening a completed occurrence *without* Undo leaves its already-created next occurrence in place (completing again reuses it, so no duplicate, but there are then two open occurrences until one is done); ~~(c) completing from a checklist says nothing about the next occurrence~~ (fixed 2026-10-14: it now goes through `toggleTaskCompletion`, whose toast names it); ~~(d) "skip this one"~~ (built 2026-10-14: the occurrence moves to the rule's next date and counts as used; Complete's hover options, the right-click menu, Undo in the toast).
- ~~**Pattern retrofit — one repeat-rule editor.**~~ Fully applied 2026-10-14: AddCalendarItemModal and the event, reminder and deadline panes use `RepeatField` (pattern test "one repeat-rule editor"). Routines (AddRoutineModal, EditRoutinePane) pick weekdays with their own control, a different editor, not a copy; they could join once `RepeatField` takes weekdays (follow-on (a)).
- **Agent commands for task links**: agents can't see or create links yet. Needs `access.ts` read/write (store actions `addItemLink`/`removeItemLink` already hold the rules), a `get_task` field for blockers, and a decision on whether an agent completing a blocked task should be refused or noted.
- **Link an existing task as a follow-up / "unlocks" from this side**: today "+ Follow-up" always creates a new task, and "unlocks" can only be made from the other task ("+ Waiting on…" there).
- **Calendar shadows of a blocked task** (its deadline/scheduled entries) show no lock.
- **User-defined link kinds** ("duplicate of", "part of"): the registry is ready for more entries; making them user-editable means storing kinds as data.
- **Links from other item types** (event ↔ task "because of", note ↔ task with a reason, list item ↔ task): same `ItemLink` shape, `targetType` widened.

---

---

## Projects (Collection kind = 'project')

### ~~Project completion flow~~ — built 2026-10-14
Completing a project's last open task offers "Archive the project" in the Completed toast (with Undo). Decided with the user: a project has no separate "completed" state (`Collection.completed`/`completedAt` removed; the Supabase columns stay, unused). Not built: a "finished" view of archived projects (they're in Manage's archived list today).

---

## Calendar

Built (each has its entry in implemented-features.md): month, week and day views; tentative events and reminders; the Deadline kind; drag to move and resize; reminders drawn as points; background events; the time field's clear; Google Calendar sync (`docs/features/external-calendar-sync.md`). Whether the Calendar ever becomes its own app is open, with no trigger.

### Tentative — ideas not pursued (revisit only if a need shows up)

- ~~**ICS import ignores `STATUS:TENTATIVE`**~~ — fixed 2026-10-14: tentative events import as tentative and cancelled ones are left out. The review step doesn't show which are tentative.
- **A "is this still happening?" follow-up notification for a tentative event whose date has arrived or passed** — the same shape as the separate "Waiting-task follow-up notifications" item above, but for tentative events instead of `kind: 'waiting'` tasks. Not built; flagged here since the two ideas are conceptually the same pattern (something left in an unresolved state past its due point) and could plausibly share a notification mechanism if both get built.
- **Schedule blocks gaining their own tentative concept** — not built, no obvious "not confirmed yet" meaning for a recurring template block (as opposed to a concrete occurrence, which already has commitment mode).

### Drag on the grid — what's left

Drag-to-create (drag an empty range to set a new item's start and end); moving and resizing repeating items (needs the this-one / this-and-following choice) and Schedule occurrences; and **a real check in a browser and on a device**: the drag itself, the reminder redesign and the Markdown hotkeys in task/calendar notes were verified only by tests and the build (no browser tool in those sessions).

### Base fields vs More options — a shared layout pattern (deferred 2026-09-27)

`AddCalendarItemModal` and `AddTaskModal` each built their own "More options" toggle and field order. Confirmed with the user as not worth doing now. If wanted: agree the rule, record it in CLAUDE.md, extract a shared `MoreOptionsSection`, move both modals onto it, and log the retrofit.

### Mini-calendar toggle in the task list view
A setting (in the Settings pane) to display a condensed calendar alongside
the to-do list — the two panels sit side by side. Useful for seeing
upcoming deadlines in context while managing tasks.
- Trigger: toggle switch in Settings → Display section
- Layout: task list narrows; mini-calendar fills remaining horizontal space
- Mini-calendar is read-only (no add from this surface)
- Persisted in settingsStore as `miniCalendarEnabled: boolean`

### External calendar sync — next phases

Built: Google Calendar, one way, rebuilt 2026-10-18 (Google's edits and deletions follow through where not edited here, native series, birthdays, travel modes, no duplicates; syncs on load and every 15 minutes while the app is open). The .ics import shares its pipeline. Detail and the original viability analysis (2026-09-16): `docs/features/external-calendar-sync.md`. Not built:
- ~~**Microsoft / Outlook**~~ built 2026-10-18 (Graph delta, personal and work accounts; `docs/features/external-calendar-sync.md` "Outlook"). Follow-ons: **publisher verification** in Microsoft's Partner Network, so work accounts whose organisation blocks unverified apps can connect; Outlook **category colours**; a work account's **shared and other people's calendars** (only `/me/calendars` is listed).
- **Syncing while the app is closed** (a server-side cron): needs a Supabase service-role key, a kind of secret the app has never held. Only if 15 minutes while open proves too slow.
- **Two-way sync**: push subscriptions and their renewal, conflict resolution, translating RRULEs both ways.
- CalDAV (iCloud, self-hosted); an "attended" mark; a per-connection sync window (fixed today at 1 month back, 6 forward).
- **Repeat rules the app still can't show** (several days of the month, BYSETPOS lists, hourly, RDATE): Google's come in as single dates; an .ics file's import only its first date. A fuller rule engine (or the `rrule` package, if approved) would cover both.
- A changed date of a Google series beyond the 6-month window shows as the plain series date until the window reaches it.
- **Routines' weekday picker** could become `RepeatField`'s now that it takes weekdays (see "Pattern retrofit — one repeat-rule editor").

---

## AI Agent Integration

### Notes-dump → tasks
Ability to paste or speak a block of free-form text (e.g. meeting notes,
a brain-dump) and have an AI agent parse it into structured tasks. The agent
should infer titles, priorities, deadlines, and collection assignments where
possible, then present the parsed tasks for review before adding them.

### Voice → agent (v1 built, paused 2026-09-24)
Dictation into text fields is built (`Ctrl+D`, see the "Voice dictation" entry in `docs/features/implemented-features.md`). **Paused by the user 2026-09-24** — enabling Google Cloud Speech-to-Text asked for a €25 payment they didn't expect, and the AI agent command layer took priority instead. Full context, the billing question, and what changed since this was designed (the agent command layer, `src/agent/`, now exists and gives "voice → agent" a concrete destination) are in **`docs/agent-tasks/04-voice-dictation-followups.md`** — read that before touching this again, don't re-derive it here.

Still to do, unchanged: with **nothing focused**, `Ctrl+D` should open a voice pane whose default destination is the agent, with recording/meeting-minutes as further options. A local Whisper `SpeechEngine` (free, offline; heavier build — C++/CMake plus a 150–500 MB model; `tauri-plugin-stt` wraps whisper-rs but its maturity is unvetted) and a Web Speech engine (free, no key, but unverified in Tauri's WebView2) are the two real alternatives to Google if that's wanted. A `RECORD_AUDIO` permission and mic button for Android (no hotkeys there). Spoken-command handling ("new line", "period") and custom vocabulary (Acronym entries, Endeavour names). **Recordings** (lectures, meeting minutes): chunked local audio in IndexedDB, timestamped transcript, speaker labels — where it lives is undecided and not Notes; a paid feature, audio kept local first.

### Voice control
Hands-free task creation and navigation via voice commands. The agent
interprets spoken input and maps it to app actions (add task, set deadline,
mark complete, etc.).

### Custom agent integration
Allow users to connect their own AI agent/workflow endpoint. The agent has
read/write access to the task store and can perform batch operations,
re-prioritisation, and smart scheduling on behalf of the user.

**Architecture note:** all three features share a common "agent interface"
layer — a well-defined API surface over the Zustand stores. **That layer now
exists for tasks, calendar, schedules and Endeavours/Purposes/Tags** (`src/agent/`,
built 2026-09-22 — see `docs/ai/02-command-layer.md`); each agent type below uses it.

### The in-app assistant — remaining phases (confirmed 2026-09-22)
The agent lives inside the app (the user talks to an in-app chat; the app calls a
model with the user's own API key, later a local model). Full reasoning, the invariants
register and every decision are in `docs/ai/01-capability-inventory.md`. Still to build, in order:
1. **Chunk B — notes.** A headless note-content module (markdown → Tiptap `doc > section+`, heading outline, append/replace under a heading); the note editor reloading from the store on an external change when it has no unsaved edits (today an external write to the open note is silently overwritten by the editor's next save); note commands (`create_note`, `append_to_note`, `replace_note_section`, `update_note_properties`, `get_note` with outline, `create_notebook`) and keyword search over note text (reuse `utils/noteSearchText.ts`); encrypted notes/lists excluded in `agent/access.ts`, with a planted-secrets test; `touchNote` must never be called by a read.
2. **The chat panel and agent loop** (client-side): send the tool list + messages to the provider, run the calls through `runCommand` with a shared `batchId` per user request, image paste for screenshots, the review screen for `needs_approval` proposals (reuse the `CalendarImportReviewModal` pattern), an "undo this request" action, an agent-activity view over the audit log.
3. **The agent manual** (system prompt) generated from the command schemas + a short terminology guide, and **evals** (scripted scenarios → expected store diffs, run per model incl. small local ones).
4. **Provider abstraction** (user's own key stored per device, never synced; local OpenAI-compatible endpoint); check CORS per provider (Tauri/Android use native HTTP).
5. **Cross-device attribution:** a small synced table recording which items an agent created (a Supabase migration).
6. **Phone widget** that opens the assistant with the app closed (headless launch on Android).
7. **An abstract written by the AI** (the user, 2026-10-08): today a note's abstract is written by hand (Note ▾ → Add abstract); offer "Write an abstract" that asks the model for a short summary of the note (or one tab) and fills the abstract for the user to edit, never silently. A command (`summarize_note` → proposes `update_note_properties` with `abstract`) under Chunk B; encrypted notes excluded like every agent read. It then shows in linked calendar items' panes for free ("Calendar items: a new note from the pane, and linked notes' abstracts").
8. **Archive support for notes, lists/items, schedules, Portfolio items and activities** (per entity: store action, the shared `ItemActions` UI, a migration), then extend `archive_item`. Until then agents create and modify those but cannot remove them.
9. Commands for Lists, Records (trackers, entries, routines), Fitness and Portfolio.

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

## Records — Routines UX improvements

**Records is on hold** (2026-10-04): ask before starting these.

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

These are computed on the fly from `trackerStore.entries` (no stored state). **Gap found 2026-10-14:** a tracker doesn't remember its template (`template` exists only on `CreateCollectionInput`, not on `Collection`), so "is this a Habit tracker" and "which is the primary boolean field" can't be asked today. Decide first: store the template, or let any tracker pick a boolean field to streak on. Display them as stat chips in the TrackerDetail header, similar to fitness app habit trackers.

The streak breaks if: no entry for a day, or entry exists but boolean field is `false`. Days where the tracker has no `repeatConfig` day constraint (i.e. it runs every day) are always counted; days outside the schedule are ignored.

---

## Records — what's left of the original spec

**On hold** (2026-10-04). Built: trackers (`kind: 'tracker'`), entries, routines, the Records section, the four templates (Habit, Books, Movies & Shows, Custom) as starting field sets, and the field editor (removing a field that holds data asks first). The original spec (2026-09) is in git history. Not built:
- The Habit view: heatmap and streaks (above).
- Books and Movies: "Want to / In progress / Done" tabs from their Status field.
- Charts of entries over time (a second `ChartWidget` host, CLAUDE.md "Charts"); a grid view; search and sort by any field.
- Entries linked to tasks and notes: `trackerEntry` is a `CrossAppRefType`, but `TrackerEntry` has no `crossAppRefs`. Then: clicking a tracker filters Tasks to its linked tasks; a task pane shows its linked entry.
- Integrations: book details from OpenLibrary/Goodreads as a title is typed; nutrition import. (Strava belongs to Fitness.)

---

## Portfolio — market data and planned scope

Built: live quotes through `api/ticker-quote.ts`, `ticker-search.ts` and `ticker-sector.ts`, refreshed on a timer while the section is visible (`integrations/usePriceRefresh.ts`), and a column chooser (`columnConfig`). The data comes from Yahoo Finance's unofficial endpoint, not FMP as first planned (risk: CLAUDE.md "Known issues"). The original "separate package and event bus" architecture was never built: Portfolio is a code-split section gated by `isAppEnabled()`. Not built:
- **Fundamentals**: P/E, EPS, dividend yield, 52-week range, average volume, the real market-cap value.
- **Analyst consensus, news headlines** (a News view) and **earnings dates**.
- **Holdings**: positions across platforms (manual first, broker import later); cost basis, current value, unrealised P&L per position and overall.
- **Into the Organizer**: "read up on X" → a task; options expiry and earnings → calendar items; a watchlist item's notes → Notes. Through the other stores' own actions and `crossAppRefs`, not an event bus.
- An official market-data API with a server-side key (CLAUDE.md "Known issues").

---

## Fitness — open items

Built: `docs/features/fitness.md` (the original spec moved there verbatim 2026-10-14). Not built:
- Supabase sync for activities and custom types ("Fitness Supabase sync", top of this file).
- Strava: webhook push (`api/strava-webhook.ts`), an automatic throttled sync on load, mapping more `sport_type` values, the wider `activity:read_all` scope, and a real end-to-end OAuth test on the deployment.
- Desktop: confirm that connecting once on the web lets the desktop app use the same connection.
- An imperial units toggle (data is stored in SI; render-only, `utils/fitnessFormat.ts`).
- Linking activities and Records trackers through `crossAppRefs`.

---

## Proposed Ideas

Items here are not confirmed requirements — they are sensible ideas raised during design discussions, held here for future consideration.

---

### New app: Nature / Environment (raised 2026-10-08 — for discussion, not confirmed)

A passion project for the user: an app for learning about environmental issues, keeping up with news on them, and fleshing out the user's own projects in that space. A fit for the suite as an add-on app (like Portfolio/Fitness: its own store, section, `isAppEnabled` gate, an Overview source). Pieces to discuss: a news feed (RSS from chosen sources through an edge function, or a news API; saving an article into Notes), a learning library (topics and key concepts, which overlaps Notes' Glossary — possibly Notes notebooks with a Nature template rather than new storage), and projects (which already exist as Endeavours: Nature projects could simply be Endeavours with a Nature purpose, shown in the app). The open question is how much is a new app versus a view over existing Notes, Tasks and Endeavours plus a news feed.


### Portfolio — Preferred Market Setting

When a user types a ticker that exists in multiple markets (e.g. VMM on NASDAQ and LSE), a disambiguation dropdown is shown. A **preferred market** setting would let users declare their home exchange (e.g. LSE / XLON) so that:
- If only one result matches the preferred market, auto-fill without showing the dropdown.
- If multiple results exist, the preferred market result floats to the top of the disambiguation list.

**Where it would live:** Portfolio settings pane (to be built), stored in `settingsStore` as `portfolioPreferredMic: string | null` (MIC = Market Identifier Code, e.g. `'XLON'`, `'XNAS'`, `'XNYS'`).

**Why deferred:** Only valuable once a meaningful number of global tickers are in the watchlist and disambiguation is a recurring friction point.

---

### Suite-wide "Quick Access" pane (recently/frequently/pinned) — v1 built, pins built 2026-10-18

**Built.** `Ctrl+G` opens a search-and-jump overlay (`src/components/QuickAccessPane/`) from anywhere in the suite — search by title across Notes, Notebooks, Tasks, Lists, Endeavours, Trackers, and Routines, or (empty query) browse Recent/Frequent visit history with a user-adjustable "Show N" count (`settingsStore.quickAccessRecentCount`, 3–20, default 8). Full design/architecture is documented in CLAUDE.md's Implemented Features list under "Suite-wide Quick Access pane" — see there for the provider-registry shape (`src/utils/quickAccess.ts`), the visit-tracking store (`src/store/recentItemsStore.ts`), and exactly which app actions record a visit.

**Deliberately not built in v1 (genuine future work, not oversights):**
- ~~**Pinning places**~~ and ~~**Pinning**~~: **built 2026-10-18** ("Quick Access pins, and Quick Access / Go to as two tabs" in implemented-features.md; CLAUDE.md "Pin to Quick Access"). Left: a pin entry on the Map view's nodes, the Glossary view's rows and Overview rows (today: pin them from Go to's search).
- **Granular in-entity targets.** Today a "destination" is a whole Note/Task/List/etc., not a specific Calendar event, Portfolio ticker, Fitness activity, a specific Tracker entry, or a specific List item/Records entry. Extending this is additive, not a redesign: one new `QuickAccessProvider` + one new `QuickAccessTargetType` union member per type (see the provider registry in `src/utils/quickAccess.ts`) — this extensibility was a deliberate design goal of v1, not left for a rewrite.
- **Portfolio/Fitness coverage** — no provider for tickers or activities yet, same "add a provider" extension path as above.
- **Android/touch entry point.** Since 2026-10-18 the header's ⚡ Quick Access button opens it on every platform (Go to is its second tab). Still to build from D6: swipe down on the mobile header.
- **Fuzzy matching.** Search today is a plain case-insensitive substring match on title, per type, capped at 6 results per type. No ranking by match quality/recency, no matching on subtitle/notes/content.

**Motivating example from the user:** they have a specific List they want faster access to than going through Lists → navigating the list hierarchy each time.

**Why deferred:** Needs UX and data-model design decisions (above) before implementation; raised as a confirmed want, not yet scoped.

---

### Flexible notes: inboxes (built 2026-10-09) and idea hubs (built 2026-10-13)

The problem (the user's words, condensed): an idea jotted in a note changes purpose once it's taken further (handed to Claude to develop, say). It's now the stub of something new, sitting in the wrong place.

**Built 2026-10-09: inboxes** (CLAUDE.md "Inboxes"; "Inboxes" in implemented-features.md). Decided with the user: the passage moves rather than being copied; there can be many inboxes, made anywhere (an `\inbox` block in a note, so a section at the bottom of the same note works too); Send to inbox picks one like Quick Access; the inbox's own order (newest, oldest, A–Z) instead of asking every time; a status per item; an optional task. A marker is left where the passage was, and it can be removed freely.
Follow-ups:
- Moving an item from one inbox to another (today: copy and paste, or delete and send again).
- Drag between Board columns to change status (today: the status chip or right-click).
- A keyboard shortcut for Send to inbox (it needs a `hotkeys.ts` entry with its touch path).
- Sending from Android's own text-selection menu (today: the toolbar's `\` button, then Send to inbox).

**Built 2026-10-13: idea hubs** (CLAUDE.md "Idea hubs"; "Idea hubs" in implemented-features.md). Decided with the user: a hub is a `\hub` block that can live in any note (several per note; a "hub note" is a note built around one), with a Hubs view to find them all; links grouped by relation in a List, with a canvas to come later as another design (the phone is mostly for reading, so a canvas being fiddly there is fine); links rather than live copies.
Follow-ups:
- **Canvas design**: the same hub's links as cards on a board, with labelled arrows (Heptabase, concept maps). One more value of `HUB_VARIANTS`; positions would be computed or stored as attributes on each `hubLink`.
- **Live references** (Roam/Logseq block references): a passage shown in full inside the hub, editable there. Deferred by the user 2026-10-12, "links first".
- Linking a whole block (a timeline, a quote) rather than its text; linking one hub into another (hubs of hubs).
- "Add to hub" from the Glossary view's terms and from a note's row (today: the hub's + Link…).
- Links between two items inside a hub ("A contradicts B"), not only item → hub.
- Feeding hubs into Review; Claude suggesting links (the agent command layer).
- A shared palette for relation colours, if relations get colours.

### Running code in notes (Python / Jupyter) — nice to have, lowest priority (raised 2026-10-09)

The user's view: only worth it if notes can use the computer's own Python (an Anaconda or Jupyter install), on desktop. Feasible on the Tauri desktop app only:
- **Talk to a running Jupyter server** (`jupyter server` on localhost, with its token) through its REST and WebSocket kernel API. Any installed kernel (Python, R, Julia), with that environment's packages. Simplest and most capable.
- **Or start Python from Tauri** (the shell plugin, or a small Rust sidecar that starts `python -m ipykernel` from a chosen interpreter path) and speak the kernel protocol.
- Either way: a "Run" button on a code block (`\code` built 2026-10-09) whose output (text, tables, plots as images) is saved in an output part under the cell. Not possible on Android or the web build. Pyodide (Python inside the browser) works everywhere, but it is a ~10 MB+ download and can't use the installed packages; the user preferred the local install.

---

## Roll the shared item-actions pattern out to the remaining apps — not built

`src/components/ItemActions/` (footer, dialogs, hook, banner) backs the Task, Calendar event, reminder and deadline panes. Still without the archive half: Notes (`Note.archivedAt` exists in the model but has no UI), Lists and list items, Portfolio watchlist items, Records trackers, entries and routines (`EditTrackerPane` / `EditRoutinePane`), Fitness activities and Schedules. Each needs `archivedAt` / `archiveReason` (a migration and a store version bump) where archiving makes sense. Their delete confirmations already use the shared `confirmDelete` dialog (2026-09-20). Agents need the same before `archive_item` can reach them (item 8 of "The in-app assistant").

*(Restored 2026-10-14: a find-and-replace on 2026-09-20 had left only the update note and a literal `$1` here.)*

---

## Recycling Bin — deferred follow-ups (logged 2026-09-24)

The suite-wide Recycling Bin is built (see "Recycling Bin" in CLAUDE.md and `docs/features/implemented-features.md`). Two things were deliberately deferred:

- **Age-based auto-purge of trash entries.** MVP keeps them indefinitely, matching the already-accepted "soft-delete tombstones are never purged" acceptance at current scale — but the local `trashStore` (IndexedDB) holds full entity bodies, not just an id, so its growth is denser than the Supabase tombstone columns. A purge (e.g. anything older than 30/90 days, with a Settings toggle) should be added once this is felt in practice.
- **Agent-initiated deletes.** `TrashEntry.deletedBy` is already a forward-compatible union (`{ type: 'user' } | { type: 'agent'; batchId }`), but nothing produces the `agent` branch — the AI command layer's "no delete, ever" boundary (`access.ts`) is unchanged; agents still only archive. If that boundary is ever revisited (see "AI Agent Integration" → item 8, archive support), a genuine agent delete should route through `moveToTrash` with `{ type: 'agent', batchId }` so it shows up in the bin attributable to the agent, not silently as "by You".

---

## Pattern retrofit backlog

The rule (see CLAUDE.md "Pattern governance"): when a pattern is agreed, record it, apply it to new code, and audit existing code; every site the audit finds that isn't converted yet is listed here **with the check to re-run**. An entry stays until its check finds zero sites. Deliberate exceptions are listed too.

| Pattern | Check to re-run | Known non-conforming / remaining |
|---------|-----------------|----------------------------------|
| **Pin to Quick Access** (2026-10-18, CLAUDE.md) | `src/test/patterns.test.ts` "Pin to Quick Access" (only `services/quickAccessPins.ts` pins or unpins; every pinnable type has a provider) | **Fully applied 2026-10-18** (new pattern, no older code). Pin entries not yet offered on: Map nodes, Glossary view rows, Overview rows. |
| **A modal or pane is never taller than the screen** (2026-10-18, CLAUDE.md "Modals") | Review: a `.modal` / `.pane` rule in a `*.module.css` with no `max-height` (or full-height `top: 0; bottom: 0` / `height`) | **Fixed:** AccountPane (2026-10-18). **Remaining** (small, but can run off a very short window): `AddPurposeModal`, `AddTagModal`, `AddPortfolioTagModal`, `AddInvestmentPurposeModal`, `ConfirmDialog`, `ItemActionDialog`, `MarkdownLinkPrompt`. No mechanical check yet. |
| **Hover to preview, click to open** (2026-10-18, CLAUDE.md "Modals", `hooks/useHoverOpen.ts`) | `grep -n "onMouseEnter" src/App.tsx` (hover timers kept by hand) | Bell and Settings use the hook. **Remaining:** the ☰ Sidebar's own `closeTimerRef` timers in App.tsx. |
| **The margin column: every mark through one column** (2026-10-17, CLAUDE.md) | `src/test/patterns.test.ts` "marks show in the margin through the margin column" | **Applied 2026-10-17**: Important, Glossary links, Glossary chips, Unsure flags. Not yet sources (a choice, not a breach; each has an icon in the text): hub links (`hubRef`), note links, cross-app links (`\` objects). Add them when wanted. |
| **Floating panels are always fully on screen** (2026-10-17, CLAUDE.md, `utils/floatingPlacement.ts`) | `src/test/patterns.test.ts` "floating panels are placed by utils/floatingPlacement.ts" (no file places a panel from `window.innerHeight`; `NOT_YET` holds any site found later) | **Fully applied 2026-10-17**: the backdrop picker, `charPicker.ts`, `ContextMenu.tsx` (menus and submenus), `RowHoverActionsMenu.tsx` (row ⋯ and hover options), `SelectionMenu.tsx`, `NoteObjectMenu.tsx`, the Dictionary and note-link hover cards, `openBlockPopover`, and `WatchlistView.tsx` (five panels and the tag popover). Not panels: `StickyNotes.tsx`, `TaskPane.tsx`. |
| **Page hotkeys stand aside** (2026-10-17, CLAUDE.md "Hotkeys rule") | `src/test/patterns.test.ts` "page hotkeys stand aside through pageKeyBlocked" | **Applied 2026-10-17** to Calendar, the Notes tree, Lists and the Notes view switcher; **App.tsx's central handler 2026-10-18** (`overOverlay`; pattern test). |
| **A note is named with its notebook** (2026-10-17, CLAUDE.md) | `src/test/patterns.test.ts` "a note is named with its notebook" (allow-list) | **Applied 2026-10-17**. Not covered by the check: places that read a precomputed `noteTitle` (Inbox picker, Glossary relations' note line); review when touched. |
| **An effect that reacts to a change skips the first run** (2026-10-17, CLAUDE.md) | Review: `grep -n "useEffect" <file>` and look for effects that reload, reset or refocus on a value change without a previous-value guard | **Fixed where found** (`NoteEditor`'s lock effect, 2026-10-16); not audited suite-wide. |
| **Picture library: a picture is stored once and referred to** (2026-10-17, CLAUDE.md "Picture library") | `src/test/patterns.test.ts` "pictures are stored once" (only the library compresses a picture; only it, sync, backup and the sign-out wipe touch `pictureStore`) | **Fully applied 2026-10-17**: backdrops, pictures in note text (`ResizableImage`, paste, Settings → Storage), Glossary card pictures. Exempt: block icons (`blockIcons.ts`, 160 px squares). |
| **Automatic changes are undoable straight after (Backspace or Ctrl+Z)** (2026-10-17, CLAUDE.md) | `src/test/patterns.test.ts` "automatic changes as you type are undoable straight after"; review any new auto-replace | **Fully applied 2026-10-17**: input rules (both editors), `fieldInput` shortcuts, typing offers. Exempt: MathLive's own shortcuts (its own undo). |
| **One registry of open editors** (2026-10-16, CLAUDE.md "Notes side by side") | `grep -rn "liveNote()" src` and check each caller wants the editor in front, not "is this note open" | **Applied 2026-10-16**: glossary, glossaryDelete and notePassage moved to `liveNoteFor`/`liveNotes`; `noteColorMenu` keeps `liveNote()` (the right-clicked editor is in front). |
| **Every block has a category** (2026-10-16, CLAUDE.md "Note blocks") | `src/test/patterns.test.ts` "every note block has a category" | **Fully applied 2026-10-16** (25 blocks and `
ef`). |
| **Dropdowns that close on an outside click close on Escape too** (existing pattern, breach found 2026-10-16) | `src/test/patterns.test.ts` "every outside-click listener on the document has its own Escape registration" (tightened 2026-10-17: counts per file, `click`/`mousedown`/`pointerdown`, `.ts` too) | **Fully applied 2026-10-17**: the ribbon's table, columns and text-colour pickers, Portfolio's column, filter, sort and two group panels, and the Notes tag button (`TagFAB`, which opens on hover and has no outside-click listener, so the test can't see that kind). |
| **Marks on text keep out of the palette** (2026-10-16, CLAUDE.md "Colours a person picks") | `src/test/patterns.test.ts` "marks on text keep out of the palette" | **Fully applied 2026-10-16**: no mark used a palette colour. The Dictionary word uses the new `--color-text-mark`; linked terms keep their Glossary type's colour (a kind colour from one registry, allowed); hub refs, link offers and note links use the primary colour. |
| **No Outline on card blocks** (`CARD_BLOCK_NODES`, 2026-10-13, CLAUDE.md "Block designs") | Review: a block drawn with its own border is in `CARD_BLOCK_NODES` | **Applied 2026-10-13** (Glossary card, question). |
| **Delete in every block's pill on hover** (2026-10-13, CLAUDE.md "Block designs") | `src/test/patterns.test.ts` "every block shows Delete in its pill" | **Fully applied 2026-10-13** (one CSS rule; the Glossary card's own exception removed). |
| **Card and Compact look the same for cards and questions** (2026-10-13, CLAUDE.md "Glossary records and cards") | Review: the two stylesheets keep the same measurements | **Applied 2026-10-13** to Glossary cards and questions. |
| **Block fields: Enter and arrows move through them; arrowing into a block enters it** (2026-10-13, CLAUDE.md "Blocks with their own inputs") | Review: an atom block with inputs registers `registerEnterableBlock` and its fields hand Enter and the arrows on | **Applied 2026-10-13** to Glossary cards and maths. Deliberately not: chart, diagram, embed (selected whole). |
| **Formatted text in block fields** (`utils/richText.ts`, 2026-10-13, CLAUDE.md "Glossary records and cards") | `src/test/patterns.test.ts` "formatted text in block fields" | **Fully applied 2026-10-13** (Glossary cards; `TagView` fixed to read fields plain). |
| **ProseMirror's classes are `:global` in CSS Modules** (2026-10-13, CLAUDE.md "Coding conventions") | `src/test/patterns.test.ts` "the editor library's classes are :global in scoped CSS" | **Fully applied 2026-10-13** (two sites fixed earlier the same day: `.ProseMirror-selectednode`, `.ProseMirror-trailingBreak`). |
| **Glossary records and cards** (2026-10-13, CLAUDE.md) | Review: a new way of showing a Glossary record holds its id, not a copy | **Fully applied 2026-10-13** (cards and marked text). |
| **Blocks with their own inputs take the typing** (2026-10-13, CLAUDE.md) | `src/test/patterns.test.ts` "blocks with their own inputs take the typing" | **Fully applied 2026-10-13** (maths, chart, Glossary card; the chart was a breach: typing over a selected chart deleted it). |
| **Offer as you type** (`typingOffer.ts`, 2026-10-13, CLAUDE.md) | `src/test/patterns.test.ts` "offers made as you type come from one helper" | **Fully applied 2026-10-13** (Glossary linking, acronym offer). |
| **Tests that fake the clock read "today" inside a test** (2026-10-13, CLAUDE.md "Testing") | `src/test/patterns.test.ts` "tests that fake the clock" | **Fully applied 2026-10-13** (one site fixed: `objects.test.ts`). |
| **One colour palette** (`config/swatches.ts`; 2026-10-09, CLAUDE.md "Colours a person picks") | `src/test/patterns.test.ts` "colour pickers use config/swatches.ts" and "every palette colour has its --color-swatch token" | **Fully applied 2026-10-09**: ColorPicker, AddNoteTagModal, EditNoteTagModal, EditNoteMetaModal, FloatingToolbar's text colour and block frames all read it. |
| **Typing check in key handlers** (`utils/typingTarget.ts` `isTypingTarget`; 2026-10-09, CLAUDE.md "Hotkeys rule") | `src/test/patterns.test.ts` "keyboard handlers ask isTypingTarget" | **Fully applied 2026-10-09** (App, CalendarView, ChronicleView, ListsSection, useItemActions). Exception: `services/speech/insertText.ts`, which asks where to insert, not whether someone is typing. |
| **Putting a `\` block in, and spectrum colours** (`replaceTypedWithBlock` / `placeBlock`, `spectrumColour` in `blockDesigns.ts`; 2026-10-09) | `src/test/patterns.test.ts` "a block typed in with a backslash…" and "spectrum colours come from spectrumColour" | **Fully applied 2026-10-09** (all ten blocks; the hierarchy's level colours moved onto `spectrumColour`, keeping their hues). |
| **Places** (`config/places.ts`: destinations that aren't items, each with a shared icon and its visit recorded in its uiStore open action; 2026-10-09, CLAUDE.md "Places") | `src/test/patterns.test.ts` "Places" | **Fully applied 2026-10-09** (8 places). |
| **Text on a primary fill uses `--color-on-primary`** (2026-10-09, CLAUDE.md "Design tokens") | `src/test/patterns.test.ts` "text on a primary fill uses --color-on-primary" (rules that set the fill and the text together) | **Fully applied 2026-10-09** (70 rules in 49 files). Not caught by the check: white text in a rule whose primary fill is set by another selector (an `.active` modifier); move those as files are touched. |
| **Review has its own icon, not 🔁** (2026-10-09; 🔁 is "repeats" in `config/itemIcons.ts`) | `src/test/patterns.test.ts` "Review is drawn with its own icon" | **Fully applied 2026-10-09** (6 sites; the margin marker through `createReviewIcon`). 🔁 stays for Routines in Quick Access: a routine does repeat. |
| **Errors and logging: one approach** (`utils/log.ts`, global handlers, the four destinations; adopted 2026-10-09, CLAUDE.md "Errors and logging") | `npx vitest run src/test/patterns.test.ts -t "logs through"` (no `console.*` in `src/`; no empty `catch` without a reason; handlers installed) | **Fully applied 2026-10-09** for logging (63 `console.*` calls moved; 9 debug logs in `integrations/useTickerLookup.ts` deleted) and empty catches (6 given a reason). **Not audited:** whether every user-facing error message is plain words with a next step; whether every `catch` that logs should also tell the user (e.g. `tickerService` failures show only an empty result). Effort: an audit pass, small. |
| **Design tokens** (`src/index.css`: `--color-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--z-*`; adopted 2026-10-09, CLAUDE.md "Design tokens and theming") | `npx vitest run src/test/patterns.test.ts -t "design tokens"` (a ratchet: counts may only go down) | **Replaced as files are touched, not swept** (the user's call). Baseline 2026-10-09 in `*.module.css`: 154 hex colours (some deliberate: FloatingToolbar, NoteBackdrop presets, brand colours; worth doing first: `#ef4444` ×14 → `--color-danger`), 1222 literal font sizes, 137 z-index, 306 radii, 123 shadows. Spacing literals aren't counted (too many legitimate 0/1px values to ratchet usefully). Supersedes the "CSS colours from variables" row. |
| **Charts: one neutral spec, one adapter** (CLAUDE.md "Charts", 2026-10-07) | `src/test/patterns.test.ts` "only src/charts/chartAdapter.ts imports the charting library" | **Fully applied 2026-10-07.** Deliberate exception: Portfolio's `WatchlistView/TickerChart.tsx` (`lightweight-charts`, candlesticks and live price scales a ChartSpec doesn't describe). |
| **Block designs** (note blocks offer several designs through `extensions/blockDesigns.ts`, 2026-10-07) | `src/test/patterns.test.ts` "every note block offers its designs through blockDesigns" | **Fully applied 2026-10-07** — timeline and quote moved onto it; the cycle built on it. |
| **Right-click menus: "clicked thing first, families fold"** (2026-10-09, CLAUDE.md "Right-click menus") | No mechanical check: review each `registerContextMenuProvider` (`grep -rn "registerContextMenuProvider" src`) against the six rules. `headingMenu.test.ts` checks depth ≤ 2 for the heading menu | **Fully applied 2026-10-09** — the two sites the audit found (Important levels → Importance ▸, a `\` link's options → Options ▸) were fixed the same day. |
| **Resizable side panels** (`usePaneWidth` + `ResizeHandle`, 2026-10-09) | `src/test/patterns.test.ts` "side panels resize through usePaneWidth" | **Fully applied 2026-10-14** (20 places): Portfolio's chart sidebar was missed on 2026-10-09 and added 2026-10-14. Exceptions: modals, the icon rail, popovers. A new side panel is added to the test's list. |
| **Icons beside text** (1em square of the text, centred on its first line, 2026-10-09) | `src/test/patterns.test.ts` "icons beside text are sized from the text" (checks DisclosureIcon and the heading arrow only) | Applied to the heading-fold arrow; DisclosureIcon is drawn to it everywhere. **Not audited:** other inline icons (link 🔗, flags) are emoji/characters that already scale with their text; review when the close/edit/link icons move into `components/Icons`. |
| **Expand/collapse arrows are `DisclosureIcon`** (2026-10-09) | `src/test/patterns.test.ts` "expand/collapse arrows are DisclosureIcon" | **Fully applied 2026-10-09** (22 sites). Deliberate exceptions: dropdown triggers' ▾ (CollectionPicker's ▴/▾ is the one the test exempts by name), the right-click submenu ▸, the tracker field-type icon, ChronicleView's collapsed-column strips. |
| **Icons come from one place (`components/Icons`)** (2026-10-07) | `src/test/patterns.test.ts` "suite-wide icons come from components/Icons"; for the rest, `grep -rln ">×<\|✎\|🔗" src/components --include=*.tsx` | Applied to the text-colour swatch and the item-action icons; **✎ × ✕ 🔗 fully applied 2026-10-18** (~150 sites: `EditIcon`, `CloseIcon`, `TrashIcon`, `UnlinkIcon`, `LinkIcon`, `createGlyph`; pattern test "edit, close, delete and link controls are icons"). ⊘ ↺ ↗ ↳ ↰ ◐ ◫ ▦ **fully applied 2026-10-18** (`OpenIcon`, `IndentIcon`/`OutdentIcon`, `ResetIcon`, `PaletteIcon`, `DesignIcon`, `StatusIcon`, `NoteLayoutIcon`, `TableIcon`; same pattern test). The + speed dial, Manage's nav and the Purpose filter **fully applied 2026-10-18** (line icons on palette-token circles). Nothing left on this row. NoteEditor's ribbon SVGs are local on purpose (one place uses them). |
| **Changes to a note from outside the editor go through `editNoteContent`** (`services/noteContentEdit.ts`; rule 2026-10-07, one function 2026-10-09) | `src/test/patterns.test.ts` "a note's content is changed from outside the editor only through editNoteContent" | **Fully applied 2026-10-09**: `noteReview.ts`, `crossAppLinkCleanup.ts`, `noteInbox.ts`. No exceptions (`shrinkNoteImages.ts` removed 2026-10-17). |
| **Linked Glossary text drawn once per run, never per mark element** (2026-10-07) | `src/test/patterns.test.ts` "no CSS draws content on [data-concept-ref]" | **Fully applied 2026-10-07** — new. |
| **Note blocks registered in `NOTE_BLOCK_KINDS`** (`\timeline`, 2026-10-06) | `src/test/patterns.test.ts` "every note block is in NOTE_BLOCK_KINDS" | **Fully applied 2026-10-06** — the timeline is the first note block; nothing existed before. |
| **`/api/*` via `apiFetch()`; files via `saveFile()`** (Android W1, 2026-10-04) | `src/test/patterns.test.ts` "/api/* calls go through apiFetch"; for files, `grep -rn "\.download =" src` (only `utils/saveFile.ts`) | **Fully applied 2026-10-04** — every `/api/*` caller already used `apiFetch`; the only downloads (`backupExport.ts`) now call `saveFile`. No test for `saveFile` yet (grep only). |
| **Notifications: one set of rules** (`services/notifications/plan.ts`, 2026-10-06) | `src/test/patterns.test.ts` "notifications are delivered only from the planned paths" | **Fully applied 2026-10-06** — the old checker was the only place with rules, and it now uses `plan.ts`. |
| **Pickers suggest by keywords** (`utils/suggestRank.ts`, 2026-10-01) | `src/test/patterns.test.ts` "\"link a …\" pickers suggest by keywords" | **Fully applied 2026-10-01** — NotePickerModal (its own tab-aware ranking), TaskPickerModal, ListPickerModal; every opener passes `suggestFrom`. |
| **Toasts via `showToast()` + one `ToastHost`** (2026-10-01) | `src/test/patterns.test.ts` "toasts go through showToast and the one ToastHost" | **Fully applied 2026-10-01** — no toast existed before. |
| **Task completion via `toggleTaskCompletion()`** (2026-10-01) | `src/test/patterns.test.ts` "the UI completes tasks through toggleTaskCompletion" | **Fully applied 2026-10-14**: the last exception, `taskListLinks.toggleChecklistItemWithTasks`, now completes through `toggleTaskCompletion` too. |
| **No native popups** (`ConfirmDialog`) | `grep -rnE "window\.(confirm\|alert\|prompt)" src` | **Fully applied 2026-09-20** — zero sites. |
| **Ctrl+Enter on every modal** | list modals/panes; each must bind Ctrl+Enter (`useCtrlEnterSubmit`, or the inline `requestSubmit` effect) | **Fully applied 2026-09-20.** Exception: `NoteTagPresetModal` (no primary action). *Optional tidy:* ~20 older modals still use the inline effect rather than `useCtrlEnterSubmit`. Five of them (`AddNoteModal`, `AddNoteTagModal`, `BulkUploadWatchlistModal`, `ListsSection`, `NoteEditor`) also trip `react-hooks/immutability` because the handler is a `const` referenced from an effect above it — moving them to the hook with a function declaration fixes both. |
| **Escape via `useEscapeClose`** | `grep -rlE "'Escape'" src` — every hit must be a documented inline handler that calls `stopPropagation` | **Fully applied**, and since 2026-10-04 the Android back button uses the same stack (`closeTopOverlay()`), so it is covered too. Pattern test: "the Android back button is the Escape stack". |
| **Terms from `labels.ts`** | `npx vitest run src/test/patterns.test.ts -t "Endeavour"` (quoted-string hits only; see `src/test/patterns.test.ts`) | **Endeavour fully applied 2026-09-20**, but drifted again: the AI command layer (Chunk A, merged after that audit) hard-codes "Endeavour" throughout its tool descriptions and error messages — `src/agent/commands/organisation.ts`, `read.ts`, `shared.ts`, `tasks.ts` (found 2026-09-24 by the new pattern test, which exempts `src/agent/` with a pointer back to this row so it doesn't silently regress further). Not fixed here: these are AI tool-schema/error strings, not UI a person reads, and brief `03-ai-assistant-next-steps.md`'s own rules require discussing any change to agent-facing wording with the user first. Other concept names (Purpose, Tracker, Routine, Notebook, Activity…) are still hard-coded in many strings too — only Endeavour was ever audited. Extend `LABELS` and re-audit before renaming any of them. |
| **No constant inline styles** | `grep -rnE "style=\{\{ ?[a-zA-Z]+: ?('[^']*'\|[0-9.]+)" src --include=*.tsx` | Applied 2026-09-20 except six `NoteEditor.tsx` portaled elements that carry a constant `position: 'fixed'` / `transform` alongside measured `top`/`left` (move the constants into classes). |
| ~~**CSS colours from variables (dark-mode safe)**~~ | — | **Superseded 2026-10-09 by "Design tokens" above.** |
| **Archive + delete via `ItemActions`** | panes for user-owned items | Only Task, Calendar event and Calendar reminder are on it. Notes, notebooks, lists, list items, trackers, routines, activities, schedules and watchlist items delete through `confirmDelete` (correct wording, but no "Archive instead" and no archived state). |
| **No effect-copying of item state into forms** (`react-hooks/set-state-in-effect`) | `npx eslint . \| grep -c set-state-in-effect` | **Fully applied 2026-09-20** — zero errors (was 35). Five documented `eslint-disable` sites remain, each a genuine external sync: `CalendarSidePane` (network fetch on open), `ListsSection` (consuming a one-shot request posted to uiStore by another section), `TickerChart` (fetch status), `NoteEditor` (Tiptap reload on lock/unlock), `AutoBackupSection` (loads the automatic-snapshot list from IndexedDB on mount, 2026-09-25). `CalendarView`'s equivalent site dropped out 2026-09-25 when `year`/`month`/`selectedDate` moved from local `useState` to uiStore actions (lifting Calendar's view position for nav-memory) — the rule doesn't flag calls into a Zustand action the way it flags a local `setState` call, so the disable comment became genuinely unused and was removed, not just left stale. Related lint debt not covered by this pattern (41 errors total, unaudited since 2026-09-20): `react-hooks/refs` x9 (`NoteEditor`, `ChronicleView` — docs/agent-tasks/02), `preserve-manual-memoization` x2, `no-explicit-any` x13, `no-unused-vars` x7, `ban-ts-comment` x4, `no-empty` x3, `no-unused-expressions` x2, `only-export-components` x1. |
| **Every persisted store versioned** | each `persist(` has `version` + `migrate` | **Fully applied 2026-09-20.** |
| **Every persisted store uses `persistStorage()`** | `grep -L persistStorage $(grep -rl "persist(" src/store)` must list nothing | **Fully applied 2026-09-21** — all 14 persisted stores; the two agent stores (2026-09-22) use it too. |
| **Agent commands touch data only through `agent/access.ts`** | `npm test` (`boundary.test.ts`) and `npx eslint src/agent` | **Fully applied 2026-09-22** (new code). Standing rule: "Agent command layer" in CLAUDE.md. |
| **One implementation of each create/edit rule, shared by the UI and the agent** | for calendar items: every `addEvent(`/`addReminder(` call site should build its input with `utils/calendarItemInput.ts`; for schedule blocks: `createScheduleBlock` | Applied to `AddCalendarItemModal` and `AddScheduleModal` 2026-09-22. **Remaining:** `MobileCalendarQuickAdd` builds its own event/reminder input, `CalendarEventPane` applies the end-date and notes→links rules itself on edit, and the ICS import in `IntegrationsPane` builds events directly. |
| **Every sync mapper's `xToRow` sends an explicit `deleted_at: null`** | `npx vitest run src/test/patterns.test.ts -t "deleted_at"` | **Fully applied 2026-09-24** — all 18 mappers (17 existing + the new `trashEntryToRow`), fixed in the same change that added the Recycling Bin (see CLAUDE.md "Recycling Bin"). Without this, restoring an item previously tombstoned by another device would leave it zombie-tombstoned forever. |
| **Right-click menus only through `src/contextMenu/`** (scopes + providers; adopted 2026-10-06, CLAUDE.md "Right-click menus") | `npx vitest run src/test/patterns.test.ts -t "right-click"` | **Fully applied 2026-10-06**: nothing else listens for `contextmenu` (the exceptions only suppress it: BottomSheet, useLongPress, the menu itself). Coverage of places is a feature list, not a retrofit — see "Right-click menus — next places". |
| **One icon per item kind, from `config/itemIcons.ts`** (adopted 2026-10-06, CLAUDE.md "Inline objects in notes") | `npx vitest run src/test/patterns.test.ts -t "one icon"` | **Fully applied 2026-10-06** for the reminder, deadline and task icons: NoteBacklinks, ListLinksBar, CalendarView (deadline type icon), overview/sources.ts and the note panes all read it. Not yet covered by the check: event/list/note emoji elsewhere (calendar event-type icons are a separate concept in `config/calendarEventTypes.ts` and stay there). |
| **Linked text drawn once per link by `objects/artifactGroups.ts`; `\` kinds only through `NOTE_OBJECT_KINDS`** (adopted 2026-10-06, CLAUDE.md "Inline objects in notes (`\`)") | `npx vitest run src/test/patterns.test.ts -t "linked text"` | **Fully applied 2026-10-06**: the per-element `mark[data-artifact-type]::after` icons were removed in the same change. Both creation paths (Ctrl+Q and `\`) end in the same `artifactLink` mark. A future retrofit: Ctrl+Q's Create menu could become a picker over `NOTE_OBJECT_KINDS` (one list of kinds for both), once Task and Event kinds exist. |
| **Creation panes show the "what are you creating?" switcher** (`CreateKindSwitcher` + `config/createKinds.ts`, adopted 2026-10-05; CLAUDE.md "Creation panes: the switcher") | `npx vitest run src/test/patterns.test.ts -t "createKinds"` (registered kinds have a pane); `grep -L "CreateKindSwitcher" src/components/Add*Modal/*.tsx` lists the panes without it | **Applied to Notes only** (`AddNoteModal`, `AddNoteTagModal`). Not yet: Records (`AddTrackerModal` / `AddEntryModal` / `AddRoutineModal`), Lists (`AddListModal` / `AddListItemModal`), Portfolio (`AddWatchlistItemModal` / `AddPortfolioTagModal` / `AddInvestmentPurposeModal`), Fitness (`AddActivityModal` / `EditActivityTypeModal`), Tasks (`AddTaskModal`, also `AddCollectionModal` / `AddPurposeModal` / `AddTagModal`?), Calendar (`AddCalendarItemModal` already switches event/reminder/deadline inside itself; decide whether those become registry kinds), Overview. Also: the speed dial (`AddTaskButton`) keeps its own per-section option lists; it could read `CREATE_KINDS` instead. Each pane joining also reads `uiStore.createDraft` for its first field. |
| **Row hover-action menu (`RowHoverActions`), not inline-growth CSS** — **changed 2026-10-05 to `RowOptionsMenu`** (the row's leading icon becomes a ⋯ on hover; hovering the ⋯ drops the actions down in the icon column; hovering the row opens nothing) | `npx vitest run src/test/patterns.test.ts -t "RowHoverActions\|RowOptionsMenu"` | **2026-10-05: fully applied to all 7 row sites** (Chronicle, Sidebar ×3, Manage, Lists, Records, Overview); a pattern test keeps the hook/menu private to `RowOptionsMenu` and `HoverOptions`. **Fully applied to all 5 known nav-column sites 2026-09-24** (see CLAUDE.md "Row hover-action menu"). **Known gap, not fixed**: the pattern is hover-only, with no touch/tap fallback — the old inline-growth CSS it replaced had one (`@media (hover: none)`). **Now a real problem**: Manage (via More), Records, Lists and Notes are all reachable on Android, so their row actions are unreachable there. Fix decided 2026-10-04 (D1): long-press opens the same items in an `ActionSheet` — see the next row. |
| **Android: every hover affordance has a touch path** (long-press → `ActionSheet`, D1, decided 2026-10-04 — `docs/android/11-design-and-coding-patterns.md` §6.1) | `grep -rlE "useRowHoverActions\|HoverOptions" src/components` — each site must work via long-press on Android (once the shared change lands, all do) | **Fully applied 2026-10-04 (W2)** for `RowHoverActions` and `HoverOptions`: `useRowHoverActions` adds long-press on Android and `RowHoverActionsMenu` shows the actions in a `BottomSheet`; every site's actions are `RowAction`s with a label from `LABELS` (pattern test: no raw `<button>` inside a `<RowHoverActionsMenu>`). `TruncatedText` wraps to two lines on Android. Still hover-only, by decision or later workstream: `LinkHoverPreview` and calendar hover cards (n/a: a tap opens the item), NoteList's inline note-row actions (W7). Also fixed: AddTaskButton's speed dial opened on sticky `:hover` after a tap and its empty column swallowed taps on the list. |
| **Android: every hotkey records its touch path** (`HotkeyDef.touch`, D13, decided 2026-10-04 — patterns doc §6.2) | pattern test to add with the field: every `HOTKEYS` entry has a non-empty `touch` | **Fully applied 2026-10-04 (W2).** `touch: string` is required on `HotkeyDef`; every entry has the path or `'n/a: <why>'`. Pattern test: "every hotkey names its touch path". |
| **Android: phone sheets use `BottomSheet` / `ActionSheet`** (adopted 2026-10-04, W2 — CLAUDE.md "Bottom sheets") | pattern test: no `.sheetOverlay`/`.sheetPanel` class outside `components/BottomSheet/`; manually, `grep -rln "align-items: flex-end" src --include=*.css` and check each phone sheet | **Partly applied.** Migrated: `CollectionFilterPicker`/`PurposeFilterPicker` `'sheet'` variants, `MobileMoreSheet`. Still hand-rolled: `MobileCalendarQuickAdd` (its own overlay/grabber; move it with gap C1 in W3) and `CalendarSidePane`'s Android full-screen sheet. Not in scope: `AccountPane`/`RecyclingBinPane` (the general modal's narrow-screen bottom-sheet layout, not a phone sheet). |
| **Android: row gestures use `useLongPress` / `useSwipeRow`** (adopted 2026-10-04, W2 — patterns doc §5, §7) | `grep -rn "addEventListener('touch" src/components` — each hit should be one of the shared hooks, or a canvas gesture with a reason | **Partly applied.** `TaskItem` moved to `useSwipeRow`; `RowHoverActions`/`HoverOptions` use `useLongPress`. Own gesture code left: `CalendarView`'s period swipe (a canvas swipe, not a row: could share `startsAtEdge`/`lockAxis` from `useSwipeRow.ts`), `MobileCalendarQuickAdd`'s grabber drag. `AddTaskButton`'s document `touchstart` is an outside-tap close, not a gesture. |
| **Android: swipe-left reveals Archive + Delete; gesture deletes are immediate with an Undo toast** (D2, decided 2026-10-04 — patterns doc §9) | `grep -n "swipeDelete" src/components` | **Applied to `TaskItem`** (Archive + Delete behind a left swipe, each with an Undo toast; checked 2026-10-14). Not yet: tracker entries and list items, when Records (on hold) and Lists are built for the phone. |

### Local storage headroom (logged 2026-09-21; notes moved to IndexedDB 2026-09-22)

Found when a user hit `QuotaExceededError` opening a note: the whole app shared ~5 MB of localStorage and notes keep pasted images inline as base64. **Done:** the crash is guarded for every store (`persistStorage`), new pasted images are compressed (`imageCompress.ts`), Settings → Storage shows usage and shrinks existing images, and **the notes store now lives in IndexedDB** (`idbStorage.ts`) — see "Zustand migration rule" in CLAUDE.md and "Notes in IndexedDB" in implemented-features.md. **Still open:**
- ~~**Images as separate blobs**~~ — **done 2026-10-17** for the note side: the picture library (`services/pictures.ts`, CLAUDE.md "Picture library") holds every picture once; note text holds only ids. **Still open:** pictures are whole rows in the `pictures` table (base64 in a text column), not Supabase Storage files; a multi-MB file (the PDF idea) would want Storage, which is a change inside `services/pictures.ts` only.
- **Picture library cleanup** (logged 2026-10-17): pictures no longer used anywhere (removed from a note's text or a card, or their note deleted for good) stay in the library. A cleanup needs every note, entry and Recycling Bin snapshot readable (run while unlocked), should wait a grace period (say 30 days unused, so undo and restore keep working), and skips backdrop pictures (the person manages those in the picker). Not urgent while the library is small; Settings → Storage could show the library's size meanwhile. Shrinks every Supabase `notes` row and sync push, which still carry the base64; needs an upload story (Supabase Storage) to work across devices.
- **`touchNote` rewrites the entire notes store on every open** (`lastViewedAt`) — now a whole-store JSON write to IndexedDB each time. Keeping `lastViewedAt` out of the persisted note (a small separate map) would remove most of the churn. More generally, the store is persisted as one JSON string; per-note records in IndexedDB would make each save proportional to the note changed, not to all notes.
- **Other stores stay on localStorage.** None is likely to reach 5 MB (Lists with many items is the next candidate); `persistStorageIdb()` + `IDB_STORAGE_KEYS` moves one when needed.
- **A persistent "not saving" indicator** — today the user gets the alert (repeated every 10 min) but nothing lasting in the UI once dismissed.
- **Desktop/Android limits are unmeasured.** IndexedDB in WebView2 and the Android WebView should behave like Chromium's, but neither was tested.
- Renamed titles don't update in text inserted from a "Linked from" pill — accepted, not planned.

### Sync — remaining gaps (logged 2026-09-22, after the pending-changes queue)

The queue/retry/reconcile work is built (see "Sync that survives offline" in implemented-features.md). Still open:
- ~~**Deletions in the load window**~~ — fixed 2026-10-14: the watchers run during the load and pushes wait until its merge is done (CLAUDE.md "How sync works").
- **No realtime and no periodic pull.** Another device's changes arrive only on its next launch / sign-in / Android pull-to-refresh. Options: Supabase realtime channels per table, or a cheap incremental pull (`updated_at > lastPull`) on focus.
- **Offline edits to records without `updatedAt`** (tags, list types, portfolio tags/purposes) lose to the cloud. Needs an `updatedAt` on those domain types (+ migration).
- **Conflicts are last-write-wins on `updatedAt`, whole row.** Two devices editing the same note lose one edit; no merge or conflict UI.
- **Whole-row pushes for big notes** (inline base64 images) on every autosave — see "Local storage headroom".
- **Every launch downloads every row** of every table (`select *`); incremental sync would cut that.

### Data that exists only on one device (sync not built)

Signing out can only safely clear data that is confirmed in the cloud, so these stores are deliberately left alone on sign-out (`clearSyncedLocalData()` in `src/services/clearLocalData.ts`, built 2026-09-20; the sign-out confirmation tells the user they stay). **When any of them gains Supabase sync, add it to `clearSyncedLocalData()` at the same time.**

- **Fitness** (`fitnessStore`: activities, activity types) — no Supabase tables yet. Sync design already noted in docs/features/fitness.md (custom activity types only; built-ins are re-seeded like `list_types`; `(source, sourceId)` upsert for Strava).
- **Routine instances** (`routineStore`: the per-day record of which steps of a routine were ticked, whether that day was completed, and the tracker entry it produced). The routine *definitions* (name, steps, schedule) are Collections and already sync; the per-day instances and the Records "history" table built from them do not. Completing a routine does create a `TrackerEntry`, which does sync — so the completion itself reaches the cloud, but a half-ticked checklist and the history table stay on that device. Needs a `routine_instances` table (key `${routineId}_${date}`), mappers, `SYNC_TABLES` entry, and `PERSISTED_STORAGE_KEYS` is already covered.

### Existing stores/actions with no UI (features, not patterns)

- **Custom list types.** `listStore.addListType/updateListType/deleteListType`, the sync path (`list_types`, custom types only) and the mappers all exist, but nothing in the UI creates, edits or deletes a list type — users can only pick the built-ins (including the built-in "Custom" type). Build a list-type manager (name, icon, colour, kind, field schema — the same editor `AddListModal` already has) or remove the plumbing.
- **Portfolio tags and investment purposes: create only.** `AddPortfolioTagModal` / `AddInvestmentPurposeModal` create them, but `portfolioStore.updatePortfolioTag/deletePortfolioTag/updateInvestmentPurpose/deleteInvestmentPurpose` are never called — a tag or purpose can't be renamed, recoloured or removed once made. It needs an edit/delete affordance (the Manage view pattern would fit).

### OAuth flow hardening — bind the connect flow to the browser that started it

*(Logged 2026-09-20, from agent brief 01 task 1.)* Strava / Google Calendar connect uses a single-use `state` nonce (migration 032), but nothing ties the nonce to the browser that started the flow, so "login CSRF" (an attacker starts a flow on their own account and tricks a victim into approving the consent screen, attaching the victim's calendar/Strava to the attacker) is an accepted residual risk. Fix: run the OAuth in the system browser with a deep-link return (Tauri/Android) and a PKCE-style verifier stored by the app and checked at completion, or, web-only, an HttpOnly cookie on the Vercel origin compared with `state` by the callback. Both need the Tauri/Android hand-off first. Reasoning in `implemented-features.md` "OAuth `state` nonces".
