import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { NotePickerModal } from '@/components/NotePickerModal/NotePickerModal';
import { LinkPickerModal, type CalendarItemPick, type PickerStart } from '@/components/ItemPickerModal/LinkPickerModal';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { UnlinkIcon } from '@/components/Icons';
import { showToast } from '@/components/Toast/showToast';
import { LINK_TARGETS, addReference, removeReference, useLinkSnapshot, type LinkOwner, type ResolvedLink } from '@/services/linkTargets';
import { linkTaskToEvent, unlinkTaskFromEvent } from '@/services/eventTaskLinks';
import { createNoteForItem, type NotePlace } from '@/services/noteFromItem';
import { eventLinksOf, type EventLinkKind, type EventTargetType } from '@/utils/eventTaskLinks';
import { ITEM_LINK_KINDS } from '@/config/itemLinkKinds';
import { LABELS } from '@/config/labels';
import { formatDate } from '@/utils/date';
import type { CrossAppRef, CrossAppRefType, TaskId } from '@/types';
import styles from './LinkedItemsField.module.css';

// THE Linked items field (adopted 2026-11-10, docs/agent-tasks/08-linking-consolidation.md Task 3)
// for tasks, calendar items and lists: the person sees one field, so it's one component, where a
// task's notes and lists (references) and its calendar items (task links) had been three. Every
// link is a row the same way (agreed with the user 2026-11-10): its icon, its title, a line of
// context, how it relates when it carries a relation ("Prepares for"), and an unlink button. A
// click on the title opens it (services/linkTargets.ts → services/openItem.ts); a link whose item is
// gone (deleted, maybe in the Recycling Bin) is hidden until it's restored; a locked note or list
// shows as locked, never its text.
//
// The add buttons come from what the host offers: "+ Note", "+ New note" (make a note for this and
// link it), "+ List", "+ Calendar item" (a task only: a task link, how it relates chosen in the
// picker, and for a repeating item which dates). On an item that exists (`owner`) a link is made or
// removed at once, through the registry (unlinking a note takes the linked text out of it too);
// unlinking a calendar item offers Undo, since its dates were chosen. In a create form (no `owner`)
// the picks are held by the form (`onRefsChange`, `calendar.onPending`) and made on Save; a held
// series' link reopens the picker on its dates.
//
// Task links between tasks stay their own section (TaskLinksField: the user, 2026-11-07); a linked
// checklist's items show below this field (LinkedChecklists), not as link rows.

export type LinkOffer = 'note' | 'newNote' | 'list' | 'calendar';

interface Props {
  owner:          LinkOwner | null;
  refs:           CrossAppRef[];
  // A create form's held references (required without an owner).
  onRefsChange?:  (next: CrossAppRef[]) => void;
  // A task's calendar items: its own (with an owner) or a create form's held picks. `added` is
  // what was just picked (the add-task form fills its dates from it).
  calendar?:      { pending?: CalendarItemPick[]; onPending?: (next: CalendarItemPick[], added?: CalendarItemPick[]) => void };
  offers:         LinkOffer[];
  // Title of the item linking: its keywords order the pickers' suggestions.
  suggestFrom:    string;
  // "+ New note": the new note's title.
  newNoteTitle?:  string;
}

const CAL: CrossAppRefType[] = ['event', 'reminder', 'deadline'];
type Picking = 'note' | 'newNote' | 'list' | 'calendar' | null;

interface Row {
  key:       string;
  type:      CrossAppRefType;
  id:        string;
  item:      ResolvedLink;
  tabId?:    string;
  // A task link to a calendar item: how it relates and, for one date of a series, which.
  kind?:     EventLinkKind;
  occurrence?: string | null;
  ref?:      CrossAppRef;
  pick?:     CalendarItemPick;
  repeats?:  boolean;
}

