import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export type NotificationKind = 'task-timed' | 'task-untimed' | 'event' | 'reminder';

export interface PendingNotification {
  id: string;
  itemId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  triggeredAt: string;
}

interface NotificationState {
  pending: PendingNotification[];
  notifiedLog: Record<string, string>; // itemId -> last trigger ISO that fired

  addPending: (n: Omit<PendingNotification, 'id'>) => void;
  removePending: (id: string) => void;
  clearAll: () => void;
  markNotified: (itemId: string, triggerISO: string) => void;
  lastNotified: (itemId: string) => string | null;
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
      clearAll: () => set({ pending: [] }),
      markNotified: (itemId, triggerISO) => set((s) => ({
        notifiedLog: { ...s.notifiedLog, [itemId]: triggerISO },
      })),
      lastNotified: (itemId) => get().notifiedLog[itemId] ?? null,
    }),
    { name: 'todo-notifications' }
  )
);
