import { useState, useEffect, useRef, useMemo } from 'react';
import { PeriodEditor } from '@/components/PeriodField/PeriodEditor';
import { useTaskStore } from '@/store/taskStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { ScheduleWeekGridPreview, type PreviewEntry } from '@/components/ScheduleWeekGridPreview/ScheduleWeekGridPreview';
import { todayIso } from '@/utils/date';
import { createScheduleBlock } from '@/utils/scheduleBlocks';
import { scheduleItems, withItemRows } from '@/utils/scheduleItems';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import { dateUseOf, periodsFor } from '@/utils/datePeriods';
import { PeriodsField } from '@/components/PeriodsField/PeriodsField';
import { createScheduleWithItems, deleteScheduleWithItems, saveScheduleRows } from '@/services/schedules';
import type { CollectionId, DateUse, PeriodBreak, ScheduleBlock } from '@/types';
import styles from './AddScheduleModal.module.css';

const EMPTY_BREAKS: PeriodBreak[] = [];
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { CloseIcon, EditIcon, TrashIcon } from '@/components/Icons';
import { ScheduleBlockFields } from './ScheduleBlockFields';

const S = LABELS.scheduleEditor;
const DAY_LETTERS = LABELS.recurring.dayLetter;
interface BlockRow extends ScheduleBlock { expanded: boolean }

function blockToRow(b: ScheduleBlock): BlockRow {
  return { ...b, expanded: false };
}

function summarizeDays(days: number[]): string {
  if (days.length === 0) return S.noDays;
  if (days.length === 7) return S.everyDay;
  return [...days].sort((a, b) => a - b).map((d) => DAY_LETTERS[d]).join('');
}

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function blocksToPreviewEntries(blocks: BlockRow[], color: string | null): PreviewEntry[] {
  return blocks.map((b) => ({
    key: b.id,
    title: b.title,
    daysOfWeek: b.daysOfWeek,
    startTime: b.startTime,
    endTime: b.endTime,
    color,
  }));
}

