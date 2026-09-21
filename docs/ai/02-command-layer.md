# The agent command layer (`src/agent/`)

The command layer is the one surface through which an AI agent can see and change the app's data. It is built (Chunk A: tasks, calendar, schedules, Endeavours/Purposes/Tags), tested, and not yet connected to any model — nothing in the app calls it except a dev-only console handle. Read [`01-capability-inventory.md`](01-capability-inventory.md) for *why* it is shaped this way and what is still to do. **What to build next, and how, is in [`../agent-tasks/03-ai-assistant-next-steps.md`](../agent-tasks/03-ai-assistant-next-steps.md).**

## What it guarantees

1. **An agent can only do what a command allows, and only through `src/agent/access.ts`.** Commands import nothing from the stores or services; an ESLint rule (`@typescript-eslint/no-restricted-imports` scoped to `src/agent/commands/**`) fails the build if one does, and `boundary.test.ts` proves the rule fires.
2. **There is no delete.** `access.write` has no delete function, no command deletes, and the one store action that would delete as a side effect (ending a repeating series before its first date) is refused in `access.ts`. Removal is archive; undoing an agent's own creations is `revertBatch`, a user action.
3. **A command either happens completely or not at all.** A handler that throws part-way has its writes rolled back.
4. **A read cannot change anything.** If a read command changes any tracked data the runner undoes it and reports an internal error.
5. **Everything an agent does is recorded and undoable** (audit log + before-snapshots, below).
6. **The app's own rules apply.** Writes go through the same store actions and services the UI uses (sync stamps, the task ⇄ calendar links, sub-task archiving), so they hold for free.

## Files

