import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Goal, GoalCheckIn, GoalId, GoalStatus } from '@/types';
import { now } from '@/utils/date';
import { persistStorage } from '@/utils/persistStorage';
import { moveToTrash } from '@/services/trashCapture';

// The person's goals (docs/features/endeavours.md phase 5), synced (`goals`, migration 062). How
// far along each is is worked out from other data (utils/goals.ts), never stored here; only its
// check-ins (by hand) and its status, which is always the person's call.

export type GoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'checkIns' | 'status' | 'statusAt'>;

interface GoalState {
  goals: Record<GoalId, Goal>;
  addGoal:       (input: GoalInput) => GoalId;
  updateGoal:    (id: GoalId, changes: Partial<Omit<Goal, 'id' | 'createdAt'>>) => void;
  setGoalStatus: (id: GoalId, status: GoalStatus) => void;
  addCheckIn:    (id: GoalId, checkIn: GoalCheckIn) => void;
  deleteGoal:    (id: GoalId) => void;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set) => ({
      goals: {},

      addGoal: (input) => {
        const id = nanoid() as GoalId;
        const ts = now();
        set((s) => ({ goals: { ...s.goals, [id]: { ...input, title: input.title.trim(), id, checkIns: [], status: 'active', statusAt: null, createdAt: ts, updatedAt: ts } } }));
        return id;
      },

      updateGoal: (id, changes) => set((s) => {
        const g = s.goals[id];
        if (!g) return {};
        return { goals: { ...s.goals, [id]: { ...g, ...changes, updatedAt: now() } } };
      }),

      setGoalStatus: (id, status) => set((s) => {
        const g = s.goals[id];
        if (!g) return {};
        const ts = now();
        return { goals: { ...s.goals, [id]: { ...g, status, statusAt: status === 'active' ? null : ts, updatedAt: ts } } };
      }),

      addCheckIn: (id, checkIn) => set((s) => {
        const g = s.goals[id];
        if (!g) return {};
        const checkIns = [...g.checkIns, checkIn].sort((a, b) => a.date.localeCompare(b.date));
        return { goals: { ...s.goals, [id]: { ...g, checkIns, updatedAt: now() } } };
      }),

      deleteGoal: (id) => set((s) => {
        const { [id]: removed, ...rest } = s.goals;
        if (removed) moveToTrash('goal', removed);
        return { goals: rest as Record<GoalId, Goal> };
      }),
    }),
    {
      name: 'goals-storage',
      storage: persistStorage(),
      version: 1,
    },
  ),
);
