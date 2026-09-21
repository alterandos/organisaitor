import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getCommand } from '@/agent/registry';
import { takeSnapshot, diffSince, revertChanges } from '@/agent/batch';
import { AgentError } from '@/agent/errors';
import { useAgentLogStore } from '@/store/agentLogStore';
import { useAgentBatchStore } from '@/store/agentBatchStore';
import type { ApprovalPolicy, CommandDef, CommandResult, RunOptions } from '@/agent/types';
import type { AgentOutcome, EntityKind, EntityRef, RiskTier } from '@/types/agent';

// The single entry point for an agent to do anything: validate the input, enforce the risk tier and
// the approval policy, run the handler inside a change-capturing batch, and record it all in the
// audit log. A handler that throws part-way has its partial writes rolled back, so a command either
// happens completely or not at all.
export function runCommand(name: string, rawInput: unknown, opts: RunOptions = {}): CommandResult {
  const sessionId = opts.sessionId ?? 'default';
  const def = getCommand(name);

  const log = (tier: RiskTier, outcome: AgentOutcome, message: string | null, batchId: string | null, refs: EntityRef[]) =>
    useAgentLogStore.getState().append({ sessionId, batchId, command: name, tier, outcome, message, refs });
  const fail = (tier: RiskTier, code: string, message: string): CommandResult => {
    log(tier, 'error', `${code}: ${message}`, null, []);
    return { status: 'error', command: name, code, message };
  };

  if (!def) return fail('read', 'unknown_command', `There is no command called "${name}".`);
  if (opts.allow && !opts.allow.includes(def.tier)) return fail(def.tier, 'refused', `This session is not allowed to run ${def.tier} commands.`);

  const parsed = def.input.safeParse(rawInput);
  if (!parsed.success) return fail(def.tier, 'invalid_input', z.prettifyError(parsed.error));
  const input = parsed.data;

  const policy: ApprovalPolicy = typeof def.approval === 'function' ? (def.approval as (i: unknown) => ApprovalPolicy)(input) : def.approval;
  if (policy === 'review' && !opts.approved) {
    const summary = def.describe ? def.describe(input) : name;
    log(def.tier, 'pending', summary, null, []);
    return { status: 'needs_approval', command: name, proposal: { input, summary } };
  }

  const batchId = opts.batchId ?? nanoid();
  const seen = new Map<string, EntityRef>();
  const ctx = {
    sessionId,
    batchId,
    seen: (kind: EntityKind, id: string) => { seen.set(`${kind}:${id}`, { kind, id }); },
  };
  const snapshot = takeSnapshot();

  const rollback = () => {
    const changes = diffSince(snapshot);
    if (changes.length) revertChanges(changes, true);
  };

  let output: unknown;
  try {
    output = def.run(input, ctx);
  } catch (e) {
    rollback();
    if (e instanceof AgentError) return fail(def.tier, e.code, e.message);
    console.error(`[agent] ${name} failed`, e);
    return fail(def.tier, 'internal', 'Something went wrong running this command, and nothing was changed.');
  }

  const changes = diffSince(snapshot);
  if (def.tier === 'read' && changes.length) {
    rollback();
    console.error(`[agent] read command ${name} changed data — rolled back`);
    return fail(def.tier, 'internal', 'A read command tried to change data, so it was undone.');
  }
  if (changes.length) useAgentBatchStore.getState().record(batchId, sessionId, name, changes);

  const refs = changes.length ? changes.map((c): EntityRef => ({ kind: c.kind, id: c.id })) : [...seen.values()];
  log(def.tier, 'ok', null, changes.length ? batchId : null, refs);
  return { status: 'done', command: name, output, batchId: changes.length ? batchId : null };
}

export type { CommandDef };
