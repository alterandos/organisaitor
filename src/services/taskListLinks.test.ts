import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useListStore } from '@/store/listStore';
import type { TaskId } from '@/types';
import type { ListId } from '@/types/lists';

const confirm = vi.hoisted(() => ({ answer: true, calls: [] as { title: string; message?: string }[] }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({
  confirmDialog: vi.fn(async (opts: { title: string; message?: string }) => { confirm.calls.push(opts); return confirm.answer; }),
}));

const { checklistProgress, toggleTaskWithLists, toggleChecklistItemWithTasks } = await import('./taskListLinks');

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useListStore.setState(useListStore.getInitialState(), true);
  confirm.answer = true;
  confirm.calls = [];
});

function checklist(titles: string[], opts: { reusable?: boolean } = {}) {
  const listId = useListStore.getState().addList({ name: 'Groceries', typeId: 'lt-shopping' as never, resetOnTaskComplete: opts.reusable });
  const ids = titles.map((title) => useListStore.getState().addListItem({ listId, title }));
  return { listId, ids };
}

function taskLinkedTo(...listIds: ListId[]): TaskId {
  const id = useTaskStore.getState().addTask({ title: 'Weekly shop' });
  useTaskStore.getState().updateTask(id, { crossAppRefs: listIds.map((l) => ({ type: 'list' as const, id: l })) });
  return id;
}

const status = (id: string) => useListStore.getState().listItems[id as never].status;
const task = (id: TaskId) => useTaskStore.getState().tasks[id];

describe('checklistProgress', () => {
  it('counts ticked / total across every linked checklist, ignoring other list kinds', () => {
    const a = checklist(['Milk', 'Eggs']);
    const b = checklist(['Bread']);
    const watchlist = useListStore.getState().addList({ name: 'Films', typeId: 'lt-movies' as never });
    useListStore.getState().addListItem({ listId: watchlist, title: 'Heat' });
    useListStore.getState().toggleListItemChecked(a.ids[0]);
    const { lists, listItems } = useListStore.getState();
    expect(checklistProgress([a.listId, b.listId, watchlist], lists, listItems)).toEqual({ done: 1, total: 3 });
  });

  it('is null when no linked list is a checklist', () => {
    const watchlist = useListStore.getState().addList({ name: 'Films', typeId: 'lt-movies' as never });
    const { lists, listItems } = useListStore.getState();
    expect(checklistProgress([watchlist], lists, listItems)).toBeNull();
  });
});

describe('toggleTaskWithLists', () => {
  it('completing the task unticks a reusable checklist, keeping every item', () => {
    const { listId, ids } = checklist(['Milk', 'Eggs'], { reusable: true });
    ids.forEach((id) => useListStore.getState().toggleListItemChecked(id));
    const t = taskLinkedTo(listId);
    toggleTaskWithLists(t);
    expect(task(t).completed).toBe(true);
    expect(ids.map(status)).toEqual(['want', 'want']);
  });

  it('leaves a non-reusable checklist alone, and un-completing never touches the list', () => {
    const { listId, ids } = checklist(['Milk'], { reusable: false });
    useListStore.getState().toggleListItemChecked(ids[0]);
    const t = taskLinkedTo(listId);
    toggleTaskWithLists(t);
    expect(status(ids[0])).toBe('done');
    toggleTaskWithLists(t);
    expect(task(t).completed).toBe(false);
    expect(status(ids[0])).toBe('done');
  });
});

describe('toggleChecklistItemWithTasks', () => {
  it('ticking the last item asks to complete the linked task, and completes it on yes', async () => {
    const { listId, ids } = checklist(['Milk', 'Eggs']);
    const t = taskLinkedTo(listId);
    await toggleChecklistItemWithTasks(ids[0]);
    expect(confirm.calls).toHaveLength(0);
    await toggleChecklistItemWithTasks(ids[1]);
    expect(confirm.calls).toHaveLength(1);
    expect(confirm.calls[0].title).toContain('Weekly shop');
    expect(task(t).completed).toBe(true);
  });

  it('declining leaves the task open and the items ticked', async () => {
    confirm.answer = false;
    const { listId, ids } = checklist(['Milk']);
    const t = taskLinkedTo(listId);
    await toggleChecklistItemWithTasks(ids[0]);
    expect(task(t).completed).toBe(false);
    expect(status(ids[0])).toBe('done');
  });

  it('with a reusable list, says so — and completing then unticks it', async () => {
    const { listId, ids } = checklist(['Milk'], { reusable: true });
    const t = taskLinkedTo(listId);
    await toggleChecklistItemWithTasks(ids[0]);
    expect(confirm.calls[0].message).toMatch(/ready for next time/);
    expect(task(t).completed).toBe(true);
    expect(status(ids[0])).toBe('want');
  });

  it('waits until every checklist the task links to is done', async () => {
    const a = checklist(['Milk']);
    const b = checklist(['Bread']);
    taskLinkedTo(a.listId, b.listId);
    await toggleChecklistItemWithTasks(a.ids[0]);
    expect(confirm.calls).toHaveLength(0);
    await toggleChecklistItemWithTasks(b.ids[0]);
    expect(confirm.calls).toHaveLength(1);
  });

  it('never asks about a task that is already completed or archived, or when unticking', async () => {
    const { listId, ids } = checklist(['Milk']);
    const done = taskLinkedTo(listId);
    useTaskStore.getState().toggleTask(done);
    const archived = taskLinkedTo(listId);
    useTaskStore.getState().archiveTask(archived);
    await toggleChecklistItemWithTasks(ids[0]);
    await toggleChecklistItemWithTasks(ids[0]);
    expect(confirm.calls).toHaveLength(0);
  });
});
