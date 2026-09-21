import { useState, useRef } from 'react';
import type { CalendarEventId, CalendarEventType, NotifyUnit, RepeatFreq, RepeatConfig } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { timeAddMinutes, computeLinkedEndTime, addDaysToIso } from '@/utils/date';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import { LinksField } from '@/components/LinksField/LinksField';
import { deleteEventWithCleanup, unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import { updateCalendarEventLinked as updateEvent } from '@/services/taskCalendarLinks';
import type { CrossAppRef } from '@/types';
import { RecurrenceScopeBar } from '@/components/RecurrenceScopeBar/RecurrenceScopeBar';
import { ItemActionDialog } from '@/components/ItemActions/ItemActionDialog';
import { ItemActionFooter } from '@/components/ItemActions/ItemActionFooter';
import { ArchivedBanner } from '@/components/ItemActions/ArchivedBanner';
import { useItemActions } from '@/components/ItemActions/useItemActions';
import styles from './CalendarEventPane.module.css';

const EVENT_TYPES: { value: CalendarEventType; label: string; icon: string }[] = [
  { value: 'default',  label: 'Event',    icon: '' },
  { value: 'birthday', label: 'Birthday', icon: '🎉' },
];

export function CalendarEventPane() {
  const editingId         = useUIStore((s) => s.editingCalendarEventId);
  const occurrenceDate    = useUIStore((s) => s.editingCalendarEventOccurrence);
  const closePane         = useUIStore((s) => s.closeCalendarEventPane);
  const openPane          = useUIStore((s) => s.openCalendarEventPane);
  const openTaskPane      = useUIStore((s) => s.openTaskPane);
  const eventsRecord      = useCalendarStore((s) => s.events);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const tasksRecord       = useTaskStore((s) => s.tasks);

  const event = editingId ? eventsRecord[editingId as CalendarEventId] : null;
  const archiveEvent = useCalendarStore((s) => s.archiveEvent);
  const restoreEvent = useCalendarStore((s) => s.restoreEvent);
  // A task's scheduled shadow event is archived/restored with the task itself, never on its own.
  const isTaskShadow = !!editingId && Object.values(tasksRecord).some((t) => t.calendarEventId === editingId);
  const { dialog, setDialog, closeDialog } = useItemActions({
    itemKey:    editingId,
    archived:   !!event?.archivedAt,
    canArchive: !isTaskShadow,
    onClose:    closePane,
    onRestore:  () => { if (editingId) restoreEvent(editingId as CalendarEventId); },
  });

  const repeat = event?.repeat ?? null;
  const [title,          setTitle]          = useState(() => event?.title ?? '');
  const [notes,          setNotes]          = useState(() => event?.notes ?? '');
  const [notifyAtTime,   setNotifyAtTime]   = useState(event?.notifyAtTime ?? '12:00');
  const [repeatOn,       setRepeatOn]       = useState(!!repeat);
  const [repeatFreq,     setRepeatFreq]     = useState<RepeatFreq>(repeat?.freq ?? 'weekly');
  const [repeatInterval, setRepeatInterval] = useState(repeat?.interval ?? 1);
  const [repeatEndKind,  setRepeatEndKind]  = useState<RepeatConfig['endKind']>(repeat?.endKind ?? 'forever');
  const [repeatCount,    setRepeatCount]    = useState(repeat?.count ?? 10);
  const [repeatUntil,    setRepeatUntil]    = useState(repeat?.until ?? '');
  // See AddCalendarItemModal's identical ref for why this exists — prevents the linked-end-time
  // cascade from getting "stuck" on its own previous guess while a start time is typed digit by
  // digit. A pre-existing endTime here counts as genuinely user-set (it was saved), not one of our
  // own in-progress auto-guesses; App.tsx remounts this pane per event (key), so it starts fresh.
  const endAutoRef = useRef(!event);

  if (!event) return null;

  const id = event.id;
  const allCollections = Object.values(collectionsRecord);
  // scheduledAt auto-creates this exact event (see Task.calendarEventId) — the event is the
  // correct primary entity (it's genuinely blocking calendar time), but the pane still surfaces
  // the link so the user isn't left guessing why an "event" they didn't create exists.
  const linkedTask = Object.values(tasksRecord).find((t) => t.calendarEventId === id) ?? null;

  const openLinkedTask = () => {
    if (!linkedTask) return;
    closePane();
    openTaskPane(linkedTask.id);
  };

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== event.title) updateEvent(id, { title: v });
    else if (!v) setTitle(event.title);
  };

  const saveNotes = () => {
    const v = notes.trim() || null;
    if (v !== event.notes) updateEvent(id, { notes: v });
  };

  const handleDelete = () => { closeDialog(); deleteEventWithCleanup(id); closePane(); };
  const handleArchive = (reason: string) => { closeDialog(); archiveEvent(id, reason); closePane(); };

  const navigateToCrossAppRef = (ref: CrossAppRef) => {
    if (ref.type !== 'note') return;
    closePane();
    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().openNote(ref.id, ref.tabId);
  };

  const handleCrossAppRefsChange = (next: CrossAppRef[]) => {
    (event.crossAppRefs ?? [])
      .filter((r) => !next.some((n) => n.type === r.type && n.id === r.id))
      .forEach((ref) => unlinkCrossAppRef('event', id, ref));
    updateEvent(id, { crossAppRefs: next });
  };

  const handleStartTimeChange = (val: string) => {
    const newStart = val || null;
    const changes: Record<string, string | null> = { startTime: newStart };
    if (val) {
      const { time, dayOffset } = computeLinkedEndTime(val, endAutoRef.current ? '' : (event.endTime ?? ''));
      changes.endTime = time;
      endAutoRef.current = true;
      if (dayOffset > 0 && !event.endDate) changes.endDate = addDaysToIso(event.date, dayOffset);
    }
    updateEvent(id, changes as Parameters<typeof updateEvent>[1]);
  };

  const handleEndTimeChange = (val: string) => {
    endAutoRef.current = false;
    const changes: Record<string, string | null> = { endTime: val || null };
    if (val && event.startTime && val < event.startTime) {
      changes.startTime = timeAddMinutes(val, -30);
    }
    updateEvent(id, changes as Parameters<typeof updateEvent>[1]);
  };

  const isLocationUrl = (loc: string) =>
    /^https?:\/\//i.test(loc) || /^maps\.google\./i.test(loc);

  // A plain address gets wrapped into a Google Maps search — no API key or integration needed,
  // this is just a URL. A location that's already a link (isLocationUrl) is used as-is.
  const locationMapsUrl = (loc: string) =>
    isLocationUrl(loc) ? loc : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;

  const saveRepeat = (on: boolean, freq: RepeatFreq, interval: number, endKind: RepeatConfig['endKind'], count: number, until: string) => {
    const r: RepeatConfig | null = on
      ? { freq, interval, endKind, count: endKind === 'count' ? count : null, until: endKind === 'until' ? until || null : null, exceptions: event.repeat?.exceptions }
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
          {event.archivedAt && <ArchivedBanner archivedAt={event.archivedAt} reason={event.archiveReason} />}

          {event.repeat && (
            <RecurrenceScopeBar
              kind="event"
              id={id}
              baseDate={event.date}
              repeat={event.repeat}
              occurrenceDate={occurrenceDate}
              onClose={closePane}
              onSwitch={(newId) => openPane(newId)}
            />
          )}

          {linkedTask && (
            <button type="button" className={styles.linkedTaskChip} onClick={openLinkedTask}>
              🕐 Linked task: {linkedTask.title}
            </button>
          )}

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
            <div className={styles.timeRow}>
              <input
                type="date"
                className={styles.dateInput}
                value={event.date}
                onChange={(e) => {
                  const v = e.target.value;
                  updateEvent(id, { date: v });
                  if (event.endDate && event.endDate <= v) updateEvent(id, { endDate: null });
                }}
              />
              {(event.eventType ?? 'default') !== 'birthday' && (
                <>
                  <span className={styles.timeSep}>→</span>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={event.endDate ?? ''}
                    min={event.date}
                    onChange={(e) => updateEvent(id, { endDate: e.target.value || null })}
                  />
                </>
              )}
            </div>
          </div>

          {(event.eventType ?? 'default') !== 'birthday' && (
            <div className={styles.field}>
              <span className={styles.label}>Time</span>
              <div className={styles.timeRow}>
                <TimeInput
                  className={styles.timeInput}
                  value={event.startTime ?? ''}
                  onChange={handleStartTimeChange}
                  placeholder="Start"
                />
                <span className={styles.timeSep}>→</span>
                <TimeInput
                  className={styles.timeInput}
                  value={event.endTime ?? ''}
                  onChange={handleEndTimeChange}
                  placeholder="End"
                />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>Location</span>
            <div className={styles.locationRow}>
              <input
                type="text"
                className={styles.textInput}
                value={event.location ?? ''}
                onChange={(e) => updateEvent(id, { location: e.target.value || null })}
                placeholder="Address or link"
              />
              {event.location && (
                <a
                  href={locationMapsUrl(event.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.locationLink}
                  title={isLocationUrl(event.location) ? 'Open link' : 'Open in Google Maps'}
                >
                  {isLocationUrl(event.location) ? '↗' : '🗺'}
                </a>
              )}
            </div>
          </div>

          {!isTaskShadow && (
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
          )}

          <div className={styles.field}>
            <label className={`${styles.label} ${styles.checkLabel}`}>
              <input
                type="checkbox"
                checked={event.important ?? false}
                onChange={(e) => updateEvent(id, { important: e.target.checked })}
              />
              ❗ Important — highlight on the calendar
            </label>
          </div>

          {(event.eventType ?? 'default') !== 'birthday' && (
            <div className={styles.field}>
              <label className={`${styles.label} ${styles.checkLabel}`}>
                <input
                  type="checkbox"
                  checked={(event.status ?? 'confirmed') === 'tentative'}
                  onChange={(e) => updateEvent(id, { status: e.target.checked ? 'tentative' : 'confirmed' })}
                />
                Tentative — not confirmed yet, just a placeholder
              </label>
            </div>
          )}

          {(event.eventType ?? 'default') === 'birthday' ? (
            <div className={styles.field}>
              <span className={styles.label}>Notify at</span>
              <TimeInput
                className={styles.timeInput}
                value={notifyAtTime}
                onChange={(v) => {
                  setNotifyAtTime(v);
                  updateEvent(id, { notifyAtTime: v || null });
                }}
              />
            </div>
          ) : (
            <div className={styles.field}>
              <label className={`${styles.label} ${styles.checkLabel}`}>
                <input
                  type="checkbox"
                  checked={event.notifyBeforeValue !== null}
                  onChange={(e) => updateEvent(id, { notifyBeforeValue: e.target.checked ? 1 : null })}
                />
                Notify before
              </label>
              {event.notifyBeforeValue !== null && (
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
              )}
            </div>
          )}

          {/* ── Repeat — not offered on a task's scheduled event: the task itself doesn't repeat ── */}
          {!isTaskShadow && <div className={styles.field}>
            <label className={`${styles.label} ${styles.checkLabel}`}>
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
          </div>}

          <div className={styles.field}>
            <span className={styles.label}>Links</span>
            <LinksField links={event.links ?? []} onChange={(next) => updateEvent(id, { links: next })} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Links</span>
            <LinksField links={event.links ?? []} onChange={(next) => updateEvent(id, { links: next })} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Linked items</span>
            <CrossAppRefPicker
              value={event.crossAppRefs ?? []}
              suggestFrom={event.title}
              onChange={handleCrossAppRefsChange}
              onNavigate={navigateToCrossAppRef}
            />
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

        <ItemActionFooter
          archived={!!event.archivedAt}
          canArchive={!isTaskShadow}
          completed={linkedTask?.completed}
          onToggleComplete={linkedTask ? () => useTaskStore.getState().toggleTask(linkedTask.id) : undefined}
          deleteLabel={event.repeat ? 'Delete all occurrences' : `Delete ${LABELS.calendarItemKind.event.toLowerCase()}`}
          onArchive={() => setDialog('archive')}
          onRestore={() => restoreEvent(id)}
          onDelete={() => setDialog('delete')}
        />
      </aside>

      {dialog && (
        <ItemActionDialog
          mode={dialog}
          noun="event"
          itemTitle={event.title}
          archiveNote={event.repeat ? 'The whole repeating series is archived, not just this occurrence.' : undefined}
          alsoRemoves={event.repeat ? 'and all of its occurrences' : undefined}
          canArchive={!isTaskShadow}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onArchiveInstead={() => setDialog('archive')}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}
