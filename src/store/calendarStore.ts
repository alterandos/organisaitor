import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CalendarEvent,
  CalendarEventId,
  CalendarReminder,
  CalendarReminderId,
  CalendarDeadline,
  CalendarDeadlineId,
  CreateCalendarEventInput,
  CreateCalendarReminderInput,
  CreateCalendarDeadlineInput,
} from '@/types';
import { newCalendarEventId, newCalendarReminderId, newCalendarDeadlineId } from '@/utils/id';
import { now } from '@/utils/date';
import { deriveNotifyBefore } from '@/utils/googleReminders';
import { DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE, DEFAULT_ALLDAY_NOTIFY_AT_TIME } from '@/config/notifyDefaults';
import { withException, endedBefore, tailOf } from '@/utils/recurrence';
import { mergeNewLinks } from '@/utils/links';
import { persistStorage } from '@/utils/persistStorage';
import { moveToTrash } from '@/services/trashCapture';

// Composite key for one externally-sourced event, used to decide "have I already imported
// this" — see importedSourceKeys below.
function sourceKey(connectionId: string, calendarId: string, eventId: string): string {
  return `${connectionId}::${calendarId}::${eventId}`;
}

interface CalendarState {
  events:    Record<CalendarEventId,    CalendarEvent>;
  reminders: Record<CalendarReminderId, CalendarReminder>;
  deadlines: Record<CalendarDeadlineId, CalendarDeadline>;

  addEvent:    (input: CreateCalendarEventInput)    => CalendarEventId;
  updateEvent: (id: CalendarEventId, changes: Partial<Omit<CalendarEvent,    'id' | 'createdAt'>>) => void;
  deleteEvent: (id: CalendarEventId)                => void;
  archiveEvent: (id: CalendarEventId, reason?: string | null) => void;
  restoreEvent: (id: CalendarEventId) => void;

  addReminder:    (input: CreateCalendarReminderInput)    => CalendarReminderId;
  updateReminder: (id: CalendarReminderId, changes: Partial<Omit<CalendarReminder, 'id' | 'createdAt'>>) => void;
  deleteReminder: (id: CalendarReminderId)                => void;
  archiveReminder: (id: CalendarReminderId, reason?: string | null) => void;
  restoreReminder: (id: CalendarReminderId) => void;

  addDeadline:    (input: CreateCalendarDeadlineInput)    => CalendarDeadlineId;
  updateDeadline: (id: CalendarDeadlineId, changes: Partial<Omit<CalendarDeadline, 'id' | 'createdAt'>>) => void;
  deleteDeadline: (id: CalendarDeadlineId)                => void;
  archiveDeadline: (id: CalendarDeadlineId, reason?: string | null) => void;
  restoreDeadline: (id: CalendarDeadlineId) => void;

  // Individual-occurrence editing for repeating items (see src/utils/recurrence.ts). "skip" =
  // delete just this date; "endBefore" = delete this date and everything after; "detach" =
  // pull this date out of the series into its own standalone item; "split" = start a new
  // series from this date so later occurrences can be edited independently of earlier ones.
  // detach/split return the id of the item that now represents that date, or null if the
  // source item wasn't a repeating one.
  skipEventOccurrence:       (id: CalendarEventId, date: string) => void;
  endEventSeriesBefore:      (id: CalendarEventId, date: string) => void;
  detachEventOccurrence:     (id: CalendarEventId, date: string) => CalendarEventId | null;
  splitEventSeries:          (id: CalendarEventId, date: string) => CalendarEventId | null;
  skipReminderOccurrence:    (id: CalendarReminderId, date: string) => void;
  endReminderSeriesBefore:   (id: CalendarReminderId, date: string) => void;
  detachReminderOccurrence:  (id: CalendarReminderId, date: string) => CalendarReminderId | null;
  splitReminderSeries:       (id: CalendarReminderId, date: string) => CalendarReminderId | null;
  skipDeadlineOccurrence:    (id: CalendarDeadlineId, date: string) => void;
  endDeadlineSeriesBefore:   (id: CalendarDeadlineId, date: string) => void;
  detachDeadlineOccurrence:  (id: CalendarDeadlineId, date: string) => CalendarDeadlineId | null;
  splitDeadlineSeries:       (id: CalendarDeadlineId, date: string) => CalendarDeadlineId | null;

