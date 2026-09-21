import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { persistStorage } from '@/utils/persistStorage';
import type { AgentLogEntry } from '@/types/agent';

const MAX_ENTRIES = 2000;

interface AgentLogState {
  entries: AgentLogEntry[];
  append:  (entry: Omit<AgentLogEntry, 'id' | 'at'>) => void;
  clear:   () => void;
}

export const useAgentLogStore = create<AgentLogState>()(
  persist(
    (set) => ({
      entries: [],
      append: (entry) => set((s) => {
        const next = [...s.entries, { ...entry, id: nanoid(), at: new Date().toISOString() }];
        return { entries: next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next };
      }),
      clear: () => set({ entries: [] }),
    }),
    { name: 'agent-log', storage: persistStorage(), version: 1 }
  )
);
