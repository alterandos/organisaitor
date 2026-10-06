import { useEffect } from 'react';
import type { CalendarDeadlineId, CalendarEventId, CalendarReminderId, ScheduleId, TaskId } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useNotificationStore, type PendingNotification } from '@/store/notificationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fireOSNotification } from '@/services/notificationService';
import { planNotifications, type NotificationSnapshot } from '@/services/notifications/plan';
import { resolveTimezone } from '@/utils/timezone';
import { usePlatform } from '@/hooks/usePlatform';

// Fills the in-app bell (NotificationCenter) with whatever is due, every minute while the app is
// open, and on desktop/web also shows it as an OS notification. WHEN things are due is decided by
// services/notifications/plan.ts, the rules shared with Android. On Android the OS notification
// comes from the scheduler (services/notifications/androidScheduler.ts), which works with the app
// closed, so this only keeps the bell there.

const LOOKBACK_MS = 24 * 60 * 60_000; // opening the app shows what fired in the last day, no older

function isStale(n: PendingNotification, snap: NotificationSnapshot): boolean {
  const taskDone = (id: string | null | undefined) => {
    const t = id ? snap.tasks[id as TaskId] : undefined;
    return !!t && (t.completed || t.archived);
  };
  if (n.kind === 'task-timed' || n.kind === 'task-untimed') return !snap.tasks[n.itemId as TaskId] || taskDone(n.itemId);
  // A card also goes once its occurrence is dealt with anywhere — done, or acknowledged ("Got it") —
  // on this device or, once that syncs, another one.
  if (n.kind === 'event') {
    const e = snap.events[n.itemId as CalendarEventId];
    return !e || !!e.archivedAt || (e.seenDates ?? []).includes(n.occurrence ?? e.date);
  }
  if (n.kind === 'reminder') {
    const r = snap.reminders[n.itemId as CalendarReminderId];
    return !r || !!r.archivedAt || taskDone(n.taskId) || (r.doneDates ?? []).includes(n.occurrence ?? r.date);
  }
  if (n.kind === 'deadline') {
    const d = snap.deadlines[n.itemId as CalendarDeadlineId];
    return !d || !!d.archivedAt || taskDone(n.taskId) || [...(d.doneDates ?? []), ...(d.seenDates ?? [])].includes(n.occurrence ?? d.date);
  }
  // schedule: `${scheduleId}::${blockId}::${date}`
  const [scheduleId, blockId, date] = n.itemId.split('::');
  const schedule = snap.schedules[scheduleId as ScheduleId];
  const block = schedule?.blocks.find((b) => b.id === blockId);
  return !schedule?.active || !block?.requiresCommitment || !(block.committedDates ?? []).includes(date);
}

export function useNotificationChecker() {
  const tasks       = useTaskStore((s) => s.tasks);
  const events      = useCalendarStore((s) => s.events);
  const reminders   = useCalendarStore((s) => s.reminders);
  const deadlines   = useCalendarStore((s) => s.deadlines);
  const schedules   = useScheduleStore((s) => s.schedules);
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const timezone    = useSettingsStore((s) => s.timezone);
  const { isAndroid } = usePlatform();

  useEffect(() => {
    const zone = resolveTimezone(timezone);
    const snap: NotificationSnapshot = { tasks, events, reminders, deadlines, schedules };
    const check = () => {
      const now = new Date();
      const store = useNotificationStore.getState();
      for (const n of store.pending) if (isStale(n, snap)) store.removePending(n.id);

      const due = planNotifications(snap, { from: new Date(now.getTime() - LOOKBACK_MS), to: now, zone, clockFormat });
      for (const p of due) {
        const atIso = p.at.toISOString();
        const { notifiedLog, pending } = useNotificationStore.getState();
        // Before 2026-10-06 the log was keyed by item id; honour those so nothing fires twice.
        const last = notifiedLog[p.key] ?? notifiedLog[p.itemId];
        if (last && last >= atIso) continue;
        if (pending.some((n) => n.key === p.key)) continue;
        store.addPending({ itemId: p.itemId, kind: p.kind, title: p.title, body: p.body, triggeredAt: now.toISOString(), key: p.key, occurrence: p.occurrence, taskId: p.taskId });
        store.markNotified(p.key, atIso);
        if (!isAndroid) void fireOSNotification(p.title, p.body);
      }
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [tasks, events, reminders, deadlines, schedules, clockFormat, timezone, isAndroid]);
}
