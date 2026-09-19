import { useState, useEffect, useRef } from 'react';
import type { CalendarItemKind, CalendarEventType, EventStatus, NotifyUnit, RepeatFreq, RepeatConfig } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { LABELS } from '@/config/labels';
import { timeAddMinutes, computeLinkedEndTime, addDaysToIso } from '@/utils/date';
import { resolveTimezone, todayIsoInZone } from '@/utils/timezone';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { AllDayNotifyField } from '@/components/AllDayNotifyField/AllDayNotifyField';
import { DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE, DEFAULT_ALLDAY_NOTIFY_AT_TIME } from '@/config/notifyDefaults';
import type { CollectionId } from '@/types';
import styles from './AddCalendarItemModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

function todayStr(): string {
  return todayIsoInZone(resolveTimezone(useSettingsStore.getState().timezone));
}

const EVENT_TYPES: { value: CalendarEventType; label: string; icon: string }[] = [
  { value: 'default',  label: 'Event',    icon: '' },
  { value: 'birthday', label: 'Birthday', icon: '🎉' },
];

export function AddCalendarItemModal() {
  const closeModal         = useUIStore((s) => s.closeModal);
  const prefillDate        = useUIStore((s) => s.calendarItemDate);
  const prefillKind        = useUIStore((s) => s.calendarItemKind);
  const prefillTime        = useUIStore((s) => s.calendarItemTime);
  const prefillTitle       = useUIStore((s) => s.calendarItemTitle);
  const prefillExtra       = useUIStore((s) => s.calendarItemExtra);
  const activeCollectionId = useUIStore(selectActiveCollectionId);
  const addEvent           = useCalendarStore((s) => s.addEvent);
  const addReminder        = useCalendarStore((s) => s.addReminder);
  const collectionsRecord  = useTaskStore((s) => s.collections);

  const [kind,              setKind]              = useState<CalendarItemKind>(prefillKind ?? 'event');
  const [title,             setTitle]             = useState(prefillTitle ?? '');
  const [date,              setDate]              = useState(prefillDate ?? todayStr());
  const [endDate,           setEndDate]           = useState('');
  const [startTime,         setStartTime]         = useState(prefillTime ?? '');
  const [endTime,           setEndTime]           = useState(prefillExtra?.endTime ?? (prefillTime ? timeAddMinutes(prefillTime, 30) : ''));
  const [time,              setTime]              = useState(prefillTime ?? '');
  const [notes,             setNotes]             = useState(prefillExtra?.notes ?? '');
  const [location,          setLocation]          = useState(prefillExtra?.location ?? '');
  const [eventType,         setEventType]         = useState<CalendarEventType>('default');
  const [status,            setStatus]            = useState<EventStatus>('confirmed');
  const [collectionId,      setCollectionId]      = useState<CollectionId | null>(
    (prefillExtra?.collectionId ?? activeCollectionId) as CollectionId | null
  );
  const [important,         setImportant]         = useState(false);
  const [allDayNotifyDays,  setAllDayNotifyDays]  = useState(DEFAULT_ALLDAY_NOTIFY_DAYS_BEFORE);
  const [allDayNotifyAt,    setAllDayNotifyAt]    = useState(DEFAULT_ALLDAY_NOTIFY_AT_TIME);
  const [notifyBeforeOn,    setNotifyBeforeOn]    = useState(false);
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
  const formRef = useRef<HTMLFormElement>(null);
  // Tracks whether `endTime` is still just our own auto-linked guess vs. something the user
  // actually typed into the End field — without this, typing a start time digit-by-digit (hour
  // commits before minute) would cascade: the hour-only commit auto-links an end time, then the
  // minute commit sees that already-set end and "preserves its minutes" instead of re-deriving
  // fresh, producing a stuck/wrong result. See CLAUDE.md's Timepicker section for the full story.
  // A range typed in the note ("2-3pm") arrives as a real end time, not one of our own guesses.
  const endAutoRef = useRef(!prefillExtra?.endTime);

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

  // Abandoning the modal must drop a pending Notes "Create ▸ Calendar item" link request, or a
  // later unrelated creation could pick it up (same reason AddTaskModal does this).
  const handleClose = () => {
    if (useUIStore.getState().pendingArtifactLink) useUIStore.getState().clearPendingArtifactLink();
    closeModal();
  };

  useEscapeClose(() => { handleClose(); });

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeModal]);

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    if (val) {
      const { time, dayOffset } = computeLinkedEndTime(val, endAutoRef.current ? '' : endTime);
      setEndTime(time);
      endAutoRef.current = true;
      if (dayOffset > 0 && !endDate) setEndDate(addDaysToIso(date, dayOffset));
    }
  };

  const handleEndTimeChange = (val: string) => {
    endAutoRef.current = false;
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

    // Created from a Notes selection: record the reverse link now and report the new id (and the
    // kind actually chosen — the user may have flipped Event/Reminder) back so NoteEditor can
    // apply the forward mark. See AddTaskModal's identical handling.
    const pending = useUIStore.getState().pendingArtifactLink;
    const crossAppRefs = pending ? [{ type: 'note' as const, id: pending.noteId }] : [];

    if (kind === 'event') {
      const eventId = addEvent({
        title,
        date,
        endDate:           (endDate && endDate > date) ? endDate : null,
        startTime:         startTime    || null,
        endTime:           endTime      || null,
        notes:             notes        || null,
        location:          location     || null,
        eventType,
        collectionId:      collectionId || null,
        notifyBeforeValue: notifyBeforeOn ? notifyBeforeValue : null,
        notifyBeforeUnit,
        notifyAtTime:      eventType === 'birthday' ? notifyAtTime || null : null,
        repeat:            buildRepeat(),
        status,
        important,
        crossAppRefs,
      });
      if (pending) useUIStore.getState().resolveArtifactLink(eventId, 'event');
    } else {
      const reminderId = addReminder({
        title,
        date,
        time:         time         || null,
        notes:        notes        || null,
        collectionId: collectionId || null,
        repeat:       buildRepeat(),
        important,
        crossAppRefs,
        notifyDaysBefore: allDayNotifyDays,
        notifyAtTime:     allDayNotifyAt,
      });
      if (pending) useUIStore.getState().resolveArtifactLink(reminderId, 'reminder');
    }
    closeModal();
  };

  const isBirthday = kind === 'event' && eventType === 'birthday';
  const showAdvanced = kind === 'reminder' || formExpanded;

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>New {LABELS.calendarItemKind[kind]}</span>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">✕</button>
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

        <form ref={formRef} onSubmit={handleSubmit}>
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
            <div className={styles.timeRow}>
              <input
                type="date"
                className={styles.dateInput}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (endDate && endDate <= e.target.value) setEndDate('');
                }}
                required
              />
              {kind === 'event' && !isBirthday && (
                <>
                  <span className={styles.timeSep}>→</span>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={endDate}
                    min={date}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="End date"
                  />
                </>
              )}
            </div>
          </div>

          {kind === 'event' && !isBirthday && (
            <div className={styles.field}>
              <label className={styles.label}>Time</label>
              <div className={styles.timeRow}>
                <TimeInput
                  className={styles.timeInput}
                  value={startTime}
                  onChange={handleStartTimeChange}
                  placeholder="Start"
                />
                <span className={styles.timeSep}>→</span>
                <TimeInput
                  className={styles.timeInput}
                  value={endTime}
                  onChange={handleEndTimeChange}
                  placeholder="End"
                />
              </div>
            </div>
          )}

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

          <div className={styles.field}>
            <label className={styles.label}>
              <input
                type="checkbox"
                checked={important}
                onChange={(e) => setImportant(e.target.checked)}
                style={{ marginRight: '0.4rem' }}
              />
              ❗ Important — highlight on the calendar
            </label>
          </div>

          {isBirthday && (
            <div className={styles.field}>
              <label className={styles.label}>Notify at</label>
              <TimeInput
                className={styles.timeInput}
                value={notifyAtTime}
                onChange={setNotifyAtTime}
              />
            </div>
          )}

          {kind === 'reminder' && (
            <div className={styles.field}>
              <label className={styles.label}>Time (optional)</label>
              <TimeInput
                className={styles.timeInput}
                value={time}
                onChange={setTime}
              />
            </div>
          )}

          {kind === 'reminder' && !time && (
            <div className={styles.field}>
              <label className={styles.label}>Notify me</label>
              <AllDayNotifyField
                daysBefore={allDayNotifyDays}
                atTime={allDayNotifyAt}
                onChange={(d, t) => { setAllDayNotifyDays(d); setAllDayNotifyAt(t); }}
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
              {kind === 'event' && !isBirthday && (
                <div className={styles.field}>
                  <label className={styles.label}>
                    <input
                      type="checkbox"
                      checked={status === 'tentative'}
                      onChange={(e) => setStatus(e.target.checked ? 'tentative' : 'confirmed')}
                      style={{ marginRight: '0.4rem' }}
                    />
                    Tentative — not confirmed yet, just a placeholder
                  </label>
                </div>
              )}

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
                  <label className={styles.label}>
                    <input
                      type="checkbox"
                      checked={notifyBeforeOn}
                      onChange={(e) => setNotifyBeforeOn(e.target.checked)}
                      style={{ marginRight: '0.4rem' }}
                    />
                    Notify before
                  </label>
                  {notifyBeforeOn && (
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
                  )}
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
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
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
