import { nanoid } from 'nanoid';
import type { ScheduleBlock } from '@/types';

export interface NewScheduleBlock {
  title:               string;
  daysOfWeek:          number[];
  startTime:           string;
  endTime:             string;
  intervalAnchor:      string;
  location?:           string | null;
  interval?:           number;
  notes?:              string | null;
  requiresCommitment?: boolean;
}

// The one place a ScheduleBlock's defaults live. `intervalAnchor` has no default here on purpose:
// the sensible one (the schedule's start date, else today in the account's timezone) depends on
// the caller's context.
export function createScheduleBlock(input: NewScheduleBlock): ScheduleBlock {
  return {
    id:                 nanoid(8),
    title:              input.title.trim(),
    daysOfWeek:         input.daysOfWeek,
    startTime:          input.startTime,
    endTime:            input.endTime,
    location:           input.location?.trim() || null,
    interval:           input.interval ?? 1,
    intervalAnchor:     input.intervalAnchor,
    exceptions:         [],
    notes:              input.notes ?? null,
    requiresCommitment: input.requiresCommitment ?? false,
    committedDates:     [],
  };
}
