import { ItemTypePaneField } from '@/components/ItemTypeField/ItemTypeField';
import { toggleTaskCompletion, taskCompletionOptions } from '@/services/taskCompletion';
import type { CalendarDeadlineId } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { deleteDeadlineWithCleanup } from '@/services/crossAppLinkCleanup';
import { SeriesScopeLine } from '@/components/RecurrenceScopeBar/SeriesScope';
import { useSeriesScope } from '@/components/RecurrenceScopeBar/useSeriesScope';
import { SeriesLinkBar } from '@/components/RecurrenceScopeBar/SeriesLinkBar';
import { afterSeriesDeleted } from '@/services/calendarSeries';
import { ItemActionDialog } from '@/components/ItemActions/ItemActionDialog';
import { ItemActionFooter } from '@/components/ItemActions/ItemActionFooter';
import { DoneBanner } from '@/components/ItemActions/DoneBanner';
import itemStyles from '@/components/ItemActions/ItemActions.module.css';
import { ArchivedBanner } from '@/components/ItemActions/ArchivedBanner';
import { useItemActions } from '@/components/ItemActions/useItemActions';
import styles from './CalendarDeadlinePane.module.css';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';
import { CloseIcon } from '@/components/Icons';
import { CalendarItemFields } from '@/components/CalendarItemForm/CalendarItemFields';

