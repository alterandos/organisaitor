# Android — notifications and reminders (Phase 5 / workstream W9)

How reminders, deadlines, events, schedules and record-tracking prompts reach the user on Android when the app is closed. Reminders and record tracking are among the most important reasons to have the app on a phone (D9, decided 2026-10-04), so this is designed in detail rather than ported.

**Status:** Design signed off 2026-10-04 (N1–N10, including the shared trigger engine). Not built. Supersedes BACKLOG.md's "Android App — Capacitor" §6 (Notifications), whose per-entity rules predate per-item notify settings, Deadlines and Schedules. Its permission flow, ID hashing and deep-link sketch are carried forward below where still right.

Read first: CLAUDE.md, `00-architecture.md` (ADR-6), `11-design-and-coding-patterns.md`.

---

## 1. How desktop does it today (the baseline)

- `hooks/useNotificationChecker.ts` polls every 60 s **while the app is open**. It computes each item's trigger, adds a `PendingNotification` to `notificationStore` (the bell panel, `NotificationCenter`) and calls `fireOSNotification()` (Tauri plugin, or the browser Notification API).
- Triggers come from **per-item settings**, not global ones:
  - **Event**: `notifyBeforeValue/Unit` (null = off), or `remindAt` if snoozed.
  - **Reminder**: its `time`; if it's whole-day, `notifyDaysBefore` + `notifyAtTime` (default the evening before); `remindAt` if snoozed.
  - **Committed Schedule block**: a fixed 30 minutes before.
- Snooze already exists: the bell panel writes `remindAt` on the item, so a snooze **syncs**.
- **Bug found while writing this (2026-10-04, affects every platform):** the checker has no Deadline loop. Since "Deadline calendar kind" (2026-09-27) moved task-deadline shadows from Reminders to `CalendarDeadline`, its Reminder branch (`reminderType === 'task'`) matches nothing. **No task deadline or standalone Deadline notifies anywhere.** The fix is N1's first step (or a standalone fix sooner; see gap A16).

## 2. The core problem on Android

A phone app is usually closed, so polling can't work. Notifications must be **scheduled ahead with the OS** (`@capacitor/local-notifications`, which uses Android alarms) and kept in step with data that can change on another device.

## 3. Proposals

### N1. One trigger engine, shared by every platform
Extract the trigger rules from `useNotificationChecker` into a pure module, `services/notifications/plan.ts`:

```ts
planNotifications(snapshot, { from: Date, to: Date }): PlannedNotification[]
// PlannedNotification = { key, itemRef, kind, at: Date, title, body, channel, actions, deepLink }
```

- Desktop's poller becomes "fire anything in `plan(now-1min, now)` not yet in `notifiedLog`".
- Android's scheduler becomes "make the OS's pending set equal `plan(now, now+window)`".
- The rules exist once and get a test file. A notification change on desktop reaches Android automatically, which is the governance problem this whole effort is about.
- Adds Deadlines (fixing the bug above): lead time `notifyDaysBefore` + `notifyAtTime`, always before and never at; task-shadow deadlines are skipped when the task is completed or archived.

