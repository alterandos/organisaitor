# Not yet implemented

Summary list only — full specs are in `BACKLOG.md`.

<!-- Moved out of CLAUDE.md on 2026-09-20 to keep that file to rules and patterns. Text elsewhere that says
     "CLAUDE.md's <section>" refers to the matching section in this file or in another docs/ file. -->

## Not yet implemented (see BACKLOG.md for full specs)

### Fitness (Phase 2+)
- Strava webhook subscription (push instead of manual sync)
- Supabase sync for activities, activity types, and the OAuth token table
- Cross-app linking to Records (use the embedded `crossAppRefs` pattern — see "Cross-app linking" in implemented-features.md)
- Exercise plans (structure likely mirrors `RoutineTask[]` + `RepeatConfig`)
- Imperial units toggle; showing the already-stored-but-hidden fields (elevation, heart rate, splits, GPS route)
- Activity + ActivityType archive/restore UI (field exists on both, `ManagePane`-style UI doesn't yet — today deleting a custom type is immediate, not a sunset)
- Real entitlement/purchase backend behind `isAppEnabled()` (currently hardcoded to `true`); a settings UI for enabling/disabling add-ons

### Notes (Phase 2+)
- Export notes to JSON button (suite-level, location TBD, for data safety before migration)
- Inline text tagging / passage highlighting (Phase 2)
- Full-text search (Phase 2+)
- Backlinks display (Phase 2+)
- Note archiving (UI only; database soft-delete ready)
- Multi-user notes (deferred pending Supabase collab setup)
- NoteType schema templates (e.g., "definition" type with required fields; Phase 2+)
- TagType categorization UI (Phase 2+)

### Other
- Habit heatmap / streak stats in RecordsView
- Routine calendar/heatmap view (success visualisation per day in RecordsView)
- Streak functionality for habit trackers
- Tracker chart/stats views
- Tasks section toggle: tasks / routines / both (routines move below tasks in "both" mode)
- Records reminder schedules (configurable push/calendar notifications)
- Waiting-task follow-up notifications
- Task dependency / blocking (blockedBy: TaskId[])
- Project completion flow (prompt when all tasks done)
- Milestone tasks (kind='milestone' on calendar surface)
- Mini-calendar toggle in task list
- Daily planner view
- AI agent integration — the command layer for tasks/calendar/schedules is built (`docs/ai/02-command-layer.md`); still to do: notes commands, the in-app chat and review screen, provider abstraction, agent manual + evals, phone widget (BACKLOG.md "AI Agent Integration")
- Third-party imports (Strava, Goodreads)

---
