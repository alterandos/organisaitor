import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListStore } from '@/store/listStore';
import { useListViews } from '@/store/listViews';
import { listView } from '@/services/listSecrets';
import { linksToIn, type IncomingLink } from '@/utils/linksTo';

// "What links here", from the stores: utils/linksTo.ts's linksToIn over the current tasks,
// calendar items and lists (lists through their views). The ONE lookup of the other side of a link
// (adopted 2026-11-10): a new place that shows what links to something reads it here.
export type { IncomingLink } from '@/utils/linksTo';

export function linksTo(type: string, id: string): IncomingLink[] {
  const cal = useCalendarStore.getState();
  const lists = Object.fromEntries(Object.entries(useListStore.getState().lists).map(([k, l]) => [k, listView(l)]));
  return linksToIn({ tasks: useTaskStore.getState().tasks, events: cal.events, reminders: cal.reminders, deadlines: cal.deadlines, lists }, type, id);
}

export function useLinksTo(type: string, id: string | null | undefined): IncomingLink[] {
  const tasks     = useTaskStore((s) => s.tasks);
  const events    = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const lists     = useListViews();
  return useMemo(() => (id ? linksToIn({ tasks, events, reminders, deadlines, lists }, type, id) : []), [type, id, tasks, events, reminders, deadlines, lists]);
}
