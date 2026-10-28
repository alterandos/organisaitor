import { beforeEach, describe, expect, it } from 'vitest';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrashStore } from '@/store/trashStore';
import { useToastStore } from '@/store/toastStore';
import { addStarterSet, applyItemType, itemsOfType, makeTagAType, setItemTypeField } from './itemTypes';
import type { CollectionId, ItemTypeId, TagId } from '@/types';

beforeEach(() => {
  useItemTypeStore.setState(useItemTypeStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
  useToastStore.setState(useToastStore.getInitialState(), true);
});

const byName = (name: string) => Object.values(useItemTypeStore.getState().types).find((t) => t.name === name)!;
const tasks = () => Object.values(useTaskStore.getState().tasks);

describe('the starter set', () => {
  it('is added only on request, each Type extending the right one, and never twice', () => {
    expect(Object.keys(useItemTypeStore.getState().types)).toHaveLength(0);
    expect(addStarterSet('university')).toBe(5);
    expect(byName('Exam').extendsId).toBe(byName('Assessment').id);
    expect(byName('Essay').extendsId).toBe(byName('Assessment').id);
    expect(addStarterSet('university')).toBe(0);
  });
});

describe('giving an item a Type', () => {
  it('an Exam event gets its values, a revision task before it and a follow-up after, filed with it', () => {
    addStarterSet('university');
    const exam = byName('Exam').id;
    const sem = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    const ev = useCalendarStore.getState().addEvent({ title: 'GEOS215 final', date: '2026-11-20', collectionId: sem as CollectionId });
    const made = applyItemType({ kind: 'event', id: ev }, exam, { room: 'B12', weight: 50 });
    const e = useCalendarStore.getState().events[ev];
    expect(e.typeId).toBe(exam);
    expect(e.typeFields).toEqual({ room: 'B12', weight: 50 });
    expect(made).toHaveLength(2);
    const [revise, result] = made.map((id) => useTaskStore.getState().tasks[id]);
    expect(revise).toMatchObject({ title: 'Revise: GEOS215 final', deadline: '2026-11-13', collectionId: sem });
    expect(revise.itemLinks[0]).toMatchObject({ kind: 'prepFor', targetType: 'event', targetId: ev });
    expect(result).toMatchObject({ title: 'Check the result: GEOS215 final', deadline: '2026-12-04' });
    expect(result.itemLinks[0]).toMatchObject({ kind: 'followUpOf', targetType: 'event', targetId: ev });
    expect(itemsOfType(exam)).toBe(1);
  });

  it("only the chosen parts are made; a task's task parts are its sub-tasks; nothing without a date", () => {
    addStarterSet('university');
    const essay = byName('Essay').id;
    const t = useTaskStore.getState().addTask({ title: 'Essay 1', deadline: '2026-11-20' });
    const made = applyItemType({ kind: 'task', id: t }, essay, {}, ['draft']);
    expect(made).toHaveLength(1);
    expect(useTaskStore.getState().tasks[made[0]]).toMatchObject({ parentId: t, deadline: '2026-11-13' });
    const undated = useTaskStore.getState().addTask({ title: 'Someday essay' });
    expect(applyItemType({ kind: 'task', id: undated }, essay, {})).toEqual([]);
    expect(useTaskStore.getState().tasks[undated].typeId).toBe(essay);
  });

  it('a field is changed on its own, keeping the others', () => {
    addStarterSet('university');
    const d = useCalendarStore.getState().addDeadline({ title: 'Lab report', date: '2026-11-02' });
    applyItemType({ kind: 'deadline', id: d }, byName('Assessment').id, { weight: 20 }, []);
    setItemTypeField({ kind: 'deadline', id: d }, 'mark', 78);
    expect(useCalendarStore.getState().deadlines[d].typeFields).toEqual({ weight: 20, mark: 78 });
  });
});

describe('make this tag a Type', () => {
  it("types the tag's tasks that have no Type, keeps the tag, and Undo takes it all back", () => {
    const s = useTaskStore.getState();
    const tag = 'tg1' as TagId;
    s.addTag({ id: tag, name: 'Reading', color: null, notes: null });
    const a = s.addTask({ title: 'Ch 3', tagIds: [tag] });
    const b = s.addTask({ title: 'Ch 4', tagIds: [tag] });
    s.addTask({ title: 'Other' });
    const id = makeTagAType(tag)!;
    expect(byName('Reading').defaults.tagIds).toEqual([tag]);
    expect([a, b].map((x) => useTaskStore.getState().tasks[x].typeId)).toEqual([id, id]);
    expect(tasks().filter((t) => t.typeId)).toHaveLength(2);
    expect(tasks().every((t) => t.tagIds.length === 0 || t.tagIds[0] === tag)).toBe(true);
    useToastStore.getState().current!.actions![0].onClick();
    expect(useItemTypeStore.getState().types[id as ItemTypeId]).toBeUndefined();
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
    expect(tasks().filter((t) => t.typeId)).toHaveLength(0);
  });

  it('says so, and makes nothing, when a Type of that name exists', () => {
    addStarterSet('university');
    useTaskStore.getState().addTag({ id: 'tg2' as TagId, name: 'exam', color: null, notes: null });
    expect(makeTagAType('tg2' as TagId)).toBeNull();
    expect(Object.keys(useItemTypeStore.getState().types)).toHaveLength(5);
  });
});

describe('deleting a Type', () => {
  it('goes to the Recycling Bin; its items keep their values', () => {
    addStarterSet('university');
    const reading = byName('Reading').id;
    const t = useTaskStore.getState().addTask({ title: 'Ch 3' });
    applyItemType({ kind: 'task', id: t }, reading, { pages: '40–62' });
    useItemTypeStore.getState().deleteItemType(reading);
    expect(Object.values(useTrashStore.getState().entries)[0]).toMatchObject({ kind: 'itemType', title: 'Reading' });
    expect(useTaskStore.getState().tasks[t]).toMatchObject({ typeId: reading, typeFields: { pages: '40–62' } });
  });
});