### N2. Android scheduling: a rolling window, reconciled often
- **Reconcile** (diff the OS's pending list against the plan; cancel extras, add missing) on launch, on resume, after every sync pull, and debounced after local store changes. Nothing runs in the background, so no background service is needed.
- **Window: next 14 days, capped at 200 scheduled.** Repeating items expand within the window only (via `recurrence.ts`). Android allows 500 alarms per app.
- **Stable IDs**: djb2 hash of `kind:itemId:occurrenceDate` (BACKLOG §6c), so reconciling is idempotent.
- **Exact timing**: declare `USE_EXACT_ALARM` (allowed for calendar/reminder apps) so a 09:00 reminder fires at 09:00, not "around then". Settings gets a row explaining battery-optimisation exemptions, with a button that opens the system page (Samsung/Xiaomi etc. kill alarms otherwise).
- **Known limit, stated honestly:** something completed on desktop still fires on the phone if the phone app hasn't opened since. Removing that needs server push (FCM), which is out of scope for now; see N10.

### N3. Notification channels (user-tunable in Android settings)
| Channel | Importance | Used for |
|---------|-----------|----------|
| Reminders & deadlines | High (sound, heads-up) | Reminders, Deadlines, task deadlines |
| Events | Default | Events, committed Schedule blocks |
| Tracking | Default | Routine and tracker prompts (N7) |

An item flagged **important** posts as high importance whatever its channel.

### N4. Actions on the notification itself
Act without opening the app; each action goes through the same service as the UI.

| Kind | Actions | Tap |
|------|---------|-----|
| Reminder | **Done** · **Snooze** | Opens the reminder |
| Deadline (task-linked) | **Complete task** (`toggleTaskCompletion`) · **Snooze** | Opens the task |
| Deadline (standalone) | **Done** · **Snooze** | Opens the deadline |
| Event | **Snooze** | Opens the event |
| Routine / tracker prompt | **Log ✓** (one-tap trackers and routines, N7) · **Later** | Opens the quick-log |

- **Snooze** opens Android's action-reply chooser: **10 min · 1 hour · This evening · Tomorrow morning**. "This evening" and "Tomorrow morning" use two new settings, defaulting to 18:00 and 09:00. Snooze writes the item's existing `remindAt`, so it syncs and desktop respects it too.
- **Done** on a Reminder or standalone Deadline (decided 2026-10-04): it marks that **occurrence** as actioned. The item stays where it is; on the calendar it renders **struck through and muted**, and it sends no more notifications or snoozes for that occurrence. Done again undoes it.
  - **Today:** Done on a plain Reminder only removes the card from the bell panel; the item has no done state. Done on a task-deadline card completes the task, but that lookup still goes through `calendarReminderId` and is broken by the same Deadline bug (§1).
  - **New field, desktop and Android:** `doneDates: string[]` (occurrence dates actioned) on `CalendarReminder` and `CalendarDeadline`. It's per occurrence, so a repeating reminder is struck through for this week only; same idea as Schedule's `committedDates`. Needs `calendarStore` v15 with a cumulative migrate, migration `042` (`done_dates jsonb not null default '[]'` on `calendar_reminders` and `calendar_deadlines`, no new table), the mappers, and agent-layer exposure via the shared store action.
  - **Where Done appears:** the notification action, the bell panel, the Reminder/Deadline pane footer ("Mark done" / "Not done"), and the long-press action sheet on a calendar item.
  - Task-linked Deadlines keep using the task's own completion (already shown on the calendar).
  - Events have no Done; they just happen.

### N5. Permission: asked at the moment it's needed
Not on first launch. The first time the user saves something that would notify, an explainer sheet ("Get a nudge when this is due?") leads to the OS prompt, and then the exact-alarm/battery check. If refused, Settings → Notifications shows the state and a button to Android's settings. Asked once; never nags.

### N6. Opening from a notification
Tapping goes through the D5 deep-link listener (`organisaitor://open/<kind>/<id>`). It opens the item's pane over its section, and back returns to wherever the user was. This is one `appUrlOpen` router shared with OAuth (patterns §12.3).

### N7. Record-tracking prompts (new, for desktop too)
Trackers and routines get an optional **"Remind me"**: a time plus days of the week (default: the routine's own `repeatConfig.daysOfWeek`, or every day).
- **New field** on `Collection` (tracker/routine kinds): `reminder: { time: string; days: number[] } | null`. That means `taskStore` v14 with a cumulative migrate, a Supabase column `collections.reminder jsonb` (migration 043), and a mapper update. It's synced, and desktop's poller fires it too.
- **Skipped automatically** if today is already logged (a routine instance completed, or a tracker entry exists for today), so the prompt only comes when it's still needed.
- **Log ✓ from the notification** for one-tap shapes: a single-boolean tracker, or a routine whose steps you tick all at once. Rating or multi-field trackers open straight into the quick-log (Records W5).
- Edited in `EditTrackerPane`/`EditRoutinePane` on every platform.
- This replaces BACKLOG §6's global "routine default time" and per-routine `reminderTime`. A per-item setting matches how events, reminders and deadlines already work.

### N8. In-app history stays the bell
`NotificationCenter` remains the record of what fired (and the snooze/done panel) on every platform. On Android, OS notifications are additional to it, not a replacement. To check: the bell's placement in the mobile header (gap I5).

### N9. Settings → Notifications (Android section)
- Master switch with permission state.
- Exact-alarm / battery-optimisation status, with a fix button.
- "This evening" and "Tomorrow morning" snooze times.
- Quiet hours (optional, proposed): nothing fires between, say, 22:00 and 07:00; anything due then waits until 07:00, except items marked important.
- Per-kind on/off (Reminders & deadlines, Events, Tracking), which maps to the channels and points to Android's own per-channel settings.
- A test button ("Send a test notification").

### N10. Later, not in this workstream
Server push (FCM), so completing on one device clears the other's alarms. A home-screen widget ("today's reminders + one-tap logging"). Location-based reminders. Each would be its own decision.

## 4. Build order (once signed off)
1. N1: extract `plan.ts`, add Deadlines (fixes the desktop bug), with tests; desktop poller rewired onto it. **Desktop-visible; ships first.**
2. Install `@capacitor/local-notifications`; channels (N3); scheduler + reconcile (N2); permission flow (N5).
3. Deep-link routing (N6, shared with W1's OAuth return).
4. Actions + snooze (N4).
5. Reminder/Deadline "done" (`doneDates`, migration 042, calendar strikethrough, pane + bell + action sheet), desktop and Android.
6. N7 (schema, migration 043, pane UI on desktop and Android, Log ✓ action). Coordinate with Records W5.
7. Settings section (N9). Real-device test: Pixel plus one aggressive-battery OEM if available.

## 5. Acceptance (emulator via CDP, then a real device)
- With the app killed: a timed reminder, a whole-day reminder (evening before), a deadline's lead-time notice, an event's notify-before and a committed Schedule block each fire at the right minute in the account timezone.
- Done, Complete task and Snooze work from the shade with the app killed, and the change syncs.
- Completing or deleting an item and reopening the app cancels its pending notification. Editing a time moves it.
- A repeating reminder fires each occurrence across the window boundary (reconcile adds the next one).
- A tracker prompt is skipped when today is already logged; Log ✓ creates today's entry.
- Desktop: deadline notifications fire again (regression test in `plan.test.ts`).

## 9. Sign-off log
| # | Proposal | Status |
|---|----------|--------|
| N1 | One shared trigger engine | **Decided 2026-10-04** |
| N2 | Rolling 14-day window, reconcile on launch/resume/sync/change, exact alarms | **Decided 2026-10-04** |
| N3 | Three channels; important = high | **Decided 2026-10-04** |
| N4 | Actions + snooze presets via `remindAt`. Done = mark the occurrence actioned (`doneDates`), shown struck through | **Decided 2026-10-04** |
| N5 | Permission asked in context | **Decided 2026-10-04** |
| N6 | Deep links via the shared router | **Decided 2026-10-04** |
| N7 | Tracker/routine "Remind me", skipped if logged, Log ✓ from the shade | **Decided 2026-10-04** |
| N8 | Bell stays as history | **Decided 2026-10-04** |
| N9 | Settings section incl. quiet hours | **Decided 2026-10-04** |
| N10 | Push/widget/location deferred | **Decided 2026-10-04** |
