import { useState, useRef } from 'react';
import { toggleTaskCompletion, taskCompletionOptions } from '@/services/taskCompletion';
import type { CalendarReminderId, RepeatFreq, RepeatConfig } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { AllDayNotifyField } from '@/components/AllDayNotifyField/AllDayNotifyField';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import { LinkedNoteAbstracts } from '@/components/LinkedNoteAbstracts/LinkedNoteAbstracts';
import { newNoteTitleFor } from '@/services/noteFromItem';
import { LinksField } from '@/components/LinksField/LinksField';
import { deleteReminderWithCleanup, unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import type { CrossAppRef } from '@/types';
import { RecurrenceScopeBar } from '@/components/RecurrenceScopeBar/RecurrenceScopeBar';
import { SeriesLinkBar } from '@/components/RecurrenceScopeBar/SeriesLinkBar';
import { afterSeriesDeleted } from '@/services/calendarSeries';
import { ItemActionDialog } from '@/components/ItemActions/ItemActionDialog';
import { ItemActionFooter } from '@/components/ItemActions/ItemActionFooter';
import { ArchivedBanner } from '@/components/ItemActions/ArchivedBanner';
import { useItemActions } from '@/components/ItemActions/useItemActions';
import styles from './CalendarReminderPane.module.css';
import { useMarkdownHotkeys } from '@/hooks/useMarkdownHotkeys';
import { MarkdownLinkPrompt } from '@/components/MarkdownLinkPrompt/MarkdownLinkPrompt';

export function CalendarReminderPane() {
  const editingId         = useUIStore((s) => s.editingCalendarReminderId);
  const occurrenceDate    = useUIStore((s) => s.editingCalendarReminderOccurrence);
  const closePane         = useUIStore((s) => s.closeCalendarReminderPane);
  const openPane          = useUIStore((s) => s.openCalendarReminderPane);
  const remindersRecord   = useCalendarStore((s) => s.reminders);
  const updateReminder    = useCalendarStore((s) => s.updateReminder);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const tasksRecord       = useTaskStore((s) => s.tasks);
  const openTaskPane      = useUIStore((s) => s.openTaskPane);

  const reminder = editingId ? remindersRecord[editingId as CalendarReminderId] : null;
  const archiveReminder = useCalendarStore((s) => s.archiveReminder);
  const restoreReminder = useCalendarStore((s) => s.restoreReminder);
  const setOccurrenceDone = useCalendarStore((s) => s.setOccurrenceDone);
  const { dialog, setDialog, closeDialog } = useItemActions({
    itemKey:   editingId,
    archived:  !!reminder?.archivedAt,
    onClose:   closePane,
    onRestore: () => { if (editingId) restoreReminder(editingId as CalendarReminderId); },
  });

  const repeat = reminder?.repeat ?? null;
  const [title,          setTitle]          = useState(() => reminder?.title ?? '');
  const [notes,          setNotes]          = useState(() => reminder?.notes ?? '');
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const { linkPrompt, confirmLink, cancelLink } = useMarkdownHotkeys(notesRef, notes, setNotes);
  const [repeatOn,       setRepeatOn]       = useState(!!repeat);
  const [repeatFreq,     setRepeatFreq]     = useState<RepeatFreq>(repeat?.freq ?? 'weekly');
  const [repeatInterval, setRepeatInterval] = useState(repeat?.interval ?? 1);
  const [repeatEndKind,  setRepeatEndKind]  = useState<RepeatConfig['endKind']>(repeat?.endKind ?? 'forever');
  const [repeatCount,    setRepeatCount]    = useState(repeat?.count ?? 10);
  const [repeatUntil,    setRepeatUntil]    = useState(repeat?.until ?? '');

  if (!reminder) return null;

  const id = reminder.id;
  const allCollections = Object.values(collectionsRecord);
  // A task's deadline is mirrored as a reminder (Task.calendarReminderId) — same link as the
  // event pane's, so the task can be opened or completed from here.
  const linkedTask = Object.values(tasksRecord).find((t) => t.calendarReminderId === id) ?? null;
  // Mark done applies to the occurrence this pane was opened on (the item's own date if not repeating).
  const doneDate = occurrenceDate ?? reminder.date;
  const occurrenceDone = (reminder.doneDates ?? []).includes(doneDate);

  const openLinkedTask = () => {
    if (!linkedTask) return;
    closePane();
    openTaskPane(linkedTask.id);
  };

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== reminder.title) updateReminder(id, { title: v });
    else if (!v) setTitle(reminder.title);
  };

  const saveNotes = () => {
    const v = notes.trim() || null;
    if (v !== reminder.notes) updateReminder(id, { notes: v });
  };

  // Deleting a series also asks about the dates taken out of it (services/calendarSeries.ts).
  const handleDelete = () => {
    const wasSeries = !!reminder.repeat;
    closeDialog(); deleteReminderWithCleanup(id); closePane();
    if (wasSeries) void afterSeriesDeleted('reminder', id);
  };
  const handleArchive = (reason: string) => { closeDialog(); archiveReminder(id, reason); closePane(); };

  const navigateToCrossAppRef = (ref: CrossAppRef) => {
    if (ref.type === 'list') { closePane(); openArtifactTarget('list', ref.id); return; }
    if (ref.type !== 'note') return;
    closePane();
    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().openNote(ref.id, ref.tabId);
  };

  const handleCrossAppRefsChange = (next: CrossAppRef[]) => {
    (reminder.crossAppRefs ?? [])
      .filter((r) => !next.some((n) => n.type === r.type && n.id === r.id))
      .forEach((ref) => unlinkCrossAppRef('reminder', id, ref));
    updateReminder(id, { crossAppRefs: next });
  };

  const saveRepeat = (on: boolean, freq: RepeatFreq, interval: number, endKind: RepeatConfig['endKind'], count: number, until: string) => {
    const r: RepeatConfig | null = on
      ? { freq, interval, endKind, count: endKind === 'count' ? count : null, until: endKind === 'until' ? until || null : null, exceptions: reminder.repeat?.exceptions }
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
          {reminder.archivedAt && <ArchivedBanner archivedAt={reminder.archivedAt} reason={reminder.archiveReason} />}

          {reminder.seriesId && (
            <SeriesLinkBar kind="reminder" id={id} seriesId={reminder.seriesId} seriesDate={reminder.seriesDate} repeats={!!reminder.repeat} />
          )}

          {reminder.repeat && (
            <RecurrenceScopeBar
              kind="reminder"
              id={id}
              baseDate={reminder.date}
              repeat={reminder.repeat}
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
            aria-label="Reminder title"
          />

          <textarea
            ref={notesRef}
            className={styles.notesInput}
            placeholder="Add notes... (Ctrl+L to insert a link)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={3}
          />

          <LinkedNoteAbstracts refs={reminder.crossAppRefs ?? []} onOpen={navigateToCrossAppRef} />

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
            <TimeInput
              className={styles.timeInput}
              value={reminder.time ?? ''}
              onChange={(v) => updateReminder(id, { time: v || null })}
            />
          </div>

          {!reminder.time && (
            <div className={styles.field}>
              <span className={styles.label}>Notify me</span>
              <AllDayNotifyField
                daysBefore={reminder.notifyDaysBefore ?? 1}
                atTime={reminder.notifyAtTime ?? '17:00'}
                onChange={(d, t) => updateReminder(id, { notifyDaysBefore: d, notifyAtTime: t })}
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={`${styles.label} ${styles.checkLabel}`}>
              <input
                type="checkbox"
                checked={reminder.important ?? false}
                onChange={(e) => updateReminder(id, { important: e.target.checked })}
              />
              ❗ Important — highlight on the calendar
            </label>
          </div>

          <div className={styles.field}>
            <label className={`${styles.label} ${styles.checkLabel}`}>
              <input
                type="checkbox"
                checked={(reminder.status ?? 'confirmed') === 'tentative'}
                onChange={(e) => updateReminder(id, { status: e.target.checked ? 'tentative' : 'confirmed' })}
              />
              Tentative — not confirmed yet, just a placeholder
            </label>
          </div>

          {/* ── Repeat ── */}
          <div className={styles.field}>
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
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Links</span>
            <LinksField links={reminder.links ?? []} onChange={(next) => updateReminder(id, { links: next })} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Linked items</span>
            <CrossAppRefPicker
              value={reminder.crossAppRefs ?? []}
              suggestFrom={reminder.title}
              newNoteTitle={newNoteTitleFor(reminder.title, reminder.date)}
              onChange={handleCrossAppRefsChange}
              onNavigate={navigateToCrossAppRef}
            />
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

        <ItemActionFooter
          archived={!!reminder.archivedAt}
          completed={linkedTask ? linkedTask.completed : occurrenceDone}
          onToggleComplete={linkedTask ? () => void toggleTaskCompletion(linkedTask.id) : () => setOccurrenceDone('reminder', id, doneDate, !occurrenceDone)}
          completeOptions={linkedTask ? taskCompletionOptions(linkedTask.id) : []}
          completeLabels={linkedTask ? undefined : { on: LABELS.itemActions.markDone, off: LABELS.itemActions.notDone }}
          deleteLabel={reminder.repeat ? 'Delete all occurrences' : `Delete ${LABELS.calendarItemKind.reminder.toLowerCase()}`}
          onArchive={() => setDialog('archive')}
          onRestore={() => restoreReminder(id)}
          onDelete={() => setDialog('delete')}
        />
      </aside>

      {dialog && (
        <ItemActionDialog
          mode={dialog}
          noun="reminder"
          itemTitle={reminder.title}
          archiveNote={reminder.repeat ? 'The whole repeating series is archived, not just this occurrence.' : undefined}
          alsoRemoves={reminder.repeat ? 'and all of its occurrences' : undefined}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onArchiveInstead={() => setDialog('archive')}
          onCancel={closeDialog}
        />
      )}
      {linkPrompt && (
        <MarkdownLinkPrompt
          anchorRect={linkPrompt.anchorRect}
          initialText={linkPrompt.initialText}
          onConfirm={confirmLink}
          onCancel={cancelLink}
        />
      )}
    </>
  );
}
