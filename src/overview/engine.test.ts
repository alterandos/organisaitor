import { describe, expect, it } from 'vitest';
import { createTask } from '@/services/taskService';
import { runOverview, endeavourOverviewQuery, DEFAULT_QUERY } from './engine';
import type { OverviewSnapshot } from './sources';
import type { CalendarEvent, Collection, Task, TrackerEntry } from '@/types';
import type { List, ListItem } from '@/types/lists';
import type { Note, NoteTag } from '@/types/notes';
import type { OverviewQuery } from '@/types/overview';

const TODAY = '2026-10-01';
const T = '2026-09-01T00:00:00.000Z';

const task = (title: string, extra: Partial<Task> = {}): Task => ({ ...createTask({ title }, 0), ...extra });
const endeavour = (id: string, name: string, extra: Partial<Collection> = {}) =>
  ({ id, name, kind: 'project', color: null, collectionId: null, archivedAt: null, ...extra }) as unknown as Collection;
const event = (id: string, title: string, date: string, extra: Partial<CalendarEvent> = {}) =>
  ({ id, title, date, endDate: null, startTime: null, repeat: null, eventType: 'default', collectionId: null, archivedAt: null, location: null, ...extra }) as unknown as CalendarEvent;
const list = (id: string, name: string, extra: Partial<List> = {}): List => ({
  id: id as never, name, description: null, typeId: null, kind: 'reference', color: null, icon: null,
  fieldSchema: [{ id: 'due', name: 'Due', type: 'date' }], tabs: [], isEncrypted: false, encryptedPayload: null,
  crossAppRefs: [], resetOnTaskComplete: false, collectionId: null, createdAt: T, updatedAt: T, ...extra,
});
const item = (id: string, listId: string, title: string, extra: Partial<ListItem> = {}): ListItem => ({
  id: id as never, listId: listId as never, title, status: 'want', tabId: null, data: {}, notes: null, links: [], order: 0,
  isEncrypted: false, encryptedPayload: null, createdAt: T, updatedAt: T, ...extra,
});
const note = (id: string, title: string, extra: Partial<Note> = {}) =>
  ({ id, title, tagIds: [], collectionId: null, archivedAt: null, ...extra }) as unknown as Note;

function snap(parts: Partial<OverviewSnapshot> = {}): OverviewSnapshot {
  return {
    tasks: {}, collections: {}, events: {}, reminders: {}, deadlines: {}, notes: {}, noteTags: {},
    lists: {}, listItems: {}, entries: {}, lockedNoteIds: new Set(), lockedListIds: new Set(), ...parts,
  };
}
const byId = <X extends { id: string }>(...xs: X[]) => Object.fromEntries(xs.map((x) => [x.id, x]));
const q = (over: Partial<OverviewQuery>): OverviewQuery => ({ ...DEFAULT_QUERY, when: 'any', windowDays: null, ...over });
const titles = (s: OverviewSnapshot, query: OverviewQuery) => runOverview(query, s, TODAY).groups.flatMap((g) => g.rows.map((r) => r.title));