// Structurally close to CalendarReminderPane (same fields, same repeat/tentative/important
// machinery) — the one deliberate difference: the "Notify me" lead-time field is always shown
// and always the notification mechanism, even when a specific Time is set. A Reminder's
// notifyDaysBefore/notifyAtTime only applies when it has NO time (a timed Reminder notifies
// "at" the time instead) — a Deadline never notifies "at" anything, so that gate doesn't
// apply here; Time is purely informational (e.g. "due at 5pm").
export function CalendarDeadlinePane() {
  const paneResize = usePaneWidth('item-pane', { edge: 'left', min: 340, max: 820 });
  const editingId         = useUIStore((s) => s.editingCalendarDeadlineId);
  const occurrenceDate    = useUIStore((s) => s.editingCalendarDeadlineOccurrence);
  const closePane         = useUIStore((s) => s.closeCalendarDeadlinePane);
  const openPane          = useUIStore((s) => s.openCalendarDeadlinePane);
  const deadlinesRecord   = useCalendarStore((s) => s.deadlines);
  const tasksRecord       = useTaskStore((s) => s.tasks);
  const openTaskPane      = useUIStore((s) => s.openTaskPane);

  const deadline = editingId ? deadlinesRecord[editingId as CalendarDeadlineId] : null;
  // Which dates a change goes to (SeriesScope.tsx): every field below saves through it.
  const series = useSeriesScope({ kind: 'deadline', id: editingId, repeats: !!deadline?.repeat, occurrence: occurrenceDate,
    update: (itemId, patch: Parameters<ReturnType<typeof useCalendarStore.getState>['updateDeadline']>[1]) => useCalendarStore.getState().updateDeadline(itemId as CalendarDeadlineId, patch), onSwitch: (newId) => openPane(newId as CalendarDeadlineId) });
  const updateDeadline = (itemId: CalendarDeadlineId, patch: Parameters<ReturnType<typeof useCalendarStore.getState>['updateDeadline']>[1]) => series.update(itemId, patch);
  const archiveDeadline = useCalendarStore((s) => s.archiveDeadline);
  const restoreDeadline = useCalendarStore((s) => s.restoreDeadline);
  const setOccurrenceDone = useCalendarStore((s) => s.setOccurrenceDone);
  const { dialog, setDialog, closeDialog } = useItemActions({
    itemKey:   editingId,
    archived:  !!deadline?.archivedAt,
    onClose:   closePane,
    onRestore: () => { if (editingId) restoreDeadline(editingId as CalendarDeadlineId); },
  });


  if (!deadline) return null;

  const id = deadline.id;
  // A task's deadline is mirrored as a CalendarDeadline (Task.calendarDeadlineId) — same link
  // pattern as the event/reminder panes', so the task can be opened or completed from here.
  const linkedTask = Object.values(tasksRecord).find((t) => t.calendarDeadlineId === id) ?? null;
  // Mark done applies to the occurrence this pane was opened on (the item's own date if not repeating).
  const doneDate = occurrenceDate ?? deadline.date;
  const occurrenceDone = (deadline.doneDates ?? []).includes(doneDate);
  const isDone = linkedTask ? linkedTask.completed : occurrenceDone;

  const openLinkedTask = () => {
    if (!linkedTask) return;
    closePane();
    openTaskPane(linkedTask.id);
  };



  // Deleting a series also asks about the dates taken out of it (services/calendarSeries.ts).
  const handleDelete = () => {
    if (series.deleteScoped()) { closeDialog(); closePane(); return; }
    const wasSeries = !!deadline.repeat;
    closeDialog(); deleteDeadlineWithCleanup(id); closePane();
    if (wasSeries) void afterSeriesDeleted('deadline', id);
  };
  const handleArchive = (reason: string) => { closeDialog(); archiveDeadline(id, reason); closePane(); };


  return (
    <>
      <div className={styles.overlay} onClick={closePane} />
      <aside style={paneResize.style} className={`${styles.pane} ${isDone ? itemStyles.donePane : ''}`}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <header className={styles.header}>
          <span className={styles.heading}>{LABELS.calendarItemKind.deadline}</span>
          <button className={styles.closeBtn} onClick={closePane} aria-label="Close"><CloseIcon /></button>
        </header>

        <div className={styles.body}>
          {deadline.archivedAt && <ArchivedBanner archivedAt={deadline.archivedAt} reason={deadline.archiveReason} />}
          {isDone && (linkedTask
            ? <DoneBanner doneAt={linkedTask.completedAt} reopenLabel={LABELS.itemActions.reopenTask} onReopen={() => void toggleTaskCompletion(linkedTask.id)} />
            : <DoneBanner reopenLabel={LABELS.itemActions.notDone} onReopen={() => setOccurrenceDone('deadline', id, doneDate, false)} />)}

          {deadline.seriesId && (
            <SeriesLinkBar kind="deadline" id={id} seriesId={deadline.seriesId} seriesDate={deadline.seriesDate} repeats={!!deadline.repeat} />
          )}

          {deadline.repeat && (
            <SeriesScopeLine repeat={deadline.repeat} firstDate={deadline.date} occurrence={occurrenceDate} scope={series.scope} onScope={series.setScope} />
          )}

          {linkedTask && (
            <button type="button" className={styles.linkedTaskChip} onClick={openLinkedTask}>
              🚩 Linked task: {linkedTask.title}
            </button>
          )}

          <CalendarItemFields kind="deadline" item={deadline} savedId={id} occurrence={occurrenceDate}
            update={(patch) => updateDeadline(id, patch as Parameters<typeof updateDeadline>[1])} hasLinkedTask={!!linkedTask}
            typeField={deadline.deadlineType !== 'task' ? <ItemTypePaneField target={{ kind: 'deadline', id }} /> : undefined} />
        </div>

        <ItemActionFooter
          archived={!!deadline.archivedAt}
          completed={isDone}
          onToggleComplete={linkedTask ? () => void toggleTaskCompletion(linkedTask.id) : () => setOccurrenceDone('deadline', id, doneDate, !occurrenceDone)}
          completeOptions={linkedTask ? taskCompletionOptions(linkedTask.id) : []}
          completeLabels={linkedTask ? undefined : { on: LABELS.itemActions.markDone, off: LABELS.itemActions.notDone }}
          deleteLabel={deadline.repeat ? series.deleteLabel(LABELS.calendarSeries.deleteAll) : `Delete ${LABELS.calendarItemKind.deadline.toLowerCase()}`}
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
          alsoRemoves={deadline.repeat && series.scope === 'all' ? 'and all of its occurrences' : undefined}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onArchiveInstead={() => setDialog('archive')}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}
