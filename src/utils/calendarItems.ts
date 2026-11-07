import type { TaskId, CalendarEventId, CalendarReminderId, CalendarDeadlineId, CollectionId, CalendarEvent, CalendarReminder, CalendarDeadline, Collection, EventStatus, ScheduleId, ScheduleTemplate, Task, TrackerEntry } from '@/types';
import { isDealtWith, isRhythm, rhythmOccurrences, tickIndex } from '@/utils/rhythms';
import { STREAM_KINDS } from '@/config/streamKinds';
import { inEndeavourScope } from '@/utils/endeavourGraph';
import type { TagTest } from '@/utils/tagScope';
import { hiddenBySchedule } from '@/utils/scheduleItems';
import { drawnOnOthers, duringIndex, type DuringEntry } from '@/utils/classClashes';
import { expandRepeat, isOccurrenceSkipped, occurrenceTime } from '@/utils/recurrence';
import { eventKind, eventTypeIcon, occurrenceTitle } from '@/config/calendarEventTypes';
import { ITEM_FLAG_ICON, ITEM_TYPE_ICON } from '@/config/itemIcons';
import { quietRuleTasks } from '@/utils/eventTaskRules';
import { isPictureIcon } from '@/components/IconPicker/iconValue';

// What the calendar shows on each date (moved out of CalendarView 2026-11-07, so the calendar pad
// draws the same items): tasks' deadlines, events (a repeating one on each of its dates), Reminders,
// Deadlines and rhythm occurrences, filtered by the calendar's layers, the Endeavour filter and the
// tag filter. Pure.

// An item drawn during a class (utils/classClashes.ts): shown on the class, not on its own.
export type DuringItem = DuringEntry;

export type CalDisplayItem =
  | { kind: 'task';     id: TaskId;             title: string; time: string | null; isMilestone: boolean; collectionId: CollectionId | null; completed: boolean; notes: string | null; typeIcon: string; quiet?: boolean }
  | { kind: 'event';    id: CalendarEventId;    title: string; time: string | null; collectionId: CollectionId | null; notes: string | null; links: string[]; typeIcon: string; flags?: string; status: EventStatus; important: boolean; occurrenceDate: string; travel: boolean; travelIcon: string; pictureIcon: string | null; color: string | null; scheduleId: ScheduleId | null; during?: DuringItem[] }
  | { kind: 'reminder'; id: CalendarReminderId; title: string; time: string | null; collectionId: CollectionId | null; notes: string | null; links: string[]; typeIcon: string; flags?: string; status: EventStatus; important: boolean; occurrenceDate: string; done: boolean }
  | { kind: 'deadline'; id: CalendarDeadlineId; title: string; time: string | null; collectionId: CollectionId | null; notes: string | null; links: string[]; typeIcon: string; flags?: string; status: EventStatus; important: boolean; occurrenceDate: string; done: boolean }
  // A rhythm stream's occurrence whose stream shows on the calendar (docs/features/endeavours.md
  // phase 4): `marker` draws it small; a click ticks it done. id is its tickKey.
  | { kind: 'rhythm';   id: string; rhythmId: string; streamId: string; occurrenceDate: string; title: string; time: string | null; collectionId: CollectionId | null; notes: string | null; typeIcon: string; done: boolean; marker: boolean; behind: boolean };


export interface CalendarItemsInput {
  tasks:          Record<string, Task>;
  events:         Record<string, CalendarEvent>;
  reminders:      Record<string, CalendarReminder>;
  deadlines:      Record<string, CalendarDeadline>;
  schedules:      Record<string, ScheduleTemplate>;
  collections:    Record<string, Collection>;
  trackerEntries: Record<string, TrackerEntry>;
}

export interface CalendarItemsFilter {
  layers:         { taskDeadlines: boolean; taskScheduled: boolean; events: boolean; tentative: boolean; reminders: boolean; deadlines: boolean };
  endeavourScope: ReadonlySet<string> | null;
  tagFilter:      TagTest | null;
  today:          string;
}

