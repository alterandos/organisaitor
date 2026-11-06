import { TYPES_ENABLED } from '@/config/features';
import { BUILT_IN_BY_KEY } from '@/config/builtInTypes';
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useGoalStore } from '@/store/goalStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { trashedBy, deleteForever } from '@/services/trash';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { addBuiltInType, addStarterSet } from '@/services/itemTypes';
import { repeatSummary } from '@/services/recurringTasks';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { blankPlan, type TemplatePlan } from '@/config/endeavourTemplates';
import { planFromTemplate } from '@/utils/templatePlan';
import { templateFor } from '@/services/templates';
import { formatDate } from '@/utils/date';
import type { CollectionId, GoalMeasure, ItemTypeId, NoteTagId } from '@/types';
import { saveDrafts } from '@/services/subjectItems';
import { filedUnder, removeFiled } from '@/services/endeavourFiling';
import { endeavourAncestors, parentsOf } from '@/utils/endeavourGraph';

// Makes what a template's plan says (config/endeavourTemplates.ts), all filed under one new
// Endeavour (part of `partOf` if given), and returns its Undo, which deletes everything it made
// for good (nothing left in the Recycling Bin), Types it added included. The Endeavour remembers
// the template it came from (`templateId`), so Edit opens that template's editor.

const day = (iso: string | null) => (iso ? formatDate(iso + 'T00:00:00') : '…');

// A short summary of a plan, one line a thing, for the template's preview.
export function planLines(plan: TemplatePlan): string[] {
  const p = plan.endeavour.period;
  return [
    `🎯 ${plan.endeavour.name}`,
    ...(p && (p.start || p.end) ? [`📅 ${day(p.start)} – ${day(p.end)}${p.breaks.length ? ` · ${p.breaks.length} break${p.breaks.length === 1 ? '' : 's'}` : ''}${p.exams ? ` · exams ${day(p.exams.from)} – ${day(p.exams.to)}` : ''}`] : []),
    ...plan.notebooks.map((n) => `📓 ${n.name}`),
    ...plan.lists.map((l) => `📋 ${l.name}`),
    ...plan.items.map((r) => `${r.repeat ? '🔄' : r.kind === 'work' ? ITEM_TYPE_ICON.deadline : ITEM_TYPE_ICON.event} ${r.title}${r.repeat ? ` · ${repeatSummary(r.repeat)}` : ''}`),
    ...plan.tasks.map((t) => `${t.kind === 'milestone' ? '◆' : ITEM_TYPE_ICON.task} ${t.title}`),
    ...plan.goals.map((g) => `🎯 ${g.title}`),
    ...plan.parts.map((part) => `🎓 ${part.endeavour.name}`),
  ];
}

type Made = (() => void)[];

// `partOf`: what it's part of (one, or several from the creator's first step).
// `typesBefore`: the Types there were before the person started (the creator adds the University
// set as soon as a template needs it), so Undo also takes away what was added since.
export function applyTemplate(plan: TemplatePlan, partOf: CollectionId | CollectionId[] | null, typesBefore: Set<string> = typeIds()): { id: CollectionId; made: number; undo: () => void } {
  const made: Made = [];
  if (TYPES_ENABLED) for (const set of new Set([plan.starterTypes, ...plan.parts.map((p) => p.starterTypes)])) if (set) addStarterSet(set);
  const id = makeEndeavour(plan, partOf, made);
  // Types it added (a starter set, a default's copy) go last on Undo, after what uses them.
  for (const tid of Object.keys(useItemTypeStore.getState().types)) {
    if (!typesBefore.has(tid)) made.unshift(() => useItemTypeStore.getState().deleteItemType(tid as ItemTypeId));
  }
  return { id, made: made.length, undo: undoOf(made) };
}

// Adds a plan's parts (all but the Endeavour itself) to an Endeavour that already exists: a
// semester's suggestions taken up later from its editor.
export function addToEndeavour(id: CollectionId, plan: TemplatePlan, typesBefore: Set<string> = typeIds()): { made: number; undo: () => void } {
  const made: Made = [];
  if (TYPES_ENABLED && plan.starterTypes) addStarterSet(plan.starterTypes);
  const c = useTaskStore.getState().collections[id];
  fill(id, plan, made, c ? parentsOf(c, useTaskStore.getState().collections)[0] ?? null : null);
  for (const tid of Object.keys(useItemTypeStore.getState().types)) {
    if (!typesBefore.has(tid)) made.unshift(() => useItemTypeStore.getState().deleteItemType(tid as ItemTypeId));
  }
  return { made: made.length, undo: undoOf(made) };
}

// A new part of an Endeavour, made from the template its parts start from (a semester's subject),
// taking its period live. Its name may hold its code ("GEOS215 Climate Systems").
export function addPart(parentId: CollectionId, templateId: string | null, name: string): { id: CollectionId; undo: () => void } {
  const def = templateFor(templateId);
  const { id, undo } = applyTemplate(def ? planFromTemplate(def, { name }) : blankPlan(name.trim()), parentId);
  return { id, undo };
}

const typeIds = () => new Set(Object.keys(useItemTypeStore.getState().types));

