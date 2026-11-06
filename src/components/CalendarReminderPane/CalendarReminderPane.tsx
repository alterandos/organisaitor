import { toggleTaskCompletion, taskCompletionOptions } from '@/services/taskCompletion';
import type { CalendarReminderId } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { deleteReminderWithCleanup, unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import type { CrossAppRef } from '@/types';
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
import styles from './CalendarReminderPane.module.css';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';
import { CloseIcon } from '@/components/Icons';
import { CalendarItemFields } from '@/components/CalendarItemForm/CalendarItemFields';

export function CalendarReminderPane() {
  const paneResize = usePaneWidth('item-pane', { edge: 'left', min: 340, max: 820 });
  const editingId         = useUIStore((s) => s.editingCalendarReminderId);
  const occurrenceDate    = useUIStore((s) => s.editingCalendarReminderOccurrence);
  const closePane         = useUIStore((s) => s.closeCalendarReminderPane);
  const openPane          = useUIStore((s) => s.openCalendarReminderPane);
  const remindersRecord   = useCalendarStore((s) => s.reminders);
  const tasksRecord       = useTaskStore((s) => s.tasks);
  const openTaskPane      = useUIStore((s) => s.openTaskPane);

  const reminder = editingId ? remindersRecord[editingId as CalendarReminderId] : null;
  // Which dates a change goes to (SeriesScope.tsx): every field below saves through it.
  const series = useSeriesScope({ kind: 'reminder', id: editingId, repeats: !!reminder?.repeat, occurrence: occurrenceDate,
    update: (itemId, patch: Parameters<ReturnType<typeof useCalendarStore.getState>['updateReminder']>[1]) => useCalendarStore.getState().updateReminder(itemId as CalendarReminderId, patch), onSwitch: (newId) => openPane(newId as CalendarReminderId) });
  const updateReminder = (itemId: CalendarReminderId, patch: Parameters<ReturnType<typeof useCalendarStore.getState>['updateReminder']>[1]) => series.update(itemId, patch);
  const archiveReminder = useCalendarStore((s) => s.archiveReminder);
  const restoreReminder = useCalendarStore((s) => s.restoreReminder);
  const setOccurrenceDone = useCalendarStore((s) => s.setOccurrenceDone);
  const { dialog, setDialog, closeDialog } = useItemActions({
    itemKey:   editingId,
    archived:  !!reminder?.archivedAt,
    onClose:   closePane,
    onRestore: () => { if (editingId) restoreReminder(editingId as CalendarReminderId); },
  });


  if (!reminder) return null;

  const id = reminder.id;
  // A task's deadline is mirrored as a reminder (Task.calendarReminderId) — same link as the
  // event pane's, so the task can be opened or completed from here.
  const linkedTask = Object.values(tasksRecord).find((t) => t.calendarReminderId === id) ?? null;
  // Mark done applies to the occurrence this pane was opened on (the item's own date if not repeating).
  const doneDate = occurrenceDate ?? reminder.date;
  const occurrenceDone = (reminder.doneDates ?? []).includes(doneDate);
  const isDone = linkedTask ? linkedTask.completed : occurrenceDone;

  const openLinkedTask = () => {
    if (!linkedTask) return;
    closePane();
    openTaskPane(linkedTask.id);
  };



  // Deleting a series also asks about the dates taken out of it (services/calendarSeries.ts).
  const handleDelete = () => {
    if (series.deleteScoped()) { closeDialog(); closePane(); return; }
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

  return (
    <>
      <div className={styles.overlay} onClick={closePane} />
      <aside style={paneResize.style} className={`${styles.pane} ${isDone ? itemStyles.donePane : ''}`}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <header className={styles.header}>
          <span className={styles.heading}>{LABELS.calendarItemKind.reminder}</span>
          <button className={styles.closeBtn} onClick={closePane} aria-label="Close"><CloseIcon /></button>
        </header>

        <div className={styles.body}>
          {reminder.archivedAt && <ArchivedBanner archivedAt={reminder.archivedAt} reason={reminder.archiveReason} />}
          {isDone && (linkedTask
            ? <DoneBanner doneAt={linkedTask.completedAt} reopenLabel={LABELS.itemActions.reopenTask} onReopen={() => void toggleTaskCompletion(linkedTask.id)} />
            : <DoneBanner reopenLabel={LABELS.itemActions.notDone} onReopen={() => setOccurrenceDone('reminder', id, doneDate, false)} />)}

          {reminder.seriesId && (
            <SeriesLinkBar kind="reminder" id={id} seriesId={reminder.seriesId} seriesDate={reminder.seriesDate} repeats={!!reminder.repeat} />
          )}

          {reminder.repeat && (
            <SeriesScopeLine repeat={reminder.repeat} firstDate={reminder.date} occurrence={occurrenceDate} scope={series.scope} onScope={series.setScope} />
          )}

          {linkedTask && (
            <button type="button" className={styles.linkedTaskChip} onClick={openLinkedTask}>
              🕐 Linked task: {linkedTask.title}
            </button>
          )}

          <CalendarItemFields kind="reminder" item={reminder} savedId={id} occurrence={occurrenceDate}
            update={(patch) => updateReminder(id, patch as Parameters<typeof updateReminder>[1])}
            onRefsChange={handleCrossAppRefsChange} onNavigate={navigateToCrossAppRef} />
        </div>

        <ItemActionFooter
          archived={!!reminder.archivedAt}
          completed={isDone}
          onToggleComplete={linkedTask ? () => void toggleTaskCompletion(linkedTask.id) : () => setOccurrenceDone('reminder', id, doneDate, !occurrenceDone)}
          completeOptions={linkedTask ? taskCompletionOptions(linkedTask.id) : []}
          completeLabels={linkedTask ? undefined : { on: LABELS.itemActions.markDone, off: LABELS.itemActions.notDone }}
          deleteLabel={reminder.repeat ? series.deleteLabel(LABELS.calendarSeries.deleteAll) : `Delete ${LABELS.calendarItemKind.reminder.toLowerCase()}`}
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
          alsoRemoves={reminder.repeat && series.scope === 'all' ? 'and all of its occurrences' : undefined}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onArchiveInstead={() => setDialog('archive')}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}
