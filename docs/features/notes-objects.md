# Inline objects in notes (`\`): the design spec

<!-- Moved out of CLAUDE.md on 2026-10-09 (audit: CLAUDE.md is read every session, this is reference). Read it only when the task needs it. -->

The rules for adding a kind are in CLAUDE.md "Inline objects in notes". This is how the pieces behave, settled with the user over five rounds on 2026-10-06 (history: the "Inline objects in notes" entry in `implemented-features.md`).

## The kind and typing it

**The kind** (`types.ts`, `NoteObjectKind<D>`):
- Identity: `id` (the keyword), `aliases`, `label`, `icon`, `hint`, `targetType`.
- Reading the text: `parse(body, ctx)`, pure.
  - It reuses the app's existing inference (`utils/textToTask.ts`) after `expandShortWeekdays` ("fri 1-2pm"), and tidies the title with `tidyObjectTitle` (a trailing "important" is the flag).
  - **Saying nothing about when means tomorrow at 12:00** (an event 12:00–13:00): `DEFAULT_OBJECT_TIME` / `defaultObjectDate` in `whenInput.ts`. A date alone is a whole day; a time alone is today.
- The preview's editable lines: `fields` / `applyField`, read with `readWhenInput`. Then `validate`.
- Acting:
  - `create(draft, ctx, backLinks)` goes through the same input builder the UI and the agent use (`utils/calendarItemInput.ts`).
  - `discard` is the toast's Undo: delete, and forget the Recycling Bin entry.
  - `openFull` opens the full pane, prefilled. Also `describe` and `linkText`.

