import { useState, useRef, useEffect } from 'react';
import { useNotificationStore, type PendingNotification } from '@/store/notificationStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import type { TaskId, CalendarEventId, CalendarReminderId } from '@/types';
import styles from './NotificationCenter.module.css';

// ── Bell icon ─────────────────────────────────────────────────────────────────

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M9 2a5 5 0 00-5 5v3l-1.5 2.5h13L14 10V7a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M7 14.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ── Individual notification card ──────────────────────────────────────────────

function NotificationCard({ n }: { n: PendingNotification }) {
  const removePending   = useNotificationStore((s) => s.removePending);
  const updateTask      = useTaskStore((s) => s.updateTask);
  const archiveTask     = useTaskStore((s) => s.archiveTask);
  const toggleTask      = useTaskStore((s) => s.toggleTask);
  const updateEvent     = useCalendarStore((s) => s.updateEvent);
  const updateReminder  = useCalendarStore((s) => s.updateReminder);

  const [mode, setMode]               = useState<'idle' | 'snooze' | 'postpone'>('idle');
  const [snoozeValue, setSnoozeValue] = useState(1);
  const [snoozeUnit, setSnoozeUnit]   = useState<'minutes' | 'hours' | 'days'>('hours');
  const [postponeDate, setPostponeDate] = useState('');
  const [postponeTime, setPostponeTime] = useState('');

  const dismiss = () => removePending(n.id);

  const setRemindAt = (iso: string) => {
    if (n.kind === 'task-timed' || n.kind === 'task-untimed') {
      updateTask(n.itemId as TaskId, { remindAt: iso });
    } else if (n.kind === 'event') {
      updateEvent(n.itemId as CalendarEventId, { remindAt: iso });
    } else if (n.kind === 'reminder') {
      updateReminder(n.itemId as CalendarReminderId, { remindAt: iso });
    }
    dismiss();
  };

  const handleDone = () => {
    if (n.kind === 'task-timed' || n.kind === 'task-untimed') {
      toggleTask(n.itemId as TaskId);
    }
    // Events/reminders don't have a "complete" state — just dismiss
    dismiss();
  };

  const handleArchive = () => {
    if (n.kind === 'task-timed' || n.kind === 'task-untimed') {
      archiveTask(n.itemId as TaskId);
    }
    dismiss();
  };

  const handleSnooze = () => {
    const ms = snoozeValue * (
      snoozeUnit === 'minutes' ? 60_000 :
      snoozeUnit === 'hours'   ? 3_600_000 : 86_400_000
    );
    setRemindAt(new Date(Date.now() + ms).toISOString());
  };

  const handlePostpone = () => {
    if (!postponeDate) return;
    const iso = postponeTime
      ? new Date(`${postponeDate}T${postponeTime}`).toISOString()
      : new Date(`${postponeDate}T09:00`).toISOString();
    setRemindAt(iso);
  };

  const hasFullActions = n.kind === 'task-timed' || n.kind === 'task-untimed' || n.kind === 'reminder';

  const kindClass =
    n.kind === 'event'    ? styles.kindEvent :
    n.kind === 'reminder' ? styles.kindReminder : styles.kindTask;

  return (
    <div className={`${styles.card} ${kindClass}`}>
      <div className={styles.cardMain}>
        <div className={styles.cardText}>
          <span className={styles.cardTitle}>{n.title}</span>
          <span className={styles.cardBody}>{n.body}</span>
        </div>
        <button className={styles.dismissBtn} onClick={dismiss} title="Dismiss">✕</button>
      </div>

      {mode === 'idle' && (
        <div className={styles.actions}>
          {hasFullActions ? (
            <>
              <button className={`${styles.actionBtn} ${styles.doneBtn}`} onClick={handleDone}>Done</button>
              <button className={styles.actionBtn} onClick={() => setMode('snooze')}>Snooze</button>
              <button className={styles.actionBtn} onClick={() => setMode('postpone')}>Postpone</button>
              <button className={`${styles.actionBtn} ${styles.archiveBtn}`} onClick={handleArchive}>Archive</button>
            </>
          ) : (
            <button className={`${styles.actionBtn} ${styles.doneBtn}`} onClick={dismiss}>OK</button>
          )}
        </div>
      )}

      {mode === 'snooze' && (
        <div className={styles.miniForm}>
          <span className={styles.miniLabel}>Snooze for</span>
          <input
            type="number"
            className={styles.miniNum}
            value={snoozeValue}
            min={1}
            onChange={(e) => setSnoozeValue(Math.max(1, Number(e.target.value)))}
          />
          <select
            className={styles.miniSelect}
            value={snoozeUnit}
            onChange={(e) => setSnoozeUnit(e.target.value as typeof snoozeUnit)}
          >
            <option value="minutes">min</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <button className={`${styles.actionBtn} ${styles.doneBtn}`} onClick={handleSnooze}>Set</button>
          <button className={styles.actionBtn} onClick={() => setMode('idle')}>Cancel</button>
        </div>
      )}

      {mode === 'postpone' && (
        <div className={styles.miniForm}>
          <span className={styles.miniLabel}>Remind at</span>
          <input
            type="date"
            className={styles.miniDate}
            value={postponeDate}
            onChange={(e) => setPostponeDate(e.target.value)}
          />
          <input
            type="time"
            className={styles.miniTime}
            value={postponeTime}
            onChange={(e) => setPostponeTime(e.target.value)}
          />
          <button
            className={`${styles.actionBtn} ${styles.doneBtn}`}
            onClick={handlePostpone}
            disabled={!postponeDate}
          >Set</button>
          <button className={styles.actionBtn} onClick={() => setMode('idle')}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── Notification Center ───────────────────────────────────────────────────────

export function NotificationCenter() {
  const pending   = useNotificationStore((s) => s.pending);
  const clearAll  = useNotificationStore((s) => s.clearAll);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const count = pending.length;

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={`${styles.bellBtn} ${count > 0 ? styles.bellActive : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${count > 0 ? ` (${count})` : ''}`}
        title="Notifications"
      >
        <BellIcon />
        {count > 0 && <span className={styles.badge}>{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
            {count > 0 && (
              <button className={styles.clearBtn} onClick={clearAll}>Clear all</button>
            )}
          </div>
          {count === 0 ? (
            <div className={styles.empty}>No pending notifications</div>
          ) : (
            <div className={styles.list}>
              {pending.map((n) => <NotificationCard key={n.id} n={n} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
