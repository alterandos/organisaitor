import { useCalendarStore } from '@/store/calendarStore';
import { isHydrating } from '@/services/sync/hydrating';
import { inStep } from '@/utils/repeatFollow';
import { addDaysToIso } from '@/utils/date';
import type { CalendarDeadlineId, CalendarEventId, CalendarReminderId } from '@/types';

// Keeps every calendar item whose repeat follows other events in step with them
// (docs/features/endeavours.md phase 7): one watcher for the whole calendar, so a new way of
// moving or changing an event needs nothing. The item's own date is its first date; an event
// keeps its length. Skipped while sync is merging (the merged copies are already in step).

let syncing = false;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

export function bringFollowersInStep(): void {
  const cal = useCalendarStore.getState();
  syncing = true;
  try {
    for (const e of Object.values(cal.events)) {
      const repeat = e.repeat && inStep(e.repeat, cal.events);
      if (!repeat?.dates?.length) continue;
      const date = repeat.dates[0];
      const length = e.endDate ? daysBetween(e.date, e.endDate) : null;
      cal.updateEvent(e.id as CalendarEventId, { repeat, date, ...(length !== null ? { endDate: addDaysToIso(date, length) } : {}) });
    }
    for (const r of Object.values(cal.reminders)) {
      const repeat = r.repeat && inStep(r.repeat, cal.events);
      if (repeat?.dates?.length) cal.updateReminder(r.id as CalendarReminderId, { repeat, date: repeat.dates[0] });
    }
    for (const d of Object.values(cal.deadlines)) {
      const repeat = d.repeat && inStep(d.repeat, cal.events);
      if (repeat?.dates?.length) cal.updateDeadline(d.id as CalendarDeadlineId, { repeat, date: repeat.dates[0] });
    }
  } finally {
    syncing = false;
  }
}

export function initRepeatFollow(): () => void {
  bringFollowersInStep();
  return useCalendarStore.subscribe((state, prev) => {
    if (syncing || isHydrating() || state.events === prev.events) return;
    bringFollowersInStep();
  });
}
