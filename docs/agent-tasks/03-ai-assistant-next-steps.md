# 03 — AI assistant: what to build next (Chunk B and beyond)

Status: **Not started** (Chunk A — the command layer for tasks, calendar, schedules and Endeavours/Purposes/Tags — is done and tested, 2026-09-22).

A cold agent needs only this brief plus CLAUDE.md. Read section 0 before touching anything, and section 3 before talking to the user.

## 0. Read first, in this order

1. `CLAUDE.md` — all of it, especially "Documentation Protocol", "Agent command layer — the boundary rule", "Zustand migration rule" (every store uses `persistStorage()`; notes use IndexedDB), and "Pattern governance".
2. `docs/ai/02-command-layer.md` — what was built, how a call flows, how to add a command, how to run the tests.
3. `docs/ai/01-capability-inventory.md` — the reasoning: the vision, every entity and its traps (section 2), the invariants register (section 4), the "logic in the wrong place" list (section 5), the never-exposed list (section 6), the tool plan (section 7). Sections 1 and 8 explain the decisions.
4. The feature entry "AI agent command layer — Chunk A" at the bottom of `docs/features/implemented-features.md`, and BACKLOG.md → "AI Agent Integration" → "The in-app assistant — remaining phases".
5. Then the code: `src/agent/access.ts` (the boundary), `src/agent/run.ts`, `src/agent/batch.ts`, one command file (`src/agent/commands/tasks.ts`) and one test file (`src/agent/__tests__/tasks.test.ts`).

## 1. The vision, in the user's words

An AI agent that can administer the whole app on the user's behalf. Examples they gave: paste a screenshot of a timetable and it becomes a Schedule; paste a course outline and the agent decides whether to update the existing schedule or create one; dictate "I learnt X about my project" and the agent finds the note for that project and appends it in the right place. The agent lives **inside the app**: the user talks to an in-app chat, the app calls a model with **the user's own API key** (later a local model). Eventually shipped to users (App Store), and a phone widget should let them speak to it with the app closed.

## 2. Where things stand

**Built (Chunk A):** `src/agent/` — 22 commands (8 read, 6 create, 6 modify, 2 archive) behind `runCommand(name, input, opts)`; the boundary module `access.ts`; risk tiers; an approval policy (`create_schedule` always returns a proposal; `update_schedule` when it removes blocks or adds more than 3); snapshot-based batches with `revertBatch`; an audit log; `toolDefinitions()` emitting JSON Schema; a dev-only `window.__agent` handle; 128 Vitest tests. Extracted shared rules: `utils/calendarItemInput.ts`, `utils/scheduleBlocks.ts`, `services/taskCalendarLinks.ts` (task ⇄ calendar shadow entries, sub-task inheritance).

**Not built:** anything that touches notes, lists, records, fitness or portfolio; a model, chat UI, review screen, agent manual, evals; provider abstraction; cross-device attribution; the phone widget.

