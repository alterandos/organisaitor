import { describe, expect, it } from 'vitest';
import type { Collection, Goal, GoalId, GoalMeasure, RhythmStream, Task, TrackerEntry } from '@/types';
import { daysLeft, goalProgress, goalSuggestion, goalsOf, type GoalSnapshot } from './goals';

const TODAY = '2026-10-28';   // a Wednesday

const goal = (measure: GoalMeasure, extra: Partial<Goal> = {}): Goal => ({
  id: 'g1' as GoalId, title: 'Goal', target: { type: 'endeavour', id: 'geos' as never }, by: null, measure,
  checkIns: [], status: 'active', statusAt: null, createdAt: '', updatedAt: '', ...extra,
});

const reading: RhythmStream = {
  id: 'read', label: 'Reading', kind: 'doBy', typeId: null, start: '2026-09-01', time: null, notebookId: null,
  rule: { kind: 'repeat', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [1] } },
  show: { calendar: 'none', tasks: 'never', notify: false },
};

const collections: Record<string, Collection> = {
  geos:  { id: 'geos', kind: 'project', name: 'GEOS215' } as Collection,
  essay: { id: 'essay', kind: 'project', name: 'Essay', links: [{ kind: 'partOf', targetId: 'geos', createdAt: '' }] } as Collection,
  rh:    { id: 'rh', kind: 'routine', name: 'GEOS215 weekly', createdAt: '2026-09-01T00:00:00Z', repeatConfig: null, streams: [reading] } as unknown as Collection,
  study: { id: 'study', kind: 'tracker', name: 'Study', fieldSchema: [{ id: 'time', name: 'Time', type: 'duration' }, { id: 'pages', name: 'Pages', type: 'number' }] } as unknown as Collection,
};

const entry = (id: string, trackerId: string, date: string, data: Record<string, unknown>): TrackerEntry =>
  ({ id, trackerId, date, data, notes: null, createdAt: '', updatedAt: '' }) as unknown as TrackerEntry;

const task = (id: string, collectionId: string, completed: boolean, extra: Partial<Task> = {}): Task =>
  ({ id, collectionId, completed, archived: false, parentId: null, kind: 'action', ...extra }) as unknown as Task;

const snap = (extra: Partial<GoalSnapshot> = {}): GoalSnapshot => ({ tasks: {}, collections, entries: {}, schedules: {}, ...extra });

describe('a goal measured by hand', () => {
  it('reads its latest check-in against the target, either way round', () => {
    const g = goal({ kind: 'manual', unit: '%', target: 75, direction: 'atLeast' }, {
      checkIns: [{ date: '2026-10-01', value: 80, note: null }, { date: '2026-10-20', value: 72, note: 'Quiz 3' }],
    });
    expect(goalProgress(g, snap(), TODAY)).toMatchObject({ value: 72, target: 75, reached: false, text: '72% (target 75%)' });
    expect(goalProgress(goal({ kind: 'manual', unit: 'min', target: 50, direction: 'atMost' }, { checkIns: [{ date: '2026-10-20', value: 48, note: null }] }), snap(), TODAY))
      .toMatchObject({ reached: true, fraction: 1 });
    expect(goalProgress(goal({ kind: 'manual', unit: null, target: 10, direction: 'atLeast' }), snap(), TODAY)).toMatchObject({ value: null, text: 'No check-ins yet' });
  });
});

describe('a goal of keeping up a rhythm', () => {
  it('counts the done ones among its latest occurrences, leaving out ones not needed', () => {
    const entries = {
      a: entry('a', 'rh', '2026-10-26', { _stream: 'read', _status: 'done' }),
      b: entry('b', 'rh', '2026-10-19', { _stream: 'read', _status: 'notNeeded' }),
      c: entry('c', 'rh', '2026-10-12', { _stream: 'read', _status: 'done' }),
    };
    const p = goalProgress(goal({ kind: 'consistency', rhythmId: 'rh' as never, streamId: 'read', count: 3, outOf: 4 }), snap({ entries }), TODAY);
    // The last four that counted: 5 Oct, 28 Sep (missed), 12 Oct and 26 Oct (done); 19 Oct not needed.
    expect(p).toMatchObject({ value: 2, target: 3, reached: false, text: '2 of the last 4 Reading done' });
  });
});

describe('a goal from a tracker', () => {
  it('a total this week, the best, or the latest, in the field’s own units', () => {
    const entries = {
      a: entry('a', 'study', '2026-10-26', { time: 3 * 3600, pages: 20 }),
      b: entry('b', 'study', '2026-10-27', { time: 2 * 3600, pages: 35 }),
      c: entry('c', 'study', '2026-10-20', { time: 9 * 3600, pages: 10 }),
    };
    const week = goalProgress(goal({ kind: 'tracker', trackerId: 'study' as never, fieldId: 'time', target: 10 * 3600, direction: 'atLeast', aggregate: 'sum', period: 'week' }), snap({ entries }), TODAY);
    expect(week).toMatchObject({ value: 5 * 3600, fraction: 0.5, reached: false, text: '5h 0m (target 10h 0m)' });
    expect(goalProgress(goal({ kind: 'tracker', trackerId: 'study' as never, fieldId: 'pages', target: 30, direction: 'atLeast', aggregate: 'best', period: 'all' }), snap({ entries }), TODAY))
      .toMatchObject({ value: 35, reached: true });
    expect(goalProgress(goal({ kind: 'tracker', trackerId: 'study' as never, fieldId: 'pages', target: 30, direction: 'atLeast', aggregate: 'latest', period: 'all' }), snap({ entries }), TODAY).value).toBe(35);
  });
});

describe('a goal of getting its tasks done', () => {
  it('counts its own and its parts’ top-level tasks, not archived ones; or only milestones', () => {
    const tasks = {
      t1: task('t1', 'geos', true), t2: task('t2', 'essay', false), t3: task('t3', 'essay', true, { kind: 'milestone' }),
      t4: task('t4', 'geos', false, { archived: true }), t5: task('t5', 'essay', false, { parentId: 't2' as never }),
    };
    expect(goalProgress(goal({ kind: 'completion', milestonesOnly: false }), snap({ tasks }), TODAY)).toMatchObject({ value: 2, target: 3, text: '2 of 3 tasks done' });
    expect(goalProgress(goal({ kind: 'completion', milestonesOnly: true }), snap({ tasks }), TODAY)).toMatchObject({ value: 1, target: 1, reached: true });
  });
});

describe('what is suggested, and the rest', () => {
  it('reached: achieved; past its date without: overdue; nothing once settled', () => {
    const reached = { value: 1, target: 1, fraction: 1, reached: true, text: '' };
    const not = { ...reached, reached: false };
    expect(goalSuggestion(goal({ kind: 'completion', milestonesOnly: false }), reached, TODAY)).toBe('achieved');
    expect(goalSuggestion(goal({ kind: 'completion', milestonesOnly: false }, { by: '2026-10-20' }), not, TODAY)).toBe('overdue');
    expect(goalSuggestion(goal({ kind: 'completion', milestonesOnly: false }, { status: 'achieved' }), reached, TODAY)).toBeNull();
    expect(daysLeft(goal({ kind: 'completion', milestonesOnly: false }, { by: '2026-11-04' }), TODAY)).toBe(7);
    const goals = { a: goal({ kind: 'completion', milestonesOnly: false }, { id: 'a' as GoalId, status: 'achieved' }), b: goal({ kind: 'completion', milestonesOnly: false }, { id: 'b' as GoalId }) };
    expect(goalsOf(goals, 'geos').map((g) => g.id)).toEqual(['b', 'a']);
  });
});
