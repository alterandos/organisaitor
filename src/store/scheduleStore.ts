import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScheduleId, ScheduleTemplate, CreateScheduleInput } from '@/types';
import { newScheduleId } from '@/utils/id';
import { now } from '@/utils/date';

interface ScheduleState {
  schedules: Record<ScheduleId, ScheduleTemplate>;

  addSchedule:    (input: CreateScheduleInput) => ScheduleId;
  // `blocks` is included deliberately (unlike most `updateX` actions, which exclude structural
  // arrays) — the schedule editor edits its whole block list locally and commits it in one shot
  // on Save, the same pattern EditTrackerPane uses for a tracker's fieldSchema array.
  updateSchedule: (id: ScheduleId, changes: Partial<Omit<ScheduleTemplate, 'id' | 'createdAt'>>) => void;
  deleteSchedule: (id: ScheduleId) => void;
  toggleScheduleActive: (id: ScheduleId) => void;

  // Targeted single-occurrence mutations — used by the calendar's "skip this occurrence" popover,
  // which only ever touches one block's exception list and shouldn't need the full editor.
  addException:    (scheduleId: ScheduleId, blockId: string, date: string) => void;
  removeException: (scheduleId: ScheduleId, blockId: string, date: string) => void;

  // Commitment mode (see ScheduleBlock.requiresCommitment) — same "targeted, no full editor
  // needed" shape as addException/removeException above, driven from the occurrence popover.
  // commitOccurrences accepts more than one date so the popover's "commit for the next N
  // weeks" bulk action is a single store write, not N of them.
  commitOccurrences:  (scheduleId: ScheduleId, blockId: string, dates: string[]) => void;
  uncommitOccurrence: (scheduleId: ScheduleId, blockId: string, date: string) => void;
}

function touchSchedule(schedule: ScheduleTemplate): ScheduleTemplate {
  return { ...schedule, updatedAt: now() };
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set) => ({
      schedules: {},

      addSchedule: (input) => {
        const id = newScheduleId();
        const ts = now();
        const schedule: ScheduleTemplate = {
          id,
          name:         input.name.trim(),
          color:        input.color        ?? null,
          startDate:    input.startDate    ?? null,
          endDate:      input.endDate      ?? null,
          active:       true,
          collectionId: input.collectionId ?? null,
          blocks:       [],
          createdAt:    ts,
          updatedAt:    ts,
        };
        set((s) => ({ schedules: { ...s.schedules, [id]: schedule } }));
        return id;
      },

      updateSchedule: (id, changes) => set((s) => {
        const schedule = s.schedules[id];
        if (!schedule) return {};
        return { schedules: { ...s.schedules, [id]: touchSchedule({ ...schedule, ...changes }) } };
      }),

      deleteSchedule: (id) => set((s) => {
        const { [id]: _, ...rest } = s.schedules;
        return { schedules: rest as Record<ScheduleId, ScheduleTemplate> };
      }),

      toggleScheduleActive: (id) => set((s) => {
        const schedule = s.schedules[id];
        if (!schedule) return {};
        return { schedules: { ...s.schedules, [id]: touchSchedule({ ...schedule, active: !schedule.active }) } };
      }),

      addException: (scheduleId, blockId, date) => set((s) => {
        const schedule = s.schedules[scheduleId];
        if (!schedule) return {};
        const blocks = schedule.blocks.map((b) =>
          b.id === blockId && !b.exceptions.includes(date)
            ? { ...b, exceptions: [...b.exceptions, date] }
            : b
        );
        return { schedules: { ...s.schedules, [scheduleId]: touchSchedule({ ...schedule, blocks }) } };
      }),

      removeException: (scheduleId, blockId, date) => set((s) => {
        const schedule = s.schedules[scheduleId];
        if (!schedule) return {};
        const blocks = schedule.blocks.map((b) =>
          b.id === blockId ? { ...b, exceptions: b.exceptions.filter((d) => d !== date) } : b
        );
        return { schedules: { ...s.schedules, [scheduleId]: touchSchedule({ ...schedule, blocks }) } };
      }),

      commitOccurrences: (scheduleId, blockId, dates) => set((s) => {
        const schedule = s.schedules[scheduleId];
        if (!schedule) return {};
        const blocks = schedule.blocks.map((b) => {
          if (b.id !== blockId) return b;
          const existing = b.committedDates ?? [];
          const merged = [...new Set([...existing, ...dates])];
          return { ...b, committedDates: merged };
        });
        return { schedules: { ...s.schedules, [scheduleId]: touchSchedule({ ...schedule, blocks }) } };
      }),

      uncommitOccurrence: (scheduleId, blockId, date) => set((s) => {
        const schedule = s.schedules[scheduleId];
        if (!schedule) return {};
        const blocks = schedule.blocks.map((b) =>
          b.id === blockId ? { ...b, committedDates: (b.committedDates ?? []).filter((d) => d !== date) } : b
        );
        return { schedules: { ...s.schedules, [scheduleId]: touchSchedule({ ...schedule, blocks }) } };
      }),
    }),
    { name: 'todo-schedules' }
  )
);
