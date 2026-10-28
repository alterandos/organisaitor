import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '@/store/taskStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useUIStore } from '@/store/uiStore';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import type { ContextMenuItem } from '@/contextMenu/types';
import { useLongPress } from '@/hooks/useLongPress';
import { usePlatform } from '@/hooks/usePlatform';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { ActionSheet } from '@/components/ActionSheet/ActionSheet';
import { FieldInput } from '@/components/FieldInput/FieldInput';
import { STREAM_KINDS } from '@/config/streamKinds';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { LABELS } from '@/config/labels';
import { addDaysToIso, formatDate } from '@/utils/date';
import { useFloatingPlacement, type AnchorBox } from '@/utils/floatingPlacement';
import { resolveItemType } from '@/utils/itemTypes';
import { BEHIND_DAYS, boardWeeks, rhythmOccurrences, rhythmStreams, tickIndex, weekStart, type Occurrence } from '@/utils/rhythms';
import { openOccurrenceNote, setTick, setTickField, toggleDone } from '@/services/rhythms';
import type { Collection } from '@/types';
import styles from './RhythmBoard.module.css';

// A rhythm's board (docs/features/endeavours.md screen B): weeks down the side, its streams across
// the top, each occurrence a cell. A click ticks it done (or not); right-click, or a long-press on
// a phone, offers skip, not needed, its note and its Type's fields. Each column says where that
// stream shows besides here.

const L = LABELS.rhythms;
// How a cell is drawn: as its state, except that one left untouched for longer than BEHIND_DAYS
// is "missed": let go quietly, no longer counted as behind (the same window as the home's panel).
type CellLook = Occurrence['state'] | 'missed';
const STATE_MARK: Record<CellLook, string> = {
  done: '✓', skipped: '–', notNeeded: '·', behind: '!', missed: '', today: '', upcoming: '',
};
const lookOf = (o: Occurrence, today: string): CellLook =>
  o.state === 'behind' && o.date < addDaysToIso(today, -BEHIND_DAYS) ? 'missed' : o.state;
const shortDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });

export function RhythmBoard({ rhythm, today }: { rhythm: Collection; today: string }) {
  const collections = useTaskStore((s) => s.collections);
  const entries = useTrackerStore((s) => s.entries);
  const schedules = useScheduleStore((s) => s.schedules);
  const ticks = useMemo(() => tickIndex(entries, collections), [entries, collections]);
  const weeks = boardWeeks(today);
  const streams = rhythmStreams(rhythm);
  const occurrences = useMemo(
    () => rhythmOccurrences(rhythm, schedules, ticks, weeks[0], addDaysToIso(weeks[weeks.length - 1], 6), today),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weeks follow today
    [rhythm, schedules, ticks, today],
  );
  const [fieldsFor, setFieldsFor] = useState<{ occurrence: Occurrence; anchor: AnchorBox } | null>(null);
  const thisWeek = weekStart(today);
  const behind = occurrences.filter((o) => lookOf(o, today) === 'behind').length;

  return (
    <section className={styles.board} aria-label={L.boardOf(rhythm.name)}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          <button type="button" className={styles.titleBtn} onClick={() => { const ui = useUIStore.getState(); ui.setActiveView('records'); ui.setActiveRoutine(rhythm.id); }}>
            {L.boardOf(rhythm.name)}
          </button>
        </h3>
        {behind > 0 && <span className={styles.behindPill}>{L.behindCount(behind)}</span>}
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.weekCol}>{L.week}</th>
              {streams.map((s) => (
                <th key={s.id} scope="col">
                  <span className={styles.streamName}><span aria-hidden>{STREAM_KINDS[s.kind].icon}</span> {s.label}</span>
                  <span className={styles.where}>
                    {s.show.calendar !== 'none' && <span title={`${L.calendar}: ${L.calendarModes[s.show.calendar]}`}>{ITEM_TYPE_ICON.event}</span>}
                    {s.show.tasks !== 'never' && <span title={`${L.tasks}: ${L.tasksModes[s.show.tasks]}`}>{ITEM_TYPE_ICON.task}</span>}
                    {s.show.notify && <span title={L.notify}>🔔</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w} className={w === thisWeek ? styles.thisWeek : undefined}>
                <th scope="row" className={styles.weekCol}>{w === thisWeek ? L.thisWeek : L.weekOf(formatDate(w + 'T00:00:00'))}</th>
                {streams.map((s) => {
                  const cell = occurrences.filter((o) => o.stream.id === s.id && weekStart(o.date) === w);
                  return (
                    <td key={s.id}>
                      {cell.length === 0 ? <span className={styles.empty} aria-hidden>·</span> : cell.map((o) => (
                        <OccurrenceCell key={o.key} o={o} look={lookOf(o, today)} onFields={(anchor) => setFieldsFor({ occurrence: o, anchor })} />
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fieldsFor && <FieldsPopover occurrence={fieldsFor.occurrence} anchor={fieldsFor.anchor} onClose={() => setFieldsFor(null)} />}
    </section>
  );
}

function OccurrenceCell({ o, look, onFields }: { o: Occurrence; look: CellLook; onFields: (anchor: AnchorBox) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { isAndroid } = usePlatform();
  // Where the cell was when it was long-pressed: the sheet's "Fill in…" opens there.
  const [sheet, setSheet] = useState<AnchorBox | null>(null);
  const typeName = useItemTypeStore((s) => (o.stream.typeId ? s.types[o.stream.typeId]?.name : undefined));
  const anchor = (): AnchorBox => { const r = ref.current!.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const actions = (at: () => AnchorBox): { id: string; label: string; run: () => void }[] => [
    { id: 'done', label: o.state === 'done' ? L.clear : L.markDone, run: () => toggleDone(o.rhythm.id, o.stream.id, o.date) },
    ...(o.state !== 'skipped' ? [{ id: 'skip', label: L.markSkipped, run: () => setTick(o.rhythm.id, o.stream.id, o.date, 'skipped') }] : []),
    ...(o.state !== 'notNeeded' ? [{ id: 'notNeeded', label: L.markNotNeeded, run: () => setTick(o.rhythm.id, o.stream.id, o.date, 'notNeeded') }] : []),
    ...(o.state === 'skipped' || o.state === 'notNeeded' ? [{ id: 'clear', label: L.clear, run: () => setTick(o.rhythm.id, o.stream.id, o.date, null) }] : []),
    { id: 'note', label: o.tick?.noteId ? L.openNote : L.makeNote, run: () => openOccurrenceNote(o.rhythm.id, o.stream.id, o.date) },
    ...(typeName ? [{ id: 'fields', label: `${L.fields} (${typeName})`, run: () => onFields(at()) }] : []),
  ];
  useContextMenuScope(ref, () => ({ kind: 'rhythm-occurrence', items: () => actions(anchor).map((a): ContextMenuItem => ({ id: a.id, label: a.label, run: a.run })) }));
  useLongPress(ref, () => setSheet(anchor()), isAndroid);
  const state = L.states[look];
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`${styles.cell} ${styles[look]}`}
        aria-pressed={o.state === 'done'}
        title={L.cellTitle(o.stream.label, formatDate(o.date + 'T00:00:00'), state)}
        onClick={() => toggleDone(o.rhythm.id, o.stream.id, o.date)}
      >
        <span className={styles.mark} aria-hidden>{STATE_MARK[look]}</span>
        {shortDay(o.date)}
        {o.tick?.noteId && <span aria-hidden>{ITEM_TYPE_ICON.note}</span>}
      </button>
      {sheet && (
        <ActionSheet title={o.stream.label} onClose={() => setSheet(null)} items={actions(() => sheet).map((a) => ({ label: a.label, onSelect: a.run }))} />
      )}
    </>
  );
}

// The occurrence's Type fields, saved as they change (a tick's values: services/rhythms.ts).
function FieldsPopover({ occurrence: o, anchor, onClose }: { occurrence: Occurrence; anchor: AnchorBox; onClose: () => void }) {
  const types = useItemTypeStore((s) => s.types);
  const collections = useTaskStore((s) => s.collections);
  const entries = useTrackerStore((s) => s.entries);
  const values = useMemo(() => tickIndex(entries, collections).get(o.key)?.fields ?? {}, [entries, collections, o.key]);
  const resolved = resolveItemType(types, o.stream.typeId);
  const { ref, style } = useFloatingPlacement<HTMLDivElement>(anchor, { align: 'start' });
  useEscapeClose(onClose);
  if (!resolved) return null;
  return createPortal(
    <>
      <div className={styles.backdrop} onMouseDown={onClose} aria-hidden />
      <div ref={ref} style={style} className={styles.popover} role="dialog" aria-label={`${o.stream.label}, ${formatDate(o.date + 'T00:00:00')}`}>
        <p className={styles.popTitle}>{o.stream.label} · {formatDate(o.date + 'T00:00:00')}</p>
        {resolved.fields.map((f) => (
          <label key={f.id} className={styles.popField}>
            {f.type !== 'boolean' && <span className={styles.popLabel}>{f.name}</span>}
            <FieldInput field={f} value={values[f.id]} onChange={(v) => setTickField(o.rhythm.id, o.stream.id, o.date, f.id, v)} />
          </label>
        ))}
      </div>
    </>,
    document.body,
  );
}