export function AddScheduleModal() {
  const openModal        = useUIStore((s) => s.openModal);
  const editingSchedule   = useUIStore((s) => s.editingSchedule);
  const closeEditSchedule = useUIStore((s) => s.closeEditSchedule);

  const isVisible = openModal === 'add-schedule';
  const isEditMode = !!editingSchedule;

  const collectionsRecord = useTaskStore((s) => s.collections);
  const updateSchedule    = useScheduleStore((s) => s.updateSchedule);
  const events            = useCalendarStore((s) => s.events);

  const [name,         setName]         = useState(() => editingSchedule?.name ?? useUIStore.getState().createDraft ?? '');
  const [color,        setColor]        = useState<string | null>(() => editingSchedule?.color ?? null);
  // A new one's dates are its Endeavour's until changed (the user, 2026-11-07: its time off came
  // from the Endeavour but not its dates); null = not touched, shown and saved as the Endeavour's.
  const [ownStart,     setStartDate]    = useState<string | null>(() => (editingSchedule ? editingSchedule.startDate ?? '' : null));
  const [ownEnd,       setEndDate]      = useState<string | null>(() => (editingSchedule ? editingSchedule.endDate ?? '' : null));
  // A new timetable starts filed under the Endeavour chosen where it's made (an Endeavour's home, a filter).
  const [collectionId, setCollectionId] = useState<CollectionId | null>(() => (editingSchedule ? editingSchedule.collectionId ?? null : selectActiveCollectionId(useUIStore.getState()) as CollectionId | null));
  const inherited = collectionId ? effectivePeriod(collectionId, collectionsRecord) : null;
  // Under an Endeavour with named periods it chooses among them (utils/datePeriods.ts), followed
  // live: moving the semester's dates moves it. null = as its Endeavour.
  const periods = periodsFor(collectionId, collectionsRecord);
  const aboveUse = collectionId ? dateUseOf(collectionId, collectionsRecord) : null;
  const [periodUse, setPeriodUse] = useState<DateUse | null>(() => editingSchedule?.periodUse ?? null);
  // Its own dates even where there are periods to follow (the user, 2026-11-07): scheduleBounds
  // reads its own start and end whenever it follows no periods.
  const [ownDates, setOwnDates] = useState(() => !!editingSchedule && !editingSchedule.periodUse && !!(editingSchedule.startDate || editingSchedule.endDate));
  const byPeriods = periods.length > 0 && !ownDates;
  const startDate = ownStart ?? inherited?.period.start ?? '';
  const endDate = ownEnd ?? inherited?.period.end ?? '';
  // Its rows are its items, calendar events (docs/features/endeavours.md phase 7 (c)): read in as
  // rows when it opens, and written back on Save (services/schedules.ts).
  const [itemIds]                       = useState(() => new Set(editingSchedule ? scheduleItems(editingSchedule.id, useCalendarStore.getState().events).map((e) => e.id as string) : []));
  const [blocks,       setBlocks]       = useState<BlockRow[]>(() => editingSchedule ? withItemRows(editingSchedule, useCalendarStore.getState().events).blocks.map(blockToRow) : []);
  const [breaks,       setBreaks]       = useState<PeriodBreak[] | undefined>(() => editingSchedule?.breaks);
  const [showErrors,   setShowErrors]   = useState(false);
  const [addingBlock,  setAddingBlock]  = useState(false);
  // Scrolls a block's row into view right after it expands — both the edit button and clicking
  // a block in the grid preview go through this, so the edit panel is never left off-screen
  // requiring a manual scroll. A ref map (not a single ref) since there's one row per block.
  // requestAnimationFrame (rather than an effect keyed on some "just expanded" state) defers
  // just long enough for the setBlocks update above to commit and the expanded row's DOM to
  // exist, without adding another piece of state purely to trigger a one-off scroll.
  const blockRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollToBlock = (id: string) => {
    requestAnimationFrame(() => blockRowRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  // The block being added: a row like the others, in the same fields (ScheduleBlockFields), so
  // adding and editing a block can't drift apart again (2026-11-07).
  const blankRow = (anchor: string): ScheduleBlock => createScheduleBlock({ title: '', daysOfWeek: [], startTime: '09:00', endTime: '10:00', intervalAnchor: anchor });
  const [newRow, setNewRow] = useState<ScheduleBlock>(() => blankRow(todayIso()));

  const formRef = useRef<HTMLFormElement>(null);

  useEscapeClose(() => { closeEditSchedule(); }, isVisible);

  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isVisible, closeEditSchedule]);

  const previewEntries = useMemo(() => blocksToPreviewEntries(blocks, color), [blocks, color]);

  if (!isVisible) return null;

  const toggleExpand = (idx: number) => {
    const row = blocks[idx];
    if (row && !row.expanded) scrollToBlock(row.id);
    setBlocks((prev) => prev.map((r, i) => (i === idx ? { ...r, expanded: !r.expanded } : r)));
  };

  // Clicking a block in the grid preview (below) expands its row (if not already) and always
  // scrolls to it — unlike the ⚙ button's toggle, this never collapses an already-expanded row.
  const expandBlockAndScroll = (blockId: string) => {
    const idx = blocks.findIndex((r) => r.id === blockId);
    if (idx === -1) return;
    setBlocks((prev) => prev.map((r, i) => (i === idx ? { ...r, expanded: true } : r)));
    scrollToBlock(blockId);
  };

  const updateBlockRow = (idx: number, patch: Partial<ScheduleBlock>) =>
    setBlocks((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  // Drag-to-move / drag-to-resize in the grid preview below (ScheduleWeekGridPreview's
  // onBlockChange) — same underlying mechanism as CalendarView's week/day grids, applied here
  // to the block *template* itself (see CLAUDE.md "Calendar drag-to-move / resize").
  const handleBlockChange = (key: string, patch: { daysOfWeek?: number[]; startTime?: string; endTime?: string }) => {
    const idx = blocks.findIndex((r) => r.id === key);
    if (idx === -1) return;
    updateBlockRow(idx, patch);
  };

  const removeBlockRow = (idx: number) =>
    setBlocks((prev) => prev.filter((_, i) => i !== idx));

  const commitAddBlock = () => {
    if (!newRow.title.trim() || newRow.daysOfWeek.length === 0) return;
    setBlocks((prev) => [...prev, { ...newRow, title: newRow.title.trim(), intervalAnchor: newRow.intervalAnchor || startDate || todayIso(), expanded: false }]);
    setNewRow(blankRow(startDate || todayIso()));
    setAddingBlock(false);
  };

  const openAddBlockForm = () => {
    setNewRow((r) => ({ ...r, intervalAnchor: startDate || todayIso() }));
    setAddingBlock(true);
  };

  // Clicking the grid pre-fills the "add block" form with the clicked day/time (snapped to the
  // half-hour) and opens it, instead of requiring the day toggles + TimeInputs to be set by hand —
  // the "far more efficient" entry point requested alongside the existing manual form.
  const handleGridClick = (day: number, startMinutes: number) => {
    setNewRow((r) => ({ ...r, daysOfWeek: [day], startTime: minutesToTimeStr(startMinutes),
      endTime: minutesToTimeStr(Math.min(23 * 60 + 59, startMinutes + 60)), intervalAnchor: startDate || todayIso() }));
    setAddingBlock(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!byPeriods && Object.keys(breakErrors).length) { setShowErrors(true); return; }
    // By named periods, its dates are theirs, live: none of its own kept.
    const payload = byPeriods
      ? { name: trimmed, color, startDate: null, endDate: null, collectionId }
      : { name: trimmed, color, startDate: startDate || null, endDate: endDate || null, collectionId };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `expanded` is the editor's own, left off the row
    const rows = blocks.map(({ expanded, ...b }) => b);
    if (editingSchedule) {
      updateSchedule(editingSchedule.id, { ...payload, ...(byPeriods ? { breaks: undefined, periodUse } : { breaks, periodUse: null }) });
      saveScheduleRows(editingSchedule.id, rows);
    } else {
      const { id } = createScheduleWithItems(payload, []);
      if (byPeriods) { if (periodUse) updateSchedule(id, { periodUse }); } else if (breaks) updateSchedule(id, { breaks });
      saveScheduleRows(id, rows);
    }
    closeEditSchedule();
  };

  const handleDelete = async () => {
    if (!editingSchedule) return;
    if (!(await confirmDelete(S.noun, editingSchedule.name, S.deleteDetail, { empty: itemIds.size === 0 }))) return;
    deleteScheduleWithItems(editingSchedule.id);
    closeEditSchedule();
  };

  const allCollections = Object.values(collectionsRecord);
  const inheritedFrom = (inherited?.period.breaks.length || (ownStart === null && inherited?.period.start)) ? collectionsRecord[inherited!.from as CollectionId]?.name ?? null : null;
  const shownBreaks = breaks ?? inherited?.period.breaks ?? EMPTY_BREAKS;
  // A piece of time off with no name or dates gets a red note under it (CLAUDE.md "A form says what's missing").
  const breakErrors: Record<string, string> = Object.fromEntries([
    ...(startDate && endDate && endDate < startDate ? [['dates', LABELS.period.endBeforeStart] as [string, string]] : []),
    ...(breaks ?? []).flatMap((b, i): [string, string][] =>
      !b.label.trim() ? [[`break-${i}`, LABELS.period.breakNeeded]] : !b.from ? [[`break-${i}`, LABELS.period.breakDates]] : b.to && b.to < b.from ? [[`break-${i}`, LABELS.period.endBeforeStart]] : []),
  ]);
  // Dates taken out of an item ("only this one") show as changed in its skip list, not as skips.
  const changedDates = (itemId: string) => new Set(Object.values(events).filter((e) => e.seriesId === itemId && e.seriesDate).map((e) => e.seriesDate as string));

  return (
    <>
      <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeEditSchedule(); }}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <span className={styles.title}>{isEditMode ? S.editTitle : S.newTitle}</span>
            <button className={styles.closeBtn} onClick={closeEditSchedule} aria-label={S.close}><CloseIcon /></button>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className={styles.body}>
            <div className={styles.field}>
              <label className={styles.label}>{S.name}</label>
              <input
                className={styles.input}
                placeholder={S.namePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <span className={styles.label}>{S.colour}</span>
              <ColorPicker palette="standard" value={color} onChange={setColor} />
            </div>

            {/* Its dates and time off, in the one period editor (CLAUDE.md "One period editor"), open from the
                start. Under an Endeavour with time off it shows that Endeavour's; changing it gives the
                Schedule its own, and "Take …'s instead" goes back. */}
            <div className={styles.field} role="group" aria-label={LABELS.period.title}>
              <span className={styles.label}>{LABELS.period.title}</span>
              <p className={styles.hint}>{byPeriods ? LABELS.periods.scheduleHint : <>{S.datesHint} {LABELS.period.scheduleDates}</>}</p>
              {!byPeriods && (breaks === undefined || ownStart === null) && inheritedFrom && <p className={styles.hint}>{LABELS.period.scheduleInherited(inheritedFrom)}</p>}
              {byPeriods ? (
                <PeriodsField editable={false} inherited={periods} use={periodUse} onUse={setPeriodUse}
                  above={aboveUse ? { use: aboveUse.use, name: collectionsRecord[aboveUse.from as CollectionId]?.name ?? '' } : null}
                  fromName={(id) => collectionsRecord[id as CollectionId]?.name ?? ''} />
              ) : null}
              {byPeriods && (
                <button type="button" className={styles.addFieldBtn} onClick={() => { setOwnDates(true); setPeriodUse(null); }}>{LABELS.periods.scheduleOwnDates}</button>
              )}
              {!byPeriods && (
                <>
                <PeriodEditor
                  period={{ start: startDate || null, end: endDate || null, breaks: shownBreaks }}
                  errors={showErrors ? breakErrors : {}}
                  onChange={(p) => {
                    setStartDate(p.start ?? '');
                    setEndDate(p.end ?? '');
                    if (p.breaks !== shownBreaks) setBreaks(p.breaks);
                  }}
                />
                {ownDates && periods.length > 0 ? (
                  <button type="button" className={styles.addFieldBtn} onClick={() => { setOwnDates(false); setBreaks(undefined); setStartDate(null); setEndDate(null); }}>
                    {LABELS.periods.scheduleFollowPeriods(collectionsRecord[collectionId as CollectionId]?.name ?? LABELS.collection)}
                  </button>
                ) : (breaks !== undefined || ownStart !== null) && collectionId && inherited && (
                  <button type="button" className={styles.addFieldBtn} onClick={() => { setBreaks(undefined); setStartDate(null); setEndDate(null); }}>{LABELS.period.scheduleTakeBreaks}</button>
                )}
                </>
              )}
            </div>

            {allCollections.length > 0 && (
              <div className={styles.field}>
                <span className={styles.label}>{LABELS.collection}</span>
                <CollectionPicker collections={allCollections} value={collectionId} onChange={setCollectionId} noneLabel={S.none} />
              </div>
            )}

            {/* ── Block editor ── */}
            <div className={styles.schemaSection}>
              <div className={styles.schemaHeader}>
                <span className={styles.label}>{S.blocks}</span>
                <span className={styles.schemaMeta}>{S.blockCount(blocks.length)}</span>
              </div>

              {blocks.length === 0 && !addingBlock && (
                <p className={styles.noFields}>{S.empty}</p>
              )}

              <ScheduleWeekGridPreview entries={previewEntries} onCellClick={handleGridClick} onEntryClick={expandBlockAndScroll} onBlockChange={handleBlockChange} />
              <p className={styles.hint}>{S.gridHint}</p>

              {blocks.map((row, idx) => (
                <div key={row.id} ref={(el) => { blockRowRefs.current[row.id] = el; }} className={styles.fieldRow}>
                  <div className={styles.fieldRowTop}>
                    <div className={styles.fieldRowMeta}>
                      <span className={styles.fieldName}>{row.title}</span>
                      <span className={styles.fieldTypeBadge}>{summarizeDays(row.daysOfWeek)}</span>
                      <span className={styles.fieldTypeBadge}>{row.startTime}–{row.endTime}</span>
                      {row.interval > 1 && <span className={styles.fieldTypeBadge}>{S.everyWeeks(row.interval)}</span>}
                    </div>
                    <div className={styles.fieldRowActions}>
                      <button type="button" className={styles.fieldActionBtn} onClick={() => toggleExpand(idx)} title={S.edit} aria-label={S.edit} aria-expanded={row.expanded}><EditIcon width="1em" height="1em" /></button>
                      <button type="button" className={`${styles.fieldActionBtn} ${styles.fieldActionBtnDelete}`} onClick={() => removeBlockRow(idx)} title={S.remove} aria-label={S.remove}><TrashIcon width="1em" height="1em" /></button>
                    </div>
                  </div>

                  {row.expanded && (
                    <div className={styles.fieldExpanded}>
                      <ScheduleBlockFields row={row} onChange={(patch) => updateBlockRow(idx, patch)} startDate={startDate} endDate={endDate} changed={changedDates(row.id)} />
                    </div>
                  )}
                </div>
              ))}

              {addingBlock ? (
                <div className={styles.addFieldForm}>
                  <ScheduleBlockFields row={newRow} onChange={(patch) => setNewRow((r) => ({ ...r, ...patch }))} startDate={startDate} endDate={endDate} changed={new Set()} autoFocus />
                  <div className={styles.addFieldBtns}>
                    <button type="button" className={styles.addFieldCancelBtn} onClick={() => setAddingBlock(false)}>{S.cancel}</button>
                    <button type="button" className={styles.addFieldConfirmBtn} onClick={commitAddBlock} disabled={!newRow.title.trim() || newRow.daysOfWeek.length === 0}>{S.addBlock}</button>
                  </div>
                </div>
              ) : (
                <button type="button" className={styles.addFieldBtn} onClick={openAddBlockForm}>{S.addBlockLink}</button>
              )}
            </div>
          </form>

          <div className={styles.footer}>
            {isEditMode && <button type="button" className={styles.deleteBtn} onClick={handleDelete}>{S.delete}</button>}
            <div className={styles.footerRight}>
              <button type="button" className={styles.cancelBtn} onClick={closeEditSchedule}>{S.cancel}</button>
              <button type="button" className={styles.saveBtn} onClick={() => formRef.current?.requestSubmit()} disabled={!name.trim()}>
                {isEditMode ? S.save : S.create}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