describe('sources — every app maps onto the common row', () => {
  it('tasks: date is the deadline, else the scheduled day; a sub-task names its parent; archived never shows', () => {
    const parent = task('Parent', { deadline: '2026-10-05' });
    const sub = task('Sub', { parentId: parent.id, scheduledAt: '2026-10-03' });
    const gone = task('Gone', { archived: true });
    const r = runOverview(q({}), snap({ tasks: byId(parent, sub, gone) }), TODAY).groups[0].rows;
    expect(r.map((x) => [x.title, x.when, x.context])).toEqual([['Sub', '2026-10-03', 'Parent'], ['Parent', '2026-10-05', null]]);
  });

  it('calendar: a task’s own shadow event is left out, a past one is "past", a repeating one shows its next date', () => {
    const s = snap({ events: byId(
      event('e1', 'Shadow', '2026-10-02', { eventType: 'task' }),
      event('e2', 'Old', '2026-09-01'),
      event('e3', 'Weekly', '2026-09-03', { repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null } }),
    ) });
    const rows = runOverview(q({ status: 'all' }), s, TODAY).groups[0].rows;
    expect(rows.map((r) => [r.title, r.when, r.status])).toEqual([['Old', '2026-09-01', 'past'], ['Weekly', '2026-10-01', 'open']]);
  });

  it('list items: date from the list’s first date field (or the tab’s own), Endeavour from the list, done when ticked', () => {
    const l = list('l1', 'Assessments', {
      collectionId: 'c1' as never,
      tabs: [{ id: 'tb', name: 'Lab', color: null, fieldSchema: [{ id: 'labDue', name: 'Due', type: 'date' }] }],
    });
    const s = snap({ lists: byId(l), listItems: byId(
      item('i1', 'l1', 'Essay', { data: { due: '2026-10-10' } }),
      item('i2', 'l1', 'Lab report', { tabId: 'tb', data: { labDue: '2026-10-08' } }),
      item('i3', 'l1', 'Quiz', { status: 'done', data: { due: '2026-09-20' } }),
    ) });
    const rows = runOverview(q({ status: 'all', collectionId: 'c1' as never, sources: ['listItem'] }), s, TODAY).groups[0].rows;
    expect(rows.map((r) => [r.title, r.when, r.status, r.context])).toEqual([
      ['Quiz', '2026-09-20', 'done', 'Assessments'],
      ['Lab report', '2026-10-08', 'open', 'Assessments › Lab'],
      ['Essay', '2026-10-10', 'open', 'Assessments'],
    ]);
  });

  it('notes take their notebook’s Endeavour; tracker entries their tracker’s', () => {
    const notebook = { id: 'nb', kind: 'area', parentTagId: null, collectionId: 'c1' } as unknown as NoteTag;
    const tracker = endeavour('tr', 'Weight', { kind: 'tracker', collectionId: 'c1' as never });
    const entry = { id: 'en', trackerId: 'tr', date: '2026-09-30', data: {}, notes: null } as unknown as TrackerEntry;
    const s = snap({
      notes: byId(note('n1', 'Plan', { tagIds: ['nb' as never] })), noteTags: { nb: notebook },
      collections: byId(tracker), entries: byId(entry),
    });
    expect(titles(s, q({ status: 'all', collectionId: 'c1' as never, sort: 'title' }))).toEqual(['Plan', 'Weight']);
  });

  it('locked notes/lists are never shown, only counted — and only under a matching Endeavour filter', () => {
    const s = snap({
      notes: byId(note('n1', '', { collectionId: 'c1' as never }), note('n2', '', { collectionId: 'c2' as never })),
      lists: byId(list('l1', '', { collectionId: 'c1' as never })),
      listItems: byId(item('i1', 'l1', ''), item('i2', 'l1', '')),
      lockedNoteIds: new Set(['n1', 'n2']), lockedListIds: new Set(['l1']),
    });
    const all = runOverview(q({}), s, TODAY);
    expect(all.total).toBe(0);
    expect(all.hiddenLocked).toBe(5);
    expect(runOverview(q({ collectionId: 'c1' as never }), s, TODAY).hiddenLocked).toBe(4);
  });
});

describe('filters, sort and grouping', () => {
  const s = snap({ tasks: byId(
    task('Overdue', { deadline: '2026-09-28' }),
    task('Soon', { deadline: '2026-10-04' }),
    task('Later', { deadline: '2026-11-20' }),
    task('Undated'),
    task('Finished', { deadline: '2026-10-02', completed: true }),
  ) });

  it('upcoming within a window; past within a window; has a date', () => {
    expect(titles(s, q({ when: 'upcoming', windowDays: 14 }))).toEqual(['Soon']);
    expect(titles(s, q({ when: 'upcoming' }))).toEqual(['Soon', 'Later']);
    expect(titles(s, q({ when: 'past', windowDays: 7 }))).toEqual(['Overdue']);
    expect(titles(s, q({ when: 'dated' }))).toEqual(['Overdue', 'Soon', 'Later']);
  });

  it('open only vs open and done; title search matches every word', () => {
    expect(titles(s, q({ status: 'all', when: 'dated' }))).toEqual(['Overdue', 'Finished', 'Soon', 'Later']);
    expect(titles(s, q({ search: 'soo' }))).toEqual(['Soon']);
  });

  it('undated items sort last in both date directions', () => {
    expect(titles(s, q({}))).toEqual(['Overdue', 'Soon', 'Later', 'Undated']);
    expect(titles(s, q({ sort: 'when-desc' }))).toEqual(['Later', 'Soon', 'Overdue', 'Undated']);
  });

  it('groups by month in date order with undated last, and by Endeavour with "none" last', () => {
    const months = runOverview(q({ groupBy: 'month' }), s, TODAY).groups.map((g) => g.key);
    expect(months).toEqual(['2026-09', '2026-10', '2026-11', '~none']);
    const s2 = snap({
      collections: byId(endeavour('c1', 'Zeta'), endeavour('c2', 'Alpha')),
      tasks: byId(task('A', { collectionId: 'c1' as never }), task('B', { collectionId: 'c2' as never }), task('C')),
    });
    expect(runOverview(q({ groupBy: 'endeavour' }), s2, TODAY).groups.map((g) => g.label)).toEqual(['Alpha', 'Zeta', 'No endeavour']);
  });

  it('the Endeavour overview gathers open items from every app, grouped by app in registry order', () => {
    const s3 = snap({
      tasks: byId(task('Task', { collectionId: 'c1' as never }), task('Other')),
      events: byId(event('e1', 'Lecture', '2026-10-06', { collectionId: 'c1' as never })),
      lists: byId(list('l1', 'Reading', { collectionId: 'c1' as never })),
    });
    const res = runOverview(endeavourOverviewQuery('c1' as never), s3, TODAY);
    expect(res.groups.map((g) => [g.key, g.rows.map((r) => r.title)])).toEqual([
      ['task', ['Task']], ['event', ['Lecture']], ['list', ['Reading']],
    ]);
  });
});
