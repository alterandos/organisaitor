import { useState, useRef, useEffect } from 'react';
import { toggleTaskCompletion } from '@/services/taskCompletion';
import { useNotificationStore, type PendingNotification } from '@/store/notificationStore';
import { useTaskStore } from '@/store/taskStore';
import type { TaskId } from '@/types';
import {
  acknowledgeOccurrence, archiveOccurrence, completeNotificationTask, markOccurrenceDone, openNotificationTarget,
  postponeDate, postponeOccurrence, snoozeNotificationTarget, snoozeTime, type SnoozePreset,
} from '@/services/notifications/actions';
import { useCalendarStore } from '@/store/calendarStore';
import { showToast } from '@/components/Toast/showToast';
import { LABELS } from '@/config/labels';
import { formatObjectWhen } from '@/components/NoteEditor/objects/format';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { useSettingsStore } from '@/store/settingsStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import styles from './NotificationCenter.module.css';

// ── Bell icon ─────────────────────────────────────────────────────────────────

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M9 2a5 5 0 00-5 5v3l-1.5 2.5h13L14 10V7a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M7 14.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ── Individual notification card ──────────────────────────────────────────────

// What each button does is services/notifications/actions.ts (shared with Android's buttons):
// Got it (and ✕) · Done (deadlines) · Snooze · Postpone · Archive · Open.
function NotificationCard({ n }: { n: PendingNotification }) {
  const C = LABELS.notifications.card;
  const removePending = useNotificationStore((s) => s.removePending);
  const tasksRecord   = useTaskStore((s) => s.tasks);
  const events        = useCalendarStore((s) => s.events);
  const reminders     = useCalendarStore((s) => s.reminders);
  const deadlines     = useCalendarStore((s) => s.deadlines);
  const timezone      = useSettingsStore((s) => s.timezone);
  const morning       = useSettingsStore((s) => s.snoozeMorningTime);
  const evening       = useSettingsStore((s) => s.snoozeEveningTime);

  // A task deadline's notification acts on the task (Done completes it, Archive archives it).
  // `taskId` comes from services/notifications/plan.ts; cards from before 2026-10-06 don't carry
  // it, so a legacy task-shadow reminder is still looked up the old way.
  const linkedTask = n.taskId
    ? tasksRecord[n.taskId as TaskId] ?? null
    : n.kind === 'reminder'
      ? Object.values(tasksRecord).find((t) => t.calendarReminderId === n.itemId) ?? null
      : null;
  const item = n.kind === 'event' ? events[n.itemId as never] : n.kind === 'reminder' ? reminders[n.itemId as never] : n.kind === 'deadline' ? deadlines[n.itemId as never] : undefined;
  const occurrence = n.occurrence ?? item?.date;
  const repeats = !!item?.repeat && !linkedTask;
  const zone = resolveTimezone(timezone);
  const today = todayIsoInZone(zone);
  const legacyTask = n.kind === 'task-timed' || n.kind === 'task-untimed';
  const calendarKind = n.kind === 'event' || n.kind === 'reminder' || n.kind === 'deadline';

  const [mode, setMode] = useState<'idle' | 'snooze' | 'postpone' | 'archive'>('idle');
  const [snoozeValue, setSnoozeValue] = useState(30);
  const [snoozeUnit, setSnoozeUnit] = useState<'minutes' | 'hours'>('minutes');
  const [postponeTo, setPostponeTo] = useState('');
  const [postponeTime, setPostponeTime] = useState('');
  const [wholeSeries, setWholeSeries] = useState(false);

  const close = () => removePending(n.id);

  const gotIt = () => {
    if (legacyTask) void toggleTaskCompletion(n.itemId as TaskId);
    else acknowledgeOccurrence(n.kind, n.itemId, occurrence);
    close();
  };
  const done = () => {
    if (linkedTask) completeNotificationTask(linkedTask.id);
    else markOccurrenceDone(n.kind, n.itemId, occurrence);
    close();
  };
  const snoozeUntil = (until: Date) => { snoozeNotificationTarget(n.kind, n.itemId, until.toISOString(), occurrence); close(); };
  const snoozePreset = (preset: SnoozePreset) => snoozeUntil(snoozeTime(preset, new Date(), zone, morning, evening));
  const snoozeCustom = () => snoozeUntil(new Date(Date.now() + snoozeValue * (snoozeUnit === 'minutes' ? 60_000 : 3_600_000)));
  const postpone = (date: string, time?: string | null) => {
    postponeOccurrence(n.kind, n.itemId, occurrence, { date, ...(time !== undefined ? { time } : {}) }, linkedTask?.id);
    showToast({ message: C.moved(n.title, formatObjectWhen(date, time ?? null)) });
    close();
  };
  const archive = (series: boolean) => {
    const undo = archiveOccurrence(n.kind, n.itemId, occurrence, series, linkedTask?.id);
    if (undo) showToast({ message: C.archived(n.title), actions: [{ label: C.undo, onClick: undo }] });
    close();
  };
  const open = () => { openNotificationTarget(n.kind, n.itemId, occurrence); };

  const kindClass =
    n.kind === 'event'    ? styles.kindEvent :
    n.kind === 'reminder' || n.kind === 'deadline' ? styles.kindReminder :
    n.kind === 'schedule' ? styles.kindSchedule : styles.kindTask;
  const tomorrow = occurrence ? postponeDate('tomorrow', occurrence, today) : null;
  const nextWeek = occurrence ? postponeDate('next-week', occurrence, today) : null;

  return (
    <div className={`${styles.card} ${kindClass}`}>
      <div className={styles.cardMain}>
        <div className={styles.cardText}>
          <span className={styles.cardTitle}>{n.title}</span>
          <span className={styles.cardBody}>{n.body}</span>
        </div>
        <button
          className={styles.dismissBtn}
          onClick={calendarKind || legacyTask ? gotIt : close}
          title={n.kind === 'reminder' ? C.gotItReminder : C.gotItHint}
        >✕</button>
      </div>

      {mode === 'idle' && (
        <div className={styles.actions}>
          {calendarKind || legacyTask ? (
            <>
              <button className={`${styles.actionBtn} ${styles.doneBtn}`} title={n.kind === 'reminder' ? C.gotItReminder : C.gotItHint} onClick={gotIt}>{C.gotIt}</button>
              {n.kind === 'deadline' && <button className={styles.actionBtn} title={C.doneHint} onClick={done}>{C.done}</button>}
              <button className={styles.actionBtn} onClick={() => setMode('snooze')}>{C.snooze}</button>
              {calendarKind && <button className={styles.actionBtn} onClick={() => setMode('postpone')}>{C.postpone}</button>}
              {calendarKind && <button className={styles.actionBtn} onClick={open}>{C.open}</button>}
              <button className={`${styles.actionBtn} ${styles.archiveBtn}`} onClick={() => (repeats ? setMode('archive') : archive(false))}>{C.archive}</button>
            </>
          ) : (
            <button className={`${styles.actionBtn} ${styles.doneBtn}`} onClick={close}>{C.ok}</button>
          )}
        </div>
      )}

      {mode === 'snooze' && (
        <div className={styles.panel2}>
          <span className={styles.miniLabel}>{C.snoozeTitle}</span>
          <div className={styles.presets}>
            <button className={styles.actionBtn} onClick={() => snoozePreset('10m')}>{C.snooze10m}</button>
            <button className={styles.actionBtn} onClick={() => snoozePreset('1h')}>{C.snooze1h}</button>
            <button className={styles.actionBtn} onClick={() => snoozePreset('evening')}>{C.snoozeEvening}</button>
            <button className={styles.actionBtn} onClick={() => snoozePreset('morning')}>{C.snoozeMorning}</button>
          </div>
          <div className={styles.miniForm}>
            <span className={styles.miniLabel}>{C.snoozeIn}</span>
            <input
              type="number"
              className={styles.miniNum}
              value={snoozeValue}
              min={1}
              onChange={(e) => setSnoozeValue(Math.max(1, Number(e.target.value)))}
            />
            <select className={styles.miniSelect} value={snoozeUnit} onChange={(e) => setSnoozeUnit(e.target.value as typeof snoozeUnit)}>
              <option value="minutes">min</option>
              <option value="hours">hours</option>
            </select>
            <button className={`${styles.actionBtn} ${styles.doneBtn}`} onClick={snoozeCustom}>{C.set}</button>
            <button className={styles.actionBtn} onClick={() => setMode('idle')}>{C.cancel}</button>
          </div>
        </div>
      )}

      {mode === 'postpone' && (
        <div className={styles.panel2}>
          <span className={styles.miniLabel}>{C.postponeTitle}</span>
          {(tomorrow || nextWeek) && (
            <div className={styles.presets}>
              {tomorrow && <button className={styles.actionBtn} onClick={() => postpone(tomorrow)}>{C.postponeTomorrow}</button>}
              {nextWeek && <button className={styles.actionBtn} onClick={() => postpone(nextWeek)}>{C.postponeNextWeek}</button>}
            </div>
          )}
          <div className={styles.miniForm}>
            <input type="date" className={styles.miniDate} value={postponeTo} onChange={(e) => setPostponeTo(e.target.value)} />
            <TimeInput className={styles.miniTime} value={postponeTime} onChange={setPostponeTime} />
            <button className={`${styles.actionBtn} ${styles.doneBtn}`} disabled={!postponeTo} onClick={() => postpone(postponeTo, postponeTime || undefined)}>{C.move}</button>
            <button className={styles.actionBtn} onClick={() => setMode('idle')}>{C.cancel}</button>
          </div>
          {repeats && <span className={styles.hint}>{C.postponeOnlyThis}</span>}
        </div>
      )}

      {mode === 'archive' && (
        <div className={styles.panel2}>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={wholeSeries} onChange={(e) => setWholeSeries(e.target.checked)} />
            {C.archiveSeries}
          </label>
          <div className={styles.miniForm}>
            <button className={`${styles.actionBtn} ${styles.archiveBtn}`} onClick={() => archive(wholeSeries)}>{wholeSeries ? C.archiveSeries : C.archiveTitle}</button>
            <button className={styles.actionBtn} onClick={() => setMode('idle')}>{C.cancel}</button>
          </div>
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

  useEscapeClose(() => setOpen(false), open);

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
              <button className={styles.clearBtn} title={LABELS.notifications.card.clearAllHint} onClick={clearAll}>{LABELS.notifications.card.clearAll}</button>
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
