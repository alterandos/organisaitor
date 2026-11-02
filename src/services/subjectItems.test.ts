import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useTrashStore } from '@/store/trashStore';
import { addOutline, initSubjectWork, itemTasks, outlineDraftsFor, saveSubjectItem } from './subjectItems';
import { addStarterSet } from './itemTypes';
import { applyScheduleBounds } from './schedules';
import { readCourseOutline } from '@/utils/courseOutline';
import { blankDraft, draftFromDeadline, draftFromEvent, scheduleListOf, workListOf } from '@/utils/subjectItems';
import { expandRepeat } from '@/utils/recurrence';
import type { CalendarDeadlineId, CalendarEventId, CollectionId } from '@/types';

// A subject's items from its editor (docs/features/endeavours.md phase 7 (d)): the Schedule's
// repeating classes are its Schedule's items (so the semester's breaks apply), one-offs plain
// events, Work is Deadlines, and work can follow the classes.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 20, 10, 0));
  for (const s of [useTaskStore, useCalendarStore, useScheduleStore, useItemTypeStore, useTrashStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});
afterEach(() => { vi.useRealTimers(); });

const OUTLINE = 'Lectures: Wednesday 10-12, Friday 1-2pm\nLab 1, week 4 Thursday, 12-13\nWeekly readings\nEssay, 40%, due 23 October';

function semesterWithSubject(): { sem: CollectionId; sub: CollectionId } {
  const t = useTaskStore.getState();
  const sem = t.addCollection({ kind: 'project', name: 'Semester 2' });
  t.updateCollection(sem, { period: { start: '2026-07-27', end: '2026-11-06', breaks: [{ id: 'b', label: 'Break', from: '2026-09-28', to: '2026-10-02' }] } });
  const sub = t.addCollection({ kind: 'project', name: 'GEOS215 Climate Systems' });
  t.updateCollection(sub, { templateId: 'subject' });
  t.addEndeavourLink(sub, 'partOf', sem);
  return { sem, sub };
}

describe('a course outline read into a subject', () => {
  it('shows what it would add, then adds it: classes with the semester’s breaks, a reading before each lecture; Undo leaves nothing', () => {
    const { sub } = semesterWithSubject();
    const outline = readCourseOutline(OUTLINE, '2026-07-27');
    expect(outlineDraftsFor(sub, outline).map((d) => [d.kind, d.title])).toEqual([
      ['schedule', 'GEOS215 lecture'], ['schedule', 'GEOS215 lecture'], ['schedule', 'GEOS215 Lab 1'], ['work', 'Essay'], ['work', 'Reading'],
    ]);
    expect(useCalendarStore.getState().events).toEqual({});   // nothing made yet

    const { made, undo } = addOutline(sub, outline);
    expect(made).toBe(5);
    const { events, deadlines } = useCalendarStore.getState();
    const schedule = scheduleListOf(sub, events);
    const [wed, fri, lab] = schedule;
    expect([wed.date, wed.startTime, fri.date, fri.startTime]).toEqual(['2026-07-29', '10:00', '2026-07-31', '13:00']);
    const timetable = Object.values(useScheduleStore.getState().schedules)[0];
    expect(timetable).toMatchObject({ name: 'GEOS215 classes', collectionId: sub });
    expect(wed.scheduleId).toBe(timetable.id);
    expect(wed.repeat).toMatchObject({ endKind: 'until', until: '2026-11-06' });
    expect(wed.repeat!.exceptions).toContain('2026-09-30');   // the semester's break, taken live
    expect(lab).toMatchObject({ title: 'GEOS215 Lab 1', date: '2026-08-20', repeat: null });
    expect(lab.scheduleId ?? null).toBeNull();

    const work = workListOf(sub, deadlines);
    const essay = work.find((d) => d.title === 'Essay')!;
    expect(essay.typeFields).toMatchObject({ weight: 40 });
    expect(useItemTypeStore.getState().types[essay.typeId!].name).toBe('Essay');
    const reading = work.find((d) => d.title === 'Reading')!;
    expect(reading.repeat?.follows?.ids.sort()).toEqual([wed.id, fri.id].sort());
    expect(reading.repeat?.dates?.slice(0, 2)).toEqual(['2026-07-28', '2026-07-30']);
    expect(reading.repeat?.dates).not.toContain('2026-09-29');   // no lecture on the break's Wednesday
    expect(draftFromDeadline(reading, events).follow).toEqual({ title: 'GEOS215 lecture', offsetDays: -1 });

    undo();
    expect(useCalendarStore.getState().events).toEqual({});
    expect(useCalendarStore.getState().deadlines).toEqual({});
    expect(useScheduleStore.getState().schedules).toEqual({});
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);   // the Essay's parts
    expect(useItemTypeStore.getState().types).toEqual({});
    expect(useTrashStore.getState().entries).toEqual({});
  });
});

