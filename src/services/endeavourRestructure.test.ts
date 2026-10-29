import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useTrashStore } from '@/store/trashStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { filedUnder } from './endeavourFiling';
import { copyShape, mergeEndeavour, splitEndeavour } from './endeavourRestructure';
import { saveStreams } from './rhythms';
import { rhythmStreams } from '@/utils/rhythms';
import type { RhythmStream } from '@/types';

beforeEach(() => {
  for (const s of [useTaskStore, useCalendarStore, useNoteStore, useListStore, useScheduleStore, useGoalStore, useTrashStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});

const coll = () => useTaskStore.getState().collections;
const add = (name: string, kind: 'project' | 'list' = 'project') => useTaskStore.getState().addCollection({ kind, name });

describe('merging one Endeavour into another', () => {
  it('moves everything filed under it and its parts, archives it, and Undo puts it all back', () => {
    const a = add('Assignment 1'), b = add('GEOS215'), part = add('Draft');
    useTaskStore.getState().addEndeavourLink(part, 'partOf', a);
    const task = addTaskWithCalendar({ title: 'Write it', collectionId: a, deadline: '2026-11-02' });
    const nb = useNoteStore.getState().addNoteTag({ name: 'A1 notes', kind: 'area', collectionId: a });
    const res = mergeEndeavour(a, b);
    if (typeof res === 'string') throw new Error(res);
    expect(useTaskStore.getState().tasks[task].collectionId).toBe(b);
    const dl = useTaskStore.getState().tasks[task].calendarDeadlineId!;
    expect(useCalendarStore.getState().deadlines[dl].collectionId).toBe(b);   // its own Deadline follows
    expect(useNoteStore.getState().noteTags[nb].collectionId).toBe(b);
    expect(coll()[part].links?.map((l) => l.targetId)).toEqual([b]);
    expect(coll()[a].archivedAt).not.toBeNull();
    res.undo();
    expect(useTaskStore.getState().tasks[task].collectionId).toBe(a);
    expect(useNoteStore.getState().noteTags[nb].collectionId).toBe(a);
    expect(coll()[part].links?.map((l) => l.targetId)).toEqual([a]);
    expect(coll()[a].archivedAt).toBeNull();
  });

  it('is refused into itself or into one of its own parts', () => {
    const a = add('A'), part = add('Part');
    useTaskStore.getState().addEndeavourLink(part, 'partOf', a);
    expect(mergeEndeavour(a, a)).toBe('same');
    expect(mergeEndeavour(a, part)).toBe('inside');
  });
});

describe('splitting a part off', () => {
  it('a new part holding the chosen things; Undo moves them back and forgets the part', () => {
    const geos = add('GEOS215');
    const t1 = addTaskWithCalendar({ title: 'Essay plan', collectionId: geos });
    addTaskWithCalendar({ title: 'Lab report', collectionId: geos });
    const chosen = filedUnder(geos).filter((i) => i.id === t1);
    const { id, undo } = splitEndeavour(geos, 'Essay', chosen);
    expect(coll()[id]).toMatchObject({ name: 'Essay', kind: 'project' });
    expect(coll()[id].links?.[0]).toMatchObject({ kind: 'partOf', targetId: geos });
    expect(useTaskStore.getState().tasks[t1].collectionId).toBe(id);
    expect(filedUnder(geos).map((i) => i.title)).toEqual(['Lab report']);
    undo();
    expect(coll()[id]).toBeUndefined();
    expect(useTaskStore.getState().tasks[t1].collectionId).toBe(geos);
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
  });
});

describe("copying an Endeavour's shape", () => {
  it('its parts, notebooks, empty lists, timetables, rhythms (following the copied timetable) and goals; no content', () => {
    const sem = add('Semester 2', 'list');
    const geos = add('GEOS215');
    useTaskStore.getState().addEndeavourLink(geos, 'partOf', sem);
    const essay = add('Essay');
    useTaskStore.getState().addEndeavourLink(essay, 'partOf', geos);
    addTaskWithCalendar({ title: 'A task', collectionId: geos });
    useNoteStore.getState().addNoteTag({ name: 'GEOS215 notes', kind: 'area', collectionId: geos });
    const list = useListStore.getState().addList({ name: 'Readings', collectionId: geos });
    useListStore.getState().addListItem({ listId: list, title: 'Ch 1' });
    const tt = useScheduleStore.getState().addSchedule({ name: 'GEOS215 classes', collectionId: geos, blocks: [{ id: 'lec', title: 'Lecture', daysOfWeek: [2], startTime: '10:00', endTime: '11:00', location: null, interval: 1, intervalAnchor: '2026-09-01', exceptions: [], notes: null, requiresCommitment: false, committedDates: [] }] });
    const rh = useTaskStore.getState().addCollection({ kind: 'routine', name: 'Each week' });
    useTaskStore.getState().updateCollection(rh, { collectionId: geos });
    const reading: RhythmStream = { id: 'read', label: 'Reading', kind: 'doBy', typeId: null, rule: { kind: 'relative', scheduleId: tt, blockId: 'lec', offsetDays: -1 }, start: '2026-09-01', time: null, show: { calendar: 'none', tasks: 'never', notify: false }, notebookId: null };
    saveStreams(rh, [...rhythmStreams(coll()[rh]), reading]);
    useGoalStore.getState().addGoal({ title: 'Keep up', target: { type: 'endeavour', id: geos }, by: '2026-11-30', measure: { kind: 'consistency', rhythmId: rh, streamId: 'read', count: 3, outOf: 4 } });

    const { id, made, undo } = copyShape(geos, 'GEOS301');
    const copy = coll()[id];
    expect(copy).toMatchObject({ name: 'GEOS301', kind: 'project' });
    expect(copy.links?.map((l) => l.targetId)).toEqual([sem]);                           // part of the same
    expect(Object.values(coll()).filter((c) => c.name === 'Essay')).toHaveLength(2);    // its part, copied
    expect(filedUnder(id).map((i) => i.kind).sort()).toEqual(['goal', 'list', 'notebook', 'record', 'timetable']);   // no task
    const newList = Object.values(useListStore.getState().lists).find((l) => l.collectionId === id)!;
    expect(Object.values(useListStore.getState().listItems).filter((i) => i.listId === newList.id)).toHaveLength(0);
    const newTt = Object.values(useScheduleStore.getState().schedules).find((s) => s.collectionId === id)!;
    const newRh = Object.values(coll()).find((c) => c.kind === 'routine' && c.collectionId === id)!;
    expect(newRh.streams!.map((s) => s.id)).toEqual([newRh.id, 'read']);                 // its own stream is its own
    expect(newRh.streams![1].rule).toMatchObject({ kind: 'relative', scheduleId: newTt.id });
    const newGoal = Object.values(useGoalStore.getState().goals).find((g) => g.target.id === id)!;
    expect(newGoal).toMatchObject({ by: null, checkIns: [], measure: { rhythmId: newRh.id, streamId: 'read' } });
    expect(made).toBe(7);

    undo();
    expect(coll()[id]).toBeUndefined();
    expect(Object.values(coll()).filter((c) => c.name === 'Essay')).toHaveLength(1);
    expect(Object.values(useScheduleStore.getState().schedules)).toHaveLength(1);
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
  });
});

