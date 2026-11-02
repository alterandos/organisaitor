import { beforeEach, describe, expect, it } from 'vitest';
import { read } from '@/agent/access';
import { revertBatch } from '@/agent';
import { fails, ok, resetStores, run } from '@/test/helpers';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useGoalStore } from '@/store/goalStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { expandRepeat } from '@/utils/recurrence';

// Semesters and subjects for the agent (docs/features/endeavours.md phase 7 (d)): the same
// templates and services as the template picker and the subject editor.

beforeEach(resetStores);

const SEMESTER = {
  name: 'Semester 2', teachingStart: '2031-07-28', teachingEnd: '2031-11-07', examsFrom: '2031-11-10', examsTo: '2031-11-22',
  breaks: [{ label: 'Mid-semester break', from: '2031-09-29', to: '2031-10-03' }], subjects: ['GEOS215 Climate Systems'], averageTarget: 75,
};

function semester() {
  return ok('create_semester', SEMESTER, { approved: true });
}

describe('create_semester and create_subject', () => {
  it('a semester needs approval, then makes its period, subjects (taking it live), admin list and goal', () => {
    expect(run('create_semester', SEMESTER).status).toBe('needs_approval');
    const out = semester();
    expect(out.created).toMatchObject({ name: 'Semester 2', template: 'semester' });
    expect(out.period).toMatchObject({ start: '2031-07-28', end: '2031-11-07', exams: { from: '2031-11-10', to: '2031-11-22' } });
    expect(out.subjects.map((s: { name: string }) => s.name)).toEqual(['GEOS215 Climate Systems']);
    const sub = ok('get_subject', { endeavourId: out.subjects[0].id });
    expect(sub.period).toMatchObject({ start: '2031-07-28', inheritedFrom: 'Semester 2' });
    expect(Object.values(useListStore.getState().lists).map((l) => l.name)).toEqual(['Semester 2 admin']);
    expect(Object.values(useGoalStore.getState().goals).map((g) => g.title)).toEqual(['Average 75% this semester']);
    expect(fails('create_semester', SEMESTER, { approved: true }).message).toMatch(/already exists/);
  });

  it('a subject part of a semester; undoing the batch removes everything it made, notebook and Types included', () => {
    const sem = semester().created.id;
    const r = run('create_subject', { code: 'HIST110', name: 'Modern Europe', semesterId: sem, targetMark: 70 });
    expect(r.status).toBe('done');
    const id = (r as { output: { created: { id: string } } }).output.created.id;
    expect(read.endeavour(id)).toMatchObject({ name: 'HIST110 Modern Europe', templateId: 'subject' });
    const notebooks = Object.keys(useNoteStore.getState().noteTags).length;
    revertBatch((r as { batchId: string }).batchId);
    expect(read.endeavour(id)).toBeUndefined();
    expect(Object.keys(useNoteStore.getState().noteTags)).toHaveLength(notebooks - 1);
    expect(Object.values(useGoalStore.getState().goals).map((g) => g.title)).not.toContain('At least 70% in HIST110');
  });
});