**Typing it** (`session.ts`, `NoteObjectTrigger.ts`, `actions.ts`, `NoteObjectMenu.tsx`):
- **The session is derived from the text.** Plugin state holds only where the `\` is, how far the draft reaches, the menu highlight and the field overrides. Don't add state that would have to be kept in step with the text.
  - It starts only when a `\` is *typed* at a line start or after whitespace (never in a word, in code, or from paste).
  - It ends when the cursor leaves the draft, the `\` is deleted, or on Esc, and always leaves the text as typed.
- **Keys**, consumed with `stopPropagation` so the Escape stack and a pane's Ctrl+Enter don't also act:
  - ↑/↓, and Tab picks a kind; Enter picks once something is typed or the arrows were used.
  - Enter creates; Ctrl+Enter opens the full pane via `uiStore.pendingArtifactLink`, exactly like Ctrl+Q; Tab focuses the fields.
  - Esc ends it; `\\` types one backslash.
  - All changes go through `actions.ts`; the menu holds no state of its own.
- **Where it's created** comes from `objectTriggerStorage(editor).getContext` (set by NoteEditor in an effect): the note, its tab, its Endeavour.
- **The note text is the item's title.** Enter replaces what was typed with the title.
  - The full pane's hand-off (`replaceWithTitle`, resolved by `applyResolvedArtifactLink`) puts in the *final* title. It always waits, even with nothing typed.
  - Undo restores the typed words.

## How a linked item is drawn

**How a link is drawn** — only by `artifactGroups.ts` (`ArtifactLinkGroups`), for `\` and Ctrl+Q links alike. The mark is unstyled data. **Never draw anything per `mark[data-artifact-…]` element in CSS**: ProseMirror splits a mark per paragraph and around other marks, so it would repeat (pattern test). The pieces are grouped into one link (`collectArtifactGroups`) and drawn as **one pane that expands**. It's **visual, not an editing form**: no field labels, each thing click-to-edit where it's shown.

- **Inline:** `[icon KIND ❗] title [date time · ✏️🔁 · state · ↗ ▾]`, sized to its contents. Important sits **before** the title in both views (it changes how much attention the item needs). It's a head widget, the text's inline decorations and a tail widget (`side: 1`) sharing one outline; keep the three at the text's font size so their borders line up.
- **Expanded:** the paragraph holding the link becomes the box (node decoration). `ArtifactBody` sits inside the same paragraph (its own React root, keyed stably, so typing in it never rebuilds it). Four bands:
  - **top bar:** icon, kind, ❗ (Important only — it matters most), title, and ↗ ▴ **right-aligned** (`paneActions`);
  - **second heading line** (`WhenLine`, then the kind's place / Endeavour / notification): everything that's **on**;
  - **content:** notes and links;
  - **bottom bar:** everything that's **off**, greyed.
  - **On → the heading lines, off → the bottom bar, never both.**
- **Clicks**, the same in both views:
  - The title (note text) and the date and time (`editWhen`) highlight under the mouse and edit on a click.
  - ↗ opens.
  - **Done lives in the icon slot.** While the pane is hovered (tracked per link, `data-hover` on every piece) or once done, the kind icon shows as ☐/☑ in the same space. Never put a done box elsewhere.
  - In the expanded view, a click on an active option (❗ in the top bar, ✏️ 🔁 in the second line) removes it. It reappears greyed at the bottom, where a click turns it back on.
  - **Any other click on the heading** expands or collapses: the pieces' background, the box's own empty space (the plugin's `click`, keyed by `data-artifact-key`), and the second line's empty space (`onToggle`).
  - A new control goes through `control()`, or stops its click, so it doesn't also toggle.
- **State** (`ArtifactState`, from `summarize`):
  - **done** (ticked) and **past** (an event that has ended; a repeating one never is) are drawn **faded**, not struck through. That's the practice of calendar and to-do apps, chosen 2026-10-06. Hovering brings it back to full strength.
  - **overdue** (past and not done) stays at full strength, with "Overdue" in the warning colour: it still needs doing.
  - A whole-day item is overdue only after its day.
- **Repeating items** (the user's design, 2026-10-06):
  - The pane shows, and ticks, the **current occurrence**: the first from today on that isn't done (`currentOccurrence`, `calendarItems.ts`). Ticking it moves the pane on to the next, the way a recurring to-do does; the ticked date stays ticked (`doneDates`).
  - The date reads "Tue, Oct 13 ▾". A click drops down the **list of dates** (`OccurrenceList` in `WhenLine.tsx`, from the type's `occurrences`): a few before (faded), the current one (NEXT), the next several. Each can be ticked (`toggleOccurrenceDone`) and opened on its own in the calendar (`openArtifactTarget(type, id, date)`, where the pane offers "only this one / this and following"). At the bottom: the rule ("Every week") and "Open the series".
  - In the inline pane the same date expands the pane with the list open (`occurrenceRequests.ts`).
  - ↗ opens the current occurrence.
- **Removing something that takes data with it asks first.** Turning Repeat off removes every other date of the series, so the flag's `toggle` confirms (`confirmDialog`, destructive) before it acts. The user lost a series to one stray click. Other options toggle at once. A new option that destroys data on removal does the same, inside its own `toggle`, so every place that offers it (heading icon, right-click menu) is covered.
- **A pane's body UI state lives in `paneState.ts` (`usePaneState`), never in plain `useState`**. That covers the list of dates being open and half-typed notes, links or place.
  - ProseMirror matches widgets one step at a time, so replacing the heading widget just before the body (its date changed) builds the body again, and component state would be lost: the list closed under the click that ticked a date.
  - The state is keyed per pane and cleared when it collapses. Don't try to keep the old DOM element instead: tried, and ProseMirror detaches it.
- **Options** (Important, Tentative, Repeat) come from **one list per kind**: `flags(id)` → `ArtifactFlag[]` (`flags.ts`). It feeds the heading icons (on), the greyed bottom-bar options (off; Repeat asks how often) and the right-click menu (`flagMenuItems`). A new option is one entry in the list.
- **Notifications:** an opt-in one (an event's) is a greyed "Notify me" while off. One the calendar always sends (a deadline's, a whole-day reminder's) is shown as its setting chip, never as off (`NotifyChips.tsx`).
- **A kind's `Body`** maps its fields onto the shared `ObjectBody`:
  - for the second line: `heading` (from `WhenLine`), place, Endeavour, `extra` (active chips);
  - for the content: notes and links;
  - for the bottom bar: the off `flags` plus `offExtra`.
  - `onToggle` lets its empty space collapse the pane.
- **Editing the title as text:**
  - The mark is inclusive, so typing at a title's end extends it. The plugin's `appendTransaction` drops the mark from stored marks on any line that doesn't hold it (Enter after a title starts plain text).
  - Home/End on an expanded heading are handled by `paneLineKeys`, because the body box confuses the browser's own.
  - A commit that clears stored marks must do so *after* its last step.
- Which view is the mark's `display` attribute. Live data is redrawn on store changes and every minute. Task completion goes through `toggleTaskCompletion`.