  // External calendar sync (see CLAUDE.md "External calendar sync — built (Google, Phase
  // 1)"). Local-only, deliberately NOT part of the Supabase-synced entity rows — a plain
  // digest of every (connectionId, calendarId, eventId) ever pulled in, kept even after the
  // resulting CalendarEvent is deleted, so a later sync pass never resurrects it. Once an
  // event is created this way, this app is the source of truth for it — sync only ever
  // creates NEW events, never updates or deletes an already-imported one.
  importedSourceKeys: string[];
  upsertSyncedEvent: (input: CreateCalendarEventInput & {
    sourceConnectionId: string; sourceCalendarId: string; sourceEventId: string;
  }) => CalendarEventId | null;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      events:    {},
      reminders: {},
      deadlines: {},

      addEvent: (input) => {
        const id  = newCalendarEventId();
        const ts  = now();
        const event: CalendarEvent = {
          id,
          title:             input.title.trim(),
          date:              input.date,
          endDate:           input.endDate            ?? null,
          startTime:         input.startTime          ?? null,
          endTime:           input.endTime            ?? null,
          notes:             input.notes              ?? null,
          links:             input.links ?? mergeNewLinks([], input.notes),
          location:          input.location           ?? null,
          eventType:         input.eventType          ?? 'default',
          collectionId:      input.collectionId       ?? null,
          createdAt:         ts,
          updatedAt:         ts,
          notifyBeforeValue: input.notifyBeforeValue  ?? null,
          notifyBeforeUnit:  input.notifyBeforeUnit   ?? 'hours',
          remindAt:          null,
          notifyAtTime:      input.notifyAtTime       ?? null,
          repeat:            input.repeat             ?? null,
          status:            input.status             ?? 'confirmed',
          important:         input.important         ?? false,
          background:        input.background        ?? false,
          color:             input.color              ?? null,
          crossAppRefs:      input.crossAppRefs      ?? [],
          archivedAt:        null,
          archiveReason:     null,
          source:              input.source              ?? null,
          sourceConnectionId:  input.sourceConnectionId   ?? null,
          sourceCalendarId:    input.sourceCalendarId     ?? null,
          sourceEventId:       input.sourceEventId        ?? null,
          sourceRaw:           input.sourceRaw            ?? null,
        };
        set((s) => ({ events: { ...s.events, [id]: event } }));
        return id;
      },

      updateEvent: (id, changes) => set((s) => {
        const event = s.events[id];
        if (!event) return {};
        // Links newly typed into the notes are copied into the links list too.
        const patch = changes.notes !== undefined
          ? { ...changes, links: mergeNewLinks(changes.links ?? event.links ?? [], changes.notes, event.notes) }
          : changes;
        return { events: { ...s.events, [id]: { ...event, ...patch, updatedAt: now() } } };
      }),

      archiveEvent: (id, reason) => set((s) => {
        const event = s.events[id];
        if (!event || event.archivedAt) return {};
        const ts = now();
        return { events: { ...s.events, [id]: { ...event, archivedAt: ts, archiveReason: reason?.trim() || null, updatedAt: ts } } };
      }),

      restoreEvent: (id) => set((s) => {
        const event = s.events[id];
        if (!event?.archivedAt) return {};
        return { events: { ...s.events, [id]: { ...event, archivedAt: null, archiveReason: null, updatedAt: now() } } };
      }),

      deleteEvent: (id) => set((s) => {
        const { [id]: removed, ...rest } = s.events;
        if (removed) moveToTrash('calendarEvent', removed);
        return { events: rest as Record<CalendarEventId, CalendarEvent> };
      }),

      addReminder: (input) => {
        const id = newCalendarReminderId();
        const ts = now();
        const reminder: CalendarReminder = {
          id,
          title:        input.title.trim(),
          date:         input.date,
          time:         input.time         ?? null,
          notes:        input.notes        ?? null,
          links:        input.links ?? mergeNewLinks([], input.notes),
          collectionId: input.collectionId ?? null,
          reminderType: input.reminderType ?? 'default',
          createdAt:    ts,
          updatedAt:    ts,
          remindAt:     null,
          repeat:       input.repeat ?? null,
          important:    input.important ?? false,
          status:       input.status ?? 'confirmed',
          crossAppRefs: input.crossAppRefs ?? [],
          archivedAt:    null,
          archiveReason: null,
          notifyDaysBefore: input.notifyDaysBefore ?? DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE,
          notifyAtTime:     input.notifyAtTime     ?? DEFAULT_ALLDAY_NOTIFY_AT_TIME,
        };
        set((s) => ({ reminders: { ...s.reminders, [id]: reminder } }));
        return id;
      },