| File | Role |
|------|------|
| `src/agent/access.ts` | The boundary. `read` (what an agent can see) and `write` (what it can do). The only agent module besides `batch.ts` that touches stores. |
| `src/agent/types.ts` | `CommandDef`, `defineCommand`, `CommandResult`, `RunOptions`, `ToolDefinition`, `CommandContext` |
| `src/agent/commands/*.ts` | The commands, grouped: `read.ts`, `tasks.ts`, `calendar.ts`, `schedules.ts`, `organisation.ts`; `shared.ts` holds input primitives, lookups that fail in words a model can act on, and the compact summaries; `index.ts` lists them all |
| `src/agent/registry.ts` | `getCommand`, `listCommands`, `toolDefinitions()` (JSON Schema per command, for a model API's tool list) |
| `src/agent/run.ts` | `runCommand(name, input, opts)` — the single entry point |
| `src/agent/batch.ts` | Snapshot/diff/revert engine; `revertBatch(id)` |
| `src/agent/errors.ts` | `AgentError` — what a handler throws to give the model a message it can act on |
| `src/agent/devHandle.ts` | Dev builds only: `window.__agent = { run, revert, tools }` for the browser console |
| `src/store/agentLogStore.ts` | `agent-log` — append-only audit log, capped at 2000 entries |
| `src/store/agentBatchStore.ts` | `agent-batches` — before-snapshots, capped at 50 batches |
| `src/types/agent.ts` | `RiskTier`, `EntityKind`, `AgentLogEntry`, `AgentBatch`, `BatchChange` (not re-exported from `types/index.ts`) |
| `src/utils/calendarItemInput.ts`, `src/utils/scheduleBlocks.ts` | Rules extracted from the Add-calendar-item and Add-schedule modals so the modals and the commands share them |

## How a call flows

`runCommand(name, rawInput, { sessionId?, batchId?, approved?, allow? })`:

1. Look up the command; unknown → error `unknown_command`.
2. `allow` (tiers this caller may run) → `refused` if the command's tier isn't in it.
3. Validate with the command's Zod schema → `invalid_input` with a readable message (`z.prettifyError`).
4. **Approval.** `approval` is `'auto'`, `'review'`, or a function of the input. On `review` without `approved: true` the runner executes nothing and returns `{ status: 'needs_approval', proposal: { input, summary } }` (summary from the command's optional `describe`). The review screen does not exist yet; a later chat UI shows the proposal and calls again with `approved: true`.
5. Take a snapshot of the tracked stores, run the handler.
6. Handler throws → roll back the diff; `AgentError` → its `code` and message go to the model; anything else → `internal` with a generic message (the real error is only logged).
7. Diff against the snapshot. Changes → recorded in `agentBatchStore` under `batchId` (one per call, or the caller's shared one). Audit entry appended (writes log the entities changed; reads log the ids they looked at — never content).
8. Return `{ status: 'done', output, batchId }`.

### Batches, undo, and why it is cheap

Zustand state is immutable, so the "before" state is just a kept reference and "what changed" is a comparison of references afterwards (`batch.ts` `takeSnapshot`/`diffSince`). No command declares what it touches — a task's linked calendar entries are captured because they really changed.

Pass the same `batchId` to every command run for one user request and they merge into one undoable batch (the **original** `before` of each entity is kept). `revertBatch(id, force?)` restores modified/removed records with a fresh `updatedAt` (sync merges by `updatedAt`) and removes created ones. **Anything the user edited since is left alone and reported** (`skipped: [{ kind, id, reason: 'edited since' }]`) unless `force`; a batch with skips is not marked reverted.

To make a new store undoable, add it to `TRACKED` in `batch.ts` (and `EntityKind` in `types/agent.ts`).

## The commands (22)

| Tier | Commands |
|------|----------|
| read | `get_context`, `search`, `list_tasks`, `list_schedules`, `get`, `get_calendar_range`, `find_schedule_conflicts`, `preview_schedule` |
| create | `create_task`, `create_calendar_item`, `create_schedule` *(review)*, `create_endeavour`, `create_purpose`, `create_tag` |
| modify | `update_task`, `set_task_status`, `update_calendar_item`, `edit_occurrence`, `update_schedule` *(review when it removes blocks or adds more than 3)*, `manage_schedule_occurrences` |
| archive | `archive_item`, `restore_item` (task, calendar item, Endeavour, Purpose) |

Behaviours worth knowing:
- Dates `YYYY-MM-DD`, times 24-hour `HH:MM`, in the account timezone (`get_context` reports it). "Today" is `todayIsoInZone`, not the machine's clock.
- A sub-task (`create_task` with `parentId`) inherits the parent's priority and Endeavour unless given; depth is one level.
- Items that belong to a task (its deadline reminder, its scheduled event) can't be edited or archived on their own: the commands say to change the task. `update_calendar_item` on a task's scheduled event flows title/date/start time back to the task (`updateCalendarEventLinked`).
- `create_*` for Endeavours/Purposes/Tags refuses a duplicate name and returns the existing id in the message.
- `edit_occurrence` `end_series_before` a series' first date is refused (it would delete the series).
- `get_calendar_range` (≤ 92 days) expands repeats and schedule occurrences and shows task deadlines from the tasks themselves (the reminder that carries a deadline is skipped). It does not apply the calendar's Layers visibility setting.
- Read output is compact on purpose (nulls and empty lists dropped) because it is sent to a model.

## Adding a command

1. Put it in the right `commands/*.ts` (or a new one exported through `commands/index.ts`). Use `defineCommand({ name, description, tier, approval, input, describe?, run })`.
2. `description` is written **for the model**: what it does, when to use it, what to call first, what it refuses.
3. `input` is a Zod object (top-level must be an object — providers reject a top-level union). Use `.describe()` on non-obvious fields, `dateStr`/`timeStr`/`idStr` from `shared.ts`, `.nullish()` for fields that can be cleared, `.default()` for fields with defaults (they are emitted as optional).
4. Read and write **only** through `read`/`write` from `@/agent/access`; add a `read.*` or `write.*` wrapper there if one is missing. Never add a delete wrapper.
5. Fail with `AgentError('not_found' | 'invalid' | 'conflict' | 'refused', message)` — write the message so the model can fix its call. Validate before writing where you can.
6. Call `ctx.seen(kind, id)` for entities a **read** looked at (so the audit log records it). Writes are recorded automatically.
7. Return plain JSON, using the summaries in `shared.ts`.
8. Add tests (below). Keep the tool count within 20–30 (`framework.test.ts` checks it).

## Tests

`npm test` (Vitest, Node environment, `src/test/setup.ts` supplies a Map-backed `localStorage` and calls `preloadIdbStorage`). 128 tests, roughly:
- `framework.test.ts` — tool definitions, validation, tier gating, review, rollback, read-only guard, audit log, undo batches (incl. edited-since and shared batches)
- `tasks.test.ts`, `calendar.test.ts`, `schedules.test.ts`, `reads.test.ts` — each command against the real stores
- `boundary.test.ts` — the lint rule really rejects a store/service import in `commands/**` (runs ESLint via its Node API)
- `src/services/taskCalendarLinks.test.ts`, `src/utils/calendarItemInput.test.ts` — the shared logic the UI also uses

`boundary.test.ts` needs Node types, so `tsconfig.app.json` excludes it and `tsconfig.node.json` includes it.

## Trying it

In a dev build (`npm run dev`), open the browser console:

```js
__agent.run('get_context', {})
__agent.run('create_task', { title: 'Test', deadline: '2031-03-10' })   // → { status: 'done', batchId }
__agent.revert(batchId)
__agent.tools()   // the JSON Schemas a model would be given
```

## Not built / known limits

- **No model, chat UI, review screen or agent manual yet** (later phases in the inventory). No provider has seen the generated JSON Schemas.
- **Notes, Lists, Records, Fitness, Portfolio** have no commands. Notes is Chunk B (headless content module, editor reload on external change, note commands, encrypted content excluded at `access.ts`); nothing encrypted exists in the current commands' reach, so the planted-secrets test arrives with Chunk B.
- **Undo covers only the tracked stores** (tasks, Endeavours, Purposes, Tags, events, reminders, schedules). Restoring/removing goes straight to the stores, without `crossAppLinkCleanup`; fine while agent-made items carry no cross-app links, but revisit when notes arrive.
- **Snapshots live in localStorage** (`agent-batches`, capped at 50 batches of full "before" records). If storage gets tight, this store and `agent-log` are the ones to shrink or move to IndexedDB. Both are cleared on sign-out (`clearLocalData.ts`) since they hold copies of the account's records.
- **Attribution is local only.** "Created by the agent" is answerable from the audit log on this device; showing it on other devices needs the small synced table agreed in the inventory (a Supabase migration, not written).
- **`get_calendar_range` re-combines** events, reminders, deadlines and schedule blocks itself (using the shared `expandRepeat`/`expandScheduleBlock`) instead of reusing `CalendarView`'s inline builder, which is coupled to the UI. If the calendar's own rules change, check this too.
- **Search is substring matching** (all words present), no stemming or ranking beyond title-first.
- **Not verified in a running app:** the dev handle, real `localStorage`/IndexedDB persistence of the two new stores, and the UI paths changed by the extractions (see the feature entry in `implemented-features.md`).
