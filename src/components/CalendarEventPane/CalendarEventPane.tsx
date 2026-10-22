import { useState, useRef } from 'react';
import { EventTasksField } from '@/components/TaskLinks/EventTasksField';
import { DateInput } from '@/components/DateInput/DateInput';
import { NotifyRuleField } from '@/components/AllDayNotifyField/NotifyLead';
import { eventPatch, eventRule } from '@/utils/notifyRule';
import { toggleTaskCompletion, taskCompletionOptions } from '@/services/taskCompletion';
import type { CalendarEventId } from '@/types';
import { RepeatField } from '@/components/RepeatField/RepeatField';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { timeAddMinutes, computeLinkedEndTime, addDaysToIso } from '@/utils/date';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import { LinkedNoteAbstracts } from '@/components/LinkedNoteAbstracts/LinkedNoteAbstracts';
import { newNoteTitleFor } from '@/services/noteFromItem';
import { LinksField } from '@/components/LinksField/LinksField';
import { deleteEventWithCleanup, unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import { updateCalendarEventLinked as updateEvent } from '@/services/taskCalendarLinks';
import type { CrossAppRef } from '@/types';
import { RecurrenceScopeBar } from '@/components/RecurrenceScopeBar/RecurrenceScopeBar';
import { SeriesLinkBar } from '@/components/RecurrenceScopeBar/SeriesLinkBar';
import { afterSeriesDeleted } from '@/services/calendarSeries';
import { ItemActionDialog } from '@/components/ItemActions/ItemActionDialog';
import { ItemActionFooter } from '@/components/ItemActions/ItemActionFooter';
import { ArchivedBanner } from '@/components/ItemActions/ArchivedBanner';
import { useItemActions } from '@/components/ItemActions/useItemActions';
import { PICKABLE_EVENT_TYPES } from '@/config/calendarEventTypes';
import { TravelModePicker } from '@/components/TravelModePicker/TravelModePicker';
import styles from './CalendarEventPane.module.css';
import { useMarkdownHotkeys } from '@/hooks/useMarkdownHotkeys';
import { MarkdownLinkPrompt } from '@/components/MarkdownLinkPrompt/MarkdownLinkPrompt';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';
import { CloseIcon, OpenIcon } from '@/components/Icons';

export function CalendarEventPane() {
  const paneResize = usePaneWidth('item-pane', { edge: 'left', min: 340, max: 820 });
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

  const [title,          setTitle]          = useState(() => event?.title ?? '');
  const [notes,          setNotes]          = useState(() => event?.notes ?? '');
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const { linkPrompt, confirmLink, cancelLink } = useMarkdownHotkeys(notesRef, notes, setNotes);
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

  // Deleting a series also asks about the dates taken out of it (services/calendarSeries.ts).
  const handleDelete = () => {
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

  return (
    <>
      <div className={styles.overlay} onClick={closePane} />
      <aside style={paneResize.style} className={styles.pane}>
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

          {event.seriesId && (
            <SeriesLinkBar kind="event" id={id} seriesId={event.seriesId} seriesDate={event.seriesDate} repeats={!!event.repeat} />
          )}

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
            ref={notesRef}
            className={styles.notesInput}
            placeholder="Add notes... (Ctrl+B/I bold/italic, Ctrl+L to insert a link)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={3}
          />

          <LinkedNoteAbstracts refs={event.crossAppRefs ?? []} onOpen={navigateToCrossAppRef} />

          <div className={styles.field}>
            <span className={styles.label}>Date</span>
            <div className={styles.timeRow}>
              <DateInput
                className={styles.dateInput}
                value={event.date}
                onChange={(v) => {
                  updateEvent(id, { date: v });
                  if (event.endDate && event.endDate <= v) updateEvent(id, { endDate: null });
                }}
              />
              {(event.eventType ?? 'default') !== 'birthday' && (
                <>
                  <span className={styles.timeSep}>→</span>
                  <DateInput className={styles.dateInput} value={event.endDate ?? ''} min={event.date} onChange={(v) => updateEvent(id, { endDate: v || null })} />
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
                  {isLocationUrl(event.location) ? <OpenIcon /> : '🗺'}
                </a>
              )}
            </div>
          </div>

          {!isTaskShadow && (
            <div className={styles.field}>
              <span className={styles.label}>Event type</span>
              <div className={styles.typeRow}>
                {PICKABLE_EVENT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`${styles.typeBtn} ${(event.eventType ?? 'default') === t.value ? styles.typeBtnActive : ''}`}
                    onClick={() => updateEvent(id, { eventType: t.value, ...(t.value === 'travel' ? {} : { travelMode: null }) })}
                  >
                    {t.icon && <span>{t.icon}</span>}
                    {t.label}
                  </button>
                ))}
              </div>
              {event.eventType === 'travel' && (
                <TravelModePicker value={event.travelMode ?? null} onChange={(m) => updateEvent(id, { travelMode: m })} />
              )}
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

          {event.endDate && event.endDate > event.date && (
            <div className={styles.field}>
              <label className={`${styles.label} ${styles.checkLabel}`}>
                <input
                  type="checkbox"
                  checked={event.background ?? false}
                  onChange={(e) => updateEvent(id, { background: e.target.checked, color: e.target.checked ? event.color : null })}
                />
                🧳 Background — show as a thin line instead of a normal event (e.g. travel)
              </label>
              {event.background && (
                <ColorPicker palette="standard" value={event.color ?? null} onChange={(c) => updateEvent(id, { color: c })} />
              )}
            </div>
          )}

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

          <NotifyRuleField
            item="event"
            timed={(event.eventType ?? 'default') !== 'birthday' && !!event.startTime}
            rule={eventRule(event)}
            onChange={(r) => updateEvent(id, eventPatch(r))}
            labelClassName={`${styles.label} ${styles.checkLabel}`}
          />

          {/* ── Repeat — not offered on a task's scheduled event: the task itself doesn't repeat ── */}
          {!isTaskShadow && <div className={styles.field}>
            <RepeatField value={event.repeat ?? null} onChange={(r) => updateEvent(id, { repeat: r })} date={event.date} onDateChange={(d) => updateEvent(id, { date: d, ...(event.endDate && event.endDate <= d ? { endDate: null } : {}) })} labelClassName={`${styles.label} ${styles.checkLabel}`} />
          </div>}

          <div className={styles.field}>
            <span className={styles.label}>Links</span>
            <LinksField links={event.links ?? []} onChange={(next) => updateEvent(id, { links: next })} />
          </div>

          {!isTaskShadow && (
            <div className={styles.field}>
              <span className={styles.label}>{LABELS.taskLinks.event.heading}</span>
              <EventTasksField type="event" id={id} title={event.title} />
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>Linked items</span>
            <CrossAppRefPicker
              value={event.crossAppRefs ?? []}
              suggestFrom={event.title}
              newNoteTitle={newNoteTitleFor(event.title, event.date)}
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
          onToggleComplete={linkedTask ? () => void toggleTaskCompletion(linkedTask.id) : undefined}
          completeOptions={linkedTask ? taskCompletionOptions(linkedTask.id) : []}
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