      updateReminder: (id, changes) => set((s) => {
        const reminder = s.reminders[id];
        if (!reminder) return {};
        const patch = changes.notes !== undefined
          ? { ...changes, links: mergeNewLinks(changes.links ?? reminder.links ?? [], changes.notes, reminder.notes) }
          : changes;
        return { reminders: { ...s.reminders, [id]: { ...reminder, ...patch, updatedAt: now() } } };
      }),

      archiveReminder: (id, reason) => set((s) => {
        const reminder = s.reminders[id];
        if (!reminder || reminder.archivedAt) return {};
        const ts = now();
        return { reminders: { ...s.reminders, [id]: { ...reminder, archivedAt: ts, archiveReason: reason?.trim() || null, updatedAt: ts } } };
      }),

      restoreReminder: (id) => set((s) => {
        const reminder = s.reminders[id];
        if (!reminder?.archivedAt) return {};
        return { reminders: { ...s.reminders, [id]: { ...reminder, archivedAt: null, archiveReason: null, updatedAt: now() } } };
      }),

      deleteReminder: (id) => set((s) => {
        const { [id]: removed, ...rest } = s.reminders;
        if (removed) moveToTrash('calendarReminder', removed);
        return { reminders: rest as Record<CalendarReminderId, CalendarReminder> };
      }),

      addDeadline: (input) => {
        const id = newCalendarDeadlineId();
        const ts = now();
        const deadline: CalendarDeadline = {
          id,
          title:        input.title.trim(),
          date:         input.date,
          time:         input.time         ?? null,
          notes:        input.notes        ?? null,
          links:        input.links ?? mergeNewLinks([], input.notes),
          collectionId: input.collectionId ?? null,
          deadlineType: input.deadlineType ?? 'default',
          createdAt:    ts,
          updatedAt:    ts,
          remindAt:     null,
          repeat:       input.repeat ?? null,
          important:    input.important ?? false,
          status:       input.status ?? 'confirmed',
          crossAppRefs: input.crossAppRefs ?? [],
          archivedAt:    null,
          archiveReason: null,
          notifyDaysBefore: input.notifyDaysBefore ?? DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE,
          notifyAtTime:     input.notifyAtTime     ?? DEFAULT_ALLDAY_NOTIFY_AT_TIME,
        };
        set((s) => ({ deadlines: { ...s.deadlines, [id]: deadline } }));
        return id;
      },

      updateDeadline: (id, changes) => set((s) => {
        const deadline = s.deadlines[id];
        if (!deadline) return {};
        const patch = changes.notes !== undefined
          ? { ...changes, links: mergeNewLinks(changes.links ?? deadline.links ?? [], changes.notes, deadline.notes) }
          : changes;
        return { deadlines: { ...s.deadlines, [id]: { ...deadline, ...patch, updatedAt: now() } } };
      }),

      archiveDeadline: (id, reason) => set((s) => {
        const deadline = s.deadlines[id];
        if (!deadline || deadline.archivedAt) return {};
        const ts = now();
        return { deadlines: { ...s.deadlines, [id]: { ...deadline, archivedAt: ts, archiveReason: reason?.trim() || null, updatedAt: ts } } };
      }),

      restoreDeadline: (id) => set((s) => {
        const deadline = s.deadlines[id];
        if (!deadline?.archivedAt) return {};
        return { deadlines: { ...s.deadlines, [id]: { ...deadline, archivedAt: null, archiveReason: null, updatedAt: now() } } };
      }),

      deleteDeadline: (id) => set((s) => {
        const { [id]: removed, ...rest } = s.deadlines;
        if (removed) moveToTrash('calendarDeadline', removed);
        return { deadlines: rest as Record<CalendarDeadlineId, CalendarDeadline> };
      }),

      skipEventOccurrence: (id, date) => {
        const ev = get().events[id];
        if (ev?.repeat) get().updateEvent(id, { repeat: withException(ev.repeat, date) });
      },

