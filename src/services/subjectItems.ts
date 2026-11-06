import { TYPES_ENABLED } from '@/config/features';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { addScheduleEvent, endeavourSchedule, setScheduleEvent } from '@/services/schedules';
import { addStarterSet, applyItemType, setItemType, type TypedTarget } from '@/services/itemTypes';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { trashedBy, deleteForever } from '@/services/trash';
import { setEventTaskRules } from '@/services/eventTaskRules';
import { WORTH_FIELD, followIdsFor, isBoundedWork, outlineDrafts, scheduleListOf, subjectShort, workBounds, type SubjectItemDraft, type SubjectItemKind } from '@/utils/subjectItems';
import { boundedRepeat, sameRepeat } from '@/utils/scheduleItems';
import { isHydrating, onLoaded } from '@/services/sync/hydrating';
import { followedDates } from '@/utils/repeatFollow';
import { effectivePeriod } from '@/utils/endeavourPeriod';
import { todayIso } from '@/utils/date';
import type { CourseOutline } from '@/utils/courseOutline';
import { LABELS } from '@/config/labels';
import type { CalendarDeadlineId, CalendarEventId, ClassLink, CollectionId, ItemTypeId, RepeatConfig, Task, TaskId } from '@/types';
import { clashingClasses } from '@/utils/classClashes';


// Making, changing and deleting a subject's items from its editor (docs/features/endeavours.md
// phase 7 (d); the lists and drafts are utils/subjectItems.ts). A Schedule item that repeats is
// one of the subject's Schedule's items (services/schedules.ts), so its period and breaks apply;
// a one-off is a plain event filed under it. Work is Deadlines; one that follows the classes is
// a repeat on their dates, kept in step by services/repeatFollow.ts.

const cal = () => useCalendarStore.getState();


// Saves a draft: changes `existing`, or makes a new item filed under the subject. Returns its id,
// or null when it has nothing to be on (Work following classes that have no dates).
export function saveSubjectItem(subjectId: CollectionId, draft: SubjectItemDraft, existing?: string): string | null {
  const subject = useTaskStore.getState().collections[subjectId];
  if (!subject) return null;
  const title = draft.title.trim() || LABELS.subjectEditor.untitled;
  return draft.kind === 'schedule' ? saveScheduleItem(subjectId, subject.name, { ...draft, title }, existing as CalendarEventId | undefined)
    : saveWorkItem(subjectId, { ...draft, title }, existing as CalendarDeadlineId | undefined);
}

function saveScheduleItem(subjectId: CollectionId, name: string, d: SubjectItemDraft, existing?: CalendarEventId): string | null {
  const was = existing ? cal().events[existing] : undefined;
  const scheduleId = d.repeat ? (was?.scheduleId ?? endeavourSchedule(subjectId, LABELS.subjectEditor.scheduleName(subjectShort(name)), true)) : null;
  const fields = { title: d.title, date: d.date, startTime: d.start, endTime: d.end, location: d.place, notes: d.notes, repeat: d.repeat, ...classLink(subjectId, d, existing) };
  if (was) {
    setScheduleEvent(was.id, fields, scheduleId);
    typeItem({ kind: 'event', id: was.id }, d, was.typeId ?? null);
    return was.id;
  }
  const id = scheduleId ? addScheduleEvent(scheduleId, fields) : cal().addEvent({ ...fields, collectionId: subjectId });
  // A new item's input has no onClass or task rules: given straight after.
  if (id && fields.onClass) cal().updateEvent(id, { onClass: fields.onClass });
  if (id && d.taskRules?.length) setEventTaskRules(id as CalendarEventId, d.taskRules);
  if (id) typeItem({ kind: 'event', id }, d, undefined);
  return id;
}

