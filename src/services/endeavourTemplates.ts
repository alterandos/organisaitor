import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useGoalStore } from '@/store/goalStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { trashedBy, deleteForever } from '@/services/trash';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { addBuiltInType, addStarterSet } from '@/services/itemTypes';
import { useCalendarStore } from '@/store/calendarStore';
import { repeatSummary } from '@/services/recurringTasks';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { TEMPLATE_BY_ID, initialValues, type TemplatePlan } from '@/config/endeavourTemplates';
import { addDaysToIso, formatDate } from '@/utils/date';
import type { CalendarDeadlineId, CalendarEventId, CollectionId, GoalMeasure, ItemTypeId, NoteTagId, RepeatConfig } from '@/types';
import { endeavourAncestors } from '@/utils/endeavourGraph';

// Makes what a template's plan says (config/endeavourTemplates.ts), all filed under one new
// Endeavour (part of `partOf` if given), and returns its Undo, which deletes everything it made
// for good (nothing left in the Recycling Bin), Types it added included. The Endeavour remembers
// the template it came from (`templateId`), so Edit opens that template's editor.

// A repeat's first date on or after `start` (a weekly one on one of its days).
function firstDateOf(start: string, repeat: RepeatConfig): string {
  const days = repeat.freq === 'weekly' ? repeat.daysOfWeek ?? [] : [];
  if (!days.length) return start;
  for (let d = start, i = 0; i < 7; i++, d = addDaysToIso(d, 1)) if (days.includes(new Date(d + 'T00:00:00').getDay())) return d;
  return start;
}

const day = (iso: string | null) => (iso ? formatDate(iso + 'T00:00:00') : '…');

// A short summary of a plan, one line a thing, for the template's preview.
export function planLines(plan: TemplatePlan): string[] {
  const p = plan.endeavour.period;
  return [
    `🎯 ${plan.endeavour.name}`,
    ...(p && (p.start || p.end) ? [`📅 ${day(p.start)} – ${day(p.end)}${p.breaks.length ? ` · ${p.breaks.length} break${p.breaks.length === 1 ? '' : 's'}` : ''}${p.exams ? ` · exams ${day(p.exams.from)} – ${day(p.exams.to)}` : ''}`] : []),
    ...(plan.notebook ? [`📓 ${plan.notebook.name}`] : []),
    ...plan.lists.map((l) => `📋 ${l.name}`),
    ...plan.repeating.map((r) => `🔄 ${r.title} · ${repeatSummary(r.repeat)}`),
    ...plan.tasks.map((t) => `${t.kind === 'milestone' ? '◆' : ITEM_TYPE_ICON.task} ${t.title}`),
    ...plan.goals.map((g) => `🎯 ${g.title}`),
    ...plan.parts.map((part) => `🎓 ${part.endeavour.name}`),
  ];
}

type Made = (() => void)[];

export function applyTemplate(plan: TemplatePlan, partOf: CollectionId | null): { id: CollectionId; made: number; undo: () => void } {
  const made: Made = [];
  const typesBefore = new Set(Object.keys(useItemTypeStore.getState().types));
  for (const set of new Set([plan.starterTypes, ...plan.parts.map((p) => p.starterTypes)])) if (set) addStarterSet(set);
  const id = makeEndeavour(plan, partOf, made);
  // Types it added (a starter set, a default's copy) go last on Undo, after what uses them.
  for (const tid of Object.keys(useItemTypeStore.getState().types)) {
    if (!typesBefore.has(tid)) made.unshift(() => useItemTypeStore.getState().deleteItemType(tid as ItemTypeId));
  }
  return { id, made: made.length, undo: undoOf(made) };
}

// Adds a plan's parts (all but the Endeavour itself) to an Endeavour that already exists: a
// semester's suggestions taken up later from its editor.
export function addToEndeavour(id: CollectionId, plan: TemplatePlan): { made: number; undo: () => void } {
  const made: Made = [];
  fill(id, plan, made, null);
  return { made: made.length, undo: undoOf(made) };
}

