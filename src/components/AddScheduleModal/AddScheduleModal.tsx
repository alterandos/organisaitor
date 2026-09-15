import { useState, useEffect, useRef, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { useTaskStore } from '@/store/taskStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { ScheduleWeekGridPreview, type PreviewEntry } from '@/components/ScheduleWeekGridPreview/ScheduleWeekGridPreview';
import { todayIso, formatDate, computeLinkedEndTime } from '@/utils/date';
import { expandScheduleBlock } from '@/utils/scheduleOccurrences';
import type { CollectionId, ScheduleBlock } from '@/types';
import styles from './AddScheduleModal.module.css';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// When a schedule has no end date, the "skip occurrences" checklist would otherwise try to list
// occurrences forever — capped to a manageable window; the checklist itself notes when it's capped.
const OCCURRENCE_LIST_CAP_DAYS = 120;

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// All occurrence dates for one block within the schedule's timeframe, ignoring its own
// exceptions (so the checklist can show every date and let exceptions drive the checked state)
// — reuses expandScheduleBlock by feeding it a copy of the block with exceptions cleared.
function computeAllOccurrenceDates(block: ScheduleBlock, scheduleStartDate: string, scheduleEndDate: string): string[] {
  const rangeStart = scheduleStartDate || block.intervalAnchor || todayIso();
  const rangeEnd = scheduleEndDate || addDaysToDateStr(rangeStart, OCCURRENCE_LIST_CAP_DAYS);
  return expandScheduleBlock(
    { ...block, exceptions: [] },
    { startDate: rangeStart, endDate: rangeEnd },
    rangeStart,
    rangeEnd
  );
}

interface BlockRow extends ScheduleBlock { expanded: boolean }

function blockToRow(b: ScheduleBlock): BlockRow {
  return { ...b, expanded: false };
}

function summarizeDays(days: number[]): string {
  if (days.length === 0) return 'No days selected';
  if (days.length === 7) return 'Every day';
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
  const addSchedule       = useScheduleStore((s) => s.addSchedule);
  const updateSchedule    = useScheduleStore((s) => s.updateSchedule);
  const deleteSchedule    = useScheduleStore((s) => s.deleteSchedule);

  const [name,         setName]         = useState('');
  const [color,        setColor]        = useState<string | null>(null);
  const [startDate,    setStartDate]    = useState('');
  const [endDate,      setEndDate]      = useState('');
  const [collectionId, setCollectionId] = useState<CollectionId | null>(null);
  const [blocks,       setBlocks]       = useState<BlockRow[]>([]);
  const [addingBlock,  setAddingBlock]  = useState(false);

  // New-block form
  const [newTitle,     setNewTitle]     = useState('');
  const [newDays,      setNewDays]      = useState<number[]>([]);
  const [newStart,     setNewStart]     = useState('09:00');
  const [newEnd,       setNewEnd]       = useState('10:00');
  const [newInterval,  setNewInterval]  = useState(1);
  const [newAnchor,    setNewAnchor]    = useState(todayIso());
  const [newLocation,  setNewLocation]  = useState('');

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (editingSchedule) {
      setName(editingSchedule.name);
      setColor(editingSchedule.color ?? null);
      setStartDate(editingSchedule.startDate ?? '');
      setEndDate(editingSchedule.endDate ?? '');
      setCollectionId(editingSchedule.collectionId);
      setBlocks(editingSchedule.blocks.map(blockToRow));
    } else {
      setName('');
      setColor(null);
      setStartDate('');
      setEndDate('');
      setCollectionId(null);
      setBlocks([]);
    }
    setAddingBlock(false);
  }, [editingSchedule?.id, isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeEditSchedule(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isVisible, closeEditSchedule]);

  if (!isVisible) return null;

  const toggleDay = (setter: (fn: (prev: number[]) => number[]) => void, day: number) => {
    setter((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  };

  const toggleExpand = (idx: number) =>
    setBlocks((prev) => prev.map((r, i) => (i === idx ? { ...r, expanded: !r.expanded } : r)));

  const updateBlockRow = (idx: number, patch: Partial<ScheduleBlock>) =>
    setBlocks((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const removeBlockRow = (idx: number) =>
    setBlocks((prev) => prev.filter((_, i) => i !== idx));

  const commitAddBlock = () => {
    const title = newTitle.trim();
    if (!title || newDays.length === 0) return;
    const block: ScheduleBlock = {
      id: nanoid(8),
      title,
      daysOfWeek: newDays,
      startTime: newStart,
      endTime: newEnd,
      location: newLocation.trim() || null,
      interval: newInterval,
      intervalAnchor: newAnchor || startDate || todayIso(),
      exceptions: [],
      notes: null,
    };
    setBlocks((prev) => [...prev, { ...block, expanded: false }]);
    setNewTitle(''); setNewDays([]); setNewStart('09:00'); setNewEnd('10:00');
    setNewInterval(1); setNewAnchor(startDate || todayIso()); setNewLocation('');
    setAddingBlock(false);
  };

  const openAddBlockForm = () => {
    setNewAnchor(startDate || todayIso());
    setAddingBlock(true);
  };

  // Clicking the grid pre-fills the "add block" form with the clicked day/time (snapped to the
  // half-hour) and opens it, instead of requiring the day toggles + TimeInputs to be set by hand —
  // the "far more efficient" entry point requested alongside the existing manual form.
  const handleGridClick = (day: number, startMinutes: number) => {
    setNewDays([day]);
    setNewStart(minutesToTimeStr(startMinutes));
    setNewEnd(minutesToTimeStr(Math.min(23 * 60 + 59, startMinutes + 60)));
    setNewAnchor(startDate || todayIso());
    setAddingBlock(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const payload = {
      name: trimmed,
      color,
      startDate: startDate || null,
      endDate: endDate || null,
      collectionId,
      blocks: blocks.map(({ expanded, ...b }) => b),
    };
    if (editingSchedule) {
      updateSchedule(editingSchedule.id, payload);
    } else {
      const id = addSchedule(payload);
      updateSchedule(id, { blocks: payload.blocks });
    }
    closeEditSchedule();
  };

  const handleDelete = () => {
    if (!editingSchedule) return;
    if (!window.confirm(`Delete "${editingSchedule.name}"? This removes all its blocks and any exceptions.`)) return;
    deleteSchedule(editingSchedule.id);
    closeEditSchedule();
  };

  const allCollections = Object.values(collectionsRecord);
  const previewEntries = useMemo(() => blocksToPreviewEntries(blocks, color), [blocks, color]);

  return (
    <>
      <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeEditSchedule(); }}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <span className={styles.title}>{isEditMode ? 'Edit Schedule' : 'New Schedule'}</span>
            <button className={styles.closeBtn} onClick={closeEditSchedule} aria-label="Close">×</button>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className={styles.body}>
            <div className={styles.field}>
              <label className={styles.label}>Name</label>
              <input
                className={styles.input}
                placeholder="e.g. Semester 1 Timetable"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Colour</span>
              <ColorPicker palette="standard" value={color} onChange={setColor} />
            </div>

            <div className={styles.dateRow}>
              <div className={styles.field}>
                <label className={styles.label}>Start date</label>
                <input type="date" className={styles.dateInput} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>End date</label>
                <input type="date" className={styles.dateInput} value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <p className={styles.hint}>Blocks only appear on the calendar within this date range — e.g. a semester's start/end.</p>

            {allCollections.length > 0 && (
              <div className={styles.field}>
                <span className={styles.label}>Endeavour</span>
                <CollectionPicker collections={allCollections} value={collectionId} onChange={setCollectionId} noneLabel="None" />
              </div>
            )}

            {/* ── Block editor ── */}
            <div className={styles.schemaSection}>
              <div className={styles.schemaHeader}>
                <span className={styles.label}>Blocks</span>
                <span className={styles.schemaMeta}>{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span>
              </div>

              {blocks.length === 0 && !addingBlock && (
                <p className={styles.noFields}>No blocks yet. Click the grid below to add one — e.g. "Algorithms Lecture", Mon/Wed/Fri, 10:00–11:00 — or use "+ Add block" for manual entry.</p>
              )}

              <ScheduleWeekGridPreview entries={previewEntries} onCellClick={handleGridClick} />
              <p className={styles.hint}>Click anywhere on the grid to start a new block at that day and time.</p>

              {blocks.map((row, idx) => (
                <div key={row.id} className={styles.fieldRow}>
                  <div className={styles.fieldRowTop}>
                    <div className={styles.fieldRowMeta}>
                      <span className={styles.fieldName}>{row.title}</span>
                      <span className={styles.fieldTypeBadge}>{summarizeDays(row.daysOfWeek)}</span>
                      <span className={styles.fieldTypeBadge}>{row.startTime}–{row.endTime}</span>
                      {row.interval > 1 && <span className={styles.fieldTypeBadge}>every {row.interval}wk</span>}
                    </div>
                    <div className={styles.fieldRowActions}>
                      <button type="button" className={styles.fieldActionBtn} onClick={() => toggleExpand(idx)} title="Configure">⚙</button>
                      <button type="button" className={`${styles.fieldActionBtn} ${styles.fieldActionBtnDelete}`} onClick={() => removeBlockRow(idx)} title="Remove">✕</button>
                    </div>
                  </div>

                  {row.expanded && (
                    <div className={styles.fieldExpanded}>
                      <div className={styles.fieldMini}>
                        <label className={styles.miniLabel}>Title</label>
                        <input className={styles.miniInput} value={row.title} onChange={(e) => updateBlockRow(idx, { title: e.target.value })} />
                      </div>
                      <div className={styles.fieldMini}>
                        <label className={styles.miniLabel}>Days</label>
                        <div className={styles.dayToggleRow}>
                          {DAY_LETTERS.map((letter, d) => (
                            <button
                              key={d}
                              type="button"
                              className={`${styles.dayToggle} ${row.daysOfWeek.includes(d) ? styles.dayToggleActive : ''}`}
                              onClick={() => updateBlockRow(idx, {
                                daysOfWeek: row.daysOfWeek.includes(d) ? row.daysOfWeek.filter((x) => x !== d) : [...row.daysOfWeek, d].sort((a, b) => a - b),
                              })}
                            >
                              {letter}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className={styles.timeRow}>
                        <TimeInput
                          className={styles.miniTimeInput}
                          value={row.startTime}
                          onChange={(v) => updateBlockRow(idx, { startTime: v, endTime: computeLinkedEndTime(v, row.endTime).time })}
                        />
                        <span className={styles.timeSep}>→</span>
                        <TimeInput className={styles.miniTimeInput} value={row.endTime} onChange={(v) => updateBlockRow(idx, { endTime: v })} />
                      </div>
                      <div className={styles.fieldMini}>
                        <label className={styles.miniLabel}>Repeats every</label>
                        <div className={styles.intervalRow}>
                          <input
                            className={styles.miniIntervalInput}
                            type="number" min={1} max={8}
                            value={row.interval}
                            onChange={(e) => updateBlockRow(idx, { interval: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <span>week{row.interval !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {row.interval > 1 && (
                        <div className={styles.fieldMini}>
                          <label className={styles.miniLabel}>First occurrence</label>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={row.intervalAnchor}
                            onChange={(e) => updateBlockRow(idx, { intervalAnchor: e.target.value })}
                          />
                          <p className={styles.miniHint}>The week containing this date counts as week 1 — e.g. set this to the second week of term for a block that starts every-other-week from week 2.</p>
                        </div>
                      )}
                      <div className={styles.fieldMini}>
                        <label className={styles.miniLabel}>Location (optional)</label>
                        <input className={styles.miniInput} value={row.location ?? ''} onChange={(e) => updateBlockRow(idx, { location: e.target.value || null })} />
                      </div>
                      <div className={styles.fieldMini}>
                        <label className={styles.miniLabel}>Skip occurrences</label>
                        {(() => {
                          const occurrenceDates = computeAllOccurrenceDates(row, startDate, endDate);
                          const exceptionSet = new Set(row.exceptions);
                          if (occurrenceDates.length === 0) {
                            return <p className={styles.miniHint}>No occurrences in range yet — set days and a date range first.</p>;
                          }
                          return (
                            <>
                              <div className={styles.occurrenceList}>
                                {occurrenceDates.map((date) => {
                                  const checked = !exceptionSet.has(date);
                                  return (
                                    <label key={date} className={styles.occurrenceRow}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => updateBlockRow(idx, {
                                          exceptions: checked
                                            ? [...row.exceptions, date]
                                            : row.exceptions.filter((d) => d !== date),
                                        })}
                                      />
                                      <span>{formatDate(date)}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              {!endDate && (
                                <p className={styles.miniHint}>Showing the next {OCCURRENCE_LIST_CAP_DAYS} days — add an end date above to see further ahead.</p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {addingBlock ? (
                <div className={styles.addFieldForm}>
                  <input
                    className={styles.miniInput}
                    placeholder="Block title, e.g. Algorithms Lecture"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    autoFocus
                  />
                  <div className={styles.fieldMini}>
                    <label className={styles.miniLabel}>Days</label>
                    <div className={styles.dayToggleRow}>
                      {DAY_LETTERS.map((letter, d) => (
                        <button
                          key={d}
                          type="button"
                          className={`${styles.dayToggle} ${newDays.includes(d) ? styles.dayToggleActive : ''}`}
                          onClick={() => toggleDay(setNewDays, d)}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.timeRow}>
                    <TimeInput
                      className={styles.miniTimeInput}
                      value={newStart}
                      onChange={(v) => { setNewStart(v); setNewEnd(computeLinkedEndTime(v, newEnd).time); }}
                    />
                    <span className={styles.timeSep}>→</span>
                    <TimeInput className={styles.miniTimeInput} value={newEnd} onChange={setNewEnd} />
                  </div>
                  <div className={styles.fieldMini}>
                    <label className={styles.miniLabel}>Repeats every</label>
                    <div className={styles.intervalRow}>
                      <input className={styles.miniIntervalInput} type="number" min={1} max={8} value={newInterval} onChange={(e) => setNewInterval(Math.max(1, Number(e.target.value) || 1))} />
                      <span>week{newInterval !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  {newInterval > 1 && (
                    <div className={styles.fieldMini}>
                      <label className={styles.miniLabel}>First occurrence</label>
                      <input type="date" className={styles.dateInput} value={newAnchor} onChange={(e) => setNewAnchor(e.target.value)} />
                      <p className={styles.hint}>The week containing this date counts as week 1 — e.g. set this to the second week of term for a block that starts every-other-week from week 2.</p>
                    </div>
                  )}
                  <div className={styles.fieldMini}>
                    <label className={styles.miniLabel}>Location (optional)</label>
                    <input className={styles.miniInput} placeholder="Room / building" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
                  </div>
                  <div className={styles.addFieldBtns}>
                    <button type="button" className={styles.addFieldCancelBtn} onClick={() => setAddingBlock(false)}>Cancel</button>
                    <button type="button" className={styles.addFieldConfirmBtn} onClick={commitAddBlock} disabled={!newTitle.trim() || newDays.length === 0}>Add block</button>
                  </div>
                </div>
              ) : (
                <button type="button" className={styles.addFieldBtn} onClick={openAddBlockForm}>+ Add block</button>
              )}
            </div>
          </form>

          <div className={styles.footer}>
            {isEditMode && <button type="button" className={styles.deleteBtn} onClick={handleDelete}>Delete</button>}
            <div className={styles.footerRight}>
              <button type="button" className={styles.cancelBtn} onClick={closeEditSchedule}>Cancel</button>
              <button type="button" className={styles.saveBtn} onClick={() => formRef.current?.requestSubmit()} disabled={!name.trim()}>
                {isEditMode ? 'Save changes' : 'Create schedule'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
