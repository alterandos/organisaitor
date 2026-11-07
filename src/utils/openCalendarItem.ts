// Which calendar entry is the one whose pane is open (CalendarView outlines it, 2026-11-07): the
// same item, and for one date of a series opened on its own, only that date.
export interface OpenPanes {
  event:    { id: string | null; occurrence: string | null };
  reminder: { id: string | null; occurrence: string | null };
  deadline: { id: string | null; occurrence: string | null };
  taskId:   string | null;
}

export function isOpenCalendarItem(item: { kind: string; id: string; occurrenceDate?: string }, open: OpenPanes): boolean {
  if (item.kind === 'task') return item.id === open.taskId;
  const pane = item.kind === 'event' ? open.event : item.kind === 'reminder' ? open.reminder : item.kind === 'deadline' ? open.deadline : null;
  return !!pane?.id && item.id === pane.id && (!pane.occurrence || item.occurrenceDate === pane.occurrence);
}