function saveWorkItem(subjectId: CollectionId, d: SubjectItemDraft, existing?: CalendarDeadlineId): string | null {
  let { repeat, date } = d;
  if (d.follow) {
    const ids = followIdsFor(d.follow.title, scheduleListOf(subjectId, cal().events));
    if (!ids.length) return null;
    const follows = { ids, offsetDays: d.follow.offsetDays };
    const dates = followedDates(follows, cal().events);
    if (!dates.length) return null;
    repeat = { freq: 'dates', interval: 1, endKind: 'forever', count: null, until: null, dates, follows } satisfies RepeatConfig;
    date = dates[0];
  } else if (repeat?.follows) {
    const kept = { ...repeat };
    delete kept.follows;
    repeat = kept;
  }
  const fields = { title: d.title, date, time: d.start, notes: d.notes, repeat, ...classLink(subjectId, { ...d, date, repeat }, existing) };
  const was = existing ? cal().deadlines[existing] : undefined;
  if (was) {
    cal().updateDeadline(was.id, fields);
    typeItem({ kind: 'deadline', id: was.id }, d, was.typeId ?? null);
    applyWorkBounds();
    return was.id;
  }
  const id = cal().addDeadline({ ...fields, collectionId: subjectId });
  if (fields.onClass) cal().updateDeadline(id, { onClass: fields.onClass });
  typeItem({ kind: 'deadline', id }, d, undefined);
  applyWorkBounds();
  return id;
}

// Instead of a class or during it: kept only while it still falls in that class's time (a one-off,
// not repeating); never sent when it was never asked.
function classLink(subjectId: CollectionId, d: SubjectItemDraft, existing?: string): { onClass?: ClassLink | null } {
  if (d.onClass === undefined) return {};
  if (!d.onClass || d.repeat || d.follow) return { onClass: null };
  const still = clashingClasses({ id: existing, date: d.date, start: d.start, end: d.end, collectionId: subjectId }, cal().events)
    .some((c) => c.event.id === d.onClass!.eventId && c.date === d.onClass!.date);
  return { onClass: still ? d.onClass : null };
}

// Its Type and field values. A new item, or one whose Type changed, makes the Type's tasks the
// person chose (all, when the draft doesn't say: the outline, the agent); one whose Type stayed
// the same only has its values updated (the user, 2026-10-30: nothing made without a say).
function typeItem(target: TypedTarget, d: SubjectItemDraft, wasType: ItemTypeId | null | undefined): void {
  if (wasType === undefined || wasType !== d.typeId) {
    if (d.typeId) applyItemType(target, d.typeId, d.typeFields, wasType === undefined ? d.partIds : d.partIds ?? []);
    else if (wasType) setItemType(target, null);
    return;
  }
  if (d.typeId) setItemType(target, d.typeId, d.typeFields);
}

// The tasks made from an item's Type (its Revise, its Check the result), not archived.
export function itemTasks(itemId: string): Task[] {
  return Object.values(useTaskStore.getState().tasks)
    .filter((t) => !t.archived && t.itemLinks?.some((l) => l.targetId === itemId && (l.targetType === 'event' || l.targetType === 'deadline')))
    .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
}

// ── A subject's repeating Work takes its period (ends with it, skips its breaks), live ──

let applyingWork = false;

export function applyWorkBounds(): void {
  const { collections } = useTaskStore.getState();
  applyingWork = true;
  try {
    for (const d of Object.values(cal().deadlines)) {
      if (!d.repeat || !isBoundedWork(d, collections)) continue;
      const next = boundedRepeat(d.repeat, workBounds(d.collectionId!, collections));
      if (!sameRepeat(next, d.repeat)) cal().updateDeadline(d.id, { repeat: next });
    }
  } finally {
    applyingWork = false;
  }
}

// Started once from App.tsx, beside initSchedules: whenever an Endeavour (a period, a break) or a
// Deadline changes, and after each sync load. Skipped while sync merges.
export function initSubjectWork(): () => void {
  applyWorkBounds();
  const offLoaded = onLoaded(applyWorkBounds);
  const react = () => { if (!applyingWork && !isHydrating()) applyWorkBounds(); };
  const offCollections = useTaskStore.subscribe((s, p) => { if (s.collections !== p.collections) react(); });
  const offDeadlines = useCalendarStore.subscribe((s, p) => { if (s.deadlines !== p.deadlines) react(); });
  return () => { offLoaded(); offCollections(); offDeadlines(); };
}

// To the Recycling Bin, like deleting it anywhere else.
export function deleteSubjectItem(kind: SubjectItemKind, id: string): void {
  if (kind === 'schedule') cal().deleteEvent(id as CalendarEventId);
  else cal().deleteDeadline(id as CalendarDeadlineId);
}

