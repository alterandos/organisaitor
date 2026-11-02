import { useMemo, useRef, useState } from 'react';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import type { ContextMenuItem } from '@/contextMenu/types';
import { useLongPress } from '@/hooks/useLongPress';
import { usePlatform } from '@/hooks/usePlatform';
import { ActionSheet } from '@/components/ActionSheet/ActionSheet';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { LABELS } from '@/config/labels';
import { addDaysToIso, formatDate } from '@/utils/date';
import { boardWeeks, weekStart } from '@/utils/rhythms';
import { itemOccurrences, repeatingItemsOf, type ItemOccurrence, type ItemState } from '@/utils/itemOccurrences';
import { WORTH_FIELD } from '@/utils/subjectItems';
import { openOccurrence, skipOccurrence, toggleOccurrence, unskipOccurrence } from '@/services/itemOccurrences';
import type { Collection } from '@/types';
import styles from './RhythmBoard.module.css';

// An Endeavour's repeating classes and Work, week by week (docs/features/endeavours.md phase 7 (e)):
// weeks down the side, its items across the top, each date a cell. A click marks Work done or a
// class attended (or not again); right-click, or a long-press on a phone, skips the date, puts it
// back, or opens it, where its own details (a mark, a note) are given to that date alone. Only Work
// falls behind; an unmarked past class is shown as not attended.

const L = LABELS.itemBoard;
const MARK: Record<ItemState, string> = { done: '✓', attended: '✓', skipped: '–', behind: '!', missed: '', notMarked: '?', today: '', upcoming: '' };
const shortDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });

export function ItemBoard({ endeavour, today }: { endeavour: Collection; today: string }) {
  const events = useCalendarStore((s) => s.events);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const schedules = useScheduleStore((s) => s.schedules);
  const weeks = boardWeeks(today);
  const items = useMemo(() => repeatingItemsOf(endeavour.id, events, deadlines, schedules), [endeavour.id, events, deadlines, schedules]);
  const occurrences = useMemo(
    () => itemOccurrences(items, { events, deadlines }, weeks[0], addDaysToIso(weeks[weeks.length - 1], 6), today),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weeks follow today
    [items, events, deadlines, today],
  );
  if (items.length === 0) return null;
  const thisWeek = weekStart(today);
  const behind = occurrences.filter((o) => o.state === 'behind').length;
  const notMarked = occurrences.filter((o) => o.state === 'notMarked').length;

  return (
    <section className={styles.board} aria-label={L.title(endeavour.name)}>
      <div className={styles.head}>
        <h3 className={styles.title}>{L.title(endeavour.name)}</h3>
        {behind > 0 && <span className={styles.behindPill}>{L.behindCount(behind)}</span>}
        {notMarked > 0 && <span className={styles.notMarkedPill}>{L.notMarkedCount(notMarked)}</span>}
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.weekCol}>{L.week}</th>
              {items.map(({ kind, item }) => {
                const worth = kind === 'work' ? item.typeFields?.[WORTH_FIELD] : undefined;
                return (
                  <th key={item.id} scope="col">
                    <span className={styles.streamName}>
                      <span aria-hidden>{kind === 'work' ? ITEM_TYPE_ICON.deadline : ITEM_TYPE_ICON.event}</span> {item.title}{typeof worth === 'number' ? ` · ${worth}%` : ''}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w} className={w === thisWeek ? styles.thisWeek : undefined}>
                <th scope="row" className={styles.weekCol}>{w === thisWeek ? LABELS.rhythms.thisWeek : LABELS.rhythms.weekOf(formatDate(w + 'T00:00:00'))}</th>
                {items.map(({ item }) => {
                  const cell = occurrences.filter((o) => o.series.id === item.id && weekStart(o.date) === w);
                  return (
                    <td key={item.id}>
                      {cell.length === 0 ? <span className={styles.empty} aria-hidden>·</span> : cell.map((o) => <Cell key={o.key} o={o} />)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ o }: { o: ItemOccurrence }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { isAndroid } = usePlatform();
  const [sheet, setSheet] = useState(false);
  const work = o.kind === 'work';
  const isMarked = o.state === 'done' || o.state === 'attended';
  const actions = (): { id: string; label: string; run: () => void }[] => [
    { id: 'mark', label: isMarked ? (work ? L.notDone : L.notAttended) : (work ? L.markDone : L.markAttended), run: () => toggleOccurrence(o) },
    ...(o.copy ? [] : o.state === 'skipped'
      ? [{ id: 'unskip', label: L.unskip, run: () => unskipOccurrence(o) }]
      : [{ id: 'skip', label: L.skip, run: () => skipOccurrence(o) }]),
    { id: 'open', label: L.open, run: () => openOccurrence(o) },
  ];
  useContextMenuScope(ref, () => ({ kind: 'item-occurrence', items: () => actions().map((a): ContextMenuItem => ({ id: a.id, label: a.label, run: a.run })) }));
  useLongPress(ref, () => setSheet(true), isAndroid);
  const title = (o.copy ?? o.series).title;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`${styles.cell} ${styles[o.state]}`}
        aria-pressed={isMarked}
        title={L.cellTitle(title, formatDate(o.date + 'T00:00:00'), L.states[o.state])}
        onClick={() => { if (o.state !== 'skipped') toggleOccurrence(o); }}
      >
        <span className={styles.mark} aria-hidden>{MARK[o.state]}</span>
        {shortDay(o.date)}
      </button>
      {sheet && <ActionSheet title={title} onClose={() => setSheet(false)} items={actions().map((a) => ({ label: a.label, onSelect: a.run }))} />}
    </>
  );
}
