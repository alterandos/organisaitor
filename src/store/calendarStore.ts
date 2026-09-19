import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CalendarEvent,
  CalendarEventId,
  CalendarReminder,
  CalendarReminderId,
  CreateCalendarEventInput,
  CreateCalendarReminderInput,
} from '@/types';
import { newCalendarEventId, newCalendarReminderId } from '@/utils/id';
import { now } from '@/utils/date';
import { deriveNotifyBefore } from '@/utils/googleReminders';
import { DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE, DEFAULT_ALLDAY_NOTIFY_AT_TIME } from '@/config/notifyDefaults';
import { withException, endedBefore, tailOf } from '@/utils/recurrence';

// Composite key for one externally-sourced event, used to decide "have I already imported
// this" — see importedSourceKeys below.
function sourceKey(connectionId: string, calendarId: string, eventId: string): string {
  return `${connectionId}::${calendarId}::${eventId}`;
}

interface CalendarState {
  events:    Record<CalendarEventId,    CalendarEvent>;
  reminders: Record<CalendarReminderId, CalendarReminder>;

  addEvent:    (input: CreateCalendarEventInput)    => CalendarEventId;
  updateEvent: (id: CalendarEventId, changes: Partial<Omit<CalendarEvent,    'id' | 'createdAt'>>) => void;
  deleteEvent: (id: CalendarEventId)                => void;

  addReminder:    (input: CreateCalendarReminderInput)    => CalendarReminderId;
  updateReminder: (id: CalendarReminderId, changes: Partial<Omit<CalendarReminder, 'id' | 'createdAt'>>) => void;
  deleteReminder: (id: CalendarReminderId)                => void;

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
          crossAppRefs:      input.crossAppRefs      ?? [],
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
        return { events: { ...s.events, [id]: { ...event, ...changes, updatedAt: now() } } };
      }),

      deleteEvent: (id) => set((s) => {
        const { [id]: _, ...rest } = s.events;
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
          collectionId: input.collectionId ?? null,
          reminderType: input.reminderType ?? 'default',
          createdAt:    ts,
          updatedAt:    ts,
          remindAt:     null,
          repeat:       input.repeat ?? null,
          important:    input.important ?? false,
          crossAppRefs: input.crossAppRefs ?? [],
          notifyDaysBefore: input.notifyDaysBefore ?? DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE,
          notifyAtTime:     input.notifyAtTime     ?? DEFAULT_ALLDAY_NOTIFY_AT_TIME,
        };
        set((s) => ({ reminders: { ...s.reminders, [id]: reminder } }));
        return id;
      },

      updateReminder: (id, changes) => set((s) => {
        const reminder = s.reminders[id];
        if (!reminder) return {};
        return { reminders: { ...s.reminders, [id]: { ...reminder, ...changes, updatedAt: now() } } };
      }),

      deleteReminder: (id) => set((s) => {
        const { [id]: _, ...rest } = s.reminders;
        return { reminders: rest as Record<CalendarReminderId, CalendarReminder> };
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
      version: 8,
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
        return state as CalendarState;
      },
    }
  )
);