// Makes several drafts at once (an outline, the creator's pieces), Schedule items first so Work has
// its classes to follow, and records how to take each away again (the item, the tasks its Type
// made, a Schedule made for them) in `made`, to be run in reverse. Returns how many were made and
// each one's id by its title.
export function saveDrafts(subjectId: CollectionId, drafts: SubjectItemDraft[], made: (() => void)[]): { count: number; ids: Map<string, string> } {
  const at = made.length;
  const hadSchedule = endeavourSchedule(subjectId, '', false);
  const ids = new Map<string, string>();
  let count = 0;
  for (const d of [...drafts].sort((a, b) => Number(a.kind === 'work') - Number(b.kind === 'work'))) {
    const parts = new Set(Object.keys(useTaskStore.getState().tasks));
    const id = saveSubjectItem(subjectId, d);
    if (!id) continue;
    count++;
    if (!ids.has(d.title)) ids.set(d.title, id);
    for (const t of Object.keys(useTaskStore.getState().tasks)) if (!parts.has(t)) made.push(() => deleteTaskWithCleanup(t as TaskId));
    made.push(() => deleteSubjectItem(d.kind, id));
  }
  const schedule = hadSchedule ? null : endeavourSchedule(subjectId, '', false);
  if (schedule) made.splice(at, 0, () => useScheduleStore.getState().deleteSchedule(schedule));
  return { count, ids };
}

// ── A course outline read into a subject (the editor's magic wand) ──

// What the outline would add, before anything is made.
export function outlineDraftsFor(subjectId: CollectionId, o: CourseOutline): SubjectItemDraft[] {
  const collections = useTaskStore.getState().collections;
  const subject = collections[subjectId];
  if (!subject) return [];
  const start = o.start ?? effectivePeriod(subjectId, collections)?.period.start ?? todayIso();
  const types = Object.values(useItemTypeStore.getState().types);
  const typeIdOf = (name: string) => (TYPES_ENABLED ? types.find((t) => !t.archivedAt && t.name.toLowerCase() === name.toLowerCase())?.id ?? null : null);
  const drafts = outlineDrafts(o, subjectShort(o.code ?? subject.name), start, typeIdOf);
  if (TYPES_ENABLED) return drafts;
  // Types switched off (config/features.ts): what an assessment is worth goes in its notes.
  return drafts.map((d) => {
    const worth = d.typeFields[WORTH_FIELD];
    return typeof worth === 'number' ? { ...d, typeFields: {}, notes: [LABELS.subjectEditor.worthNote(worth), d.notes].filter(Boolean).join('\n') } : d;
  });
}

// Makes them (the University Types first, so they're typed), and gives the subject the outline's
// teaching dates when it has none of its own or from above. One Undo takes it all away for good.
export function addOutline(subjectId: CollectionId, o: CourseOutline, opts: { typeTasks?: boolean } = {}): { made: number; undo: () => void } {
  const made: (() => void)[] = [];
  const typesBefore = new Set(Object.keys(useItemTypeStore.getState().types));
  if (TYPES_ENABLED) addStarterSet('university');
  for (const tid of Object.keys(useItemTypeStore.getState().types)) {
    if (!typesBefore.has(tid)) made.push(() => useItemTypeStore.getState().deleteItemType(tid as ItemTypeId));
  }
  const tasks = useTaskStore.getState();
  const before = tasks.collections[subjectId];
  if (o.start && !effectivePeriod(subjectId, tasks.collections)) {
    tasks.updateCollection(subjectId, { period: { start: o.start, end: o.end, breaks: [] } });
    made.push(() => useTaskStore.getState().updateCollection(subjectId, { period: before?.period ?? null }));
  }
  const drafts = outlineDraftsFor(subjectId, o).map((x) => (opts.typeTasks === false ? { ...x, partIds: [] } : x));
  const { count } = saveDrafts(subjectId, drafts, made);
  const undo = () => { for (const run of [...made].reverse()) for (const entry of trashedBy(run)) deleteForever(entry); };
  return { made: count, undo };
}
