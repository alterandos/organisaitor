import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useTrashStore } from '@/store/trashStore';
import { ENDEAVOUR_TEMPLATES, TEMPLATE_BY_ID, initialValues, newRow, type TemplateValues } from '@/config/endeavourTemplates';
import { applyTemplate, planLines } from './endeavourTemplates';
import { rhythmOccurrences, tickIndex } from '@/utils/rhythms';

beforeEach(() => {
  for (const s of [useTaskStore, useCalendarStore, useNoteStore, useScheduleStore, useGoalStore, useItemTypeStore, useTrashStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});

// The user's example (2026-10-30): two lectures at different times, a tutorial, two labs (one in a
// teaching week, one on a date), a lab report after each, a reading before each lecture, a quiz.
function subject(): TemplateValues {
  const t = TEMPLATE_BY_ID['university-subject'];
  const lab1 = newRow({ type: 'Lab', title: 'Lab 1', when: 'week', week: 4, day: 4, start: '12:00', end: '13:00' });
  const lab2 = newRow({ type: 'Lab', title: 'Lab 2', when: 'date', date: '2026-10-24', start: '12:00', end: '13:00' });
  return {
    ...initialValues(t), code: 'GEOS215', name: 'Climate Systems', start: '2026-07-27', end: '2026-11-06',
    classes: [
      newRow({ type: 'Lecture', day: 3, start: '10:00', end: '12:00', location: 'Carslaw 175' }),
      newRow({ type: 'Lecture', day: 5, start: '13:00', end: '14:00', location: '' }),
      newRow({ type: 'Tutorial', day: 2, start: '09:00', end: '10:00', location: '' }),
    ],
    oneOffs: [lab1, lab2],
    routines: [
      newRow({ what: 'Reading', kind: 'doBy', freq: 'before', cls: 'Lecture', offset: 1, type: 'Reading' }),
      newRow({ what: 'Weekly quiz', kind: 'submit', freq: 'weekly', day: 5, time: '17:00', worth: 10, type: '' }),
    ],
    tasks: [
      newRow({ title: 'Lab report 1', type: 'Assessment', worth: 15, when: 'after', offset: 2, unit: 'weeks', anchor: lab1._id }),
      newRow({ title: 'Lab report 2', type: 'Assessment', worth: 15, when: 'after', offset: 16, unit: 'days', anchor: lab2._id }),
      newRow({ title: 'Essay', type: 'Essay', worth: 40, when: 'date', date: '2026-10-23' }),
    ],
  };
}

describe('the University subject template', () => {
  it('plans each class, one-off class, routine task and assessment, with dates worked out', () => {
    const plan = TEMPLATE_BY_ID['university-subject'].plan(subject());
    expect(planLines(plan)).toEqual([
      '🎯 GEOS215 Climate Systems',
      '📓 GEOS215 Climate Systems',
      '🗓 GEOS215 classes: GEOS215 lecture, GEOS215 lecture, GEOS215 tutorial',
      '📅 GEOS215 Lab 1 · 2026-08-20 12:00',
      '📅 GEOS215 Lab 2 · 2026-10-24 12:00',
      '🔄 GEOS215 each week: Lecture, Tutorial, Reading, Weekly quiz (10%)',
      '🏁 Lab report 1 · 2026-09-03 (Assessment)',
      '🏁 Lab report 2 · 2026-11-09 (Assessment)',
      '🏁 Essay · 2026-10-23 (Essay)',
      '🎯 At least 75% in GEOS215',
    ]);
  });

  it('sets it all up; the reading follows both lectures; Undo leaves nothing behind', () => {
    const sem = useTaskStore.getState().addCollection({ kind: 'list', name: 'Semester 2' });
    const { id, undo } = applyTemplate(TEMPLATE_BY_ID['university-subject'].plan(subject()), sem);

    const c = useTaskStore.getState().collections[id];
    expect(c).toMatchObject({ name: 'GEOS215 Climate Systems', kind: 'project', deadline: '2026-11-06' });
    expect(c.links?.[0]).toMatchObject({ kind: 'partOf', targetId: sem });
    const tt = Object.values(useScheduleStore.getState().schedules)[0];
    expect(tt.blocks.map((b) => [b.daysOfWeek, b.startTime])).toEqual([[[3], '10:00'], [[5], '13:00'], [[2], '09:00']]);
    expect(Object.values(useCalendarStore.getState().events).map((e) => [e.title, e.date, e.startTime])).toEqual([
      ['GEOS215 Lab 1', '2026-08-20', '12:00'], ['GEOS215 Lab 2', '2026-10-24', '12:00'],
    ]);
    const rhythm = Object.values(useTaskStore.getState().collections).find((x) => x.kind === 'routine')!;
    const reading = rhythm.streams!.find((s) => s.label === 'Reading')!;
    expect(reading.rule).toMatchObject({ kind: 'relative', blockId: tt.blocks[0].id, blockIds: [tt.blocks[1].id], offsetDays: -1 });
    // A reading the day before each lecture: Tuesday and Thursday.
    const week = rhythmOccurrences(rhythm, useScheduleStore.getState().schedules, tickIndex({}, {}), '2026-08-03', '2026-08-09', '2026-08-03')
      .filter((o) => o.stream.label === 'Reading').map((o) => o.date);
    expect(week).toEqual(['2026-08-04', '2026-08-06']);
    expect(rhythm.streams!.find((s) => s.label === 'Weekly quiz')).toMatchObject({ kind: 'submit', worth: 10, time: '17:00' });
    expect(Object.values(useCalendarStore.getState().deadlines).find((d) => d.title === 'Lab report 1')).toMatchObject({ date: '2026-09-03', typeFields: { weight: 15 } });

    undo();
    expect(Object.keys(useTaskStore.getState().collections)).toEqual([sem]);
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);
    expect(Object.keys(useCalendarStore.getState().events)).toHaveLength(0);
    expect(Object.keys(useCalendarStore.getState().deadlines)).toHaveLength(0);
    expect(Object.keys(useScheduleStore.getState().schedules)).toHaveLength(0);
    expect(Object.keys(useNoteStore.getState().noteTags)).toHaveLength(0);
    expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0);
    expect(Object.keys(useItemTypeStore.getState().types)).toHaveLength(0);
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
  });

  it('the wand fills the lists from an outline, adding to what is there', () => {
    const t = TEMPLATE_BY_ID['university-subject'];
    const values = { ...initialValues(t), start: '2026-07-27' };
    const read = t.wand!.read('GEOS215 Climate Systems\nLectures: Wednesday 10-12, Friday 1-2pm\nLab 1, week 4 Thursday, 12-13\nWeekly readings\nEssay, 40%, due 23 October', values)!;
    expect((read.classes as unknown[]).length).toBe(2);
    expect(read.oneOffs).toEqual([expect.objectContaining({ title: 'Lab 1', date: '2026-08-20' })]);
    expect(read.routines).toEqual([expect.objectContaining({ what: 'Reading', freq: 'before', cls: 'Lecture' })]);
    expect(read.tasks).toEqual([expect.objectContaining({ title: 'Essay', worth: 40, date: '2026-10-23' })]);
    // Read again: nothing comes twice.
    const again = t.wand!.read('Lectures: Wednesday 10-12, Friday 1-2pm\nEssay, 40%, due 23 October', { ...values, ...read })!;
    expect((again.classes as unknown[]).length).toBe(2);
    expect((again.tasks as unknown[]).length).toBe(1);
  });
});

