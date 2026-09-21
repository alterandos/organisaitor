import { expect } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useAgentLogStore } from '@/store/agentLogStore';
import { useAgentBatchStore } from '@/store/agentBatchStore';
import { runCommand } from '@/agent';
import type { CommandResult, RunOptions } from '@/agent';

export function resetStores() {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useScheduleStore.setState(useScheduleStore.getInitialState(), true);
  useAgentLogStore.setState(useAgentLogStore.getInitialState(), true);
  useAgentBatchStore.setState(useAgentBatchStore.getInitialState(), true);
}

type Done = Extract<CommandResult, { status: 'done' }>;

export function run(name: string, input: unknown, opts?: RunOptions): CommandResult {
  return runCommand(name, input, opts);
}

// Runs a command that is expected to succeed and returns its output.
export function ok<T = Record<string, any>>(name: string, input: unknown, opts?: RunOptions): T { // eslint-disable-line @typescript-eslint/no-explicit-any
  const result = runCommand(name, input, opts);
  if (result.status !== 'done') throw new Error(`${name} did not succeed: ${JSON.stringify(result)}`);
  return (result as Done).output as T;
}

// Runs a command that is expected to fail and returns its error.
export function fails(name: string, input: unknown, opts?: RunOptions) {
  const result = runCommand(name, input, opts);
  expect(result.status, `${name} should have failed`).toBe('error');
  return result as Extract<CommandResult, { status: 'error' }>;
}

export const FAR = '2031-03-10';
export const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
