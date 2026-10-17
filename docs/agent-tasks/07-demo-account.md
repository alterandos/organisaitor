# 07 — The demo account: keep it showing everything

Status: Ongoing — built 2026-10-17/18 (see "Demo account" in `docs/features/implemented-features.md`). Not a one-off task: every new user-facing feature should be added to the demo.

The demo account is a believable semester of a second-year Earth Sciences student that shows off
the whole suite, Notes most of all, and how notes, tasks and the calendar link together. The user
presents it from a separate account (its email contains "demo"). Features keep being added before
any demo, so **when you build a user-facing feature, add it to the demo in the same piece of work**
(or say in your session report why it doesn't belong there).

## The pieces

| File | What it is |
|------|-----------|
| `src/demo/demoAccount.ts` | `buildDemoAccount(base, pictures)`: builds all the data through the stores' own actions. **This is where new content goes.** |
| `src/demo/loadDemo.ts` | The in-app loader: wipes this device and the signed-in account, adds the pictures, builds the demo dated from today, then the per-device touches (sticky notes, recent items, Notes open on "Start here"). |
| `src/demo/demoAccount.test.ts` | Checks the demo stays valid (below); with `DEMO_OUT` set, also writes it as a backup file. |
| `src/demo/resources/` | The user's pictures, by slot name (its README lists the slots). |
| `docs/demo/walkthrough.md` | The presenter's script, in showing order. Update it when you add something worth showing. |
| AccountPane → "Load the demo account" | The button, **development builds only** (`import.meta.env.DEV`; the demo isn't in a production bundle). |

**How the user loads it:** run a dev build (`npm run dev` or `npm run tauri dev`), sign in to the
demo account, Account → Load the demo account. Sync is live, so the old demo records are deleted
in the cloud and the new ones uploaded; every device signed in to the demo account then has it.
The loader refuses an account whose email doesn't contain "demo", and confirms first.

## Adding a feature to the demo

1. **Find its place in the story.** The theme is a student with two units (GEOS201 Mineralogy &
   Petrology, GEOS215 Climate Systems), a field trip in four days with a report (Endeavour "Field
   trip report") and a climate essay (Endeavour "Climate essay"). Put the feature where a real
   student would use it, in an existing note or item where possible; a new note only if it needs
   one. Keep the text in character (first person, plain, Australian spelling) and the facts right.
2. **Build it the app's way.** Store actions and services only (`addTaskWithCalendar` for tasks with
   dates, `editNoteContent` for note text, `setBackdrop`, `addPicture` through the loader). Never
   write a store's state by hand: the actions set defaults, shadows and links.
   - **Dates** are days from `base` (`day(n)`, `at(n, 'HH:MM')`), never fixed dates.
   - **Ids** a store makes itself, or `nanoid()`. Never a fixed id for a synced record: a row's id is
     unique across every account, so a fixed id collides with the user's real account (CLAUDE.md
     "How sync works").
   - **Note content** is Tiptap JSON built with the helpers at the top of `demoAccount.ts` (`p`, `h`,
     `bullets`, `kids`, `node`, `itemLink`, `noteLink`, `card`, `embed`…). For a new block, insert it
     once in a scratch test through its `NoteBlockKind.insert` and `editor.getJSON()` to see its exact
     shape, then write that shape with real content. Fill every part a block requires: the schema
     rejects a missing one (an Options block needs its goal first).
   - **Headings** in a note start at level 1 (level 2 under no level 1 numbers as "0.1").
   - **Links both ways:** an item linked from note text gets an `itemLink` mark in the note **and**
     `crossAppRefs: [{ type: 'note', id }]` on the item. A list's `crossAppRefs` hold notes only; a
     task's link to a list lives on the task.
   - **A Glossary record** must be shown by a card or chip in its own note, or it doesn't count as
     defined.
   - Return any new id the loader needs in `DemoAccount`.
3. **Something per device** (sticky notes, recent items, what's open) goes in `loadDemo.ts`'s
   `livedIn`, not the data: it isn't synced.
4. **A new picture** is a slot: a `picture('<slot>', origin)` line in `loadDemo.ts`, its use (pass
   it through `DemoPictures` if the content needs it), and a row in `resources/README.md`. Tell the
   user which file to add.
5. **Run the test:** `npx vitest run src/demo/demoAccount.test.ts`. It checks every note against the
   editor's real schema, that no attribute you set is silently dropped (a misspelt one would be),
   that **every note block in `NOTE_BLOCK_NODES` is used** (a new block fails here until the demo
   uses it), that every link and embed resolves, and that every Glossary record is defined. If your
   feature adds a new kind of link, add its check there. The test's schema is a copy of the
   editor's extension list: add your new node/mark extension there too.
6. **Look at it in the app.** Load the demo in a dev build (signed out is fine: it loads into this
   device only) and check the feature reads well, in light and dark. The schema test can't see
   layout. To script it, Playwright can call the loader directly:
   `await page.evaluate(async () => (await import('/src/demo/loadDemo.ts')).loadDemo(new Date()))`.
7. **Update `docs/demo/walkthrough.md`** if it's worth showing, and the "Demo account" entry in
   `implemented-features.md` if the demo's shape changed.

## Known limits

- The Notes section reopens on the University notebook after a reload, not on "Start here": the
  app doesn't keep the open note across reloads, by design.
- The `investment_purposes` 403 (built-in purposes sharing fixed ids across accounts) was fixed
  by migration 050 (2026-10-18); if the demo account still logs it, check that 050 has been run.

## When done

There's no "done": keep the Status line's date current when you add to the demo, and log what you
added in the "Demo account" entry.
