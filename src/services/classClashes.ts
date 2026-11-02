import { useCalendarStore } from '@/store/calendarStore';
import { isHydrating, onLoaded } from '@/services/sync/hydrating';
import { replacedIndex, withReplaced } from '@/utils/classClashes';
import { sameRepeat } from '@/utils/scheduleItems';
import type { CalendarEventId } from '@/types';

// Keeps every class's dates in step with the items shown instead of it (an in-class essay): the
// date is skipped while the item is still on it, and given back when it moves, is archived or is
// deleted. One watcher for the calendar, as the period's breaks are (rules: utils/classClashes.ts).
// Items drawn during a class need nothing here: the calendar draws them on the class.

let applying = false;

export function applyClassReplacements(): void {
  const { events, deadlines } = useCalendarStore.getState();
  const replaced = replacedIndex(events, deadlines);
  applying = true;
  try {
    for (const ev of Object.values(events)) {
      if (!ev.repeat || ev.seriesId) continue;
      const dates = replaced.get(ev.id) ?? [];
      if (!dates.length && !ev.repeat.replacedSkips?.length) continue;
      const next = withReplaced(ev.repeat, dates);
      if (!sameRepeat(next, ev.repeat)) useCalendarStore.getState().updateEvent(ev.id as CalendarEventId, { repeat: next });
    }
  } finally {
    applying = false;
  }
}

// Started once from App.tsx.
export function initClassClashes(): () => void {
  applyClassReplacements();
  const offLoaded = onLoaded(applyClassReplacements);
  const off = useCalendarStore.subscribe((s, p) => {
    if (applying || isHydrating() || (s.events === p.events && s.deadlines === p.deadlines)) return;
    applyClassReplacements();
  });
  return () => { offLoaded(); off(); };
}
