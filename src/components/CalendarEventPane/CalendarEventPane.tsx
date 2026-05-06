import { useState, useEffect } from 'react';
import type { CalendarEventId, CalendarEventType, NotifyUnit, RepeatFreq, RepeatConfig } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { timeAddMinutes } from '@/utils/date';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import styles from './CalendarEventPane.module.css';

const EVENT_TYPES: { value: CalendarEventType; label: string; icon: string }[] = [
  { value: 'default',  label: 'Event',    icon: '' },
  { value: 'birthday', label: 'Birthday', icon: '🎉' },
];

export function CalendarEventPane() {
  const editingId         = useUIStore((s) => s.editingCalendarEventId);
  const closePane         = useUIStore((s) => s.closeCalendarEventPane);
  const eventsRecord      = useCalendarStore((s) => s.events);
  const updateEvent       = useCalendarStore((s) => s.updateEvent);
  const deleteEvent       = useCalendarStore((s) => s.deleteEvent);
  const collectionsRecord = useTaskStore((s) => s.collections);

  const event = editingId ? eventsRecord[editingId as CalendarEventId] : null;

  const [title,          setTitle]          = useState('');
  const [notes,          setNotes]          = useState('');
  const [notifyAtTime,   setNotifyAtTime]   = useState(event?.notifyAtTime ?? '12:00');
  const [repeatOn,       setRepeatOn]       = useState(false);
  const [repeatFreq,     setRepeatFreq]     = useState<RepeatFreq>('weekly');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndKind,  setRepeatEndKind]  = useState<RepeatConfig['endKind']>('forever');
  const [repeatCount,    setRepeatCount]    = useState(10);
  const [repeatUntil,    setRepeatUntil]    = useState('');

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setNotes(event.notes ?? '');
      setNotifyAtTime(event.notifyAtTime ?? '12:00');
      const r = event.repeat;
      setRepeatOn(!!r);
      if (r) {
        setRepeatFreq(r.freq);
        setRepeatInterval(r.interval);
        setRepeatEndKind(r.endKind);
        setRepeatCount(r.count ?? 10);
        setRepeatUntil(r.until ?? '');
      }
    }
  }, [event?.id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePane(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [closePane]);

  if (!event) return null;

  const id = event.id;
  const allCollections = Object.values(collectionsRecord);

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== event.title) updateEvent(id, { title: v });
    else if (!v) setTitle(event.title);
  };

  const saveNotes = () => {
    const v = notes.trim() || null;
    if (v !== event.notes) updateEvent(id, { notes: v });
  };

  const handleDelete = () => { deleteEvent(id); closePane(); };

  const handleStartTimeChange = (val: string) => {
    const newStart = val || null;
    const changes: Record<string, string | null> = { startTime: newStart };
    if (val && (!event.endTime || event.endTime <= val)) {
      changes.endTime = timeAddMinutes(val, 30);
    }
    updateEvent(id, changes as Parameters<typeof updateEvent>[1]);
  };

  const handleEndTimeChange = (val: string) => {
    const changes: Record<string, string | null> = { endTime: val || null };
    if (val && event.startTime && val < event.startTime) {
      changes.startTime = timeAddMinutes(val, -30);
    }
    updateEvent(id, changes as Parameters<typeof updateEvent>[1]);
  };

  const isLocationUrl = (loc: string) =>
    /^https?:\/\//i.test(loc) || /^maps\.google\./i.test(loc);

  const saveRepeat = (on: boolean, freq: RepeatFreq, interval: number, endKind: RepeatConfig['endKind'], count: number, until: string) => {
    const r: RepeatConfig | null = on
      ? { freq, interval, endKind, count: endKind === 'count' ? count : null, until: endKind === 'until' ? until || null : null }
      : null;
    updateEvent(id, { repeat: r });
  };

  return (
    <>
      <div className={styles.overlay} onClick={closePane} />
      <aside className={styles.pane}>
        <header className={styles.header}>
          <span className={styles.heading}>{LABELS.calendarItemKind.event}</span>
          <button className={styles.closeBtn} onClick={closePane} aria-label="Close">×</button>
        </header>

        <div className={styles.body}>
          <input
            className={styles.titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            aria-label="Event title"
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
              value={event.date}
              onChange={(e) => updateEvent(id, { date: e.target.value })}
            />
          </div>

          {(event.eventType ?? 'default') !== 'birthday' && (
            <div className={styles.field}>
              <span className={styles.label}>Time</span>
              <div className={styles.timeRow}>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={event.startTime ?? ''}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  placeholder="Start"
                />
                <span className={styles.timeSep}>→</span>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={event.endTime ?? ''}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  placeholder="End"
                />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>Location</span>
            {event.location && isLocationUrl(event.location) ? (
              <div className={styles.locationRow}>
                <input
                  type="text"
                  className={styles.textInput}
                  value={event.location ?? ''}
                  onChange={(e) => updateEvent(id, { location: e.target.value || null })}
                  placeholder="Address or link"
                />
                <a
                  href={event.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.locationLink}
                  title="Open link"
                >
                  ↗
                </a>
              </div>
            ) : (
              <input
                type="text"
                className={styles.textInput}
                value={event.location ?? ''}
                onChange={(e) => updateEvent(id, { location: e.target.value || null })}
                placeholder="Address or link"
              />
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Event type</span>
            <div className={styles.typeRow}>
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`${styles.typeBtn} ${(event.eventType ?? 'default') === t.value ? styles.typeBtnActive : ''}`}
                  onClick={() => updateEvent(id, { eventType: t.value })}
                >
                  {t.icon && <span>{t.icon}</span>}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {(event.eventType ?? 'default') === 'birthday' ? (
            <div className={styles.field}>
              <span className={styles.label}>Notify at</span>
              <input
                type="time"
                className={styles.timeInput}
                value={notifyAtTime}
                onChange={(e) => {
                  setNotifyAtTime(e.target.value);
                  updateEvent(id, { notifyAtTime: e.target.value || null });
                }}
              />
            </div>
          ) : (
            <div className={styles.field}>
              <span className={styles.label}>Notify before</span>
              <div className={styles.timeRow}>
                <input
                  type="number"
                  className={styles.notifyNum}
                  value={event.notifyBeforeValue}
                  min={1}
                  onChange={(e) => updateEvent(id, { notifyBeforeValue: Math.max(1, Number(e.target.value)) })}
                />
                <select
                  className={styles.select}
                  value={event.notifyBeforeUnit}
                  onChange={(e) => updateEvent(id, { notifyBeforeUnit: e.target.value as NotifyUnit })}
                >
                  <option value="minutes">minutes before</option>
                  <option value="hours">hours before</option>
                  <option value="days">days before</option>
                </select>
              </div>
            </div>
          )}

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
                value={event.collectionId}
                onChange={(cid) => updateEvent(id, { collectionId: cid })}
                noneLabel={`No ${LABELS.collection}`}
              />
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button className={styles.deleteBtn} onClick={handleDelete}>
            Delete {LABELS.calendarItemKind.event.toLowerCase()}
          </button>
        </footer>
      </aside>
    </>
  );
}
