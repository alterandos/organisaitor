// Types for the agent command layer (src/agent/). Like Lists/Fitness/Portfolio, these are not
// re-exported through types/index.ts — import them from '@/types/agent'.

export type RiskTier = 'read' | 'create' | 'modify' | 'archive';

export type EntityKind = 'task' | 'event' | 'reminder' | 'schedule' | 'endeavour' | 'purpose' | 'tag';

export interface EntityRef { kind: EntityKind; id: string }

export type AgentOutcome = 'ok' | 'error' | 'pending';

// One row per command call, reads included (ids only — never content). Local to the device.
export interface AgentLogEntry {
  id:        string;
  at:        string;
  sessionId: string;
  batchId:   string | null;
  command:   string;
  tier:      RiskTier;
  outcome:   AgentOutcome;
  message:   string | null;
  refs:      EntityRef[];
}

export type BatchChangeKind = 'created' | 'modified' | 'removed';

// `before` is the whole record as it was ahead of the batch (null for a created one).
// `afterUpdatedAt` is what revert compares against to notice the user edited it since.
export interface BatchChange {
  kind:           EntityKind;
  id:             string;
  change:         BatchChangeKind;
  before:         unknown | null;
  afterUpdatedAt: string | null;
}

export interface AgentBatch {
  id:         string;
  sessionId:  string;
  at:         string;
  commands:   string[];
  changes:    BatchChange[];
  revertedAt: string | null;
}
