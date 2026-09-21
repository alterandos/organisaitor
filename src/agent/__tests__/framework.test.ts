import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revertBatch, toolDefinitions, listCommands } from '@/agent';
import { read, write } from '@/agent/access';
import { useTaskStore } from '@/store/taskStore';
import { useAgentLogStore } from '@/store/agentLogStore';
import { useAgentBatchStore } from '@/store/agentBatchStore';
import { FAR, fails, ok, resetStores, run } from '@/test/helpers';

beforeEach(resetStores);

describe('tool definitions', () => {
  const tools = toolDefinitions();

  it('stays within the tool budget, with unique names', () => {
    expect(tools.length).toBeGreaterThanOrEqual(20);
    expect(tools.length).toBeLessThanOrEqual(30);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });

  it('gives every tool a description and a top-level object schema', () => {
    for (const t of tools) {
      expect(t.description.length, t.name).toBeGreaterThan(20);
      expect(t.input_schema.type, t.name).toBe('object');
      expect(t.input_schema.$schema, t.name).toBeUndefined();
    }
  });

  it('marks fields with defaults as optional for the model', () => {
    const list = tools.find((t) => t.name === 'list_tasks')!;
    expect((list.input_schema.required as string[] | undefined) ?? []).not.toContain('status');
  });

  it('has no command that deletes', () => {
    for (const c of listCommands()) expect(c.name).not.toMatch(/delete|remove_/);
  });
});

describe('runCommand', () => {
  it('reports an unknown command', () => {
    expect(fails('nope', {}).code).toBe('unknown_command');
  });

  it('explains invalid input in words', () => {
    const e = fails('create_task', { title: '' });
    expect(e.code).toBe('invalid_input');
    expect(e.message).toMatch(/title/);
  });

  it('refuses a tier the session is not allowed to run', () => {
    const r = run('create_task', { title: 'x' }, { allow: ['read'] });
    expect(r).toMatchObject({ status: 'error', code: 'refused' });
    expect(read.tasks()).toHaveLength(0);
  });

  it('returns a proposal instead of executing a command that needs review', () => {
    const input = { name: 'Term 1', blocks: [{ title: 'Maths', daysOfWeek: [1], startTime: '09:00', endTime: '10:00' }] };
    const pending = run('create_schedule', input);
    expect(pending.status).toBe('needs_approval');
    expect(read.schedules()).toHaveLength(0);
    const done = run('create_schedule', input, { approved: true });
    expect(done.status).toBe('done');
    expect(read.schedules()).toHaveLength(1);
  });

  it('rolls back everything a command wrote if it then fails', () => {
    const spy = vi.spyOn(read, 'task').mockImplementationOnce(() => { throw new Error('boom'); });
    const e = fails('create_task', { title: 'Half done', deadline: FAR });
    spy.mockRestore();
    expect(e.code).toBe('internal');
    expect(e.message).not.toMatch(/boom/);
    expect(read.tasks()).toHaveLength(0);
    expect(read.reminders()).toHaveLength(0);
  });

  it('never lets a read command change data', () => {
    const spy = vi.spyOn(read, 'today').mockImplementationOnce(() => {
      useTaskStore.getState().addTask({ title: 'sneaky' });
      return '2030-01-01';
    });
    const e = fails('get_context', {});
    spy.mockRestore();
    expect(e.code).toBe('internal');
    expect(read.tasks()).toHaveLength(0);
  });
});

describe('audit log', () => {
  it('records successes, failures and pending proposals', () => {
    ok('get_context', {});
    fails('create_task', { title: '' });
    run('create_schedule', { name: 'A', blocks: [{ title: 'b', daysOfWeek: [1], startTime: '09:00', endTime: '10:00' }] });
    const outcomes = useAgentLogStore.getState().entries.map((e) => [e.command, e.outcome]);
    expect(outcomes).toEqual([['get_context', 'ok'], ['create_task', 'error'], ['create_schedule', 'pending']]);
  });

  it('records which items a read looked at, ids only', () => {
    const { created } = ok('create_task', { title: 'Look at me' });
    ok('get', { type: 'task', id: created.id });
    const last = useAgentLogStore.getState().entries.at(-1)!;
    expect(last.refs).toEqual([{ kind: 'task', id: created.id }]);
    expect(JSON.stringify(last)).not.toContain('Look at me');
  });

  it('does not create an undo batch for a read', () => {
    ok('get_context', {});
    expect(useAgentBatchStore.getState().batches).toHaveLength(0);
  });
});

describe('undo batches', () => {
  it('captures a task and its calendar entries, and removes them all on revert', () => {
    const r = run('create_task', { title: 'Report', deadline: FAR, scheduledAt: FAR });
    if (r.status !== 'done') throw new Error('expected done');
    expect(read.tasks()).toHaveLength(1);
    expect(read.events()).toHaveLength(1);
    expect(read.reminders()).toHaveLength(1);
    const result = revertBatch(r.batchId!);
    expect(result).toMatchObject({ reverted: 3, skipped: [] });
    expect(read.tasks()).toHaveLength(0);
    expect(read.events()).toHaveLength(0);
    expect(read.reminders()).toHaveLength(0);
  });

  it('restores a modified item to how it was, with a fresh updatedAt', () => {
    const { created } = ok('create_task', { title: 'Before', priority: 'low' });
    const before = read.task(created.id)!;
    const r = run('update_task', { id: created.id, title: 'After', priority: 'high' });
    if (r.status !== 'done') throw new Error('expected done');
    revertBatch(r.batchId!);
    const now = read.task(created.id)!;
    expect(now).toMatchObject({ title: 'Before', priority: 'low' });
    expect(now.updatedAt >= before.updatedAt).toBe(true);
  });

  it('leaves alone anything the user edited since, and says so', async () => {
    const r = run('create_task', { title: 'Mine now' });
    if (r.status !== 'done') throw new Error('expected done');
    const id = read.tasks()[0].id;
    await new Promise((resolve) => setTimeout(resolve, 5));
    useTaskStore.getState().updateTask(id, { title: 'User edit' });
    const result = revertBatch(r.batchId!)!;
    expect(result.reverted).toBe(0);
    expect(result.skipped).toEqual([{ kind: 'task', id, reason: 'edited since' }]);
    expect(read.task(id)?.title).toBe('User edit');
    expect(useAgentBatchStore.getState().batches[0].revertedAt).toBeNull();
  });

  it('groups commands that share a batch id and restores the state before the first', () => {
    const batchId = 'one-request';
    const a = ok('create_task', { title: 'Step one' }, { batchId });
    ok('update_task', { id: a.created.id, priority: 'high' }, { batchId });
    ok('create_purpose', { name: 'Health' }, { batchId });
    const batches = useAgentBatchStore.getState().batches;
    expect(batches).toHaveLength(1);
    expect(batches[0].commands).toEqual(['create_task', 'update_task', 'create_purpose']);
    expect(revertBatch(batchId)).toMatchObject({ reverted: 2, skipped: [] });
    expect(read.tasks()).toHaveLength(0);
    expect(read.purposes()).toHaveLength(0);
  });

  it('cannot be reverted twice', () => {
    const r = run('create_task', { title: 'Once' });
    if (r.status !== 'done') throw new Error('expected done');
    expect(revertBatch(r.batchId!)).not.toBeNull();
    expect(revertBatch(r.batchId!)).toBeNull();
  });
});

describe('the boundary', () => {
  it('has no delete in what commands can do', () => {
    for (const key of Object.keys(write)) expect(key).not.toMatch(/^delete/);
  });
});
