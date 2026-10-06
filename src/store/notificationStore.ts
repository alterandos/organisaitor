import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { persistStorage } from '@/utils/persistStorage';

// 'task-timed' / 'task-untimed' are no longer produced (task deadlines notify through their shadow
// CalendarDeadline) but can still be sitting in a persisted bell from before.
export type NotificationKind = 'task-timed' | 'task-untimed' | 'event' | 'reminder' | 'deadline' | 'schedule';

export interface PendingNotification {
  id: string;
  itemId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  triggeredAt: string;
  key?: string;            // services/notifications/plan.ts PlannedNotification.key (since v2)
  occurrence?: string;     // which occurrence of a repeating item (since v2)
  taskId?: string | null;  // the task a task-deadline belongs to (since v2)
}

interface NotificationState {
  pending: PendingNotification[];
  notifiedLog: Record<string, string>; // plan key (before v2: itemId) -> last trigger ISO that fired

  addPending: (n: Omit<PendingNotification, 'id'>) => void;
  removePending: (id: string) => void;
  removePendingByKey: (key: string) => void;
  clearAll: () => void;
  markNotified: (key: string, triggerISO: string) => void;
  lastNotified: (key: string) => string | null;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      pending: [],
      notifiedLog: {},

      addPending: (n) => set((s) => ({
        pending: [...s.pending, { ...n, id: nanoid() }],
      })),
      removePending: (id) => set((s) => ({
        pending: s.pending.filter((n) => n.id !== id),
      })),
      removePendingByKey: (key) => set((s) => ({
        pending: s.pending.filter((n) => n.key !== key),
      })),
      clearAll: () => set({ pending: [] }),
      markNotified: (key, triggerISO) => set((s) => ({
        notifiedLog: { ...s.notifiedLog, [key]: triggerISO },
      })),
      lastNotified: (key) => get().notifiedLog[key] ?? null,
    }),
    {
      name: 'todo-notifications',
      storage: persistStorage(),
      // v2 (2026-10-06): optional key/occurrence/taskId on PendingNotification and plan keys in
      // notifiedLog. Nothing to backfill: the new fields are optional, and old itemId-keyed log
      // entries are still honoured by the checker (hooks/useNotificationChecker.ts).
      version: 2,
      migrate: (persisted) => persisted as NotificationState,
    }
  )
);
