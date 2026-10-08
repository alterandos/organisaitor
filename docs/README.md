# docs/ — index

Rules, patterns and architecture live in [`../CLAUDE.md`](../CLAUDE.md); confirmed-but-unbuilt work lives in [`../BACKLOG.md`](../BACKLOG.md). This folder holds the detail behind them. **None of it is read by default: open a file only when the task needs it** (CLAUDE.md "Reading budget"). **Before adding or changing docs, read "How to write and maintain the docs" in CLAUDE.md** — where things go, entry format, and the one-truth-per-topic rule.

| File | What it is |
|------|-----------|
| [`features/implemented-features.md`](features/implemented-features.md) | Running log of built features — what, why, files, integration points, bugs found, what was verified. Newest last. |
| [`features/fitness.md`](features/fitness.md) | Fitness app, Strava integration, and the add-on app architecture |
| [`features/schedules.md`](features/schedules.md) | Calendar Schedules — recurring weekly timetables, commitment mode |
| [`features/external-calendar-sync.md`](features/external-calendar-sync.md) | Google Calendar sync (Phase 1, read-only ingest) |
| [`features/overview.md`](features/overview.md) | Overview — the suite-level section: everything from every app for a question (sources, engine, saved Overviews, Endeavour Overview) |
| [`features/notes-objects.md`](features/notes-objects.md) | How `\` inline objects in notes look and behave (the design spec; the rules are in CLAUDE.md) |
| [`supabase/migrations.md`](supabase/migrations.md) | The migration record: which SQL is live, what each migration does, every table. Read only for migration work |
| [`architecture/file-structure.md`](architecture/file-structure.md) | The map of every folder and notable file |
| [`architecture/ui-store.md`](architecture/ui-store.md) | uiStore's full state and action listing |
| [`architecture/colour-tokens-history.md`](architecture/colour-tokens-history.md) | When each colour token was added and why |
| [`android/`](android/) | Capacitor/Android architecture, phased plan, `implementation-status.md`; `05-notifications.md` (reminders/notifications design, draft), `10-gap-analysis.md` (what desktop has that Android lacks, and the decisions/workstreams to close it) and `11-design-and-coding-patterns.md` (the rules every Android build follows) |
| [`ai/`](ai/) | The AI agent integration: `01-capability-inventory.md` (what the app can do, invariants, decisions, what is left) and `02-command-layer.md` (the built command layer: design, how to add a command, tests) |
| [`agent-tasks/`](agent-tasks/) | Self-contained briefs a fresh agent can pick up: `01-security-and-state-safety.md` (do first), `02-testing-and-engineering-hygiene.md` (after 01), `03-ai-assistant-next-steps.md` (the AI assistant: Chunk B notes and the phases after it), `04-voice-dictation-followups.md` (paused 2026-09-24 — resume only when the user says so), `05-android-w1-platform-services.md` and `06-android-w2-mobile-primitives.md` (Android workstreams W1/W2, run in parallel — see `android/10-gap-analysis.md` §K) |

## Adding a file

1. Put it in the right folder (see the table in CLAUDE.md's "How to write and maintain the docs").
2. Add a row to this table **and** to the Doc map in CLAUDE.md.
3. Give it a one-line purpose as its first heading's opening sentence.

## Feature entry template (for `features/implemented-features.md`)

```markdown
- [x] **Short title** (YYYY-MM-DD). What it does and why it was needed.
  - **Files:** `src/…`, `src/…` — components, store actions, hotkeys, types added.
  - **Integration points:** which stores/sections it touches.
  - **Decisions:** what was chosen and what was rejected, and why.
  - **Bugs found:** the symptom, the root cause, the fix.
  - **Verified:** what was actually run/checked. **Not verified:** what wasn't (say so).
  - **Not built:** what was deliberately left out (and where it's tracked, if in BACKLOG.md).
```