**Verified vs not:** `tsc -b`, `npm run build`, `npm test` all pass. **Never verified in a running app:** the three modals changed by the extraction (Add calendar item for event/reminder/birthday, Add schedule, TaskPane's quick sub-task), the dev handle, real-browser persistence of the two agent stores, and the generated JSON Schemas against a real model provider. Ask the user whether they have spot-checked the modals before building on them.

**The branch:** all of this work is on branch `ai-command-layer` (pushed to `origin`), **not** on `main`, deliberately — `main` auto-deploys to Vercel and the commit also contains other in-progress work from parallel sessions (see the commit message). The user decides when it merges.

## 3. How this user works — follow it

- **Discuss before building.** They want to hear the plan, the options and what will change, then say "go ahead". Answer their questions plainly first; don't start coding on an ambiguous message. When a decision is genuinely theirs (a UX change, a new dependency, anything visible in the UI), ask.
- **No visible UI change unless agreed.** For Chunk A they conditioned the refactors on "no change on the UI side for the user". Anything that changes what a person sees (e.g. an editor conflict banner) needs their OK first.
- **They dislike duplicated logic.** One implementation of each rule, shared by the UI and the agent. Extract rather than copy.
- **Explain terms.** They are not steeped in jargon (they asked what an invariant and an MCP server were). Keep explanations short and concrete.
- **Only commit/push when asked.** They said so explicitly for this project. Don't touch migrations' status (only they mark one `Applied`).
- **They read summaries, not diffs.** End each piece of work with: what changed, what was verified, what was *not* verified, and the decisions they need to make.
- Follow the Documentation Protocol: feature entry in `implemented-features.md`, CLAUDE.md only if a rule/store/type/file-structure changed, BACKLOG.md for unbuilt work, `docs/README.md` for new doc files, and update the inventory's "done" markers. **Edit existing entries in place — never leave two contradictory descriptions.**

## 4. Decisions already made — do not re-open

- The agent runs **in the app**; the executor is always the client (Zustand stores). No external connector, no MCP server, no server-side executor for now. No separate "agent login": the boundary is `agent/access.ts`, enforced by lint.
- **Agents never delete.** They archive. Undoing an agent's own creations is `revertBatch` (a user action). `access.write` has no delete and must not gain one.
- **Encrypted notes and lists are invisible to agents**, even while the vault is unlocked — and their **existence** is hidden (an encrypted note looks like "no such note"). Filter at `access.ts`.
- **Read commands are side-effect free** — never `touchNote`, never record visits. Agent reads go in the audit log (ids only).
- ~20–30 intent-level tools, tuned by evals. Bulk changes are staged for review (`approval: 'review'`). Every write is undoable as a batch (local). The audit log is local; **cross-device "created by the agent" attribution will be a small synced table** (a Supabase migration) — later.
- Search v1 = keyword + structure (Endeavour/notebook). Semantic/embedding search only if evals show misses at scale.
- Archive coverage: tasks, calendar items, Endeavours, Purposes have it. Notes, lists/items, schedules, Portfolio, Fitness do not; the agent creates and modifies those but cannot remove them until archive is added per entity (order: notes → lists/items → schedules → Portfolio/Fitness).
- Task ⇄ calendar: **the task is the source of truth** for title/date/time; both sides are editable and mirror; deleting a task's scheduled event un-schedules the task; a task's linked event hides Repeat and Event-type.
- Agents don't complete projects (there is no such feature yet); `archive_item` on an Endeavour is the nearest thing.

## 5. Task 1 — Chunk B: notes

Goal: the agent can find the right note and add to it (and create notes), safely, with nothing encrypted ever reachable. Do it in this order; each step has its own tests. **Talk to the user before step 2 (it changes what they see) and confirm the plan before starting.**

### 5.1 A headless note-content module (new, pure, unit-tested)

There is no store-level way to edit a note's content: `updateNote(id, { content })` takes a whole Tiptap JSON *string* and everything else happens inside `NoteEditor`. Create e.g. `src/utils/noteMarkdown.ts` (and extract `parseContent` out of `NoteEditor.tsx` so there is one implementation):

- `parseNoteContent(raw)` → a `doc > section+ > block+` document. The schema **requires** `section+` (see `NoteEditor/extensions/Section.ts`); legacy content and `''` must be wrapped in one default section, exactly as `parseContent` in `NoteEditor.tsx` does today.
- `markdownToBlocks(md)` → Tiptap block nodes: headings, paragraphs, bullet/ordered lists (nested), blockquote, code block, horizontal rule, inline bold/italic/code/links; GFM pipe tables as a stretch (the editor already converts pasted tables).
- `noteOutline(content)` → headings `{ index, level, text }` so the agent can choose where to write.
- `appendBlocks(doc, blocks, { underHeading?, position })` and `replaceSection(doc, heading, blocks)` — a heading's section runs to the next heading of the same or a higher level. Operate on a section's top-level children; if the target sits inside a locked-columns `columnBlock`, refuse with a clear error.
- **Preserve everything you don't touch** (annotation-tag marks, `artifactLink` marks, images, tables). Work on the JSON structurally.
- **Gotcha:** `HeadingNumbering` numbers by raw heading level (templates use level 1 for top-level sections, which is why). Decide and document how markdown `#` levels map when appending under an existing heading (recommended: relative to the target heading's level).
- **Test it against the real schema**: build the Tiptap schema from the same extensions the editor uses and `Node.fromJSON(schema, json).check()` every output. That is the only thing that proves an agent can't write a note the editor can't open.

`utils/noteContent.ts` (`noteContentToText`, a JSON walk) and `utils/noteSearchText.ts` (`getNoteTabTexts`, cached plain text per tab, never caches encrypted notes) already exist — reuse them for `get_note` and search.

### 5.2 The editor must reload on an external change (touches the UI — ask first)

`NoteEditor` loads content only when the note id changes (and on lock/unlock), never when the store changes underneath it, and its debounced save (`saveRef` / `flushCurrentTab`) later writes its own copy back. So an agent write to the **open** note is silently overwritten — the common case, since the chat panel is in the same app as the editor. The same bug already exists for sync pulls from another device.

Agreed approach: track the content the editor last loaded or saved; when the store's content for the open note/tab differs and the editor has **no unsaved edits**, reload it (guard with `isLoadingRef` so the reload doesn't schedule a save); if it **does** have unsaved edits, keep the user's version and surface the conflict rather than clobbering either side. Handle the main tab and each extra tab, and title/abstract. **The conflict UI is a visible change: propose it to the user before building.** Test: an external `updateNote` on the open note updates the editor; a revert of an agent batch does too.

### 5.3 Notes in `access.ts` and the commands

- `read.notes()`, `read.notebooks()` and friends **drop `isEncrypted` notes** (check the raw stored note's flag, not `noteView`) and never call `noteView`, `touchNote` or any `open*`. Also make sure nothing derived from an encrypted note leaks: structured tag entries from it, links to it (a task's `crossAppRefs` — the current task summaries don't expose them; keep it that way), search hits, counts, recents.
- `write` gets only: create note, set a note's (or tab's) content, whitelisted property updates (title, abstract, notebook `tagIds`, `collectionId`, colour, pinned), add a tab, create notebook. Still no delete.
- Commands (see inventory section 7): `create_note`, `append_to_note`, `replace_note_section`, `update_note_properties`, `get_note` (outline + markdown-ish text, never touching `lastViewedAt`), `list_notes`, `list_notebooks`, `create_notebook`; extend `search` with note text (via `getNoteTabTexts`) and `get_context` with the notebook tree. A new note inherits its Endeavour from its notebook (already done in `noteStore.addNote`).
- Sub-notes, tabs (`tabOrder` must contain `'__main__'` and every tab id — `addNoteTab` maintains it), and templates (`config/noteTemplates.ts`) exist; use the store actions.

### 5.4 Undo for notes — watch the storage size

Add notes and notebooks to `TRACKED` in `src/agent/batch.ts` and to `EntityKind` in `src/types/agent.ts`. **Trap:** a batch stores the full "before" record, and a note's content can contain large base64 images; `agent-batches` lives in localStorage (~5 MB shared by everything). Move `agent-batches` to IndexedDB (`persistStorageIdb()`, add the key to `IDB_STORAGE_KEYS`, and use `readPersistedValue`/`writePersistedValue` for backup — see the "Zustand migration rule" section of CLAUDE.md) or store only the changed tab's content. Never track an encrypted note.

### 5.5 The planted-secrets test (required)

Create encrypted notes (and an encrypted list is out of scope until lists get commands), put plaintext secrets for them into the memory cache the way a *unlocked* vault would (`putNoteSecrets` in `services/noteSecrets.ts`), also a structured tag entry and a task whose `crossAppRefs` point at one. Then run **every read command and `search`** and assert no output, audit-log entry or batch contains a planted string, an encrypted note's id, or a count that includes it. `agent-batches` and `agent-log` must never hold their content either. Do this in the same change as 5.3, not later.

### 5.6 Docs and done-ness

Update `docs/ai/02-command-layer.md` (commands table, the "not built" list), the inventory ("done" markers, finding 1 and 2), a feature entry, BACKLOG.md, CLAUDE.md's "Agent command layer" rule if the encrypted-content handling adds anything to it. `npm test`, `npx tsc -b`, `npm run build` clean; no new lint errors (the repo's baseline is 43 pre-existing errors — see section 8).

