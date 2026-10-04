import { useState, useRef } from 'react';
import { toggleTaskCompletion, taskCompletionOptions } from '@/services/taskCompletion';
import type { CalendarDeadlineId, RepeatFreq, RepeatConfig } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { AllDayNotifyField } from '@/components/AllDayNotifyField/AllDayNotifyField';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import { LinksField } from '@/components/LinksField/LinksField';
import { deleteDeadlineWithCleanup, unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import type { CrossAppRef } from '@/types';
import { RecurrenceScopeBar } from '@/components/RecurrenceScopeBar/RecurrenceScopeBar';
import { ItemActionDialog } from '@/components/ItemActions/ItemActionDialog';
import { ItemActionFooter } from '@/components/ItemActions/ItemActionFooter';
import { ArchivedBanner } from '@/components/ItemActions/ArchivedBanner';
import { useItemActions } from '@/components/ItemActions/useItemActions';
import styles from './CalendarDeadlinePane.module.css';
import { useMarkdownHotkeys } from '@/hooks/useMarkdownHotkeys';
import { MarkdownLinkPrompt } from '@/components/MarkdownLinkPrompt/MarkdownLinkPrompt';

// Structurally close to CalendarReminderPane (same fields, same repeat/tentative/important
// machinery) — the one deliberate difference: the "Notify me" lead-time field is always shown
// and always the notification mechanism, even when a specific Time is set. A Reminder's
// notifyDaysBefore/notifyAtTime only applies when it has NO time (a timed Reminder notifies
// "at" the time instead) — a Deadline never notifies "at" anything, so that gate doesn't
// apply here; Time is purely informational (e.g. "due at 5pm").
export function CalendarDeadlinePane() {
  const editingId         = useUIStore((s) => s.editingCalendarDeadlineId);
  const occurrenceDate    = useUIStore((s) => s.editingCalendarDeadlineOccurrence);
  const closePane         = useUIStore((s) => s.closeCalendarDeadlinePane);
  const openPane          = useUIStore((s) => s.openCalendarDeadlinePane);
  const deadlinesRecord   = useCalendarStore((s) => s.deadlines);
  const updateDeadline    = useCalendarStore((s) => s.updateDeadline);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const tasksRecord       = useTaskStore((s) => s.tasks);
  const openTaskPane      = useUIStore((s) => s.openTaskPane);

  const deadline = editingId ? deadlinesRecord[editingId as CalendarDeadlineId] : null;
  const archiveDeadline = useCalendarStore((s) => s.archiveDeadline);
  const restoreDeadline = useCalendarStore((s) => s.restoreDeadline);
  const { dialog, setDialog, closeDialog } = useItemActions({
    itemKey:   editingId,
    archived:  !!deadline?.archivedAt,
    onClose:   closePane,
    onRestore: () => { if (editingId) restoreDeadline(editingId as CalendarDeadlineId); },
  });

  const repeat = deadline?.repeat ?? null;
  const [title,          setTitle]          = useState(() => deadline?.title ?? '');
  const [notes,          setNotes]          = useState(() => deadline?.notes ?? '');
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const { linkPrompt, confirmLink, cancelLink } = useMarkdownHotkeys(notesRef, notes, setNotes);
  const [repeatOn,       setRepeatOn]       = useState(!!repeat);
  const [repeatFreq,     setRepeatFreq]     = useState<RepeatFreq>(repeat?.freq ?? 'weekly');
  const [repeatInterval, setRepeatInterval] = useState(repeat?.interval ?? 1);
  const [repeatEndKind,  setRepeatEndKind]  = useState<RepeatConfig['endKind']>(repeat?.endKind ?? 'forever');
  const [repeatCount,    setRepeatCount]    = useState(repeat?.count ?? 10);
  const [repeatUntil,    setRepeatUntil]    = useState(repeat?.until ?? '');

  if (!deadline) return null;

  const id = deadline.id;
  const allCollections = Object.values(collectionsRecord);
  // A task's deadline is mirrored as a CalendarDeadline (Task.calendarDeadlineId) — same link
  // pattern as the event/reminder panes', so the task can be opened or completed from here.
  const linkedTask = Object.values(tasksRecord).find((t) => t.calendarDeadlineId === id) ?? null;

  const openLinkedTask = () => {
    if (!linkedTask) return;
    closePane();
    openTaskPane(linkedTask.id);
  };

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== deadline.title) updateDeadline(id, { title: v });
    else if (!v) setTitle(deadline.title);
  };

  const saveNotes = () => {
    const v = notes.trim() || null;
    if (v !== deadline.notes) updateDeadline(id, { notes: v });
  };

  const handleDelete = () => { closeDialog(); deleteDeadlineWithCleanup(id); closePane(); };
  const handleArchive = (reason: string) => { closeDialog(); archiveDeadline(id, reason); closePane(); };

  const navigateToCrossAppRef = (ref: CrossAppRef) => {
    if (ref.type === 'list') { closePane(); openArtifactTarget('list', ref.id); return; }
    if (ref.type !== 'note') return;
    closePane();
    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().openNote(ref.id, ref.tabId);
  };

  const handleCrossAppRefsChange = (next: CrossAppRef[]) => {
    (deadline.crossAppRefs ?? [])
      .filter((r) => !next.some((n) => n.type === r.type && n.id === r.id))
      .forEach((ref) => unlinkCrossAppRef('deadline', id, ref));
    updateDeadline(id, { crossAppRefs: next });
  };

  const saveRepeat = (on: boolean, freq: RepeatFreq, interval: number, endKind: RepeatConfig['endKind'], count: number, until: string) => {
    const r: RepeatConfig | null = on
      ? { freq, interval, endKind, count: endKind === 'count' ? count : null, until: endKind === 'until' ? until || null : null, exceptions: deadline.repeat?.exceptions }
      : null;
    updateDeadline(id, { repeat: r });
  };

  return (
    <>
      <div className={styles.overlay} onClick={closePane} />
      <aside className={styles.pane}>
        <header className={styles.header}>
          <span className={styles.heading}>{LABELS.calendarItemKind.deadline}</span>
          <button className={styles.closeBtn} onClick={closePane} aria-label="Close">×</button>
        </header>

        <div className={styles.body}>
          {deadline.archivedAt && <ArchivedBanner archivedAt={deadline.archivedAt} reason={deadline.archiveReason} />}

          {deadline.repeat && (
            <RecurrenceScopeBar
              kind="deadline"
              id={id}
              baseDate={deadline.date}
              repeat={deadline.repeat}
              occurrenceDate={occurrenceDate}
              onClose={closePane}
              onSwitch={(newId) => openPane(newId)}
            />
          )}

          {linkedTask && (
            <button type="button" className={styles.linkedTaskChip} onClick={openLinkedTask}>
              🚩 Linked task: {linkedTask.title}
            </button>
          )}

          <input
            className={styles.titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            aria-label="Deadline title"
          />

          <textarea
            ref={notesRef}
            className={styles.notesInput}
            placeholder="Add notes... (Ctrl+B/I bold/italic, Ctrl+L to insert a link)"
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
              value={deadline.date}
              onChange={(e) => updateDeadline(id, { date: e.target.value })}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Time (optional)</span>
            <TimeInput
              className={styles.timeInput}
              value={deadline.time ?? ''}
              onChange={(v) => updateDeadline(id, { time: v || null })}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Notify me</span>
            <AllDayNotifyField
              daysBefore={deadline.notifyDaysBefore ?? 1}
              atTime={deadline.notifyAtTime ?? '17:00'}
              onChange={(d, t) => updateDeadline(id, { notifyDaysBefore: d, notifyAtTime: t })}
            />
            <p className={styles.repeatSmall}>A Deadline only ever notifies before it's due, never at the moment itself — this applies even if you set a Time above.</p>
          </div>

          <div className={styles.field}>
            <label className={`${styles.label} ${styles.checkLabel}`}>
              <input
                type="checkbox"
                checked={deadline.important ?? false}
                onChange={(e) => updateDeadline(id, { important: e.target.checked })}
              />
              ❗ Important — highlight on the calendar
            </label>
          </div>

          <div className={styles.field}>
            <label className={`${styles.label} ${styles.checkLabel}`}>
              <input
                type="checkbox"
                checked={(deadline.status ?? 'confirmed') === 'tentative'}
                onChange={(e) => updateDeadline(id, { status: e.target.checked ? 'tentative' : 'confirmed' })}
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
            <LinksField links={deadline.links ?? []} onChange={(next) => updateDeadline(id, { links: next })} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Linked items</span>
            <CrossAppRefPicker
              value={deadline.crossAppRefs ?? []}
              suggestFrom={deadline.title}
              onChange={handleCrossAppRefsChange}
              onNavigate={navigateToCrossAppRef}
            />
          </div>

          {allCollections.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>{LABELS.collection}</span>
              <CollectionPicker
                collections={allCollections}
                value={deadline.collectionId}
                onChange={(cid) => updateDeadline(id, { collectionId: cid })}
                noneLabel={`No ${LABELS.collection}`}
              />
            </div>
          )}
        </div>

        <ItemActionFooter
          archived={!!deadline.archivedAt}
          completed={linkedTask?.completed}
          onToggleComplete={linkedTask ? () => void toggleTaskCompletion(linkedTask.id) : undefined}
          completeOptions={linkedTask ? taskCompletionOptions(linkedTask.id) : []}
          deleteLabel={deadline.repeat ? 'Delete all occurrences' : `Delete ${LABELS.calendarItemKind.deadline.toLowerCase()}`}
          onArchive={() => setDialog('archive')}
          onRestore={() => restoreDeadline(id)}
          onDelete={() => setDialog('delete')}
        />
      </aside>

      {dialog && (
        <ItemActionDialog
          mode={dialog}
          noun="deadline"
          itemTitle={deadline.title}
          archiveNote={deadline.repeat ? 'The whole repeating series is archived, not just this occurrence.' : undefined}
          alsoRemoves={deadline.repeat ? 'and all of its occurrences' : undefined}
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
