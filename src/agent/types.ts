import type { z } from 'zod';
import type { EntityKind, RiskTier } from '@/types/agent';

export type ApprovalPolicy = 'auto' | 'review';

export interface CommandContext {
  sessionId: string;
  batchId:   string;
  // Handlers report what a read looked at, so the audit log can say "the agent viewed X".
  seen:      (kind: EntityKind, id: string) => void;
}

// `run` uses method syntax on purpose: it keeps CommandDef<SomeSchema> assignable to the plain
// CommandDef in the registry's list, which strict function-property variance would reject.
export interface CommandDef<S extends z.ZodType = z.ZodType> {
  name:        string;
  // Written for the model: what it does, when to use it, what to call first.
  description: string;
  tier:        RiskTier;
  // 'review' means the runner returns a proposal instead of executing until it is approved.
  // A function decides per call (e.g. only when a schedule update removes blocks).
  approval:    ApprovalPolicy | ((input: never) => ApprovalPolicy);
  input:       S;
  // One line for the review screen; falls back to the command name.
  describe?(input: z.output<S>): string;
  run(input: z.output<S>, ctx: CommandContext): unknown;
}

export const defineCommand = <S extends z.ZodType>(def: CommandDef<S>): CommandDef<S> => def;

export interface ToolDefinition {
  name:         string;
  description:  string;
  input_schema: Record<string, unknown>;
}

export type CommandResult =
  | { status: 'done';           command: string; output: unknown; batchId: string | null }
  | { status: 'needs_approval'; command: string; proposal: { input: unknown; summary: string } }
  | { status: 'error';          command: string; code: string; message: string };

export interface RunOptions {
  sessionId?: string;
  // Commands from one user request share a batch so the whole request can be undone at once.
  batchId?:   string;
  // Set by the review UI once the user has approved a proposal.
  approved?:  boolean;
  // Tiers this caller may run; defaults to all of them.
  allow?:     RiskTier[];
}
