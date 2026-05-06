import { useState, useEffect } from 'react';
import type { CalendarReminderId, RepeatFreq, RepeatConfig } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import styles from './CalendarReminderPane.module.css';

export function CalendarReminderPane() {
  const editingId         = useUIStore((s) => s.editingCalendarReminderId);
  const closePane         = useUIStore((s) => s.closeCalendarReminderPane);
  const remindersRecord   = useCalendarStore((s) => s.reminders);
  const updateReminder    = useCalendarStore((s) => s.updateReminder);
  const deleteReminder    = useCalendarStore((s) => s.deleteReminder);
  const collectionsRecord = useTaskStore((s) => s.collections);

  const reminder = editingId ? remindersRecord[editingId as CalendarReminderId] : null;

  const [title,          setTitle]          = useState('');
  const [notes,          setNotes]          = useState('');
  const [repeatOn,       setRepeatOn]       = useState(false);
  const [repeatFreq,     setRepeatFreq]     = useState<RepeatFreq>('weekly');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndKind,  setRepeatEndKind]  = useState<RepeatConfig['endKind']>('forever');
  const [repeatCount,    setRepeatCount]    = useState(10);
  const [repeatUntil,    setRepeatUntil]    = useState('');

  useEffect(() => {
    if (reminder) {
      setTitle(reminder.title);
      setNotes(reminder.notes ?? '');
      const r = reminder.repeat;
      setRepeatOn(!!r);
      if (r) {
        setRepeatFreq(r.freq);
        setRepeatInterval(r.interval);
        setRepeatEndKind(r.endKind);
        setRepeatCount(r.count ?? 10);
        setRepeatUntil(r.until ?? '');
      }
    }
  }, [reminder?.id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePane(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [closePane]);

  if (!reminder) return null;

  const id = reminder.id;
  const allCollections = Object.values(collectionsRecord);

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== reminder.title) updateReminder(id, { title: v });
    else if (!v) setTitle(reminder.title);
  };

  const saveNotes = () => {
    const v = notes.trim() || null;
    if (v !== reminder.notes) updateReminder(id, { notes: v });
  };

  const handleDelete = () => { deleteReminder(id); closePane(); };

  const saveRepeat = (on: boolean, freq: RepeatFreq, interval: number, endKind: RepeatConfig['endKind'], count: number, until: string) => {
    const r: RepeatConfig | null = on
      ? { freq, interval, endKind, count: endKind === 'count' ? count : null, until: endKind === 'until' ? until || null : null }
      : null;
    updateReminder(id, { repeat: r });
  };

  return (
    <>
      <div className={styles.overlay} onClick={closePane} />
      <aside className={styles.pane}>
        <header className={styles.header}>
          <span className={styles.heading}>{LABELS.calendarItemKind.reminder}</span>
          <button className={styles.closeBtn} onClick={closePane} aria-label="Close">×</button>
        </header>

        <div className={styles.body}>
          <input
            className={styles.titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            aria-label="Reminder title"
          />

          <textarea
            className={styles.notesInput}
            placeholder="Add notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={3}
          />

          <div className={styles.field}>
            <span className={styles.label}>Date</span>
            <input
              type="date"
              className={styles.dateInput}
              value={reminder.date}
              onChange={(e) => updateReminder(id, { date: e.target.value })}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Time</span>
            <input
              type="time"
              className={styles.timeInput}
              value={reminder.time ?? ''}
              onChange={(e) => updateReminder(id, { time: e.target.value || null })}
            />
          </div>

          {/* ── Repeat ── */}
          <div className={styles.field}>
            <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={repeatOn}
                onChange={(e) => {
                  const on = e.target.checked;
                  setRepeatOn(on);
                  saveRepeat(on, repeatFreq, repeatInterval, repeatEndKind, repeatCount, repeatUntil);
                }}
              />
              Repeat
            </label>
            {repeatOn && (
              <div className={styles.repeatConfig}>
                <div className={styles.repeatRow}>
                  <span className={styles.repeatSmall}>Every</span>
                  <input
                    type="number"
                    className={styles.repeatNum}
                    min={1}
                    value={repeatInterval}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value));
                      setRepeatInterval(v);
                      saveRepeat(true, repeatFreq, v, repeatEndKind, repeatCount, repeatUntil);
                    }}
                  />
                  <select
                    className={styles.select}
                    value={repeatFreq}
                    onChange={(e) => {
                      const f = e.target.value as RepeatFreq;
                      setRepeatFreq(f);
                      saveRepeat(true, f, repeatInterval, repeatEndKind, repeatCount, repeatUntil);
                    }}
                  >
                    <option value="daily">day(s)</option>
                    <option value="weekly">week(s)</option>
                    <option value="monthly">month(s)</option>
                    <option value="yearly">year(s)</option>
                  </select>
                </div>
                <div className={styles.repeatRow}>
                  <span className={styles.repeatSmall}>Ends</span>
                  <select
                    className={styles.select}
                    value={repeatEndKind}
                    onChange={(e) => {
                      const k = e.target.value as RepeatConfig['endKind'];
                      setRepeatEndKind(k);
                      saveRepeat(true, repeatFreq, repeatInterval, k, repeatCount, repeatUntil);
                    }}
                  >
                    <option value="forever">Never</option>
                    <option value="count">After N times</option>
                    <option value="until">On date</option>
                  </select>
                  {repeatEndKind === 'count' && (
                    <input
                      type="number"
                      className={styles.repeatNum}
                      min={1}
                      value={repeatCount}
                      onChange={(e) => {
                        const v = Math.max(1, Number(e.target.value));
                        setRepeatCount(v);
                        saveRepeat(true, repeatFreq, repeatInterval, 'count', v, repeatUntil);
                      }}
                    />
                  )}
                  {repeatEndKind === 'until' && (
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={repeatUntil}
                      onChange={(e) => {
                        setRepeatUntil(e.target.value);
                        saveRepeat(true, repeatFreq, repeatInterval, 'until', repeatCount, e.target.value);
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {allCollections.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>{LABELS.collection}</span>
              <CollectionPicker
                collections={allCollections}
                value={reminder.collectionId}
                onChange={(cid) => updateReminder(id, { collectionId: cid })}
                noneLabel={`No ${LABELS.collection}`}
              />
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button className={styles.deleteBtn} onClick={handleDelete}>
            Delete {LABELS.calendarItemKind.reminder.toLowerCase()}
          </button>
        </footer>
      </aside>
    </>
  );
}
