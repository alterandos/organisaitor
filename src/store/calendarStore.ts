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

interface CalendarState {
  events:    Record<CalendarEventId,    CalendarEvent>;
  reminders: Record<CalendarReminderId, CalendarReminder>;

  addEvent:    (input: CreateCalendarEventInput)    => void;
  updateEvent: (id: CalendarEventId, changes: Partial<Omit<CalendarEvent,    'id' | 'createdAt'>>) => void;
  deleteEvent: (id: CalendarEventId)                => void;

  addReminder:    (input: CreateCalendarReminderInput)    => void;
  updateReminder: (id: CalendarReminderId, changes: Partial<Omit<CalendarReminder, 'id' | 'createdAt'>>) => void;
  deleteReminder: (id: CalendarReminderId)                => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      events:    {},
      reminders: {},

      addEvent: (input) => set((s) => {
        const ts = now();
        const event: CalendarEvent = {
          id:           newCalendarEventId(),
          title:        input.title.trim(),
          date:         input.date,
          endDate:           input.endDate            ?? null,
          startTime:    input.startTime    ?? null,
          endTime:      input.endTime      ?? null,
          notes:        input.notes        ?? null,
          location:     input.location     ?? null,
          eventType:    input.eventType    ?? 'default',
          collectionId:      input.collectionId ?? null,
          createdAt:         ts,
          updatedAt:         ts,
          notifyBeforeValue: input.notifyBeforeValue ?? 1,
          notifyBeforeUnit:  input.notifyBeforeUnit  ?? 'hours',
          remindAt:          null,
          notifyAtTime:      input.notifyAtTime      ?? null,
          repeat:            input.repeat            ?? null,
        };
        return { events: { ...s.events, [event.id]: event } };
      }),

      updateEvent: (id, changes) => set((s) => {
        const event = s.events[id];
        if (!event) return {};
        return { events: { ...s.events, [id]: { ...event, ...changes, updatedAt: now() } } };
      }),

      deleteEvent: (id) => set((s) => {
        const { [id]: _, ...rest } = s.events;
        return { events: rest as Record<CalendarEventId, CalendarEvent> };
      }),

      addReminder: (input) => set((s) => {
        const ts = now();
        const reminder: CalendarReminder = {
          id:           newCalendarReminderId(),
          title:        input.title.trim(),
          date:         input.date,
          time:         input.time         ?? null,
          notes:        input.notes        ?? null,
          collectionId: input.collectionId ?? null,
          createdAt:    ts,
          updatedAt:    ts,
          remindAt:     null,
          repeat:       input.repeat ?? null,
        };
        return { reminders: { ...s.reminders, [reminder.id]: reminder } };
      }),

      updateReminder: (id, changes) => set((s) => {
        const reminder = s.reminders[id];
        if (!reminder) return {};
        return { reminders: { ...s.reminders, [id]: { ...reminder, ...changes, updatedAt: now() } } };
      }),

      deleteReminder: (id) => set((s) => {
        const { [id]: _, ...rest } = s.reminders;
        return { reminders: rest as Record<CalendarReminderId, CalendarReminder> };
      }),
    }),
    {
      name: 'todo-calendar',
      version: 2,
      migrate(state: any, version: number) {
        if (version < 2) {
          const events = state.events ?? {};
          Object.values(events).forEach((ev: any) => { if (ev.endDate === undefined) ev.endDate = null; });
        }
        return state as CalendarState;
      },
    }
  )
);
