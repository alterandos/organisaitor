import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { trashedBy, deleteForever } from '@/services/trash';
import { filedUnder, moveFiled, type FiledItem } from '@/services/endeavourFiling';
import { listView, isListLocked } from '@/services/listSecrets';
import { canAddEndeavourLink, childrenOf, endeavourSubtree, parentsOf } from '@/utils/endeavourGraph';
import { now } from '@/utils/date';
import type { Collection, CollectionId, GoalMeasure, RhythmStream, ScheduleId } from '@/types';
import type { NoteTagId } from '@/types/notes';

// Changing your mind about how Endeavours are arranged (docs/features/endeavours.md phase 6):
// merge one into another, split a part off, copy one's shape. Each returns its Undo, which puts
// everything back (things it made are deleted for good, not left in the Recycling Bin). What's
// filed under an Endeavour comes from services/endeavourFiling.ts, so every app is covered.

type Undo = () => void;
const isEndeavour = (c: Collection | undefined): c is Collection => !!c && (c.kind === 'project' || c.kind === 'list');

// Deletes, for good, things a restructure made (newest first), leaving nothing in the Recycling Bin.
function forget(runs: (() => void)[]): void {
  for (const run of [...runs].reverse()) for (const entry of trashedBy(run)) deleteForever(entry);
}

// ── Merge ───────────────────────────────────────────────────────────────────

export type MergeRefusal = 'same' | 'inside';

// Everything filed under `fromId` moves to `intoId`; the Endeavours part of it become part of
// `intoId` instead; `fromId` is archived. Refused into itself, or into one of its own parts.
export function mergeEndeavour(fromId: CollectionId, intoId: CollectionId): { undo: Undo } | MergeRefusal {
  if (fromId === intoId) return 'same';
  const store = useTaskStore.getState();
  if (endeavourSubtree(fromId, store.collections).has(intoId)) return 'inside';
  const back = moveFiled(filedUnder(fromId), intoId);

  // Its parts (by a "part of" link) become parts of the one merged into.
  const relinked: CollectionId[] = [];
  for (const kid of childrenOf(fromId, store.collections)) {
    const c = useTaskStore.getState().collections[kid as CollectionId];
    if (!isEndeavour(c) || !(c.links ?? []).some((l) => l.kind === 'partOf' && l.targetId === fromId)) continue;
    useTaskStore.getState().removeEndeavourLink(c.id, 'partOf', fromId);
    if (canAddEndeavourLink(useTaskStore.getState().collections, c.id, 'partOf', intoId) === null) useTaskStore.getState().addEndeavourLink(c.id, 'partOf', intoId);
    relinked.push(c.id);
  }
  useTaskStore.getState().updateCollection(fromId, { archivedAt: now() });

  return {
    undo: () => {
      useTaskStore.getState().updateCollection(fromId, { archivedAt: null });
      for (const id of relinked) {
        const c = useTaskStore.getState().collections[id];
        if (c?.links?.some((l) => l.kind === 'partOf' && l.targetId === intoId)) useTaskStore.getState().removeEndeavourLink(id, 'partOf', intoId);
        useTaskStore.getState().addEndeavourLink(id, 'partOf', fromId);
      }
      back();
    },
  };
}

// ── Split ───────────────────────────────────────────────────────────────────

// A new Endeavour, part of `fromId`, with the chosen things moved into it. Being part of it, nothing
// leaves the original's views (its filters and home include its parts).
export function splitEndeavour(fromId: CollectionId, name: string, items: readonly FiledItem[]): { id: CollectionId; undo: Undo } {
  const from = useTaskStore.getState().collections[fromId];
  const id = useTaskStore.getState().addCollection({ kind: 'project', name: name.trim(), color: from?.color ?? null, purposeIds: from?.purposeIds ?? [] });
  useTaskStore.getState().addEndeavourLink(id, 'partOf', fromId);
  const back = moveFiled(items, id);
  return { id, undo: () => { back(); forget([() => useTaskStore.getState().deleteCollection(id)]); } };
}

// ── Copy the shape ──────────────────────────────────────────────────────────

export interface ShapeOptions {
  parts:      boolean;
  notebooks:  boolean;
  lists:      boolean;
  timetables: boolean;
  records:    boolean;   // trackers and rhythms
  goals:      boolean;
}

export const ALL_SHAPE: ShapeOptions = { parts: true, notebooks: true, lists: true, timetables: true, records: true, goals: true };

