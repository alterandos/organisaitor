# Requirements Backlog

Items here are confirmed requirements that are not yet implemented.
Format: brief description + context/motivation.

---

## Notifications & Reminders

### Waiting-task follow-up notifications
When a task has `kind = 'waiting'` and a deadline passes, the user should
receive a notification prompting them to follow up. The notification should
be surfaced in-app (and eventually as a system/push notification).
- Triggered by: deadline expiry on a waiting task
- Expected behaviour: remind once at deadline, then allow snooze/dismiss
- Context: "wait for response from private health insurance" type tasks need
  automatic prompting so nothing slips through

---

## Workflow & Task Dependencies

### Task contingency / sequencing
Some sub-tasks are only actionable after a predecessor is complete
(e.g. "book specialist" requires "get referral" to be done first).
Implement a dependency model: a task can list `blockedBy: TaskId[]`.
UI would show blocked tasks greyed out with a lock icon.

---

## Projects (Collection kind = 'project')

### Milestone tasks (`kind = 'milestone'`)
Tasks that represent key anchor events in a project rather than actionable
deliverables — e.g. "Presentation to board", "Trial begins". These are
distinct from regular task deadlines in that they *happen to* you rather
than being completed by you. See architectural decision note below.

### Project completion flow
When all tasks in a project are done, prompt the user to mark the project
as complete (with a completion date).

---

## Architecture: Calendar Integration

### Decision: unified app with calendar view vs. separate calendar app
The to-do app will be the source of truth for all time-anchored data
(task deadlines, project milestones, waiting-task follow-ups). The calendar
layer reads from this data rather than maintaining its own event store.

**Confirmed near-term:**
- A calendar view inside this app, populated directly from tasks and
  milestones. No separate app needed for this layer.

**Confirmed future:**
- Ingest of external calendar events (Google Calendar, iCal) so that
  meetings, appointments and project events live alongside tasks in one
  place. The `Milestone` type's `source` field is already open for a
  `'calendar-event'` origin to support this without schema changes.

**Open decision:**
- Whether the calendar view becomes a sibling route in this app or a
  standalone app that shares the same data store via the planned
  StorageAdapter layer. Recommend revisiting once the calendar feature
  spec is defined — the StorageAdapter abstraction should keep both paths
  open until then.

### Mini-calendar toggle in the task list view
A setting (in the Settings pane) to display a condensed calendar alongside
the to-do list — the two panels sit side by side. Useful for seeing
upcoming deadlines in context while managing tasks.
- Trigger: toggle switch in Settings → Display section
- Layout: task list narrows; mini-calendar fills remaining horizontal space
- Mini-calendar is read-only (no add from this surface)
- Persisted in settingsStore as `miniCalendarEnabled: boolean`

### Weekly and daily calendar views
Ability to switch between monthly (current), weekly, and daily views in the
calendar. Monthly is the default; weekly and daily show finer time-slot
detail useful for scheduling events.

---

---

## AI Agent Integration

### Notes-dump → tasks
Ability to paste or speak a block of free-form text (e.g. meeting notes,
a brain-dump) and have an AI agent parse it into structured tasks. The agent
should infer titles, priorities, deadlines, and collection assignments where
possible, then present the parsed tasks for review before adding them.

### Voice control
Hands-free task creation and navigation via voice commands. The agent
interprets spoken input and maps it to app actions (add task, set deadline,
mark complete, etc.).

### Custom agent integration
Allow users to connect their own AI agent/workflow endpoint. The agent has
read/write access to the task store and can perform batch operations,
re-prioritisation, and smart scheduling on behalf of the user.

**Architecture note:** all three features share a common "agent interface"
layer — a well-defined API surface over the Zustand stores. Design that
interface before building any individual feature so each agent type can use
the same underlying operations.

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

## Architecture: Note-taking Integration

### Bidirectional link between tasks and notes
Tasks and notes have a natural, tight relationship:

- A task such as "Read paper X" produces notes as its output. Those notes
  should be linkable to the originating task so the work product is
  traceable.
- Conversely, when taking notes it is common to identify follow-up actions.
  The note-taking interface should allow inline task creation that lands
  directly in this task store.

**Implications for this app:**
- Tasks should be able to reference one or more note documents
  (`noteIds: NoteId[]` or a links-style approach via the existing `links`
  field as a stopgap).
- The shared data layer (StorageAdapter) must be accessible to both apps,
  or both must be views within the same app.
- Purposes are a natural cross-cutting concern — a note and a task about
  the same research project should share the same Purpose, reinforcing the
  case for a unified or tightly federated app rather than two isolated tools.

**Open decision:** same unified-vs-federated question as calendar. Recommend
deciding the overall app architecture (single app with multiple views vs.
micro-apps sharing a common store) before building the note-taking surface.

---
