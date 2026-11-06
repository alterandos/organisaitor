import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { linkTaskToEvent, linkedTaskDates } from '@/services/eventTaskLinks';
import { makeItemLink } from '@/utils/taskLinks';
import { LABELS } from '@/config/labels';
import type { CollectionId, TaskId } from '@/types';
import type { PendingTask } from '@/components/TaskLinks/EventTasksField';

// What the create form held for an item not made yet (CalendarItemFields' Tasks): once it's made, a
// new preparation or follow-up task for each (titled from the item, dated from it, filed with it),
// and the existing tasks linked.
export function makePendingTasks(pending: PendingTask[], type: 'event' | 'deadline', id: string, title: string, collectionId: CollectionId | null): void {
  const L = LABELS.taskLinks.event;
  for (const p of pending) {
    if (p.taskId) { linkTaskToEvent(p.taskId as TaskId, p.kind, type, id); continue; }
    if (p.kind === 'related') continue;
    addTaskWithCalendar({
      title: (p.kind === 'prepFor' ? L.prepTitle : L.followTitle)(title),
      collectionId,
      ...linkedTaskDates(p.kind, type, id),
      itemLinks: [makeItemLink(p.kind, id, null, new Date().toISOString(), type)],
    });
  }
}
