import { useState, useEffect } from 'react';
import type { CalendarItemKind, CalendarEventType, NotifyUnit, RepeatFreq, RepeatConfig } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { timeAddMinutes } from '@/utils/date';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import type { CollectionId } from '@/types';
import styles from './AddCalendarItemModal.module.css';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EVENT_TYPES: { value: CalendarEventType; label: string; icon: string }[] = [
  { value: 'default',  label: 'Event',    icon: '' },
  { value: 'birthday', label: 'Birthday', icon: '🎉' },
];

export function AddCalendarItemModal() {
  const closeModal         = useUIStore((s) => s.closeModal);
  const prefillDate        = useUIStore((s) => s.calendarItemDate);
  const prefillKind        = useUIStore((s) => s.calendarItemKind);
  const activeCollectionId = useUIStore((s) => s.activeCollectionId);
  const addEvent           = useCalendarStore((s) => s.addEvent);
  const addReminder        = useCalendarStore((s) => s.addReminder);
  const collectionsRecord  = useTaskStore((s) => s.collections);

  const [kind,              setKind]              = useState<CalendarItemKind>(prefillKind ?? 'event');
  const [title,             setTitle]             = useState('');
  const [date,              setDate]              = useState(prefillDate ?? todayStr());
  const [startTime,         setStartTime]         = useState('');
  const [endTime,           setEndTime]           = useState('');
  const [time,              setTime]              = useState('');
  const [notes,             setNotes]             = useState('');
  const [location,          setLocation]          = useState('');
  const [eventType,         setEventType]         = useState<CalendarEventType>('default');
  const [collectionId,      setCollectionId]      = useState<CollectionId | null>(
    activeCollectionId as CollectionId | null
  );
  const [notifyBeforeValue, setNotifyBeforeValue] = useState(1);
  const [notifyBeforeUnit,  setNotifyBeforeUnit]  = useState<NotifyUnit>('hours');
  const [notifyAtTime,      setNotifyAtTime]      = useState('12:00');
  const [repeatOn,          setRepeatOn]          = useState(false);
  const [repeatFreq,        setRepeatFreq]        = useState<RepeatFreq>('weekly');
  const [repeatInterval,    setRepeatInterval]    = useState(1);
  const [repeatEndKind,     setRepeatEndKind]     = useState<RepeatConfig['endKind']>('forever');
  const [repeatCount,       setRepeatCount]       = useState(10);
  const [repeatUntil,       setRepeatUntil]       = useState('');
  const [formExpanded,      setFormExpanded]      = useState(false);

  const allCollections = Object.values(collectionsRecord);

  function buildRepeat(): RepeatConfig | null {
    if (!repeatOn) return null;
    return {
      freq:     repeatFreq,
      interval: repeatInterval,
      endKind:  repeatEndKind,
      count:    repeatEndKind === 'count' ? repeatCount : null,
      until:    repeatEndKind === 'until' ? repeatUntil || null : null,
    };
  }

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    if (val && (!endTime || endTime <= val)) {
      setEndTime(timeAddMinutes(val, 30));
    }
  };

  const handleEndTimeChange = (val: string) => {
    setEndTime(val);
    if (val && startTime && val < startTime) {
      setStartTime(timeAddMinutes(val, -30));
    }
  };

  const handleEventTypeChange = (type: CalendarEventType) => {
    setEventType(type);
    if (type === 'birthday') {
      setStartTime('');
      setEndTime('');
      setRepeatOn(true);
      setRepeatFreq('yearly');
      setRepeatInterval(1);
      setRepeatEndKind('forever');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    if (kind === 'event') {
      addEvent({
        title,
        date,
        startTime:         startTime    || null,
        endTime:           endTime      || null,
        notes:             notes        || null,
        location:          location     || null,
        eventType,
        collectionId:      collectionId || null,
        notifyBeforeValue,
        notifyBeforeUnit,
        notifyAtTime:      eventType === 'birthday' ? notifyAtTime || null : null,
        repeat:            buildRepeat(),
      });
    } else {
      addReminder({
        title,
        date,
        time:         time         || null,
        notes:        notes        || null,
        collectionId: collectionId || null,
        repeat:       buildRepeat(),
      });
    }
    closeModal();
  };

  const isBirthday = kind === 'event' && eventType === 'birthday';
  const showAdvanced = kind === 'reminder' || formExpanded;

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>New {LABELS.calendarItemKind[kind]}</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        {/* Type toggle */}
        <div className={styles.kindToggle}>
          {(['event', 'reminder'] as CalendarItemKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`${styles.kindBtn} ${kind === k ? styles.kindBtnActive : ''}`}
              onClick={() => setKind(k)}
            >
              {LABELS.calendarItemKind[k]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <input
            className={styles.titleInput}
            placeholder={kind === 'event' ? 'Event title' : 'Reminder title'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <textarea
            className={styles.notes}
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />

          <div className={styles.field}>
            <label className={styles.label}>Date</label>
            <input
              type="date"
              className={styles.dateInput}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {kind === 'event' && (
            <div className={styles.field}>
              <label className={styles.label}>Event type</label>
              <div className={styles.typeRow}>
                {EVENT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`${styles.typeBtn} ${eventType === t.value ? styles.typeBtnActive : ''}`}
                    onClick={() => handleEventTypeChange(t.value)}
                  >
                    {t.icon && <span>{t.icon}</span>}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind === 'event' && !isBirthday && (
            <div className={styles.field}>
              <label className={styles.label}>Time</label>
              <div className={styles.timeRow}>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  placeholder="Start"
                />
                <span className={styles.timeSep}>→</span>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={endTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  placeholder="End"
                />
              </div>
            </div>
          )}

          {isBirthday && (
            <div className={styles.field}>
              <label className={styles.label}>Notify at</label>
              <input
                type="time"
                className={styles.timeInput}
                value={notifyAtTime}
                onChange={(e) => setNotifyAtTime(e.target.value)}
              />
            </div>
          )}

          {kind === 'reminder' && (
            <div className={styles.field}>
              <label className={styles.label}>Time (optional)</label>
              <input
                type="time"
                className={styles.timeInput}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}

          <button
            type="button"
            className={styles.formExpandBtn}
            onClick={() => setFormExpanded((v) => !v)}
          >
            {formExpanded ? '▴ Fewer options' : '▾ More options'}
          </button>

          {showAdvanced && (
            <>
              {kind === 'event' && (
                <div className={styles.field}>
                  <label className={styles.label}>Location (optional)</label>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="Address or link"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              )}

              {kind === 'event' && !isBirthday && (
                <div className={styles.field}>
                  <label className={styles.label}>Notify before</label>
                  <div className={styles.timeRow}>
                    <input
                      type="number"
                      className={styles.notifyNum}
                      value={notifyBeforeValue}
                      min={1}
                      onChange={(e) => setNotifyBeforeValue(Math.max(1, Number(e.target.value)))}
                    />
                    <select
                      className={styles.select}
                      value={notifyBeforeUnit}
                      onChange={(e) => setNotifyBeforeUnit(e.target.value as NotifyUnit)}
                    >
                      <option value="minutes">minutes before</option>
                      <option value="hours">hours before</option>
                      <option value="days">days before</option>
                    </select>
                  </div>
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.label}>
                  <input
                    type="checkbox"
                    checked={repeatOn}
                    onChange={(e) => setRepeatOn(e.target.checked)}
                    style={{ marginRight: '0.4rem' }}
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
                        onChange={(e) => setRepeatInterval(Math.max(1, Number(e.target.value)))}
                      />
                      <select
                        className={styles.select}
                        value={repeatFreq}
                        onChange={(e) => setRepeatFreq(e.target.value as RepeatFreq)}
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
                        onChange={(e) => setRepeatEndKind(e.target.value as RepeatConfig['endKind'])}
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
                          onChange={(e) => setRepeatCount(Math.max(1, Number(e.target.value)))}
                        />
                      )}
                      {repeatEndKind === 'until' && (
                        <input
                          type="date"
                          className={styles.dateInput}
                          value={repeatUntil}
                          onChange={(e) => setRepeatUntil(e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {allCollections.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.label}>{LABELS.collection} (optional)</label>
                  <CollectionPicker
                    collections={allCollections}
                    value={collectionId}
                    onChange={(id) => setCollectionId(id)}
                    noneLabel={`No ${LABELS.collection}`}
                  />
                </div>
              )}
            </>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!title.trim() || !date}
            >
              Add {LABELS.calendarItemKind[kind]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