// Takes away for good the Types added since `before` (the creator, closed without making anything).
export function removeTypesAddedSince(before: Set<string>): void {
  for (const tid of typeIds()) if (!before.has(tid)) useItemTypeStore.getState().deleteItemType(tid as ItemTypeId);
}

// The Endeavours made part of one (directly).
export function partsOf(id: string): CollectionId[] {
  const collections = useTaskStore.getState().collections;
  return Object.values(collections).filter((c) => c.id !== id && parentsOf(c, collections).includes(id as CollectionId)).map((c) => c.id);
}

// How many things are in it: what's filed under it and the Endeavours inside it.
export function piecesIn(id: string): number {
  return filedUnder(id).length + partsOf(id).length;
}

// Discards an Endeavour that was being made (the creator closed before it was finished, the user
// 2026-11-03): it, everything filed under it and everything inside it, for good (not to the
// Recycling Bin), and the Types added since `typesBefore`.
export function discardEndeavour(id: CollectionId, typesBefore: Set<string>): void {
  const runs: Made = [];
  const gather = (cid: CollectionId) => {
    for (const part of partsOf(cid)) gather(part);
    for (const i of filedUnder(cid)) runs.push(() => removeFiled(i));
    runs.push(() => useTaskStore.getState().deleteCollection(cid));
  };
  gather(id);
  for (const run of runs) for (const entry of trashedBy(run)) deleteForever(entry);
  removeTypesAddedSince(typesBefore);
}

const undoOf = (made: Made) => () => { for (const run of [...made].reverse()) for (const entry of trashedBy(run)) deleteForever(entry); };

function makeEndeavour(plan: TemplatePlan, partOfIn: CollectionId | CollectionId[] | null, made: Made): CollectionId {
  const tasks = useTaskStore.getState();
  const e = plan.endeavour;
  const parents = partOfIn === null ? [] : Array.isArray(partOfIn) ? partOfIn : [partOfIn];
  const partOf = parents[0] ?? null;
  const id = tasks.addCollection({ kind: e.kind, name: e.name, deadline: e.deadline, description: e.description ?? null, color: e.color ?? null, purposeIds: e.purposeIds ?? [] });
  made.push(() => useTaskStore.getState().deleteCollection(id));
  tasks.updateCollection(id, { ...(e.templateId ? { templateId: e.templateId } : {}), ...(e.period ? { period: e.period } : {}) });
  // Its Type: the person's own copy of a default (docs/features/endeavours.md "Attributes").
  // Its details: its Type's fields and its own (docs/features/endeavours.md "Attributes").
  // With Types switched off (config/features.ts), the Type's fields become details of its own (a
  // subject's Code), keeping their ids so the values still match; its dates are the form's own.
  const typeId = TYPES_ENABLED && e.typeKey ? addBuiltInType(e.typeKey) : null;
  const typeFields = !TYPES_ENABLED && e.typeKey ? (BUILT_IN_BY_KEY[e.typeKey]?.fields ?? []).filter((f) => f.type !== 'period' && !e.fields?.some((o) => o.id === f.id)) : [];
  const fields = [...typeFields.map((f) => ({ ...f })), ...(e.fields ?? [])];
  if (typeId || fields.length) tasks.updateCollection(id, { attributes: { typeId: typeId ?? null, fields, values: { ...(e.values ?? {}) } } });
  for (const p of parents) tasks.addEndeavourLink(id, 'partOf', p);
  for (const r of e.related ?? []) tasks.addEndeavourLink(id, 'related', r);
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
  const inside = parentNotebook(partOf);
  for (const n of plan.notebooks) {
    const nb = useNoteStore.getState().addNoteTag({ name: n.name, kind: 'area', collectionId: id, parentTagId: inside });
    made.push(() => useNoteStore.getState().deleteNoteTag(nb));
  }

  for (const l of plan.lists) {
    const lid = useListStore.getState().addList({ name: l.name, collectionId: id });
    (l.items ?? []).forEach((title, order) => { if (title.trim()) useListStore.getState().addListItem({ listId: lid, title: title.trim(), order }); });
    made.push(() => useListStore.getState().deleteList(lid));
  }

  // Its Schedule and Work: calendar items filed under it, made as a subject's are.
  const itemIds = saveDrafts(id, plan.items, made).ids;

  for (const t of plan.tasks) {
    const tid = addTaskWithCalendar({ title: t.title, kind: t.kind, collectionId: id, deadline: t.deadline ?? null, repeat: t.repeat ?? null });
    made.push(() => deleteTaskWithCleanup(tid));
  }

  for (const g of plan.goals) {
    const m = g.measure;
    let measure: GoalMeasure;
    if (m.kind === 'keepUp') {
      const rid = itemIds.get(m.title);
      if (!rid) continue;
      measure = { kind: 'keepUp', itemIds: [rid], count: m.count, outOf: m.outOf };
    } else measure = m;
    const gid = useGoalStore.getState().addGoal({ title: g.title, target: { type: 'endeavour', id }, by: g.by, measure });
    made.push(() => useGoalStore.getState().deleteGoal(gid));
  }

  for (const part of plan.parts) makeEndeavour(part, id, made);
}
