import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { trashedBy, deleteForever } from '@/services/trash';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { addStarterSet, applyItemType } from '@/services/itemTypes';
import { saveStreams } from '@/services/rhythms';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { STREAM_KINDS } from '@/config/streamKinds';
import type { TemplatePlan } from '@/config/endeavourTemplates';
import { nanoid } from 'nanoid';
import { todayIso } from '@/utils/date';
import type { CollectionId, GoalMeasure, ItemTypeId, NoteTagId, RhythmStream, ScheduleBlock, ScheduleId } from '@/types';

// Makes what a template's plan says (config/endeavourTemplates.ts), all filed under one new
// Endeavour (part of `partOf` if given), and returns its Undo, which deletes everything it made
// for good (nothing left in the Recycling Bin), Types it added included.

const typeIdOf = (name: string | null): ItemTypeId | null =>
  name ? (Object.values(useItemTypeStore.getState().types).find((t) => t.name === name)?.id ?? null) : null;

// A short summary of a plan, one line a thing, for the template's preview.
export function planLines(plan: TemplatePlan): string[] {
  return [
    `🎯 ${plan.endeavour.name}`,
    ...(plan.notebook ? [`📓 ${plan.notebook.name}`] : []),
    ...(plan.timetable ? [`🗓 ${plan.timetable.name}: ${plan.timetable.blocks.map((b) => b.title).join(', ')}`] : []),
    ...plan.events.map((e) => `${ITEM_TYPE_ICON.event} ${e.title} · ${e.date}${e.start ? ` ${e.start}` : ''}`),
    ...(plan.rhythm ? [`🔄 ${plan.rhythm.name}: ${plan.rhythm.streams.map((s) => (s.worth ? `${s.label} (${s.worth}%)` : s.label)).join(', ')}`] : []),
    ...plan.deadlines.map((d) => `${ITEM_TYPE_ICON.deadline} ${d.title} · ${d.date}${d.typeName ? ` (${d.typeName})` : ''}`),
    ...plan.tasks.map((t) => `${t.kind === 'milestone' ? '◆' : ITEM_TYPE_ICON.task} ${t.title}`),
    ...plan.goals.map((g) => `🎯 ${g.title}`),
  ];
}

export function applyTemplate(plan: TemplatePlan, partOf: CollectionId | null): { id: CollectionId; made: number; undo: () => void } {
  const made: (() => void)[] = [];
  const typesBefore = new Set(Object.keys(useItemTypeStore.getState().types));
  if (plan.starterTypes) addStarterSet(plan.starterTypes);
  for (const tid of Object.keys(useItemTypeStore.getState().types)) {
    if (!typesBefore.has(tid)) made.push(() => useItemTypeStore.getState().deleteItemType(tid as ItemTypeId));
  }

  const id = useTaskStore.getState().addCollection({ kind: plan.endeavour.kind, name: plan.endeavour.name, deadline: plan.endeavour.deadline });
  made.push(() => useTaskStore.getState().deleteCollection(id));
  if (partOf) useTaskStore.getState().addEndeavourLink(id, 'partOf', partOf);

  let notebook: NoteTagId | null = null;
  if (plan.notebook) {
    notebook = useNoteStore.getState().addNoteTag({ name: plan.notebook.name, kind: 'area', collectionId: id });
    const nb = notebook;
    made.push(() => useNoteStore.getState().deleteNoteTag(nb));
  }

  const blockIds = new Map<string, string>();
  let scheduleId: ScheduleId | null = null;
  if (plan.timetable) {
    const blocks: ScheduleBlock[] = plan.timetable.blocks.map((b) => {
      const bid = nanoid(8);
      blockIds.set(b.key, bid);
      return { id: bid, title: b.title, daysOfWeek: b.days, startTime: b.start, endTime: b.end, location: b.location, interval: 1, intervalAnchor: plan.timetable!.startDate ?? todayIso(), exceptions: [], notes: null, requiresCommitment: false, committedDates: [] };
    });
    const sid = useScheduleStore.getState().addSchedule({ name: plan.timetable.name, startDate: plan.timetable.startDate, endDate: plan.timetable.endDate, collectionId: id, blocks });
    scheduleId = sid;
    made.push(() => useScheduleStore.getState().deleteSchedule(sid));
  }

  const streamIds = new Map<string, string>();
  let rhythmId: CollectionId | null = null;
  if (plan.rhythm) {
    const rid = useTaskStore.getState().addCollection({ kind: 'routine', name: plan.rhythm.name });
    rhythmId = rid;
    useTaskStore.getState().updateCollection(rid, { collectionId: id });
    made.push(() => useTaskStore.getState().deleteCollection(rid));
    const streams: RhythmStream[] = plan.rhythm.streams.flatMap((s) => {
      const followed = s.rule.kind === 'relative' ? s.rule.blockKeys.map((k) => blockIds.get(k)).filter((b): b is string => !!b) : [];
      const rule = s.rule.kind === 'repeat' ? s.rule
        : scheduleId && followed.length ? { kind: 'relative' as const, scheduleId, blockId: followed[0], offsetDays: s.rule.offsetDays, ...(followed.length > 1 ? { blockIds: followed.slice(1) } : {}) }
        : null;
      if (!rule) return [];
      const sid = nanoid(8);
      streamIds.set(s.label, sid);
      return [{ id: sid, label: s.label, kind: s.kind, typeId: typeIdOf(s.typeName), rule, start: s.start, time: s.time, show: { ...STREAM_KINDS[s.kind].show }, notebookId: s.toNotebook ? notebook : null, ...(s.worth ? { worth: s.worth } : {}) }];
    });
    saveStreams(rid, streams);
  }

  for (const e of plan.events) {
    const eid = useCalendarStore.getState().addEvent({ title: e.title, date: e.date, startTime: e.start, endTime: e.end, location: e.location, collectionId: id });
    made.push(() => useCalendarStore.getState().deleteEvent(eid));
  }

  for (const d of plan.deadlines) {
    const did = useCalendarStore.getState().addDeadline({ title: d.title, date: d.date, collectionId: id });
    const typeId = typeIdOf(d.typeName);
    const parts = typeId ? applyItemType({ kind: 'deadline', id: did }, typeId, d.fields) : [];
    for (const t of parts) made.push(() => deleteTaskWithCleanup(t));
    made.push(() => useCalendarStore.getState().deleteDeadline(did));
  }

  for (const t of plan.tasks) {
    const tid = addTaskWithCalendar({ title: t.title, kind: t.kind, collectionId: id });
    made.push(() => deleteTaskWithCleanup(tid));
  }

  for (const g of plan.goals) {
    const m = g.measure;
    let measure: GoalMeasure;
    if (m.kind === 'consistency') {
      if (!rhythmId || !streamIds.has(m.streamLabel)) continue;
      measure = { kind: 'consistency', rhythmId, streamId: streamIds.get(m.streamLabel)!, count: m.count, outOf: m.outOf };
    } else measure = m;
    const gid = useGoalStore.getState().addGoal({ title: g.title, target: { type: 'endeavour', id }, by: g.by, measure });
    made.push(() => useGoalStore.getState().deleteGoal(gid));
  }

  const undo = () => {
    for (const run of [...made].reverse()) for (const entry of trashedBy(run)) deleteForever(entry);
  };
  return { id, made: made.length, undo };
}