// A new subject part of a semester (its editor's "+ Subject"), taking its period live.
export function addSubject(semesterId: CollectionId, name: string): { id: CollectionId; undo: () => void } {
  const t = TEMPLATE_BY_ID.subject;
  const [code, ...rest] = name.trim().split(/\s+/);
  const values = /\d/.test(code ?? '') ? { ...initialValues(t), code, name: rest.join(' '), target: null } : { ...initialValues(t), name: name.trim(), target: null };
  const { id, undo } = applyTemplate(t.plan(values), semesterId);
  return { id, undo };
}

const undoOf = (made: Made) => () => { for (const run of [...made].reverse()) for (const entry of trashedBy(run)) deleteForever(entry); };

function makeEndeavour(plan: TemplatePlan, partOf: CollectionId | null, made: Made): CollectionId {
  const tasks = useTaskStore.getState();
  const e = plan.endeavour;
  const id = tasks.addCollection({ kind: e.kind, name: e.name, deadline: e.deadline });
  made.push(() => useTaskStore.getState().deleteCollection(id));
  tasks.updateCollection(id, { templateId: e.templateId, ...(e.period ? { period: e.period } : {}) });
  // Its Type: the person's own copy of a default (docs/features/endeavours.md "Attributes").
  if (e.typeKey) {
    const typeId = addBuiltInType(e.typeKey);
    if (typeId) tasks.updateCollection(id, { attributes: { typeId, fields: [], values: { ...(e.values ?? {}) } } });
  }
  if (partOf) tasks.addEndeavourLink(id, 'partOf', partOf);
  fill(id, plan, made, partOf);
  return id;
}

// The notebook a new Endeavour's notebook goes in: the one of the nearest Endeavour above it that
// has one (a subject's inside its semester's; the user, 2026-10-30), else none (the top level).
function parentNotebook(partOf: CollectionId | null): NoteTagId | null {
  if (!partOf) return null;
  const collections = useTaskStore.getState().collections;
  const areas = Object.values(useNoteStore.getState().noteTags).filter((t) => t.kind === 'area');
  for (const cid of [partOf, ...endeavourAncestors(partOf, collections)]) {
    const nb = areas.filter((t) => t.collectionId === cid).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (nb) return nb.id;
  }
  return null;
}

function fill(id: CollectionId, plan: TemplatePlan, made: Made, partOf: CollectionId | null = null): void {
  if (plan.notebook) {
    const nb = useNoteStore.getState().addNoteTag({ name: plan.notebook.name, kind: 'area', collectionId: id, parentTagId: parentNotebook(partOf) });
    made.push(() => useNoteStore.getState().deleteNoteTag(nb));
  }

  for (const l of plan.lists) {
    const lid = useListStore.getState().addList({ name: l.name, collectionId: id });
    made.push(() => useListStore.getState().deleteList(lid));
  }

  // Repeating classes and Work (phase 7 (e)): calendar items filed under it, from their first date.
  const repeatingIds = new Map<string, string>();
  for (const r of plan.repeating) {
    const date = firstDateOf(r.start, r.repeat);
    const rid = r.kind === 'class'
      ? useCalendarStore.getState().addEvent({ title: r.title, date, startTime: r.time, collectionId: id, repeat: r.repeat })
      : useCalendarStore.getState().addDeadline({ title: r.title, date, time: r.time, collectionId: id, repeat: r.repeat });
    repeatingIds.set(r.title, rid);
    made.push(() => (r.kind === 'class' ? useCalendarStore.getState().deleteEvent(rid as CalendarEventId) : useCalendarStore.getState().deleteDeadline(rid as CalendarDeadlineId)));
  }

  for (const t of plan.tasks) {
    const tid = addTaskWithCalendar({ title: t.title, kind: t.kind, collectionId: id });
    made.push(() => deleteTaskWithCleanup(tid));
  }

  for (const g of plan.goals) {
    const m = g.measure;
    let measure: GoalMeasure;
    if (m.kind === 'keepUp') {
      const rid = repeatingIds.get(m.title);
      if (!rid) continue;
      measure = { kind: 'keepUp', itemIds: [rid], count: m.count, outOf: m.outOf };
    } else measure = m;
    const gid = useGoalStore.getState().addGoal({ title: g.title, target: { type: 'endeavour', id }, by: g.by, measure });
    made.push(() => useGoalStore.getState().deleteGoal(gid));
  }

  for (const part of plan.parts) makeEndeavour(part, id, made);
}
