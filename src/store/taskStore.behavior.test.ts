import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import type { TaskId } from '@/types';

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
});

describe('addTask', () => {
  it('registers a sub-task on its parent\'s subtaskIds', () => {
    const parentId = useTaskStore.getState().addTask({ title: 'Parent' });
    const childId = useTaskStore.getState().addTask({ title: 'Child', parentId });
    expect(useTaskStore.getState().tasks[parentId].subtaskIds).toEqual([childId]);
  });
});

describe('archiveTask / restoreTask cascade', () => {
  it('archiving a parent archives its sub-tasks under the same archivedAt stamp', () => {
    const parentId = useTaskStore.getState().addTask({ title: 'Parent' });
    const childId = useTaskStore.getState().addTask({ title: 'Child', parentId });

    useTaskStore.getState().archiveTask(parentId, 'done for now');
    const { tasks } = useTaskStore.getState();
    expect(tasks[parentId].archived).toBe(true);
    expect(tasks[parentId].archiveReason).toBe('done for now');
    expect(tasks[childId].archived).toBe(true);
    expect(tasks[childId].archivedAt).toBe(tasks[parentId].archivedAt);
  });

  it('restoring a parent restores only sub-tasks archived in that same batch, not ones archived separately earlier', () => {
    const parentId = useTaskStore.getState().addTask({ title: 'Parent' });
    const child1 = useTaskStore.getState().addTask({ title: 'Child1', parentId });
    const child2 = useTaskStore.getState().addTask({ title: 'Child2', parentId });

    // child1 archived on its own, first — a distinct timestamp from the parent's later batch.
    vi.useFakeTimers();
    vi.setSystemTime('2026-01-01T00:00:00.000Z');
    useTaskStore.getState().archiveTask(child1);
    vi.setSystemTime('2026-01-01T00:01:00.000Z');
    // Then the whole parent (which cascades to child2, but leaves already-archived child1 alone).
    useTaskStore.getState().archiveTask(parentId);
    vi.useRealTimers();
    expect(useTaskStore.getState().tasks[child1].archivedAt).not.toBe(useTaskStore.getState().tasks[parentId].archivedAt);

    useTaskStore.getState().restoreTask(parentId);
    const { tasks } = useTaskStore.getState();
    expect(tasks[parentId].archived).toBe(false);
    expect(tasks[child2].archived).toBe(false);
    // child1 was archived independently earlier — restoring the parent must not resurrect it.
    expect(tasks[child1].archived).toBe(true);
  });

  it('archiving an already-archived task is a no-op (does not re-stamp archivedAt)', () => {
    const id = useTaskStore.getState().addTask({ title: 'X' });
    useTaskStore.getState().archiveTask(id, 'first reason');
    const firstStamp = useTaskStore.getState().tasks[id].archivedAt;
    useTaskStore.getState().archiveTask(id, 'second reason');
    const state = useTaskStore.getState().tasks[id];
    expect(state.archivedAt).toBe(firstStamp);
    expect(state.archiveReason).toBe('first reason');
  });

  it('restoring a task that is not archived is a no-op', () => {
    const id = useTaskStore.getState().addTask({ title: 'X' });
    const before = useTaskStore.getState().tasks[id];
    useTaskStore.getState().restoreTask(id);
    expect(useTaskStore.getState().tasks[id]).toEqual(before);
  });
});

describe('deleteTask', () => {
  it('removes the task from its parent\'s subtaskIds', () => {
    const parentId = useTaskStore.getState().addTask({ title: 'Parent' });
    const childId = useTaskStore.getState().addTask({ title: 'Child', parentId });
    useTaskStore.getState().deleteTask(childId);
    expect(useTaskStore.getState().tasks[parentId].subtaskIds).toEqual([]);
    expect(useTaskStore.getState().tasks[childId as TaskId]).toBeUndefined();
  });
});

describe('updateTask — link extraction from notes', () => {
  it('a URL newly typed into notes is added to links; an already-removed link is not resurrected', () => {
    const id = useTaskStore.getState().addTask({ title: 'X' });
    useTaskStore.getState().updateTask(id, { notes: 'see https://example.com/a for details' });
    expect(useTaskStore.getState().tasks[id].links).toContain('https://example.com/a');

    // User deliberately removed the link from the explicit links list...
    useTaskStore.getState().updateTask(id, { links: [] });
    // ...editing notes again (same URL still present in the text) must not bring it back.
    useTaskStore.getState().updateTask(id, { notes: 'see https://example.com/a for details, still' });
    expect(useTaskStore.getState().tasks[id].links).toEqual([]);
  });
});
