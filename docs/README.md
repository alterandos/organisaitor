# docs/ — index

Rules, patterns and architecture live in [`../CLAUDE.md`](../CLAUDE.md); confirmed-but-unbuilt work lives in [`../BACKLOG.md`](../BACKLOG.md). This folder holds the detail behind them. **Before adding or changing docs, read "How to write and maintain the docs" in CLAUDE.md** — where things go, entry format, and the one-truth-per-topic rule.

| File | What it is |
|------|-----------|
| [`features/implemented-features.md`](features/implemented-features.md) | Running log of built features — what, why, files, integration points, bugs found, what was verified. Newest last. |
| [`features/fitness.md`](features/fitness.md) | Fitness app, Strava integration, and the add-on app architecture |
| [`features/schedules.md`](features/schedules.md) | Calendar Schedules — recurring weekly timetables, commitment mode |
| [`features/external-calendar-sync.md`](features/external-calendar-sync.md) | Google Calendar sync (Phase 1, read-only ingest) |
| [`features/not-yet-implemented.md`](features/not-yet-implemented.md) | Short list of what's unbuilt (full specs are in BACKLOG.md) |
| [`android/`](android/) | Capacitor/Android architecture, phased plan, `implementation-status.md` |
| [`ai/`](ai/) | The AI agent integration: `01-capability-inventory.md` (what the app can do, invariants, decisions, what is left) and `02-command-layer.md` (the built command layer: design, how to add a command, tests) |
| [`agent-tasks/`](agent-tasks/) | Self-contained briefs a fresh agent can pick up: `01-security-and-state-safety.md` (do first), `02-testing-and-engineering-hygiene.md` (after 01), `03-ai-assistant-next-steps.md` (the AI assistant: Chunk B notes and the phases after it), `04-voice-dictation-followups.md` (paused 2026-09-24 — resume only when the user says so) |

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