describe('the other templates', () => {
  it('a training plan: sessions as a rhythm, the aim and keeping it up as goals', () => {
    const t = TEMPLATE_BY_ID['training-plan'];
    const plan = t.plan({ ...initialValues(t), name: 'Half marathon', goal: '21 km under 2 hours', by: '2027-04-01' });
    expect(planLines(plan)).toEqual(['🎯 Half marathon', '🔄 Half marathon sessions: Session', '🎯 21 km under 2 hours', '🎯 Keep up the sessions']);
    expect(plan.endeavour).toMatchObject({ kind: 'project', deadline: '2027-04-01' });
  });

  it('a project: its milestones as tasks and a goal of reaching them', () => {
    const t = TEMPLATE_BY_ID.project;
    const { id } = applyTemplate(t.plan({ ...initialValues(t), name: 'Renovation', milestones: 'Quotes in\nBuilt' }), null);
    expect(Object.values(useTaskStore.getState().tasks).map((x) => [x.title, x.kind, x.collectionId])).toEqual([['Quotes in', 'milestone', id], ['Built', 'milestone', id]]);
    expect(Object.values(useGoalStore.getState().goals)[0].measure).toEqual({ kind: 'completion', milestonesOnly: true });
  });

  it('every template plans something from an empty form', () => {
    for (const t of ENDEAVOUR_TEMPLATES) expect(t.plan(initialValues(t)).endeavour.name).toBeTruthy();
  });
});
