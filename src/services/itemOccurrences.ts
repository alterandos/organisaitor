import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import type { CalendarDeadlineId, CalendarEventId } from '@/types';
import type { ItemOccurrence } from '@/utils/itemOccurrences';

// Marking one date of an Endeavour's repeating class or Work (the board on its home; rules:
// utils/itemOccurrences.ts). Work is done through its deadline's done dates (as the bell and
// Overview do); a class is attended through its event's `attendedDates`. A date taken out of its
// series is marked on its own item.

const cal = () => useCalendarStore.getState();

export function setAttended(eventId: CalendarEventId, date: string, attended: boolean): void {
  const e = cal().events[eventId];
  if (!e) return;
  const now = e.attendedDates ?? [];
  const next = attended ? [...new Set([...now, date])].sort() : now.filter((d) => d !== date);
  if (next.length !== now.length) cal().updateEvent(eventId, { attendedDates: next });
}

// A click on the board: done (attended), or not again.
export function toggleOccurrence(o: ItemOccurrence): void {
  const target = o.copy ?? o.series;
  if (o.kind === 'work') cal().setOccurrenceDone('deadline', target.id as CalendarDeadlineId, o.date, o.state !== 'done');
  else setAttended(target.id as CalendarEventId, o.date, o.state !== 'attended');
}

// Skip that date (it isn't on), or put it back.
export function skipOccurrence(o: ItemOccurrence): void {
  if (o.copy) return;
  const key = o.key.slice(o.key.lastIndexOf('|') + 1);
  if (o.kind === 'work') cal().skipDeadlineOccurrence(o.series.id as CalendarDeadlineId, key);
  else cal().skipEventOccurrence(o.series.id as CalendarEventId, key);
}

export function unskipOccurrence(o: ItemOccurrence): void {
  const repeat = o.series.repeat;
  if (!repeat || o.copy) return;
  const changes = { repeat: { ...repeat, exceptions: (repeat.exceptions ?? []).filter((d) => d !== o.date) } };
  if (o.kind === 'work') cal().updateDeadline(o.series.id as CalendarDeadlineId, changes);
  else cal().updateEvent(o.series.id as CalendarEventId, changes);
}

// That date in its pane, where its own details (a mark, a note) are given to it alone ("only this
// one", decided with the user 2026-10-30).
export function openOccurrence(o: ItemOccurrence): void {
  const ui = useUIStore.getState();
  if (o.copy) {
    if (o.kind === 'work') ui.openCalendarDeadlinePane(o.copy.id); else ui.openCalendarEventPane(o.copy.id);
    return;
  }
  if (o.kind === 'work') ui.openCalendarDeadlinePane(o.series.id, o.date); else ui.openCalendarEventPane(o.series.id, o.date);
}
