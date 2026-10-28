import { useCalendarStore } from '@/store/calendarStore';
import { toggleTaskCompletion } from '@/services/taskCompletion';
import { toggleDone } from '@/services/rhythms';
import type { CalendarDeadlineId, CalendarReminderId, TaskId } from '@/types';
import type { OverviewRow } from '@/types/overview';

// The Overview's one edit: ticking a row done (or not done again), agreed 2026-10-13. Everything
// else opens the item (open.ts). Goes through each kind's own single entry point, so ticking here
// is the same as ticking it anywhere else: a task through toggleTaskCompletion (blockers, the
// Completed toast, recurring tasks), a reminder or deadline through its occurrence's done mark.

export function canTickDone(row: OverviewRow): boolean {
  if (row.status === 'archived') return false;
  if (row.source === 'task' || row.source === 'rhythm') return true;
  return (row.source === 'reminder' || row.source === 'deadline') && !!row.when;
}

export function tickOverviewRow(row: OverviewRow): void {
  if (!canTickDone(row)) return;
  if (row.source === 'task') { void toggleTaskCompletion(row.id as TaskId); return; }
  if (row.source === 'rhythm') { const [rhythm, stream, date] = row.id.split('|'); toggleDone(rhythm, stream, date); return; }
  // The row stands for one date: a one-off item's own, a repeating one's next not yet done.
  useCalendarStore.getState().setOccurrenceDone(
    row.source as 'reminder' | 'deadline',
    row.id as CalendarReminderId | CalendarDeadlineId,
    row.when!,
    row.status !== 'done',
  );
}