// A new Endeavour set up like `sourceId`, with nothing in it: the same kind, colour and Purposes,
// part of the same Endeavours; and, as chosen, its parts (copied the same way), its notebooks,
// lists (without items), timetables, trackers and rhythms (without entries; a stream on a copied
// timetable follows the copy) and goals (without check-ins; measured from the copies). Returns how
// many things it made, and the Undo.
export function copyShape(sourceId: CollectionId, name: string, opts: ShapeOptions = ALL_SHAPE): { id: CollectionId; made: number; undo: Undo } {
  const made: (() => void)[] = [];
  const idMap = new Map<string, string>();   // a copied thing's id -> its copy's

  function copyEndeavour(src: Collection, newName: string, parent: CollectionId | null): CollectionId {
    const ts = useTaskStore.getState();
    const id = ts.addCollection({ kind: src.kind, name: newName, description: src.description, color: src.color, purposeIds: src.purposeIds, tagIds: src.tagIds });
    made.push(() => useTaskStore.getState().deleteCollection(id));
    idMap.set(src.id, id);
    // Part of the same Endeavours as the original (a copied part: of the copy).
    const parents = parent ? [parent] : parentsOf(src, ts.collections).filter((p) => isEndeavour(ts.collections[p]));
    for (const p of parents) useTaskStore.getState().addEndeavourLink(id, 'partOf', p as CollectionId);
    if (opts.parts) {
      for (const kid of childrenOf(src.id, useTaskStore.getState().collections)) {
        const c = useTaskStore.getState().collections[kid as CollectionId];
        if (isEndeavour(c) && !c.archivedAt && !idMap.has(c.id)) copyEndeavour(c, c.name, id);
      }
    }
    return id;
  }

  const source = useTaskStore.getState().collections[sourceId];
  const id = copyEndeavour(source, name.trim(), null);

  // What's filed under the original and each copied part, copied empty under its copy.
  for (const [srcId, copyId] of [...idMap.entries()]) {
    const to = copyId as CollectionId;
    if (opts.notebooks) {
      for (const t of Object.values(useNoteStore.getState().noteTags).filter((t) => t.kind === 'area' && t.collectionId === srcId)) {
        const nb = useNoteStore.getState().addNoteTag({ name: t.name, kind: 'area', parentTagId: t.parentTagId, icon: t.icon, color: t.color, collectionId: to });
        made.push(() => useNoteStore.getState().deleteNoteTag(nb as NoteTagId));
      }
    }
    if (opts.lists) {
      for (const l of Object.values(useListStore.getState().lists).filter((l) => l.collectionId === srcId && !isListLocked(l))) {
        const v = listView(l);
        const lid = useListStore.getState().addList({ name: v.name, description: v.description, typeId: l.typeId, kind: l.kind, color: l.color, icon: l.icon, fieldSchema: l.fieldSchema, collectionId: to });
        made.push(() => useListStore.getState().deleteList(lid));
      }
    }
    if (opts.timetables) {
      for (const s of Object.values(useScheduleStore.getState().schedules).filter((s) => s.collectionId === srcId)) {
        const sid = useScheduleStore.getState().addSchedule({ name: s.name, color: s.color, startDate: s.startDate, endDate: s.endDate, collectionId: to, blocks: s.blocks.map((b) => ({ ...b, exceptions: [], committedDates: [] })) });
        idMap.set(s.id, sid);
        made.push(() => useScheduleStore.getState().deleteSchedule(sid));
      }
    }
  }
  if (opts.records) {
    for (const [srcId, copyId] of [...idMap.entries()]) {
      for (const r of Object.values(useTaskStore.getState().collections).filter((c) => (c.kind === 'tracker' || c.kind === 'routine') && c.collectionId === srcId && !c.archivedAt)) {
        const rid = useTaskStore.getState().addCollection({ kind: r.kind, name: r.name, color: r.color, purposeIds: r.purposeIds, tagIds: r.tagIds, fieldSchema: r.fieldSchema, routineTasks: r.routineTasks, repeatConfig: r.repeatConfig });
        useTaskStore.getState().updateCollection(rid, { collectionId: copyId as CollectionId });
        idMap.set(r.id, rid);
        made.push(() => useTaskStore.getState().deleteCollection(rid));
      }
    }
    // Streams follow copied timetables; the routine's own stream takes its copy's id.
    for (const r of Object.values(useTaskStore.getState().collections).filter((c) => c.kind === 'routine' && c.streams?.length && idMap.has(c.id))) {
      const copyId = idMap.get(r.id) as CollectionId;
      const streams: RhythmStream[] = r.streams!.map((s) => ({
        ...s,
        id: s.id === r.id ? copyId : s.id,
        rule: s.rule.kind === 'relative' ? { ...s.rule, scheduleId: (idMap.get(s.rule.scheduleId) ?? s.rule.scheduleId) as ScheduleId } : s.rule,
      }));
      useTaskStore.getState().updateCollection(copyId, { streams });
    }
  }
  if (opts.goals) {
    for (const [srcId, copyId] of [...idMap.entries()]) {
      for (const g of Object.values(useGoalStore.getState().goals).filter((g) => g.target.type === 'endeavour' && g.target.id === srcId)) {
        const m = g.measure;
        const measure: GoalMeasure =
          m.kind === 'consistency' ? { ...m, rhythmId: (idMap.get(m.rhythmId) ?? m.rhythmId) as CollectionId, streamId: m.streamId === m.rhythmId ? (idMap.get(m.rhythmId) ?? m.streamId) : m.streamId }
          : m.kind === 'tracker' ? { ...m, trackerId: (idMap.get(m.trackerId) ?? m.trackerId) as CollectionId }
          : m;
        const gid = useGoalStore.getState().addGoal({ title: g.title, target: { type: 'endeavour', id: copyId as CollectionId }, by: null, measure });
        made.push(() => useGoalStore.getState().deleteGoal(gid));
      }
    }
  }
  return { id, made: made.length, undo: () => forget(made) };
}
