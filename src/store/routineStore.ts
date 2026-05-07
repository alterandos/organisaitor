import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CollectionId, RoutineInstance, TrackerEntryId } from '@/types';

type InstanceKey = string; // `${routineId}_${date}`

interface RoutineState {
  instances: Record<InstanceKey, RoutineInstance>;

  getOrCreateInstance: (routineId: CollectionId, date: string) => RoutineInstance;
  toggleRoutineTask:   (routineId: CollectionId, date: string, taskId: string) => void;
  completeRoutine:     (routineId: CollectionId, date: string, entryId: TrackerEntryId | null) => void;
  deleteInstancesForRoutine: (routineId: CollectionId) => void;
}

const key = (routineId: string, date: string): InstanceKey => `${routineId}_${date}`;

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set, get) => ({
      instances: {},

      getOrCreateInstance: (routineId, date) => {
        const k = key(routineId, date);
        const existing = get().instances[k];
        if (existing) return existing;
        const instance: RoutineInstance = { routineId, date, checked: [], completed: false, entryId: null };
        set((s) => ({ instances: { ...s.instances, [k]: instance } }));
        return instance;
      },

      toggleRoutineTask: (routineId, date, taskId) => {
        const k = key(routineId, date);
        set((s) => {
          const inst = s.instances[k] ?? { routineId, date, checked: [], completed: false, entryId: null };
          const checked = inst.checked.includes(taskId)
            ? inst.checked.filter((id) => id !== taskId)
            : [...inst.checked, taskId];
          return { instances: { ...s.instances, [k]: { ...inst, checked } } };
        });
      },

      completeRoutine: (routineId, date, entryId) => {
        const k = key(routineId, date);
        set((s) => {
          const inst = s.instances[k] ?? { routineId, date, checked: [], completed: false, entryId: null };
          return { instances: { ...s.instances, [k]: { ...inst, completed: true, entryId } } };
        });
      },

      deleteInstancesForRoutine: (routineId) => {
        set((s) => {
          const instances = { ...s.instances };
          for (const k of Object.keys(instances)) {
            if (k.startsWith(`${routineId}_`)) delete instances[k];
          }
          return { instances };
        });
      },
    }),
    { name: 'todo-routines', version: 1 }
  )
);
