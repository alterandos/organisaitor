# Note blocks: design and UX review (2026-11-02)

Status: For the user to triage. 2026-11-02: §1.2 / B3 (dark-mode contrast) fixed; §4 patterns 1 and 2 agreed and built (the part handle: CLAUDE.md "Block designs"), with the §4 breaches; study mode (§1.6, question 3) in BACKLOG.md "Study mode for blocks".

**How this was done.** Every block with a standalone example (25 of 30; not the Glossary cards, Profile or embed, which need records) was rendered in every design, light and dark, in the real note editor (a separate dev server and browser profile; screenshots in the session scratchpad). Then the code was read for how parts are added, deleted and moved. Findings marked *(check)* were seen in a headless browser and want your eye in the real app.

**How each design was judged** (five questions, the usual ones in UX reviews: Nielsen's heuristics plus visual craft):

1. **Does it say the structure?** Someone glancing at it understands the shape of the idea (a cycle, a sequence, a choice).
2. **Craft:** alignment, spacing, type scale, no collisions or clipping, consistent with its block family.
3. **Robust:** works with 2 parts and with 9, with long text, at a narrow width, and in dark mode (contrast AA).
4. **Editable everywhere:** every part can be added, changed, **deleted and moved**, by keyboard, mouse and touch, and you can find out how.
5. **Delight:** smart defaults, feedback when things change, something it does that paper can't.

Severity: **Bug** (wrong or broken) · **UX** (works, but hard or confusing) · **Polish** (looks unfinished) · **Idea** (new).

---

## 1. Cross-cutting findings (the biggest wins)

These affect many blocks at once. Fixing them once fixes them everywhere.

### 1.1 Parts are easy to create, hard to delete, and can't be moved at all (UX, high)

This is the asymmetry you noticed, and it's systematic:

| | Add a part | Delete a filled part | Move a part |
|---|---|---|---|
| Breakdown, Cycle, Hierarchy | Enter, menu | **hover button** + menu | none |
| Pyramid, Steps, Types, Options, Key (steps), Inbox | Enter, menu | right-click only | none |
| Compare (sides) | menu | right-click only | none |
| Timeline, Conclusion, Pros/cons, Argument, Compare points, Cause & effect, Venn, Key choices, Options' points | Enter | **clear all its text, then Backspace** (or Ctrl+click → Delete, which nobody will find) | none (timeline sorts itself) |

- **No block has reorder.** No drag, no Alt+↑/↓, no "Move up". To move a step you retype it.
- Deleting a filled part in the bottom group takes three or more actions, and is undiscoverable.
- On touch, only blocks with a right-click entry have a delete path (via long-press menu); the rest have none.

**Recommendation: one "part handle" for every block (a new pattern, see §4).** Each part gets the same four operations in the same four places:
- **Keyboard:** Alt+Shift+↑/↓ move the part; Ctrl+Shift+Backspace deletes it whole; Ctrl+D duplicates it (Notion, Logseq and Workflowy use these).
- **Hover:** a ⋮⋮ grip at the part's edge: drag to reorder, click for a small menu (Delete, Duplicate, Move up/down, Add before/after).
- **Right-click:** the same items, in every block's menu.
- **Touch:** long-press the part opens the same menu.

It can be built once: `blockPicks.ts` already knows every block's part type (`BLOCK_PART_NODES`) and already deletes parts generically while respecting each block's minimum (`validContent`). Move and duplicate are the same kind of schema-checked change.

### 1.2 Dark mode: text on a block's colour fails contrast (Bug, accessibility)

Block colours in dark mode are pastels (`--color-block-steps: #f9a8d4`, `--color-block-options: #c4b5fd`), but text on them uses `--color-on-primary`, which is white in both themes. White on those pastels is about 1.6–2:1 (AA needs 4.5:1).
- Seen: the Steps stepper's numbers, Options' "CHOSEN" badge (`[data-op-status="chosen"]`).
- Likely anywhere a block fills a shape with its accent and writes on it.
- Fix: a `--color-on-block` token (dark ink in the dark theme) set beside `--color-primary` in the "Block colours" rule, used for text on an accent fill. A pattern test can check the tokens' contrast.

### 1.3 Designs aren't tested at the edges (Polish → Bug)

Most visual bugs below share one cause: a design that looks right with the example's part count breaks with more parts or longer text (Cycle Flow overflows, Breakdown Hub leaves a large gap, Steps Stairs rise unevenly). Recommendation: a **block gallery script** that renders every design with 2, 5 and 9 parts, short and long text, light and dark, to look over before a block is called done. The harness used for this review is about 60 lines (see §5, Q2).

### 1.4 Some designs drop information or barely differ (UX)

A design should show the same content another way, never hide part of it without saying so:
- **Cause & effect List** drops every link (what causes what), the block's whole point.
- **Options Tiles and Either** drop the status (which one was chosen).
- **Pairs too close to be worth two designs:** Options Fork vs Side (Side is Fork without the goal box); Inbox List vs Cards; Hub List vs Compact (identical when empty).

### 1.5 Weight dots in Pros/cons, Argument and Options (Polish)

The weight is drawn as three tiny superscript dots touching the text (`•••Fast`). It reads like a typo, it's too small to click, and the weight can't be told apart at a glance. Suggest a small fixed-width gutter before the text with the weight as 1–3 filled pips (or bars) at text height, clickable to cycle, and the heavier points shown in a bolder weight.

### 1.6 Ideas that apply to every block

- **Turn into ▸** (right-click): convert between blocks of the same shape without retyping: Breakdown ↔ Hierarchy ↔ Types ↔ bullets; Steps ↔ Timeline ↔ Cycle; Pros/cons ↔ Argument ↔ Options (one option); Compare ↔ Venn. Content maps part to part.
- **Paste a list into a block:** pasting bullet lines into a part makes one part per line (today they land as one part's text, presumably).
- **Animated design switch:** the app already has `withViewTransition`; give each part a `view-transition-name` so switching Ring → Steps morphs the stages into place. A large delight return for little code.
- **Design previews:** hovering a design button in the pill previews it on the block; leaving restores. People pick designs by seeing them.
- **Study mode** for the blocks that hold knowledge (see each block): hide and reveal (Question, Key, Cycle, Steps), using the Review intervals already in the app.
- **Width** (the shared `blockWidth.ts`) for Quote, Conclusion, Case study, Convert and Code (already the backlog's candidates).

---

## 2. Bugs found (one list, most visible first)

| # | Block · design | What's wrong | Likely cause / fix |
|---|---|---|---|
| B1 | Code · Numbered | Line numbers run across one line ("1 2 3 4 5") instead of down the gutter. Also the panel's bottom corners are square and the last line touches the edge. | ProseMirror's own CSS `.ProseMirror [contenteditable="false"] { white-space: normal }` beats `.editorContent [data-code-gutter] { white-space: pre }` (same specificity, loaded later). Raise the specificity. Confirmed by computed style. |
| B2 | Compare · Versus | The "vs" badge sits over the first letter of the second title ("alcite"). | Badge is centred on the column gap but the right title has no left padding for it. |
| B3 | Dark mode · Steps (stepper numbers), Options ("Chosen") | White text on a pastel fill, ~2:1 contrast. | §1.2. |
| B4 | Cycle · Ring | An arrow's label collides with a stage card ("Burial & lithification" over Sedimentary rock); labels float far from their arcs. | Labels placed at a fixed radius; place each at its arc's midpoint, pushed outward, and avoid the measured cards (`RingLayout` already measures them). |
| B5 | Cycle · Flow | Five stages overflow the note at 1500 px; the fifth card and its label are cut off, and the return arrow runs off the edge. | No wrap. Wrap into rows (snake), or shrink cards, or fall back to Steps past N stages. |
| B6 | Steps · Stairs | The steps don't rise evenly: 1 and 2 at the same height, then uneven rises. | Heights come from content; give each step a fixed rise (`calc(var(--i) * rise)`) and let text grow downward. |
| B7 | Diagram · Flow, Flowchart | With a loop (the example's feedback cycle), the laid-out arrows cross through boxes and over each other, and the "amplifies" label sits on a line. Flowchart is zoomed out so its text is smaller than the other designs. | dagre needs the back edge marked (route it around the side), and `fitView` with a `maxZoom`/`minZoom` of 1 so text stays one size. |
| B8 | Chart · Scatter | Year axis reads "1,960", "2,020". | Number formatting on a linear x-axis; when labels look like years, format without grouping. |
| B9 | Cause & effect · Fishbone | Effects and knock-ons are drawn as the bones of the last effect ("Warming" and "More methane" as causes of "Sea level rises"), mixed with real causes. | A fishbone's bones should be the causes (grouped by column, or by category), the head the final effect. |
| B10 | Options · Fork *(check)* | Short connector stubs drop from the line into the gaps between cards, joining nothing. | Connectors drawn per gap as well as per card. |
| B11 | Breakdown · Hub | Large empty space below the hub (about 120 px) with three parts. | The block reserves a square; size it to the measured parts. |
| B12 | Maths *(check)* | The minus in `e^{-λt}` doesn't show in the rendered formula. | Could be the headless font; check in the app. |
| B13 | Venn · Table | An empty extra row at the bottom. | Probably the "add" row drawn empty. |
| B14 | Types · Guide, Umbrella | An examples line that wraps puts its last word on a much taller line ("shale" alone, big gap). | The italic examples span's line-height differs from its parent. |

Not a block, seen in passing: **headings in a note with no H1/H2 above are numbered "0.0.1", "0.0.2"**. Probably numbering should start at the highest level used.

---

## 3. Block by block

Score per design is out of 5 against the five questions above (rounded; it's a guide, not a measurement). ✓ means no issue worth listing.

### Structures

**Timeline** — Rail 4 · Horizontal 4 · Ledger 4
- UX: deleting an entry means emptying its When and its text first (§1.1). No reorder needed in date order, but needed in Manual order.
- Polish: Horizontal alternates above and below well; check it with 9+ entries (does it scroll, wrap?).
- Ideas: **spans** (an entry with an end, drawn as a bar: "1914–1918"), a **Today** marker when the Whens are dates, eras (a shaded band behind several entries), Alternating and Compact (already in backlog).

**Cycle** — Ring 3 · Flow 2 · Steps 4
- Bugs: B4, B5.
- Polish: Ring's arrows are short and heavy next to small cards; thinner arcs nearer the cards read better. The name in the middle has room for a short description.
- Ideas: highlight the arc you're editing; Orbit and Spiral (backlog); **Play**: step through the stages one at a time (study).

**Breakdown** — Hub 2 · Pillars 2 · Tree 4
- Bug: B11.
- Polish: Hub cards are narrow (text wraps every two words) and the dotted connectors barely reach. Pillars' column fluting (dense vertical lines behind the text) reads as noise and lowers the text's contrast; suggest two faint lines, or none. The pillars' pediment and base are good.
- Ideas: show each part's share when parts have numbers ("Radiometric 60%") as a stacked bar design; Tree with nested parts (a part with parts).

**Types** — Guide 3 · Umbrella 4 · Is-a 4 · Compact 5
- Bug: B14.
- Polish: Guide's cards keep a fixed width and leave the right half empty; let them fill the row (grid `auto-fill, minmax`).
- Ideas: sub-types (a type with types) as Is-a's natural next step; **link a type to its Glossary record** (Concept "Igneous rock").

**Identification key** — Couplets 4 · Cards 4
- Polish: "→ 2 ↘": the ↘ glyph's meaning isn't clear; "→ step 2" with the jump on click is enough. Couplets' fixed width leaves the block narrower than the note for no reason.
- UX: deleting a choice inside a step has no menu entry (only empty+Backspace).
- Idea (strong): **Identify mode**: answer one step at a time ("Does it scratch glass? Yes / No") and land on the answer. It turns the key into a tool, which is what a key is for. A path breadcrumb of the answers taken.

**Hierarchy** — Tree 5 · Columns 4 · Outline 3
- Polish: Outline repeats its level label on every row (ERA, PERIOD, PERIOD, ERA…); show each level's label once, as a column heading, or only where the level changes.
- ✓ Tree is the best-crafted design in the set; its "+" beside parts and corner delete are the model for §1.1.
- Ideas: collapse a branch; drag to re-parent (backlog); Radial.

**Pyramid** — Pyramid 3 · Funnel 4 · Stacked 4
- Polish: the apex layer's text wraps tightly into the point ("IPCC / assessments"); give the top layer a minimum height or put its label beside it. Notes sit in a column with no line to their layer; a faint leader line helps. Funnel is narrower than the other two for the same content.
- Ideas: numbers on layers; a 3-D shade (backlog).

**Steps** — Stepper 4 · Chevrons 3 · Cards 4 · Stairs 2
- Bugs: B3 (dark), B6.
- Polish: Chevrons' step number is tiny in the top-left corner; put it before the label in the same size. Chevrons don't fill the width. The emoji in small tinted squares look faded at that size; larger emoji without the box, or the box only when no icon.
- Ideas: **tick steps off** (a done state per step, for following a procedure: a lab method, a recipe), with progress in the title; the step you're on highlighted.

**Conclusion** — Arrow 5 · Brace 3 · Therefore 4 · Total 4 · Funnel 3
- Polish: Brace spans the whole width though the premises are short; it should hug the longest premise. Funnel's premise text is smaller than the note's.
- UX: deleting a premise (§1.1).
- ✓ Arrow is excellent: clear, compact, unmistakable.

**Case study** — Card 4 · Report 4 · Compact 4
- Polish: "Setting" is the only italic label; make it match the others.
- Idea: link the principle ("What it shows") to a Concept in the Glossary.

**Cause & effect** — Flow 3 · List 2 · Fishbone 2
- Bug: B9. List: §1.4 (show each item's links under it: "→ More CO₂").
- Polish: the columns are headed THEN, THEN, THEN; "Knock-on 1, 2, 3" or nothing. Flow's curves are thin and their arrowheads small.

### Weighing

**Compare** — Versus 3 · Table 3
- Bug: B2.
- Polish: Table repeats each row's label inside every cell ("Hardness | Hardness: 7…"); strip the "Label:" prefix in Table (it's the row heading), and align the row labels with the cell text (they sit higher).
- Ideas: highlight the winner per row; a third side already works (menu), so a "+ side" button at the right.

**Pros and cons** — T-chart 4 · Scales 4 · Ledger 3
- §1.5. Ledger is narrower than the others.
- Polish: Scales' pans read as cones; a flatter pan shape. The tilt is a lovely touch: animate it when a weight changes.

**Options** — Fork 3 · Side 3 · Ranked 3 · Tiles 2 · Either 3
- Bugs: B3, B10. §1.4 (Tiles and Either drop the status; Fork vs Side).
- Polish: Ranked's score bar floats unlabelled in the middle of the card; label it ("Net +3") and put it by the title.
- Idea: let the person mark a decision date and why; "Chosen" then reads as a decision record.

**Argument** — Card 4 · Tree 4 · Debate 4
- §1.5. "Leans against (−2)" is the verdict but is the smallest, faintest text in the block; make it a visible verdict line (a small balance bar) near the claim.
- UX: no menu entry to delete a piece of evidence.

**Venn** — Circles 4 · Table 4
- Bug: B13.
- Polish: Circles' items are small (smaller than body text); the set names sit far above their circles.
- Ideas: click an item to move it between regions; three sets (supported? worth checking in the gallery).

### Cards and visuals

**Quote** — Classic 5 · Card 4 · Pull 5
- Polish: Card's quote mark is small and sits above the text; either a large faint mark behind the text or none (the left bar already says "quote").
- Ideas: a picture for the speaker in Card (backlog), Speech bubble (backlog).

**Question** — Card 5 · Compact 3
- Polish: Compact's ✅ isn't aligned with the question's first line, and the two halves split 50/50 whatever the lengths.
- Idea: **flashcard flip**: hide the answer until clicked (and in study mode); the Glossary flashcards in the backlog would share it.

**Chart** — Column 4 · Bar 4 · Line 4 · Area 4 · Pie 3 · Doughnut 3 · Scatter 3 · Waterfall 3
- Bug: B8.
- Polish: axis and legend text is about 9 px, smaller than anything else in a note; set Chart.js's default font size from the note's (`--text-xs` at least). The guide's example shows a time series as a pie (a poor fit); the example could change per design.
- Ideas: data labels, height (backlog).

**Code** — Plain 4 · Numbered 1 · Terminal 4
- Bug: B1.
- Ideas: a copy button on hover; a filename/title in the header; highlighted lines.

**Maths** — Centred 4 · Left 4 · Numbered 4
- B12 *(check)*. ✓ otherwise.
- Idea: refer to a numbered equation from text ("see (1)") as a note link to the block, numbering kept in step.

**Diagram** — Free 4 · Flow 2 · Flowchart 2
- Bug: B7.
- Polish: arrows and their labels are pale grey and thin; the canvas has a fixed height with lots of empty space (fit to content); the "React Flow" attribution shows in every diagram (it can be hidden with `proOptions`; React Flow asks commercial users who do so to subscribe, so that's your call).

**Conversion** — Card 3 · Compact 3
- Polish: Card is a fixed narrow width with empty space below the fields; the converter name floats in the middle of the header. Compact's "—" between the converter and the amount reads as a minus.
- Idea: show the "≈ like…" size comparison under the result (the converters have it).

### Containers

**Inbox** — List 3 · Cards 3 · Board 3
- Polish: List and Cards are nearly the same (§1.4). Board repeats the status pill on every card in a column already named for it, and an empty column ("Built") has no empty state or drop hint. Blank space (about 60 px) after the block.
- Ideas: drag a card between Board columns to change its status (the most expected interaction on any board).

**Hub** — List 3 · Compact 3
- Polish: the hub is a flat grey slab with a dark bar; it's the least designed block, though it's the one that holds a big idea. The empty-state text is long and small. Compact centres "+ Link…" where List puts it left.
- Ideas: a **Map** design (the hub in the middle, its links around by relation; React Flow is already loaded for diagrams); link counts per relation.

**Not reviewed visually:** Glossary cards (Definition, Acronym, Concept, Profile) and Embed, which need records from your notes. Worth putting in the gallery with a fake record.

---

## 4. Patterns and breaches

**New patterns proposed (need your approval before they go in CLAUDE.md):**

1. **Every part of a block can be added, deleted, duplicated and moved, in the same ways** (§1.1): keys Alt+Shift+↑/↓, Ctrl+Shift+Backspace, Ctrl+D; a ⋮⋮ grip on hover (drag, or click for a menu); the same items on right-click and on long-press. Built once on `BLOCK_PART_NODES` and `blockPicks.ts`'s schema check, so a new block gets it by listing its part. Pattern test: every block in `BLOCK_PART_NODES` is reachable by the part handle, and no block draws its own per-part delete button.
2. **Text on a block's colour uses `--color-on-block`** (§1.2), with both themes checked for 4.5:1 in a test.
3. **A design shows all of its block's content** (§1.4), or says on the block what it leaves out. A review rule rather than a test.

**Breaches of existing patterns:**
- **Quality baseline, contrast:** B3 (white on pastel in dark mode).
- **"+" beside a part / delete from the part** (CLAUDE.md "Block designs"): applied to Hierarchy, and hover delete buttons exist on Breakdown and Cycle, but those two draw their own button rather than going through `partAdders.ts` (`remove: true`). Candidates already noted in the backlog; with pattern 1 above they'd all move to one mechanism.
- **Ctrl+click to pick parts** exists for every block, but nothing tells the person; it's the only multi-delete path. A hint in the pill or the right-click menu ("Pick several: Ctrl+click") would make it findable.

---

## 5. Questions for you

1. **Reorder:** drag handles, keyboard, or both? I recommend both (drag for mouse and touch, Alt+Shift+↑/↓ for keyboard).
2. **Keep the gallery harness?** It renders every block × design × theme to PNGs (§1.3). Keeping it in the repo would need `playwright-core` as a dev dependency (about 8 MB installed, no browser download: it uses the Chromium Playwright already cached on this machine, or Edge). The alternative is to keep it outside the repo and run it on request.
3. **Study mode** (hide and reveal in Question, Key, Cycle, Steps): one shared mode for all, or each block's own interaction (Identify for the key, flip for the question)? I'd start with the key's Identify mode and the question's flip, which are the clearest wins.
