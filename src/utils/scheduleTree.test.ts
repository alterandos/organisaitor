// The calendar's Schedules grouped by Endeavour (utils/scheduleTree.ts): each under its Endeavour's
// chain of parents, once; loose ones at the top; a group's switch is on, off or mixed.
import { describe, expect, it } from 'vitest';
import type { Collection, CollectionId, ScheduleId, ScheduleTemplate } from '@/types';
import { groupState, scheduleTree, schedulesIn } from './scheduleTree';

const T0 = '2030-01-01T00:00:00.000Z';
const col = (id: string, partOf: string[] = []): Collection => ({
  id: id as CollectionId, kind: 'project', name: id, description: null, color: null, purposeIds: [], tagIds: [], deadline: null,
  fieldSchema: [], routineTasks: [], repeatConfig: null, collectionId: null, archivedAt: null, createdAt: T0, updatedAt: T0,
  links: partOf.map((t) => ({ kind: 'partOf' as const, targetId: t as CollectionId, createdAt: T0 })),
});
const sch = (id: string, collectionId: string | null, active = true) =>
  ({ id: id as ScheduleId, name: id, color: null, active, collectionId: collectionId as CollectionId | null, blocks: [], startDate: null, endDate: null, createdAt: T0, updatedAt: T0 }) as unknown as ScheduleTemplate;

const all = { Sem: col('Sem'), Bio: col('Bio', ['Sem']), Chem: col('Chem', ['Sem']), Gym: col('Gym') } as Record<string, Collection>;

describe('scheduleTree', () => {
  it('groups schedules by their Endeavours’ chain, each once; loose ones stay at the top', () => {
    const t = scheduleTree([sch('Bio timetable', 'Bio'), sch('Chem timetable', 'Chem', false), sch('Sem exams', 'Sem'), sch('Yoga', null)], all);
    expect(t.loose.map((s) => s.name)).toEqual(['Yoga']);
    expect(t.groups.map((g) => g.name)).toEqual(['Sem']);
    const sem = t.groups[0];
    expect(sem.schedules.map((s) => s.name)).toEqual(['Sem exams']);
    expect(sem.groups.map((g) => [g.name, g.schedules.map((s) => s.name)])).toEqual([['Bio', ['Bio timetable']], ['Chem', ['Chem timetable']]]);
    expect(schedulesIn(sem)).toHaveLength(3);
    expect(groupState(sem)).toBe('mixed');
    expect(groupState(sem.groups[0])).toBe('on');
    expect(groupState(sem.groups[1])).toBe('off');
  });
});
