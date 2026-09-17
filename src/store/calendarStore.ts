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
          notifyBeforeValue: input.notifyBeforeValue  ?? 1,
          notifyBeforeUnit:  input.notifyBeforeUnit   ?? 'hours',
          remindAt:          null,
          notifyAtTime:      input.notifyAtTime       ?? null,
          repeat:            input.repeat             ?? null,
          status:            input.status             ?? 'confirmed',
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
      version: 5,
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
        return state as CalendarState;
      },
    }
  )
);
