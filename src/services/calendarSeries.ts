import { useCalendarStore } from '@/store/calendarStore';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { deleteDeadlineWithCleanup, deleteEventWithCleanup, deleteReminderWithCleanup } from '@/services/crossAppLinkCleanup';
import { LABELS } from '@/config/labels';
import type { CalendarDeadline, CalendarDeadlineId, CalendarEvent, CalendarEventId, CalendarReminder, CalendarReminderId } from '@/types';

// Dates taken out of a repeating series stay linked to it (seriesId / seriesDate, set by the
// store's detach/split actions — iCalendar's RECURRENCE-ID). The rules for that link live here, for
// the calendar panes and the note panes alike.

export type SeriesKind = 'event' | 'reminder' | 'deadline';
type SeriesItem = CalendarEvent | CalendarReminder | CalendarDeadline;

function slice(kind: SeriesKind): Record<string, SeriesItem> {
  const cal = useCalendarStore.getState();
  return kind === 'event' ? cal.events : kind === 'reminder' ? cal.reminders : cal.deadlines;
}

export function seriesItem(kind: SeriesKind, id: string): SeriesItem | undefined {
  return slice(kind)[id];
}

// The dates taken out of this series (each now its own item, or the start of its own series).
export function changedDatesOf(kind: SeriesKind, seriesId: string): SeriesItem[] {
  return Object.values(slice(kind))
    .filter((item) => item.seriesId === seriesId && !item.archivedAt)
    .sort((a, b) => (a.seriesDate ?? a.date).localeCompare(b.seriesDate ?? b.date));
}

function update(kind: SeriesKind, id: string, changes: Partial<SeriesItem>): void {
  const cal = useCalendarStore.getState();
  if (kind === 'event') cal.updateEvent(id as CalendarEventId, changes as Partial<CalendarEvent>);
  else if (kind === 'reminder') cal.updateReminder(id as CalendarReminderId, changes as Partial<CalendarReminder>);
  else cal.updateDeadline(id as CalendarDeadlineId, changes as Partial<CalendarDeadline>);
}

function remove(kind: SeriesKind, id: string): void {
  if (kind === 'event') deleteEventWithCleanup(id as CalendarEventId);
  else if (kind === 'reminder') deleteReminderWithCleanup(id as CalendarReminderId);
  else deleteDeadlineWithCleanup(id as CalendarDeadlineId);
}

// "Unlink from series": the item stays as it is, just no longer part of the series.
export function unlinkFromSeries(kind: SeriesKind, id: string): void {
  update(kind, id, { seriesId: null, seriesDate: null });
}

// After a series is deleted: if dates were taken out of it, ask whether they go too (the series
// they belonged to is gone). Kept ones are unlinked, so nothing points at a deleted series.
export async function afterSeriesDeleted(kind: SeriesKind, seriesId: string): Promise<void> {
  const changed = changedDatesOf(kind, seriesId);
  if (changed.length === 0) return;
  const L = LABELS.calendarSeries;
  const also = await confirmDialog({
    title:        L.deleteChangedTitle(changed.length),
    message:      L.deleteChangedMessage(changed.length),
    confirmLabel: L.deleteChangedConfirm,
    cancelLabel:  L.keepChanged,
    destructive:  true,
  });
  for (const item of changed) {
    if (also) remove(kind, item.id);
    else unlinkFromSeries(kind, item.id);
  }
}