export const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function sortItems(items: CalDisplayItem[]): CalDisplayItem[] {
  const kindOrder = { event: 0, task: 2, deadline: 3, reminder: 4, rhythm: 5 } as const;
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
    if (!a.time && b.time) return 1;
    if (a.time && !b.time) return -1;
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return 0;
  });
}


export function calendarItemsByDate(input: CalendarItemsInput, rangeStart: string, rangeEnd: string, filter: CalendarItemsFilter): Map<string, CalDisplayItem[]> {
  const { tasks, events, reminders, deadlines, schedules, collections, trackerEntries } = input;
  const { layers, endeavourScope, tagFilter, today } = filter;
  const map = new Map<string, CalDisplayItem[]>();
  const push = (date: string, item: CalDisplayItem) => {
    const list = map.get(date) ?? [];
    list.push(item);
    map.set(date, list);
  };


  // A rule's later tasks (one for each date of an event) show quietly (2026-11-07).
  const quietTasks = quietRuleTasks(Object.values(tasks));
  Object.values(tasks).forEach((task) => {
    if (task.archived) return;
    if (task.deadline) {
      if (!layers.taskDeadlines) return;
      if (!inEndeavourScope(endeavourScope, task.collectionId) || (tagFilter && !tagFilter(task))) return;
      push(task.deadline, {
        kind: 'task',
        id: task.id,
        title: task.title,
        time: task.deadlineTime,
        isMilestone: task.kind === 'milestone',
        collectionId: task.collectionId,
        completed: task.completed,
        notes: task.notes,
        // A deadline's icon (config/itemIcons.ts), not ❗: that's the Important flag, and read as
        // one beside the title (2026-11-06).
        typeIcon: ITEM_TYPE_ICON.deadline,
        ...(quietTasks.has(task.id) ? { quiet: true } : {}),
      });
    }
  });

  const taskLinkedEventIds = new Set(
    Object.values(tasks).map((t) => t.calendarEventId).filter((id): id is CalendarEventId => !!id)
  );

  // An archived task's shadow event is kept (restoring the task brings it back) but hidden.
  const archivedTaskEventIds = new Set(
    Object.values(tasks).filter((t) => t.archived && t.calendarEventId).map((t) => t.calendarEventId)
  );

  Object.values(events).forEach((ev) => {
    if (ev.archivedAt || archivedTaskEventIds.has(ev.id)) return;
    const isTaskEvent = (ev.eventType ?? 'default') === 'task';
    if (isTaskEvent ? !layers.taskScheduled : !layers.events) return;
    // Tentative is a filter on top of the 'events' layer, not a separate one — a task-linked
    // shadow event is never user-marked tentative, so this only ever applies to plain events.
    if (!isTaskEvent && (ev.status ?? 'confirmed') === 'tentative' && !layers.tentative) return;
    if (!inEndeavourScope(endeavourScope, ev.collectionId) || (tagFilter && !tagFilter(ev))) return;
    // One of a Schedule's items: hidden while the Schedule is off; 🗓, or ✅ for a date taken out
    // of a commitment-mode item and confirmed (services/schedules.ts).
    if (hiddenBySchedule(ev, schedules)) return;
    const series = ev.seriesId ? events[ev.seriesId as CalendarEventId] : undefined;
    const scheduleIcon = !ev.scheduleId ? '' : !ev.repeat && ev.status === 'confirmed' && series?.status === 'tentative' ? '✅' : '🗓';
    const item: CalDisplayItem = {
      kind: 'event',
      id: ev.id,
      title: ev.title,
      time: ev.startTime,
      collectionId: ev.collectionId,
      notes: ev.notes,
      links: ev.links,
      // The event's own icon takes priority in the vanishingly rare case both apply; otherwise 🕐 marks an
      // event auto-created from a task's scheduledAt (see Task.calendarEventId) so the calendar
      // reads as task-linked without changing the event's click/edit behaviour.
      // 🔁 on anything that repeats, or a date taken out of a series (2026-11-05: the user couldn't
      // tell a Schedule's items or a repeating event from a one-off).
      // What it is before its title (its own or its kind's icon); what the app adds about it (❗, 🔁)
      // small after its time, so a few at once don't crowd the title (2026-11-06). A kind that
      // repeats by its nature (a birthday) doesn't say so.
      typeIcon: eventTypeIcon(ev) || scheduleIcon || (taskLinkedEventIds.has(ev.id) ? '🕐' : ''),
      flags: `${ev.important ? ITEM_FLAG_ICON.important : ''}${(ev.repeat || ev.seriesId) && !eventKind(ev.eventType).presets.repeat ? ITEM_FLAG_ICON.repeats : ''}`,
      status: ev.status ?? 'confirmed',
      important: ev.important ?? false,
      occurrenceDate: ev.date,
      travel: !!ev.quiet,
      travelIcon: eventTypeIcon(ev),
      pictureIcon: isPictureIcon(ev.icon) ? ev.icon ?? null : null,
      color: ev.color ?? null,
      scheduleId: ev.scheduleId ?? null,
    };

    if (ev.endDate && ev.endDate > ev.date) {
      // Multi-day event: push to all covered dates within view range
      let cur = ev.date;
      while (cur <= ev.endDate) {
        if (cur >= rangeStart && cur <= rangeEnd) push(cur, { ...item, occurrenceDate: cur });
        const d = new Date(cur + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        cur = toDateStr(d);
      }
    } else {
      // What a date of it says (a birthday: the age it turns: config/calendarEventTypes.ts).
      const titled = (d: string) => occurrenceTitle(ev, d);
      if (!isOccurrenceSkipped(ev.repeat, ev.date)) push(ev.date, { ...item, time: occurrenceTime(ev.repeat, ev.date, ev.startTime) });
      if (ev.repeat) {
        for (const d of expandRepeat(ev.date, ev.repeat, rangeStart, rangeEnd)) push(d, { ...item, occurrenceDate: d, title: titled(d), time: occurrenceTime(ev.repeat, d, ev.startTime) });
      }
    }
  });

  Object.values(reminders).forEach((rem) => {
    if (rem.archivedAt) return;
    // Task-deadline-derived reminders (reminderType: 'task') are excluded here — the
    // deadline already rendered above as its own dedicated kind:'task' pill (synthesized
    // directly from the Task, so it gets live completion styling and opens TaskPane in
    // one click). This row exists only for sync + notification purposes; rendering it
    // here too would duplicate the pill.
    if (rem.reminderType === 'task') return;
    if (!layers.reminders) return;
    // Tentative is a filter on top of the 'reminders' layer, not a separate one — same
    // convention as events (see above).
    if ((rem.status ?? 'confirmed') === 'tentative' && !layers.tentative) return;
    if (!inEndeavourScope(endeavourScope, rem.collectionId) || (tagFilter && !tagFilter(rem))) return;
    const item: CalDisplayItem = {
      kind: 'reminder',
      id: rem.id,
      title: rem.title,
      time: rem.time,
      collectionId: rem.collectionId,
      notes: rem.notes,
      links: rem.links,
      typeIcon: '',
      flags: `${rem.important ? ITEM_FLAG_ICON.important : ''}${rem.repeat || rem.seriesId ? ITEM_FLAG_ICON.repeats : ''}`,
      status: rem.status ?? 'confirmed',
      important: rem.important ?? false,
      occurrenceDate: rem.date,
      done: (rem.doneDates ?? []).includes(rem.date),
    };
    if (!isOccurrenceSkipped(rem.repeat, rem.date)) push(rem.date, { ...item, time: occurrenceTime(rem.repeat, rem.date, rem.time) });
    if (rem.repeat) {
      for (const d of expandRepeat(rem.date, rem.repeat, rangeStart, rangeEnd)) push(d, { ...item, occurrenceDate: d, time: occurrenceTime(rem.repeat, d, rem.time), done: (rem.doneDates ?? []).includes(d) });
    }
  });

  Object.values(deadlines).forEach((dl) => {
    if (dl.archivedAt) return;
    // Same exclusion as task-deadline-derived reminders above, now for deadlineType:'task' —
    // the task's own deadline still renders as its dedicated kind:'task' pill; this row
    // exists only for sync + notification purposes.
    if (dl.deadlineType === 'task') return;
    if (!layers.deadlines) return;
    if ((dl.status ?? 'confirmed') === 'tentative' && !layers.tentative) return;
    if (!inEndeavourScope(endeavourScope, dl.collectionId) || (tagFilter && !tagFilter(dl))) return;
    const item: CalDisplayItem = {
      kind: 'deadline',
      id: dl.id,
      title: dl.title,
      time: dl.time,
      collectionId: dl.collectionId,
      notes: dl.notes,
      links: dl.links,
      typeIcon: ITEM_TYPE_ICON.deadline,
      flags: `${dl.important ? ITEM_FLAG_ICON.important : ''}${dl.repeat || dl.seriesId ? ITEM_FLAG_ICON.repeats : ''}`,
      status: dl.status ?? 'confirmed',
      important: dl.important ?? false,
      occurrenceDate: dl.date,
      done: (dl.doneDates ?? []).includes(dl.date),
    };
    if (!isOccurrenceSkipped(dl.repeat, dl.date)) push(dl.date, { ...item, time: occurrenceTime(dl.repeat, dl.date, dl.time) });
    if (dl.repeat) {
      for (const d of expandRepeat(dl.date, dl.repeat, rangeStart, rangeEnd)) push(d, { ...item, occurrenceDate: d, time: occurrenceTime(dl.repeat, d, dl.time), done: (dl.doneDates ?? []).includes(d) });
    }
  });

  // Rhythm occurrences whose stream shows on the calendar (a mark or an item).
  const ticks = tickIndex(trackerEntries, collections);
  for (const rhythm of Object.values(collections)) {
    if (!isRhythm(rhythm) || rhythm.archivedAt || !inEndeavourScope(endeavourScope, rhythm.id) || (tagFilter && !tagFilter({ tagIds: rhythm.tagIds, collectionId: rhythm.id }))) continue;
    for (const o of rhythmOccurrences(rhythm, schedules, ticks, rangeStart, rangeEnd, today, events)) {
      if (o.stream.show.calendar === 'none') continue;
      push(o.date, {
        kind: 'rhythm', id: o.key, rhythmId: rhythm.id, streamId: o.stream.id, occurrenceDate: o.date,
        title: o.stream.label, time: o.time, collectionId: rhythm.collectionId, notes: rhythm.name,
        typeIcon: STREAM_KINDS[o.stream.kind].icon, done: isDealtWith(o.state),
        marker: o.stream.show.calendar === 'marker', behind: o.state === 'behind',
      });
    }
  }

  // Items during another event (an in-class quiz: utils/classClashes.ts) are drawn on it that day,
  // not on their own: its title says what's in it, and 📌 marks it. A repeating item linked
  // "during" is drawn on it on each of its dates that falls in it.
  const during = duringIndex(events, deadlines);
  if (during.size) {
    const drawnElsewhere = drawnOnOthers(during);
    map.forEach((list, date) => map.set(date, list.flatMap((i): CalDisplayItem[] => {
      if ((i.kind === 'deadline' || i.kind === 'event') && drawnElsewhere.has(`${i.id}|${i.occurrenceDate}`)) return [];
      if (i.kind !== 'event') return [i];
      const ev = events[i.id];
      const on = during.get(`${i.id}|${i.occurrenceDate}`) ?? (ev?.seriesId ? during.get(`${ev.seriesId}|${ev.seriesDate}`) : undefined);
      return on ? [{ ...i, title: `${i.title} · ${on.map((x) => x.title).join(', ')}`, typeIcon: `📌${i.typeIcon}`, during: on }] : [i];
    })));
  }

  map.forEach((list, date) => map.set(date, sortItems(list)));
  return map;
}
