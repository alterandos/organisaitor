import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { addTaskWithCalendar, syncTaskShadows, updateCalendarEventLinked, updateTaskLinked } from '@/services/taskCalendarLinks';
import { deleteEventWithCleanup } from '@/services/crossAppLinkCleanup';
import { resetStores } from '@/test/helpers';

const T = () => useTaskStore.getState();
const C = () => useCalendarStore.getState();

beforeEach(resetStores);

describe('taskCalendarLinks', () => {
  const make = () => addTaskWithCalendar({ title: 'Write report', deadline: '2031-10-01', deadlineTime: '17:00', scheduledAt: '2031-09-25', scheduledTime: '09:00' });

  it('creates a matching event and reminder', () => {
    const id = make();
    const t = T().tasks[id];
    expect(C().events[t.calendarEventId!]).toMatchObject({ title: 'Write report', date: '2031-09-25', startTime: '09:00', eventType: 'task' });
    expect(C().reminders[t.calendarReminderId!]).toMatchObject({ title: 'Write report', date: '2031-10-01', time: '17:00', reminderType: 'task' });
  });

  it('carries task edits to both entries', () => {
    const id = make();
    updateTaskLinked(id, { title: 'Report v2', scheduledAt: '2031-09-26', scheduledTime: '10:30', deadlineTime: null });
    const t = T().tasks[id];
    expect(C().events[t.calendarEventId!]).toMatchObject({ title: 'Report v2', date: '2031-09-26', startTime: '10:30' });
    expect(C().reminders[t.calendarReminderId!]).toMatchObject({ title: 'Report v2', time: null });
  });

  it('carries edits made on the event back to the task, leaving event-only fields alone', () => {
    const id = make();
    const eventId = T().tasks[id].calendarEventId!;
    updateCalendarEventLinked(eventId, { title: 'Report v3', date: '2031-09-27', startTime: '11:00' });
    expect(T().tasks[id]).toMatchObject({ title: 'Report v3', scheduledAt: '2031-09-27', scheduledTime: '11:00' });
    expect(C().reminders[T().tasks[id].calendarReminderId!].title).toBe('Report v3');
    updateCalendarEventLinked(eventId, { location: 'Room 4', endTime: '12:00' });
    expect(T().tasks[id].title).toBe('Report v3');
    expect(C().events[eventId].location).toBe('Room 4');
  });

  it('removes the entries when the dates are cleared', () => {
    const id = make();
    updateTaskLinked(id, { deadline: null, deadlineTime: null, scheduledAt: null, scheduledTime: null });
    expect(Object.keys(C().events)).toHaveLength(0);
    expect(Object.keys(C().reminders)).toHaveLength(0);
    expect(T().tasks[id]).toMatchObject({ calendarEventId: null, calendarReminderId: null });
  });

  it('un-schedules the task when its scheduled event is deleted', () => {
    const id = make();
    deleteEventWithCleanup(T().tasks[id].calendarEventId!);
    expect(T().tasks[id]).toMatchObject({ scheduledAt: null, scheduledTime: null, calendarEventId: null, title: 'Write report' });
    updateTaskLinked(id, { scheduledAt: '2031-10-05' });
    expect(C().events[T().tasks[id].calendarEventId!].date).toBe('2031-10-05');
  });

  it('replaces a linked id whose entry no longer exists on the next edit', () => {
    const id = make();
    useTaskStore.setState((s) => ({ tasks: { ...s.tasks, [id]: { ...s.tasks[id], calendarEventId: 'gone' as never } } }));
    updateTaskLinked(id, { scheduledAt: '2031-10-06' });
    expect(C().events[T().tasks[id].calendarEventId!]?.date).toBe('2031-10-06');
  });

  it('does nothing for an unrelated edit, and is idempotent', () => {
    const id = make();
    const events = C().events;
    updateTaskLinked(id, { priority: 'high' });
    syncTaskShadows(id);
    expect(C().events).toBe(events);
  });

  it('makes a sub-task inherit the parent priority and Endeavour unless told otherwise', () => {
    const endeavour = T().addCollection({ kind: 'project', name: 'P' });
    const parent = addTaskWithCalendar({ title: 'Parent', priority: 'high', collectionId: endeavour });
    const childId = addTaskWithCalendar({ title: 'Child', parentId: parent });
    expect(T().tasks[childId]).toMatchObject({ priority: 'high', collectionId: endeavour });
    const ownId = addTaskWithCalendar({ title: 'Own', parentId: parent, priority: 'low', collectionId: null });
    expect(T().tasks[ownId]).toMatchObject({ priority: 'low', collectionId: null });
  });
});
