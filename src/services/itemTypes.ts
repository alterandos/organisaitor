import { nanoid } from 'nanoid';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { trashedBy, deleteForever } from '@/services/trash';
import { showToast } from '@/components/Toast/showToast';
import { makeItemLink } from '@/utils/taskLinks';
import { now } from '@/utils/date';
import { partDue, resolveItemType } from '@/utils/itemTypes';
import { STARTER_SETS, type StarterSet } from '@/config/typeStarters';
import { LABELS } from '@/config/labels';
import type { CollectionId, CalendarDeadlineId, CalendarEventId, ItemTypeId, TagId, TaskId, TypeableKind, TypedItem } from '@/types';

// Giving items a Type, making a Type's parts, the starter sets, and turning a tag into a Type
// (docs/features/endeavours.md phase 3). The rules are utils/itemTypes.ts; every form and pane
// that sets an item's Type comes here, so the item and its parts are made the same way everywhere.

const L = LABELS.itemTypes;

export type TypedTarget =
  | { kind: 'task';     id: TaskId }
  | { kind: 'event';    id: CalendarEventId }
  | { kind: 'deadline'; id: CalendarDeadlineId };

interface TargetInfo { title: string; date: string | null; collectionId: string | null; typed: TypedItem }

function targetInfo(t: TypedTarget): TargetInfo | null {
  if (t.kind === 'task') {
    const x = useTaskStore.getState().tasks[t.id];
    return x ? { title: x.title, date: x.deadline ?? x.scheduledAt, collectionId: x.collectionId, typed: x } : null;
  }
  const cal = useCalendarStore.getState();
  const x = t.kind === 'event' ? cal.events[t.id] : cal.deadlines[t.id];
  return x ? { title: x.title, date: x.date, collectionId: x.collectionId, typed: x } : null;
}

// Sets (or, with null, clears) an item's Type and its field values. Values of fields the new Type
// doesn't have are kept, so changing the Type back loses nothing.
export function setItemType(t: TypedTarget, typeId: ItemTypeId | null, values?: Record<string, unknown>): void {
  const info = targetInfo(t);
  if (!info) return;
  const patch: TypedItem = { typeId, typeFields: { ...(info.typed.typeFields ?? {}), ...(values ?? {}) } };
  if (t.kind === 'task') useTaskStore.getState().updateTask(t.id, patch);
  else if (t.kind === 'event') useCalendarStore.getState().updateEvent(t.id, patch);
  else useCalendarStore.getState().updateDeadline(t.id, patch);
}

export function setItemTypeField(t: TypedTarget, fieldId: string, value: unknown): void {
  const info = targetInfo(t);
  if (!info || info.typed.typeId === undefined) return;
  setItemType(t, info.typed.typeId ?? null, { [fieldId]: value });
}

// Gives a newly made item its Type and makes the chosen parts (all of them when `partIds` is left
// out). A part is a task, dated from the item: before it for a task part (a sub-task of a task, or
// "preparation for" an event or a Deadline, so it moves when that moves), after it for a follow-up.
// Nothing is made without a date to count from. Returns the parts made.
export function applyItemType(t: TypedTarget, typeId: ItemTypeId, values: Record<string, unknown>, partIds?: string[]): TaskId[] {
  setItemType(t, typeId, values);
  const resolved = resolveItemType(useItemTypeStore.getState().types, typeId);
  const info = targetInfo(t);
  if (!resolved || !info?.date) return [];
  const ts = now();
  const made: TaskId[] = [];
  for (const part of resolved.parts) {
    if (partIds && !partIds.includes(part.id)) continue;
    const linkKind = part.kind === 'task' ? 'prepFor' : 'followUpOf';
    made.push(addTaskWithCalendar({
      title:        L.partItemTitle(part.title, info.title),
      deadline:     partDue(part, info.date),
      collectionId: info.collectionId as CollectionId | null,
      parentId:     t.kind === 'task' && part.kind === 'task' ? t.id : null,
      itemLinks:    t.kind === 'task'
        ? (part.kind === 'followUp' ? [makeItemLink('followUpOf', t.id, null, ts)] : undefined)
        : [makeItemLink(linkKind, t.id, null, ts, t.kind)],
    }));
  }
  return made;
}

// How many items have this Type (for Manage, and the delete prompt).
export function itemsOfType(typeId: ItemTypeId): number {
  const { tasks } = useTaskStore.getState();
  const { events, deadlines } = useCalendarStore.getState();
  const count = (xs: Record<string, TypedItem>) => Object.values(xs).filter((x) => x.typeId === typeId).length;
  return count(tasks) + count(events) + count(deadlines);
}

// Adds a starter set's Types the person doesn't have yet (by name), each extending the right one.
// Returns how many were added.
export function addStarterSet(set: StarterSet): number {
  const store = useItemTypeStore.getState();
  const byName = new Map(Object.values(store.types).map((x) => [x.name.toLowerCase(), x.id]));
  const ids = new Map<string, ItemTypeId>();
  let added = 0;
  for (const s of STARTER_SETS[set]) {
    const existing = byName.get(s.name.toLowerCase());
    if (existing) { ids.set(s.key, existing); continue; }
    const id = store.addItemType({
      name: s.name, icon: s.icon,
      extendsId: s.extends ? ids.get(s.extends) ?? null : null,
      fields: s.fields.map((f) => ({ ...f })), defaults: { ...s.defaults }, parts: s.parts.map((p) => ({ ...p })),
    });
    ids.set(s.key, id);
    added++;
  }
  return added;
}

// "Make this tag a Type": a Type named after the tag that keeps adding it, given to every task
// carrying the tag that has no Type yet. The tag stays. Undo in the toast takes it all back.
export function makeTagAType(tagId: TagId): ItemTypeId | null {
  const tag = useTaskStore.getState().tags[tagId];
  if (!tag) return null;
  const types = useItemTypeStore.getState().types;
  if (Object.values(types).some((x) => x.name.toLowerCase() === tag.name.toLowerCase())) {
    showToast({ message: L.fromTagExists(tag.name) });
    return null;
  }
  const typeId = useItemTypeStore.getState().addItemType({
    name: tag.name, icon: null, extendsId: null, fields: [], parts: [],
    defaults: { makeAs: 'task', tagIds: [tagId] },
  });
  const given = Object.values(useTaskStore.getState().tasks).filter((x) => x.tagIds.includes(tagId) && !x.typeId).map((x) => x.id);
  for (const id of given) setItemType({ kind: 'task', id }, typeId);
  showToast({
    message: L.fromTagDone(tag.name, given.length),
    actions: [{ label: L.undo, onClick: () => {
      // null, not removed: a cleared Type has to reach the cloud too (mappers.ts typeColumns).
      for (const id of given) useTaskStore.getState().updateTask(id, { typeId: null, typeFields: {} });
      for (const entry of trashedBy(() => useItemTypeStore.getState().deleteItemType(typeId))) deleteForever(entry);
    } }],
  });
  return typeId;
}

// Which kind of item to open for a Type chosen from a create menu.
export function makeAsOf(typeId: ItemTypeId): TypeableKind {
  return resolveItemType(useItemTypeStore.getState().types, typeId)?.defaults.makeAs ?? 'task';
}

export const newFieldId = () => nanoid(8);