describe('a subject\'s items', () => {
  function subject() {
    const out = semester();
    return out.subjects[0].id as string;
  }

  it('adds a weekly lecture, a reading the day before each, and a weekly quiz bounded by the period and the break', () => {
    const id = subject();
    ok('add_subject_item', { subjectId: id, kind: 'schedule', title: 'GEOS215 lecture', type: 'Lecture', date: '2031-07-30', start: '10:00', end: '12:00', place: 'Carslaw 175',
      repeat: { freq: 'weekly', daysOfWeek: [3] } });
    ok('add_subject_item', { subjectId: id, kind: 'work', title: 'Reading', type: 'Reading', date: '2031-07-28', followClass: { title: 'GEOS215 lecture', offsetDays: -1 } });
    const quiz = ok('add_subject_item', { subjectId: id, kind: 'work', title: 'Weekly quiz', type: 'Assessment', date: '2031-08-01', start: '17:00', worth: 10,
      notes: 'best 8 of 9 count', repeat: { freq: 'weekly', daysOfWeek: [5] } }).added;

    const got = ok('get_subject', { endeavourId: id });
    expect(got.schedule).toEqual([expect.objectContaining({ title: 'GEOS215 lecture', type: 'Lecture', place: 'Carslaw 175' })]);
    expect(got.work.map((w: { title: string }) => w.title).sort()).toEqual(['Reading', 'Weekly quiz']);
    expect(got.work.find((w: { title: string }) => w.title === 'Reading').follows).toEqual({ title: 'GEOS215 lecture', offsetDays: -1 });
    expect(got.work.find((w: { title: string }) => w.title === 'Weekly quiz')).toMatchObject({ worth: 10, notes: 'best 8 of 9 count', type: 'Assessment' });

    const d = read.deadline(quiz)!;
    expect(d.repeat).toMatchObject({ endKind: 'until', until: '2031-11-07' });
    expect(expandRepeat(d.date, d.repeat!, '2031-09-26', '2031-10-10')).toEqual(['2031-09-26', '2031-10-10']);   // not in the break
    expect(useItemTypeStore.getState().types[d.typeId!].name).toBe('Assessment');
  });

  it('updates only what is given; refuses what doesn\'t fit', () => {
    const id = subject();
    const item = ok('add_subject_item', { subjectId: id, kind: 'work', title: 'Essay', type: 'Essay', date: '2031-10-24', worth: 40 }).added;
    ok('update_subject_item', { itemId: item, worth: 35, notes: 'Word limit 2,000' });
    expect(read.deadline(item)).toMatchObject({ title: 'Essay', date: '2031-10-24', notes: 'Word limit 2,000', typeFields: { weight: 35 } });

    expect(fails('add_subject_item', { subjectId: id, kind: 'work', title: 'Reading', date: '2031-08-01', followClass: { title: 'Lecture', offsetDays: -1 } }).message).toMatch(/No repeating Schedule item/);
    expect(fails('add_subject_item', { subjectId: id, kind: 'schedule', title: 'Lab', date: '2031-08-01', worth: 5 }).message).toMatch(/Work items only/);
    expect(fails('add_subject_item', { subjectId: id, kind: 'work', title: 'Quiz', type: 'Nonsense', date: '2031-08-01' }).message).toMatch(/No Type named/);
    const notSubject = read.endeavours().find((c) => c.templateId === 'semester')!.id;
    expect(fails('add_subject_item', { subjectId: notSubject, kind: 'work', title: 'X', date: '2031-08-01' }).message).toMatch(/isn't a subject/);
  });
});

describe('set_period', () => {
  it('gives a subject its own period, then takes the semester\'s again', () => {
    const sub = semester().subjects[0].id;
    ok('set_period', { endeavourId: sub, start: '2031-12-01', end: '2032-02-20', breaks: [] });
    const own = ok('get_subject', { endeavourId: sub }).period;
    expect(own).toMatchObject({ start: '2031-12-01', end: '2032-02-20' });
    expect(own.breaks).toBeUndefined();   // none (empty lists are left out of what the agent reads)
    expect(own.inheritedFrom).toBeUndefined();   // starts from the semester's, so its exam period comes too
    expect(fails('set_period', { endeavourId: sub, start: '2032-03-01' }).message).toMatch(/end is before the start/);
    ok('set_period', { endeavourId: sub, inherit: true });
    expect(read.endeavour(sub)!.period).toBeNull();
    expect(ok('get_subject', { endeavourId: sub }).period).toMatchObject({ inheritedFrom: 'Semester 2' });
  });
});

describe('mark_subject_date', () => {
  it('lists Work behind and classes not marked, and marks them', () => {
    const sub = semester().subjects[0].id;
    const today = read.today();
    const back = (n: number) => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const lec = ok('add_subject_item', { subjectId: sub, kind: 'schedule', title: 'Lecture', date: back(3), onDates: [back(3)] }).added;
    const quiz = ok('add_subject_item', { subjectId: sub, kind: 'work', title: 'Quiz', date: back(2), onDates: [back(2)] }).added;
    const before = ok('get_subject', { endeavourId: sub }).behindOrUnmarked;
    expect(before).toEqual(expect.arrayContaining([
      { itemId: lec, title: 'Lecture', date: back(3), state: 'notMarked' },
      { itemId: quiz, title: 'Quiz', date: back(2), state: 'behind' },
    ]));
    ok('mark_subject_date', { itemId: lec, date: back(3) });
    ok('mark_subject_date', { itemId: quiz, date: back(2) });
    expect(read.event(lec)!.attendedDates).toEqual([back(3)]);
    expect(read.deadline(quiz)!.doneDates).toEqual([back(2)]);
    expect(ok('get_subject', { endeavourId: sub }).behindOrUnmarked).toBeUndefined();
    expect(fails('mark_subject_date', { itemId: quiz, date: back(1) }).message).toMatch(/doesn't fall on/);
  });
});

describe('add_subject_item in a class’s time', () => {
  it('an in-class essay instead of the lecture; refused when it falls in no class', () => {
    const sub = semester().subjects[0].id;
    const lec = ok('add_subject_item', { subjectId: sub, kind: 'schedule', title: 'Lecture', date: '2031-07-29', start: '12:00', end: '14:00', repeat: { freq: 'weekly', daysOfWeek: [2] } }).added;
    const essay = ok('add_subject_item', { subjectId: sub, kind: 'schedule', title: 'In-class essay', date: '2031-08-12', start: '12:00', end: '14:00', inClass: 'instead' }).added;
    expect(read.event(essay)!.onClass).toEqual({ eventId: lec, date: '2031-08-12', mode: 'replaces' });
    expect(fails('add_subject_item', { subjectId: sub, kind: 'work', title: 'Quiz', date: '2031-08-13', start: '12:30', inClass: 'during' }).message).toMatch(/doesn't fall in any/);
  });
});