export function LinkedItemsField({ owner, refs, onRefsChange, calendar, offers, suggestFrom, newNoteTitle }: Props) {
  const snap = useLinkSnapshot();
  const ownTask = useTaskStore((s) => (owner?.type === 'task' ? s.tasks[owner.id as TaskId] : undefined));
  const [picking, setPicking] = useState<Picking>(null);
  const [editing, setEditing] = useState<PickerStart | null>(null);
  const L = LABELS.linkedItems;

  // A task's calendar links: its own ItemLinks, or the form's held picks.
  const calendarLinks: CalendarItemPick[] = ownTask
    ? eventLinksOf(ownTask).map((l) => ({ type: l.targetType as EventTargetType, id: l.targetId, kind: l.kind as EventLinkKind, occurrence: l.occurrence ?? null }))
    : calendar?.pending ?? [];

  const rows: Row[] = [];
  for (const ref of refs) {
    const item = LINK_TARGETS[ref.type]?.resolve(snap, ref.id, ref.tabId);
    if (item) rows.push({ key: `ref:${ref.type}:${ref.id}:${ref.tabId ?? ''}`, type: ref.type, id: ref.id, item, tabId: ref.tabId, ref });
  }
  for (const pick of calendarLinks) {
    const item = LINK_TARGETS[pick.type].resolve(snap, pick.id);
    if (!item) continue;
    const raw = (pick.type === 'event' ? snap.events : pick.type === 'reminder' ? snap.reminders : snap.deadlines)[pick.id];
    rows.push({
      key: `cal:${pick.type}:${pick.id}:${pick.occurrence ?? ''}`, type: pick.type, id: pick.id, kind: pick.kind, occurrence: pick.occurrence,
      item: { ...item, context: pick.occurrence ? formatDate(pick.occurrence) : item.context }, pick, repeats: !!raw?.repeat,
    });
  }

  const setRefs = (next: CrossAppRef[]) => onRefsChange?.(next);
  const addRef = (ref: CrossAppRef) => (owner ? addReference(owner, ref) : setRefs([...refs, ref]));

  const addCalendar = (picks: CalendarItemPick[]) => {
    if (ownTask) for (const p of picks) linkTaskToEvent(ownTask.id, p.kind, p.type, p.id, p.occurrence);
    else calendar?.onPending?.([...calendarLinks, ...picks], picks);
  };
  const replaceSeries = (start: PickerStart, picks: CalendarItemPick[]) =>
    calendar?.onPending?.([...calendarLinks.filter((p) => !(p.type === start.type && p.id === start.id)), ...picks], picks);

  const remove = (row: Row) => {
    if (row.ref) {
      if (owner) removeReference(owner, row.ref);
      else setRefs(refs.filter((r) => r !== row.ref));
      return;
    }
    const pick = row.pick!;
    if (!ownTask) { calendar?.onPending?.(calendarLinks.filter((p) => p !== pick)); return; }
    const taskId = ownTask.id;
    unlinkTaskFromEvent(taskId, pick.type, pick.id, pick.occurrence);
    showToast({
      message: L.unlinked(row.item.title),
      actions: [{ label: L.undo, onClick: () => linkTaskToEvent(taskId, pick.kind, pick.type, pick.id, pick.occurrence) }],
    });
  };

  const open = (row: Row) => LINK_TARGETS[row.type].open(row.id, { tabId: row.tabId, occurrence: row.occurrence ?? undefined });
  // A held series reopens the picker on its dates, to change them.
  const editSeries = (row: Row) => {
    const same = calendarLinks.filter((p) => p.type === row.type && p.id === row.id);
    setEditing({ type: row.type as EventTargetType, id: row.id, kind: row.kind!, dates: same.some((p) => !p.occurrence) ? 'all' : same.map((p) => p.occurrence!) });
  };

  const addNewNote = (place: NotePlace) => {
    const title = newNoteTitle?.trim() || LABELS.newNoteFromItem.button;
    const ref = createNoteForItem(place, title);
    addRef(ref);
    const N = LABELS.newNoteFromItem;
    const noteTitle = place.kind === 'note' ? snap.notes[place.id]?.title || title : title;
    showToast({
      message: place.kind === 'note' ? N.createdTab(noteTitle) : N.created(title),
      actions: owner ? [{ label: N.open, onClick: () => LINK_TARGETS.note.open(ref.id, { tabId: ref.tabId }) }] : [],
    });
  };

  const linkedNoteIds = new Set(refs.filter((r) => r.type === 'note').map((r) => r.id));
  const linkedListIds = new Set(refs.filter((r) => r.type === 'list').map((r) => r.id));
  const keyOfPick = (p: CalendarItemPick) => `${p.type}:${p.id}:${p.occurrence ?? ''}`;

  const offerLabel: Record<LinkOffer, string> = {
    note: LABELS.listLinks.linkNote, newNote: LABELS.newNoteFromItem.button, list: LABELS.listLinks.linkList, calendar: LABELS.taskLinks.linkCalendar,
  };

  return (
    <div className={styles.root}>
      {rows.length > 0 && (
        <ul className={styles.rows}>
          {rows.map((row) => {
            const def = LINK_TARGETS[row.type];
            const opens = owner ? () => open(row) : row.repeats && row.pick ? () => editSeries(row) : null;
            const body = (
              <>
                <span className={styles.title}>{row.item.locked ? '🔒 ' : ''}{row.item.title}</span>
                {row.item.context && <span className={styles.context}>{row.item.context}</span>}
              </>
            );
            return (
              <li key={row.key} className={`${styles.row} ${row.item.done ? styles.done : ''} ${row.item.locked ? styles.locked : ''}`}>
                <span className={styles.icon} aria-hidden="true">{row.item.icon ? <ItemIcon icon={row.item.icon} fallback={def.icon} /> : def.icon}</span>
                {opens
                  ? <button type="button" className={styles.main} onClick={opens} title={owner ? (row.item.locked ? L.locked : L.open(def.label)) : LABELS.taskLinks.calendarEditDates}>{body}</button>
                  : <span className={styles.main}>{body}</span>}
                {row.kind && <span className={styles.relation}>{ITEM_LINK_KINDS[row.kind].icon} {ITEM_LINK_KINDS[row.kind].out}</span>}
                <button type="button" className={styles.unlink} onClick={() => remove(row)} aria-label={`${L.unlink}: ${row.item.title}`} title={L.unlink}><UnlinkIcon /></button>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.adds}>
        {offers.map((o) => (
          <button key={o} type="button" className={styles.addBtn} onClick={() => setPicking(o)}
            title={o === 'newNote' ? LABELS.newNoteFromItem.buttonTitle : undefined}>{offerLabel[o]}</button>
        ))}
      </div>

      {picking === 'note' && <NotePickerModal excludeIds={linkedNoteIds} suggestFrom={suggestFrom} onPick={(id, tabId) => addRef({ type: 'note', id, ...(tabId ? { tabId } : {}) })} onClose={() => setPicking(null)} />}
      {picking === 'newNote' && <NotePickerModal mode="place" excludeIds={linkedNoteIds} suggestFrom={suggestFrom} onPick={() => {}} onPlace={addNewNote} onClose={() => setPicking(null)} />}
      {picking === 'list' && <LinkPickerModal kinds={['list']} excludeIds={linkedListIds} suggestFrom={suggestFrom} onPick={([p]) => p && addRef({ type: 'list', id: p.id })} onClose={() => setPicking(null)} />}
      {picking === 'calendar' && (
        <LinkPickerModal kinds={CAL} relation="prepFor" suggestFrom={suggestFrom}
          excludeIds={new Set(calendarLinks.filter((p) => !p.occurrence).map((p) => p.id))}
          linked={new Set(calendarLinks.map(keyOfPick))}
          onPick={addCalendar} onClose={() => setPicking(null)} />
      )}
      {editing && (
        <LinkPickerModal kinds={CAL} relation={editing.kind} suggestFrom={suggestFrom} excludeIds={new Set()} linked={new Set()} start={editing}
          onPick={(picks) => replaceSeries(editing, picks)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
