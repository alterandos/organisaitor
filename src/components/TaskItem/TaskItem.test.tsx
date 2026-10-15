// @vitest-environment jsdom
//
// A task row's right-click menu (the `task-row` scope): what it offers in each state, and that its
// actions reach the task.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenuHost } from '@/components/ContextMenu/ContextMenuHost';
import { TaskItem } from './TaskItem';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import type { TaskId } from '@/types';

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => { cleanup(); });

function Row({ id }: { id: TaskId }) {
  const task = useTaskStore((s) => s.tasks[id]);
  return task ? <TaskItem task={task} collectionColor={null} /> : null;
}

function show(id: TaskId) {
  render(<><ContextMenuHost /><Row id={id} /></>);
  act(() => { fireEvent.contextMenu(screen.getByText('Buy milk'), { clientX: 10, clientY: 10 }); });
  return screen.getAllByRole('menuitem').map((el) => el.textContent?.trim());
}

describe('TaskItem right-click menu', () => {
  it('an open task: Open, Complete, sub-task, follow-up, Archive, Delete', () => {
    const id = useTaskStore.getState().addTask({ title: 'Buy milk' });
    const items = show(id);
    for (const label of ['Open', 'Complete', 'Add a sub-task', 'Add a follow-up', 'Archive', 'Delete']) {
      expect(items.some((t) => t?.includes(label))).toBe(true);
    }
  });

  it('Archive archives at once (with Undo in a toast); an archived task offers Restore instead', async () => {
    const id = useTaskStore.getState().addTask({ title: 'Buy milk' });
    show(id);
    await userEvent.click(screen.getByRole('menuitem', { name: /Archive/ }));
    expect(useTaskStore.getState().tasks[id].archived).toBe(true);
    act(() => { fireEvent.contextMenu(screen.getByText('Buy milk'), { clientX: 10, clientY: 10 }); });
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent ?? '');
    expect(items.some((t) => t.includes('Restore'))).toBe(true);
    expect(items.some((t) => t.includes('Complete'))).toBe(false);
  });

  it('Complete completes it; a sub-task offers no sub-task of its own; Delete removes it', async () => {
    const parent = useTaskStore.getState().addTask({ title: 'Shop' });
    const id = useTaskStore.getState().addTask({ title: 'Buy milk', parentId: parent });
    const items = show(id);
    expect(items.some((t) => t?.includes('Add a sub-task'))).toBe(false);
    await userEvent.click(screen.getByRole('menuitem', { name: /Complete/ }));
    expect(useTaskStore.getState().tasks[id].completed).toBe(true);
    act(() => { fireEvent.contextMenu(screen.getByText('Buy milk'), { clientX: 10, clientY: 10 }); });
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }));
    expect(useTaskStore.getState().tasks[id]).toBeUndefined();
  });
});
