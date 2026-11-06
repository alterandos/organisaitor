import { ItemTypePaneField } from '@/components/ItemTypeField/ItemTypeField';
import { toggleTaskCompletion, taskCompletionOptions } from '@/services/taskCompletion';
import type { CalendarEventId } from '@/types';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { deleteEventWithCleanup, unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import { updateCalendarEventLinked } from '@/services/taskCalendarLinks';
import type { CrossAppRef } from '@/types';
import { SeriesScopeLine } from '@/components/RecurrenceScopeBar/SeriesScope';
import { useSeriesScope } from '@/components/RecurrenceScopeBar/useSeriesScope';
import { SeriesLinkBar } from '@/components/RecurrenceScopeBar/SeriesLinkBar';
import { ScheduleCommitBar } from '@/components/RecurrenceScopeBar/ScheduleCommitBar';
import { afterSeriesDeleted } from '@/services/calendarSeries';
import { ItemActionDialog } from '@/components/ItemActions/ItemActionDialog';
import { ItemActionFooter } from '@/components/ItemActions/ItemActionFooter';
import { DoneBanner } from '@/components/ItemActions/DoneBanner';
import itemStyles from '@/components/ItemActions/ItemActions.module.css';
import { ArchivedBanner } from '@/components/ItemActions/ArchivedBanner';
import { useItemActions } from '@/components/ItemActions/useItemActions';
import styles from './CalendarEventPane.module.css';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';
import { CloseIcon } from '@/components/Icons';
import { CalendarItemFields } from '@/components/CalendarItemForm/CalendarItemFields';

export function CalendarEventPane() {
  const paneResize = usePaneWidth('item-pane', { edge: 'left', min: 340, max: 820 });
  const editingId         = useUIStore((s) => s.editingCalendarEventId);
  const occurrenceDate    = useUIStore((s) => s.editingCalendarEventOccurrence);
  const closePane         = useUIStore((s) => s.closeCalendarEventPane);
  const openPane          = useUIStore((s) => s.openCalendarEventPane);
  const openTaskPane      = useUIStore((s) => s.openTaskPane);
  const eventsRecord      = useCalendarStore((s) => s.events);
  const tasksRecord       = useTaskStore((s) => s.tasks);

  const event = editingId ? eventsRecord[editingId as CalendarEventId] : null;
  // Which dates a change goes to (SeriesScope.tsx): every field below saves through it.
  const series = useSeriesScope({ kind: 'event', id: editingId, repeats: !!event?.repeat, occurrence: occurrenceDate,
    update: (itemId, patch: Parameters<typeof updateCalendarEventLinked>[1]) => updateCalendarEventLinked(itemId as CalendarEventId, patch), onSwitch: (newId) => openPane(newId) });
  const updateEvent = (itemId: CalendarEventId, patch: Parameters<typeof updateCalendarEventLinked>[1]) => series.update(itemId, patch);
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

  if (!event) return null;

  const id = event.id;
  // scheduledAt auto-creates this exact event (see Task.calendarEventId) — the event is the
  // correct primary entity (it's genuinely blocking calendar time), but the pane still surfaces
  // the link so the user isn't left guessing why an "event" they didn't create exists.
  const linkedTask = Object.values(tasksRecord).find((t) => t.calendarEventId === id) ?? null;

  const openLinkedTask = () => {
    if (!linkedTask) return;
    closePane();
    openTaskPane(linkedTask.id);
  };

  // Deleting a series also asks about the dates taken out of it (services/calendarSeries.ts).
  const handleDelete = () => {
    if (series.deleteScoped()) { closeDialog(); closePane(); return; }
    const wasSeries = !!event.repeat;
    closeDialog(); deleteEventWithCleanup(id); closePane();
    if (wasSeries) void afterSeriesDeleted('event', id);
  };
  const handleArchive = (reason: string) => { closeDialog(); archiveEvent(id, reason); closePane(); };

  const navigateToCrossAppRef = (ref: CrossAppRef) => {
    if (ref.type === 'list') { closePane(); openArtifactTarget('list', ref.id); return; }
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


  return (
    <>
      <div className={styles.overlay} onClick={closePane} />
      <aside style={paneResize.style} className={`${styles.pane} ${linkedTask?.completed ? itemStyles.donePane : ''}`}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <header className={styles.header}>
          <span className={styles.heading}>{LABELS.calendarItemKind.event}</span>
          {event.source && event.sourceAccount && (() => {
            const L = LABELS.calendarImport;
            const synced = event.source === 'google' || event.source === 'microsoft';
            const name = event.source === 'microsoft' ? 'Outlook' : 'Google';
            const deleted = (event.sourceRaw as { deleted?: boolean } | null)?.deleted;
            return (
              <span className={styles.sourceLine} title={synced ? (deleted ? L.deletedThere(name) : L.followsSource(name)) : undefined}>
                {deleted ? L.deletedShort(name)
                  : event.source === 'google' ? L.fromGoogle(event.sourceAccount)
                  : event.source === 'microsoft' ? L.fromOutlook(event.sourceAccount)
                  : L.fromFile(event.sourceAccount)}
              </span>
            );
          })()}
          <button className={styles.closeBtn} onClick={closePane} aria-label="Close"><CloseIcon /></button>
        </header>

        <div className={styles.body}>
          {event.archivedAt && <ArchivedBanner archivedAt={event.archivedAt} reason={event.archiveReason} />}
          {linkedTask?.completed && <DoneBanner doneAt={linkedTask.completedAt} reopenLabel={LABELS.itemActions.reopenTask} onReopen={() => void toggleTaskCompletion(linkedTask.id)} />}

          {event.seriesId && (
            <SeriesLinkBar kind="event" id={id} seriesId={event.seriesId} seriesDate={event.seriesDate} repeats={!!event.repeat} />
          )}

          <ScheduleCommitBar id={id} occurrenceDate={occurrenceDate} onSwitch={(newId) => openPane(newId)} onClose={closePane} />

          {event.repeat && (
            <SeriesScopeLine repeat={event.repeat} firstDate={event.date} occurrence={occurrenceDate} scope={series.scope} onScope={series.setScope} scheduleId={event.scheduleId ?? null} />
          )}

          {linkedTask && (
            <button type="button" className={styles.linkedTaskChip} onClick={openLinkedTask}>
              🕐 Linked task: {linkedTask.title}
            </button>
          )}

          <CalendarItemFields kind="event" item={event} savedId={id} occurrence={occurrenceDate} isTaskShadow={isTaskShadow}
            update={(patch) => updateEvent(id, patch as Parameters<typeof updateCalendarEventLinked>[1])}
            onRefsChange={handleCrossAppRefsChange} onNavigate={navigateToCrossAppRef}
            typeField={!isTaskShadow ? <ItemTypePaneField target={{ kind: 'event', id }} /> : undefined} />
        </div>

        <ItemActionFooter
          archived={!!event.archivedAt}
          canArchive={!isTaskShadow}
          completed={linkedTask?.completed}
          onToggleComplete={linkedTask ? () => void toggleTaskCompletion(linkedTask.id) : undefined}
          completeOptions={linkedTask ? taskCompletionOptions(linkedTask.id) : []}
          deleteLabel={event.repeat ? series.deleteLabel(LABELS.calendarSeries.deleteAll) : `Delete ${LABELS.calendarItemKind.event.toLowerCase()}`}
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
          alsoRemoves={event.repeat && series.scope === 'all' ? 'and all of its occurrences' : undefined}
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
