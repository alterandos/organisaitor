import { useCalendarStore } from '@/store/calendarStore';
import { planDeadlineWork, undoDeadlineWork, updateTaskLinked } from '@/services/taskCalendarLinks';
import { useTaskStore } from '@/store/taskStore';
import { showToast } from '@/components/Toast/showToast';
import { addDaysToIso, formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { CalendarDeadlineId, CalendarEventId, CalendarReminderId, TaskId } from '@/types';
import type { OverviewRow } from '@/types/overview';

// Changing an item's dates from an Overview timeline (the Runway's drag handles): THE one place,
// as open.ts is for opening. Each change goes through the item's own path (a task through
// updateTaskLinked, so its calendar entries follow), and every one shows a toast with Undo.
// Only rows whose plan says `movable` are offered.

const L = LABELS.overview.runway;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// The row's due date (a task's deadline, a Deadline's date) or, for a moment or an event, its date
// (an event keeps its length). Returns false when nothing could be moved.
export function moveRowDate(row: OverviewRow, date: string): boolean {
  if (!row.plan?.movable || !row.when || date === row.when) return false;
  const undo = applyMove(row, date);
  if (!undo) return false;
  showToast({ message: L.moved(row.title, formatDate(date)), actions: [{ label: L.undo, onClick: undo }] });
  return true;
}

function applyMove(row: OverviewRow, date: string): (() => void) | null {
  const cal = useCalendarStore.getState();
  switch (row.source) {
    case 'task': {
      const t = useTaskStore.getState().tasks[row.id as TaskId];
      if (!t) return null;
      if (t.deadline) {
        const before = { deadline: t.deadline, scheduledAt: t.scheduledAt };
        // A start after the new deadline moves back to it, so the window never runs backwards.
        updateTaskLinked(t.id, { deadline: date, ...(t.scheduledAt && t.scheduledAt > date ? { scheduledAt: date } : {}) });
        return () => updateTaskLinked(t.id, before);
      }
      const before = t.scheduledAt;
      updateTaskLinked(t.id, { scheduledAt: date });
      return () => updateTaskLinked(t.id, { scheduledAt: before });
    }
    case 'event': {
      const e = cal.events[row.id as CalendarEventId];
      if (!e) return null;
      const shift = daysBetween(e.date, date);
      const before = { date: e.date, endDate: e.endDate };
      cal.updateEvent(e.id, { date, endDate: e.endDate ? addDaysToIso(e.endDate, shift) : null });
      return () => useCalendarStore.getState().updateEvent(e.id, before);
    }
    case 'reminder': {
      const r = cal.reminders[row.id as CalendarReminderId];
      if (!r) return null;
      const before = r.date;
      cal.updateReminder(r.id, { date });
      return () => useCalendarStore.getState().updateReminder(r.id, { date: before });
    }
    case 'deadline': {
      const d = cal.deadlines[row.id as CalendarDeadlineId];
      if (!d) return null;
      const before = d.date;
      cal.updateDeadline(d.id, { date });
      return () => useCalendarStore.getState().updateDeadline(d.id, { date: before });
    }
    default:
      return null;
  }
}

// When work starts: a task's scheduled day; on a standalone Deadline, "Plan the work": it becomes a
// task with that start, keeping the Deadline (services/taskCalendarLinks.ts planDeadlineWork).
export function setRowStart(row: OverviewRow, date: string): boolean {
  if (!row.plan?.movable || row.plan.shape !== 'due' || !row.when) return false;
  const start = date > row.when ? row.when : date;
  if (row.source === 'task') {
    const t = useTaskStore.getState().tasks[row.id as TaskId];
    if (!t) return false;
    const before = t.scheduledAt;
    updateTaskLinked(t.id, { scheduledAt: start });
    showToast({ message: L.startSet(row.title, formatDate(start)), actions: [{ label: L.undo, onClick: () => updateTaskLinked(t.id, { scheduledAt: before }) }] });
    return true;
  }
  if (row.source === 'deadline') {
    const made = planDeadlineWork(row.id, start);
    if (!made) return false;
    showToast({ message: L.planned(row.title, formatDate(start)), actions: [{ label: L.undo, onClick: () => undoDeadlineWork(made) }] });
    return true;
  }
  return false;
}
