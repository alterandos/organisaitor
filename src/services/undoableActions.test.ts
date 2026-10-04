import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrashStore } from '@/store/trashStore';
import { useToastStore } from '@/store/toastStore';
import { archiveTaskWithUndo, deleteTaskWithUndo } from '@/services/undoableActions';

function pressUndo() {
  const toast = useToastStore.getState().current;
  const undo = toast?.actions.find((a) => a.label === 'Undo');
  expect(undo).toBeDefined();
  undo!.onClick();
}

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
  useToastStore.setState(useToastStore.getInitialState(), true);
});

describe('deleteTaskWithUndo', () => {
  it('deletes at once (task, sub-task and calendar entry go to the Recycling Bin) and says so', () => {
    const taskId = useTaskStore.getState().addTask({ title: 'Buy milk' });
    const childId = useTaskStore.getState().addTask({ title: 'Child', parentId: taskId });
    const eventId = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    useTaskStore.getState().updateTask(taskId, { calendarEventId: eventId });

    deleteTaskWithUndo(taskId);

    expect(useTaskStore.getState().tasks[taskId]).toBeUndefined();
    expect(useTaskStore.getState().tasks[childId]).toBeUndefined();
    expect(useCalendarStore.getState().events[eventId]).toBeUndefined();
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(3);
    expect(useToastStore.getState().current?.message).toBe('Deleted “Buy milk”');
  });

  it('Undo brings everything back, sub-task re-attached, and leaves the Recycling Bin as it was', () => {
    const earlier = useTaskStore.getState().addTask({ title: 'Deleted earlier' });
    useTaskStore.getState().deleteTask(earlier);
    const taskId = useTaskStore.getState().addTask({ title: 'Buy milk' });
    const childId = useTaskStore.getState().addTask({ title: 'Child', parentId: taskId });
    const eventId = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    useTaskStore.getState().updateTask(taskId, { calendarEventId: eventId });

    deleteTaskWithUndo(taskId);
    pressUndo();

    const tasks = useTaskStore.getState().tasks;
    expect(tasks[taskId]).toBeDefined();
    expect(tasks[childId]?.parentId).toBe(taskId);
    expect(tasks[taskId].subtaskIds).toEqual([childId]);
    expect(useCalendarStore.getState().events[eventId]).toBeDefined();
    const left = Object.values(useTrashStore.getState().entries);
    expect(left.map((e) => e.title)).toEqual(['Deleted earlier']);
  });
});

describe('archiveTaskWithUndo', () => {
  it('archives without a reason, and Undo restores it', () => {
    const taskId = useTaskStore.getState().addTask({ title: 'Old idea' });

    archiveTaskWithUndo(taskId);
    expect(useTaskStore.getState().tasks[taskId]).toMatchObject({ archived: true, archiveReason: null });
    expect(useToastStore.getState().current?.message).toBe('Archived “Old idea”');

    pressUndo();
    expect(useTaskStore.getState().tasks[taskId].archived).toBe(false);
  });
});