      endEventSeriesBefore: (id, date) => {
        const ev = get().events[id];
        if (!ev?.repeat) return;
        if (date <= ev.date) get().deleteEvent(id);
        else get().updateEvent(id, { repeat: endedBefore(ev.repeat, date) });
      },

      detachEventOccurrence: (id, date) => {
        const ev = get().events[id];
        if (!ev?.repeat) return null;
        get().updateEvent(id, { repeat: withException(ev.repeat, date) });
        return get().addEvent({ ...ev, date, endDate: null, crossAppRefs: [], repeat: null, source: null, sourceConnectionId: null, sourceCalendarId: null, sourceEventId: null, sourceRaw: null });
      },

      splitEventSeries: (id, date) => {
        const ev = get().events[id];
        if (!ev?.repeat || date <= ev.date) return null;
        const tail = tailOf(ev.date, ev.repeat, date);
        get().updateEvent(id, { repeat: endedBefore(ev.repeat, date) });
        return get().addEvent({ ...ev, date, endDate: null, crossAppRefs: [], repeat: tail, source: null, sourceConnectionId: null, sourceCalendarId: null, sourceEventId: null, sourceRaw: null });
      },

      skipReminderOccurrence: (id, date) => {
        const rem = get().reminders[id];
        if (rem?.repeat) get().updateReminder(id, { repeat: withException(rem.repeat, date) });
      },

      endReminderSeriesBefore: (id, date) => {
        const rem = get().reminders[id];
        if (!rem?.repeat) return;
        if (date <= rem.date) get().deleteReminder(id);
        else get().updateReminder(id, { repeat: endedBefore(rem.repeat, date) });
      },

      detachReminderOccurrence: (id, date) => {
        const rem = get().reminders[id];
        if (!rem?.repeat) return null;
        get().updateReminder(id, { repeat: withException(rem.repeat, date) });
        return get().addReminder({ ...rem, date, crossAppRefs: [], repeat: null });
      },

      splitReminderSeries: (id, date) => {
        const rem = get().reminders[id];
        if (!rem?.repeat || date <= rem.date) return null;
        const tail = tailOf(rem.date, rem.repeat, date);
        get().updateReminder(id, { repeat: endedBefore(rem.repeat, date) });
        return get().addReminder({ ...rem, date, crossAppRefs: [], repeat: tail });
      },

      skipDeadlineOccurrence: (id, date) => {
        const dl = get().deadlines[id];
        if (dl?.repeat) get().updateDeadline(id, { repeat: withException(dl.repeat, date) });
      },

      endDeadlineSeriesBefore: (id, date) => {
        const dl = get().deadlines[id];
        if (!dl?.repeat) return;
        if (date <= dl.date) get().deleteDeadline(id);
        else get().updateDeadline(id, { repeat: endedBefore(dl.repeat, date) });
      },

      detachDeadlineOccurrence: (id, date) => {
        const dl = get().deadlines[id];
        if (!dl?.repeat) return null;
        get().updateDeadline(id, { repeat: withException(dl.repeat, date) });
        return get().addDeadline({ ...dl, date, crossAppRefs: [], repeat: null });
      },

      splitDeadlineSeries: (id, date) => {
        const dl = get().deadlines[id];
        if (!dl?.repeat || date <= dl.date) return null;
        const tail = tailOf(dl.date, dl.repeat, date);
        get().updateDeadline(id, { repeat: endedBefore(dl.repeat, date) });
        return get().addDeadline({ ...dl, date, crossAppRefs: [], repeat: tail });
      },