describe('an item saved from its small editor', () => {
  it('a one-off becomes a Schedule item once it repeats, and leaves it (with its break days) when it stops', () => {
    const { sub } = semesterWithSubject();
    const id = saveSubjectItem(sub, { ...blankDraft('schedule', '2026-08-05'), title: 'Field trip', start: '09:00' }) as CalendarEventId;
    expect(useCalendarStore.getState().events[id]).toMatchObject({ collectionId: sub });
    expect(useCalendarStore.getState().events[id].scheduleId ?? null).toBeNull();

    const weekly = { freq: 'weekly' as const, interval: 1, endKind: 'forever' as const, count: null, until: null };
    saveSubjectItem(sub, { ...draftFromEvent(useCalendarStore.getState().events[id]), repeat: weekly }, id);
    expect(useCalendarStore.getState().events[id].scheduleId).toBeTruthy();
    applyScheduleBounds();   // the watcher's work, started from App.tsx in the app
    expect(useCalendarStore.getState().events[id].repeat).toMatchObject({ until: '2026-11-06', breakSkips: expect.arrayContaining(['2026-09-30']) });

    saveSubjectItem(sub, { ...draftFromEvent(useCalendarStore.getState().events[id]), repeat: null }, id);
    expect(useCalendarStore.getState().events[id]).toMatchObject({ scheduleId: null, repeat: null, collectionId: sub });
  });

  it('work following the classes needs classes with dates; its worth goes in its Type’s weight', () => {
    const { sub } = semesterWithSubject();
    addStarterSet('university');
    const follow = { ...blankDraft('work', '2026-07-27'), title: 'Reading', follow: { title: 'GEOS215 lecture', offsetDays: -1 } };
    expect(saveSubjectItem(sub, follow)).toBeNull();

    saveSubjectItem(sub, { ...blankDraft('schedule', '2026-07-29'), title: 'GEOS215 lecture', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null } });
    const rid = saveSubjectItem(sub, follow) as CalendarDeadlineId;
    const reading = useCalendarStore.getState().deadlines[rid];
    expect(reading.date).toBe('2026-07-28');
    expect(expandRepeat(reading.date, reading.repeat!, '2026-08-01', '2026-08-10')).toEqual(['2026-08-04']);

    const assessment = Object.values(useItemTypeStore.getState().types).find((t) => t.name === 'Assessment')!;
    const qid = saveSubjectItem(sub, { ...blankDraft('work', '2026-08-07'), title: 'Quiz', typeId: assessment.id, typeFields: { weight: 10 } }) as CalendarDeadlineId;
    expect(useCalendarStore.getState().deadlines[qid].typeFields).toMatchObject({ weight: 10 });
    saveSubjectItem(sub, { ...draftFromDeadline(useCalendarStore.getState().deadlines[qid], {}), typeFields: { weight: 15 } }, qid);
    expect(useCalendarStore.getState().deadlines[qid].typeFields).toMatchObject({ weight: 15 });
  });
});

describe('a subject’s repeating Work', () => {
  it('ends with the period and skips its breaks, live from the semester; its own skips are kept', () => {
    const { sem, sub } = semesterWithSubject();
    const stop = initSubjectWork();
    const id = saveSubjectItem(sub, { ...blankDraft('work', '2026-07-31'), title: 'Weekly quiz',
      repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [5], exceptions: ['2026-08-14'] } }) as CalendarDeadlineId;
    const quiz = () => useCalendarStore.getState().deadlines[id];
    expect(quiz().repeat).toMatchObject({ endKind: 'until', until: '2026-11-06' });
    expect(quiz().repeat!.exceptions).toEqual(expect.arrayContaining(['2026-08-14', '2026-10-02']));
    expect(expandRepeat(quiz().date, quiz().repeat!, '2026-09-25', '2026-10-09')).toEqual(['2026-09-25', '2026-10-09']);

    // The semester's break moves a week later: the quiz follows; the person's own skip stays.
    useTaskStore.getState().updateCollection(sem, { period: { start: '2026-07-27', end: '2026-11-06', breaks: [{ id: 'b', label: 'Break', from: '2026-10-05', to: '2026-10-09' }] } });
    expect(expandRepeat(quiz().date, quiz().repeat!, '2026-09-25', '2026-10-16')).toEqual(['2026-09-25', '2026-10-02', '2026-10-16']);
    expect(quiz().repeat!.exceptions).toContain('2026-08-14');
    stop();
  });

  it('a repeating Deadline in an Endeavour that isn’t a subject is left alone', () => {
    const { sem } = semesterWithSubject();
    const id = useCalendarStore.getState().addDeadline({ title: 'Rent', date: '2026-08-01', collectionId: sem,
      repeat: { freq: 'monthly', interval: 1, endKind: 'forever', count: null, until: null } });
    const stop = initSubjectWork();
    expect(useCalendarStore.getState().deadlines[id].repeat).toMatchObject({ endKind: 'forever' });
    stop();
  });
});

describe('a Type’s tasks are made only when wanted (the user, 2026-10-30)', () => {
  it('a new Exam makes the tasks chosen; changing its values makes none; the outline can leave them out', () => {
    const { sub } = semesterWithSubject();
    addStarterSet('university');
    const exam = Object.values(useItemTypeStore.getState().types).find((t) => t.name === 'Exam')!;
    const none = saveSubjectItem(sub, { ...blankDraft('work', '2026-11-10'), title: 'Final exam', typeId: exam.id, partIds: [] })!;
    expect(itemTasks(none)).toEqual([]);
    const one = saveSubjectItem(sub, { ...blankDraft('work', '2026-11-12'), title: 'Mid exam', typeId: exam.id, partIds: ['revise'] })!;
    expect(itemTasks(one).map((t) => t.title)).toEqual([expect.stringContaining('Revise')]);
    saveSubjectItem(sub, { ...draftFromDeadline(useCalendarStore.getState().deadlines[one as CalendarDeadlineId], {}), typeFields: { weight: 30 } }, one);
    expect(itemTasks(one)).toHaveLength(1);

    addOutline(sub, readCourseOutline('Essay, 40%, due 23 October', '2026-07-27'), { typeTasks: false });
    const essay = Object.values(useCalendarStore.getState().deadlines).find((d) => d.title === 'Essay')!;
    expect(essay.typeFields).toMatchObject({ weight: 40 });
    expect(itemTasks(essay.id)).toEqual([]);
  });
});
