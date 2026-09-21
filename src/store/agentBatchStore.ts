import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/utils/persistStorage';
import type { AgentBatch, BatchChange } from '@/types/agent';

const MAX_BATCHES = 50;

interface AgentBatchState {
  batches:      AgentBatch[];
  record:       (batchId: string, sessionId: string, command: string, changes: BatchChange[]) => void;
  markReverted: (batchId: string) => void;
  clear:        () => void;
}

// Folds a later change to the same entity into the earlier one, keeping the ORIGINAL `before`:
// what revert has to restore is the state ahead of the whole batch, not ahead of the last command.
function mergeChanges(existing: BatchChange[], added: BatchChange[]): BatchChange[] {
  const out = [...existing];
  for (const c of added) {
    const i = out.findIndex((e) => e.kind === c.kind && e.id === c.id);
    if (i === -1) { out.push(c); continue; }
    const first = out[i];
    out[i] = {
      ...first,
      change: first.change === 'created' ? (c.change === 'removed' ? 'removed' : 'created') : c.change === 'removed' ? 'removed' : first.change,
      afterUpdatedAt: c.afterUpdatedAt,
    };
  }
  return out.filter((c) => !(c.change === 'removed' && c.before === null));
}

export const useAgentBatchStore = create<AgentBatchState>()(
  persist(
    (set) => ({
      batches: [],

      record: (batchId, sessionId, command, changes) => set((s) => {
        const existing = s.batches.find((b) => b.id === batchId);
        if (existing) {
          return {
            batches: s.batches.map((b) => b.id === batchId
              ? { ...b, commands: [...b.commands, command], changes: mergeChanges(b.changes, changes) }
              : b),
          };
        }
        const next = [...s.batches, { id: batchId, sessionId, at: new Date().toISOString(), commands: [command], changes, revertedAt: null }];
        return { batches: next.length > MAX_BATCHES ? next.slice(next.length - MAX_BATCHES) : next };
      }),

      markReverted: (batchId) => set((s) => ({
        batches: s.batches.map((b) => b.id === batchId ? { ...b, revertedAt: new Date().toISOString() } : b),
      })),

      clear: () => set({ batches: [] }),
    }),
    { name: 'agent-batches', storage: persistStorage(), version: 1 }
  )
);