      importedSourceKeys: [],
      upsertSyncedEvent: (input) => {
        const key = sourceKey(input.sourceConnectionId, input.sourceCalendarId, input.sourceEventId);
        const state = get();
        if (state.importedSourceKeys.includes(key)) return null;
        const alreadyLive = Object.values(state.events).some((ev) =>
          ev.sourceConnectionId === input.sourceConnectionId &&
          ev.sourceCalendarId   === input.sourceCalendarId &&
          ev.sourceEventId      === input.sourceEventId
        );
        if (alreadyLive) {
          set((s) => ({ importedSourceKeys: [...s.importedSourceKeys, key] }));
          return null;
        }
        const id = get().addEvent(input);
        set((s) => ({ importedSourceKeys: [...s.importedSourceKeys, key] }));
        return id;
      },
    }),
    {
      name: 'todo-calendar',
      storage: persistStorage(),
      version: 14,
      migrate(state: any, version: number) {
        if (version < 2) {
          const events = state.events ?? {};
          Object.values(events).forEach((ev: any) => { if (ev.endDate === undefined) ev.endDate = null; });
        }
        if (version < 3) {
          const reminders = state.reminders ?? {};
          Object.values(reminders).forEach((rem: any) => { if (rem.reminderType === undefined) rem.reminderType = 'default'; });
        }
        if (version < 4) {
          const events = state.events ?? {};
          Object.values(events).forEach((ev: any) => { if (ev.status === undefined) ev.status = 'confirmed'; });
        }
        if (version < 5) {
          const events = state.events ?? {};
          Object.values(events).forEach((ev: any) => {
            if (ev.source === undefined)              ev.source = null;
            if (ev.sourceConnectionId === undefined)  ev.sourceConnectionId = null;
            if (ev.sourceCalendarId === undefined)    ev.sourceCalendarId = null;
            if (ev.sourceEventId === undefined)       ev.sourceEventId = null;
            if (ev.sourceRaw === undefined)           ev.sourceRaw = null;
          });
          if (state.importedSourceKeys === undefined) state.importedSourceKeys = [];
        }
        if (version < 6) {
          Object.values(state.events ?? {}).forEach((ev: any) => { if (ev.important === undefined) ev.important = false; if (ev.crossAppRefs === undefined) ev.crossAppRefs = []; });
          Object.values(state.reminders ?? {}).forEach((rem: any) => { if (rem.important === undefined) rem.important = false; if (rem.crossAppRefs === undefined) rem.crossAppRefs = []; });
        }
        if (version < 7) {
          Object.values(state.reminders ?? {}).forEach((rem: any) => {
            if (rem.notifyDaysBefore === undefined) rem.notifyDaysBefore = DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE;
            if (rem.notifyAtTime === undefined) rem.notifyAtTime = DEFAULT_ALLDAY_NOTIFY_AT_TIME;
          });
        }
        if (version < 8) {
          // Google events imported while "notify before" defaulted to off never got a notification.
          // Re-derive theirs from the reminders Google sent (kept in sourceRaw). Only events never
          // edited here (updatedAt === createdAt), so a deliberate "off" isn't overridden; the
          // calendar's own default reminders weren't stored, so this can only use the event's own.
          Object.values(state.events ?? {}).forEach((ev: any) => {
            if (ev.source !== 'google' || ev.notifyBeforeValue !== null || ev.updatedAt !== ev.createdAt) return;
            const n = deriveNotifyBefore(ev.sourceRaw?.reminders, undefined, !ev.startTime);
            ev.notifyBeforeValue = n.value;
            ev.notifyBeforeUnit = n.unit;
          });
        }
        if (version < 9) {
          Object.values(state.events ?? {}).forEach((ev: any) => { if (ev.archivedAt === undefined) ev.archivedAt = null; if (ev.archiveReason === undefined) ev.archiveReason = null; });
          Object.values(state.reminders ?? {}).forEach((rem: any) => { if (rem.archivedAt === undefined) rem.archivedAt = null; if (rem.archiveReason === undefined) rem.archiveReason = null; });
        }
        if (version < 10) {
          Object.values(state.events ?? {}).forEach((ev: any) => { if (ev.links === undefined) ev.links = []; });
          Object.values(state.reminders ?? {}).forEach((rem: any) => { if (rem.links === undefined) rem.links = []; });
        }
        if (version < 11) {
          Object.values(state.reminders ?? {}).forEach((rem: any) => { if (rem.status === undefined) rem.status = 'confirmed'; });
        }
        if (version < 12) {
          Object.values(state.events ?? {}).forEach((ev: any) => { if (ev.background === undefined) ev.background = false; });
        }
        if (version < 13) {
          Object.values(state.events ?? {}).forEach((ev: any) => { if (ev.color === undefined) ev.color = null; });
        }
        if (version < 14) {
          // New top-level record slice, not just a new field — a store that has never seen
          // this key needs it defaulted the same way a brand-new persisted store would (see
          // CLAUDE.md "Unversioned stores"), just as a version-gated step within an existing
          // store rather than the store's very first version.
          if (state.deadlines === undefined) state.deadlines = {};
        }
        return state as CalendarState;
      },
    }
  )
);
