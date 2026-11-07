import { useState } from 'react';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { ITEM_LINK_KINDS } from '@/config/itemLinkKinds';
import { LABELS } from '@/config/labels';
import { formatDate } from '@/utils/date';
import { eventLinksOf, type EventLinkKind, type EventTargetType } from '@/utils/eventTaskLinks';
import { linkTaskToEvent, unlinkTaskFromEvent } from '@/services/eventTaskLinks';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { CalendarItemPickerModal, type CalendarItemPick, type CalendarPickerStart } from '@/components/CalendarItemPickerModal/CalendarItemPickerModal';
import { UnlinkIcon } from '@/components/Icons';
import type { Task } from '@/types';
import styles from './TaskLinks.module.css';

const L = LABELS.taskLinks;

interface Row { type: EventTargetType; id: string; kind: EventLinkKind; occurrence: string | null }

// A task's links to calendar items (events, Reminders, Deadlines: ItemLinks, services/
// eventTaskLinks.ts), in the task's "Linked items" beside its notes and lists (2026-11-07; the
// other side is the calendar item's Tasks). With `task` the links are the task's own, made at once
// and opened in the calendar; with `pending` (the add-task form) they're held until the task is made,
// and a series' link reopens the picker on its dates to change them (2026-11-07).
// Its "+ Calendar item" sits in the Linked items row with "+ Note" and "+ List" (CrossAppRefPicker's
// `extraAdds`), so the host holds `picking`.
export function TaskCalendarLinks({ task, pending, onPending, suggestFrom, picking, onPicking }: {
  task?: Task;
  pending?: CalendarItemPick[];
  onPending?: (next: CalendarItemPick[], added?: CalendarItemPick[]) => void;
  suggestFrom: string;
  picking: boolean;
  onPicking: (open: boolean) => void;
}) {
  const events    = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);

  const rows: Row[] = task
    ? eventLinksOf(task).map((l) => ({ type: l.targetType as EventTargetType, id: l.targetId, kind: l.kind as EventLinkKind, occurrence: l.occurrence ?? null }))
    : pending ?? [];
  const itemOf = (r: Row) => (r.type === 'event' ? events : r.type === 'reminder' ? reminders : deadlines)[r.id as never] as { title: string } | undefined;
  const shown = rows.filter((r) => itemOf(r));
  // A pending series reopened: its dates in the picker, replaced on Link.
  const [editing, setEditing] = useState<CalendarPickerStart | null>(null);
  const repeats = (r: Row) => !!(itemOf(r) as { repeat?: unknown } | undefined)?.repeat;
  const editSeries = (r: Row) => {
    const same = (pending ?? []).filter((p) => p.type === r.type && p.id === r.id);
    setEditing({ type: r.type, id: r.id, kind: r.kind, dates: same.some((p) => !p.occurrence) ? 'all' : same.map((p) => p.occurrence!) });
  };
  const replaceSeries = (start: CalendarPickerStart, picks: CalendarItemPick[]) =>
    onPending?.([...(pending ?? []).filter((p) => !(p.type === start.type && p.id === start.id)), ...picks], picks);

  // Opens it where it lives: the calendar, at its date (as a note's link does), leaving the task.
  const open = (r: Row) => {
    useUIStore.getState().closeTaskPane();
    openArtifactTarget(r.type, r.id, r.occurrence ?? undefined);
  };
  // A link is to the item and, for one date of a series, that date: each date is its own row.
  const keyOf = (r: Row) => `${r.type}:${r.id}:${r.occurrence ?? ''}`;
  const remove = (r: Row) => {
    if (task) unlinkTaskFromEvent(task.id, r.type, r.id, r.occurrence);
    else onPending?.((pending ?? []).filter((p) => keyOf(p) !== keyOf(r)));
  };
  const add = (picks: CalendarItemPick[]) => {
    if (task) for (const p of picks) linkTaskToEvent(task.id, p.kind, p.type, p.id, p.occurrence);
    else onPending?.([...(pending ?? []), ...picks], picks);
  };

  return (
    <>
      {shown.length > 0 && (
        <ul className={styles.rows}>
          {shown.map((r) => {
            const label = `${ITEM_TYPE_ICON[r.type]} ${itemOf(r)!.title}${r.occurrence ? ` · ${formatDate(r.occurrence)}` : ''}`;
            return (
              <li key={keyOf(r)} className={styles.row}>
                <span className={styles.groupLabel}>{ITEM_LINK_KINDS[r.kind].icon} {ITEM_LINK_KINDS[r.kind].out}</span>
                {task
                  ? <button type="button" className={styles.other} onClick={() => open(r)} title={L.openInCalendar}>{label}</button>
                  : repeats(r)
                    ? <button type="button" className={styles.other} onClick={() => editSeries(r)} title={L.calendarEditDates}>{label}</button>
                    : <span className={styles.other}>{label}</span>}
                <button type="button" className={styles.remove} onClick={() => remove(r)} aria-label={L.removeLink} title={L.removeLink}><UnlinkIcon /></button>
              </li>
            );
          })}
        </ul>
      )}
      {picking && (
        <CalendarItemPickerModal
          suggestFrom={suggestFrom}
          excludeIds={new Set(rows.filter((r) => !r.occurrence).map((r) => r.id))}
          linked={new Set(rows.map(keyOf))}
          onPick={add}
          onClose={() => onPicking(false)}
        />
      )}
      {editing && (
        <CalendarItemPickerModal
          suggestFrom={suggestFrom}
          excludeIds={new Set()}
          linked={new Set()}
          start={editing}
          onPick={(picks) => replaceSeries(editing, picks)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