## 6. Later tasks (each needs the user's go-ahead; details in BACKLOG.md "The in-app assistant — remaining phases")

2. **Chat panel + agent loop (client-side).** Send `toolDefinitions()` + messages to the provider; run each tool call through `runCommand` with **one shared `batchId` per user request**; image paste for screenshots (the model sees the image; no OCR code); the **review screen** for `needs_approval` proposals (reuse the `CalendarImportReviewModal` pattern: portaled, overlay/modal nesting rules in CLAUDE.md); an "undo this request" action (`revertBatch`, and show `skipped` items honestly); an activity view over the audit log. Voice: the dictation pipeline already exists (`Ctrl+D`, `services/speech/`); the seam for "transcript goes to the agent" is described in BACKLOG "Voice → agent".
3. **The agent manual** (system prompt): generated from the command schemas plus a short terminology guide (start from the glossary in `get_context` and inventory section 2's "traps"). **Evals:** scripted scenarios → expected store diffs, run per model including small ones; the three scenarios above are the first three. The Vitest harness (`src/test/`) is the base.
4. **Provider abstraction:** the user's own key stored per device, never synced; local OpenAI-compatible endpoint. Check CORS per provider (Tauri and Android have native HTTP; the PWA may be blocked). A key means pay-per-token API billing, not a chat subscription.
5. **Cross-device attribution:** a small synced table recording which items an agent created — a Supabase migration (include its own `grant … to authenticated`; list it in "Migration history" and "Live migration status" as `Pending`; tell the user to run it).
6. **Phone widget** to open the assistant with the app closed (headless launch on Android; Capacitor).
7. **Archive support** per entity (store action, `ItemActions` UI, migration), then extend `archive_item`.
8. **Commands for Lists** (encrypted lists exist: same invisibility rule), **Records**, Fitness, Portfolio.

## 7. Open questions to raise with the user

- Have they spot-checked the three refactored UI flows (section 2)? If not, that's worth a minute before more is built on them.
- The editor conflict UX (5.2): what should a person see when the agent changed a note they are typing in?
- `agent-batches` → IndexedDB now or only when notes are tracked (5.4)?
- Whether the review screen should be one modal per proposal or a queue.

## 8. Practical notes for this repo and machine

- Windows 11; the Bash tool is Git Bash. **There is no Python.** For multi-line file content use the Write tool; large shell heredocs sometimes fail on quoting (use a unique terminator like `ENDOFENTRY`, or write a file). `sed -i` and `node -e` work for small edits; CRLF vs LF differs per file (BACKLOG.md is CRLF, CLAUDE.md is LF), which breaks multi-line string replacement in scripts — use the Edit tool there.
- `npm test` (Vitest, Node). `src/test/setup.ts` provides a Map-backed `localStorage` and runs `preloadIdbStorage()` (no IndexedDB in Node → it falls back to localStorage). Tests that import anything reaching the Supabase client rely on the env values in `vitest.config.ts`.
- `boundary.test.ts` needs Node types, so `tsconfig.app.json` excludes it and `tsconfig.node.json` includes it — new Node-only tests need the same.
- Baseline lint is **43 errors**, all pre-existing (`no-explicit-any` in migrations and stores, unused `_` destructures, `@ts-ignore`s). Don't add to it, and check your own files with `npx eslint <paths>`.
- The dev handle: in `npm run dev`, `__agent.run('get_context', {})`, `__agent.revert(batchId)`, `__agent.tools()`.
- `erasableSyntaxOnly` is on: no enums, no constructor parameter properties. `verbatimModuleSyntax`: use `import type`.
- Other stores are persisted with `persistStorage()`; **a store module must not be imported before `preloadIdbStorage()` resolves** in the real app (`main.tsx` handles it; tests do it in setup).
- Commit and push only when the user asks. `main` auto-deploys (Vercel); prefer a branch and tell them.

## When done

Set the Status line above (`In progress` while working; `Done YYYY-MM-DD — outcome` when finished), keep the inventory's "done" markers and `docs/ai/02-command-layer.md` true, add the feature entry, and tell the user what was and wasn't verified. Don't delete this brief — mark it done so the reasoning survives, and write `04-…` if a further phase needs its own brief.
