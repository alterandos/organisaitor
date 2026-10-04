import { beforeEach, describe, expect, it, vi } from 'vitest';

const { choice } = vi.hoisted(() => ({ choice: vi.fn() }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({ choiceDialog: choice, confirmDialog: vi.fn(), alertDialog: vi.fn() }));

import { useTaskStore } from '@/store/taskStore';
import { useToastStore } from '@/store/toastStore';
import { useUIStore } from '@/store/uiStore';
import { toggleTaskCompletion, taskCompletionOptions } from './taskCompletion';
import type { TaskId } from '@/types';

const add = (title: string) => useTaskStore.getState().addTask({ title });
const task = (id: TaskId) => useTaskStore.getState().tasks[id];

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useToastStore.setState({ current: null });
  useUIStore.setState(useUIStore.getInitialState(), true);
  choice.mockReset();
});

describe('toggleTaskCompletion', () => {
  it('an unblocked task completes straight away, with a toast offering + Follow-up and Undo', async () => {
    const a = add('Attend seminar');
    await toggleTaskCompletion(a);
    expect(task(a).completed).toBe(true);
    expect(choice).not.toHaveBeenCalled();
    const toast = useToastStore.getState().current!;
    expect(toast.message).toContain('Attend seminar');
    expect(toast.actions.map((x) => x.label)).toEqual(['+ Follow-up', 'Undo']);

    toast.actions[0].onClick();
    expect(useUIStore.getState().openModal).toBe('add-task');
    expect(useUIStore.getState().pendingFollowUpOf).toBe(a);
  });

  it('a blocked task asks first; Cancel leaves everything open', async () => {
    const a = add('Get referral');
    const b = add('Book specialist');
    useTaskStore.getState().addItemLink(b, 'dependsOn', a);
    choice.mockResolvedValue('cancel');
    await toggleTaskCompletion(b);
    expect(choice).toHaveBeenCalledOnce();
    expect(task(b).completed).toBe(false);
    expect(task(a).completed).toBe(false);
  });

  it('"Complete anyway" completes only this task', async () => {
    const a = add('Get referral');
    const b = add('Book specialist');
    useTaskStore.getState().addItemLink(b, 'dependsOn', a);
    choice.mockResolvedValue('confirm');
    await toggleTaskCompletion(b);
    expect(task(b).completed).toBe(true);
    expect(task(a).completed).toBe(false);
  });

  it('"Complete all" completes the whole chain upstream; Undo reopens all of them', async () => {
    const a = add('A');
    const b = add('B');
    const c = add('C');
    useTaskStore.getState().addItemLink(b, 'dependsOn', a);
    useTaskStore.getState().addItemLink(c, 'dependsOn', b);
    choice.mockResolvedValue('alternate');
    await toggleTaskCompletion(c);
    expect([a, b, c].map((id) => task(id).completed)).toEqual([true, true, true]);

    useToastStore.getState().current!.actions[1].onClick();
    expect([a, b, c].map((id) => task(id).completed)).toEqual([false, false, false]);
  });

  it('the toast names what completing unlocked', async () => {
    const seminar = add('Attend seminar');
    const email = add('Email lecturer');
    useTaskStore.getState().addItemLink(email, 'followUpOf', seminar);
    await toggleTaskCompletion(seminar);
    expect(useToastStore.getState().current!.detail).toBe('Unlocked: Email lecturer');
  });

  it('hover options: + follow-up completes then opens a follow-up (no toast duplicate); "with blockers" skips the prompt', async () => {
    const a = add('A');
    const b = add('B');
    useTaskStore.getState().addItemLink(b, 'dependsOn', a);
    const labels = taskCompletionOptions(b).map((o) => o.label);
    expect(labels).toEqual(['Complete + add follow-up', 'Complete, with the 1 it’s waiting on', 'Add a follow-up (keep this open)']);

    await toggleTaskCompletion(b, { withBlockers: true });
    expect(choice).not.toHaveBeenCalled();
    expect([task(a).completed, task(b).completed]).toEqual([true, true]);
    expect(taskCompletionOptions(b)).toEqual([]);

    const c = add('C');
    await toggleTaskCompletion(c, { thenFollowUp: true });
    expect(useUIStore.getState().pendingFollowUpOf).toBe(c);
    expect(useToastStore.getState().current!.actions.map((x) => x.label)).toEqual(['Undo']);
  });

  it('reopening a completed task just reopens it — no prompt, no toast', async () => {
    const a = add('A');
    useTaskStore.getState().toggleTask(a);
    await toggleTaskCompletion(a);
    expect(task(a).completed).toBe(false);
    expect(useToastStore.getState().current).toBeNull();
  });
});
