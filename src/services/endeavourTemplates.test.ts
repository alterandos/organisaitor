import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useTrashStore } from '@/store/trashStore';
import { useListStore } from '@/store/listStore';
import { ENDEAVOUR_TEMPLATES, TEMPLATE_BY_ID, initialValues, newRow, type TemplateValues } from '@/config/endeavourTemplates';
import { addSubject, addToEndeavour, applyTemplate, planLines } from './endeavourTemplates';
import { childrenOf } from '@/utils/endeavourGraph';
import { effectivePeriod } from '@/utils/endeavourPeriod';

beforeEach(() => {
  for (const s of [useTaskStore, useCalendarStore, useNoteStore, useScheduleStore, useGoalStore, useItemTypeStore, useTrashStore, useListStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});

function semester(): TemplateValues {
  const t = TEMPLATE_BY_ID.semester;
  return {
    ...initialValues(t), name: 'Semester 2', start: '2026-07-27', end: '2026-11-06', examsFrom: '2026-11-09', examsTo: '2026-11-21',
    breaks: [newRow({ label: 'Mid-semester break', from: '2026-09-28', to: '2026-10-02' })],
    subjects: 'GEOS215 Climate Systems\nModern Europe',
  };
}

describe('the Semester template', () => {
  it('plans its period, subjects and suggestions', () => {
    const lines = planLines(TEMPLATE_BY_ID.semester.plan(semester()));
    expect(lines[1]).toMatch(/^📅 .+ – .+ · 1 break · exams .+ – .+$/);
    expect(lines.filter((_, i) => i !== 1)).toEqual([
      '🎯 Semester 2',
      '📓 Semester 2',
      '📋 Semester 2 admin',
      '🔄 Plan the week · Every week on Sun',
      '🎯 Average 75% this semester',
      '🎓 GEOS215 Climate Systems',
      '🎓 Modern Europe',
    ]);
  });

  it('makes the semester and its subjects, which take its period live; Undo leaves nothing', () => {
    const { id, undo } = applyTemplate(TEMPLATE_BY_ID.semester.plan(semester()), null);
    const c = useTaskStore.getState().collections[id];
    expect(c).toMatchObject({ name: 'Semester 2', templateId: 'semester', deadline: '2026-11-21' });
    expect(c.period).toMatchObject({ start: '2026-07-27', end: '2026-11-06', exams: { from: '2026-11-09', to: '2026-11-21' } });
    const subjects = childrenOf(id, useTaskStore.getState().collections).map((k) => useTaskStore.getState().collections[k]).filter((x) => x.kind === 'project');
    expect(subjects.map((x) => [x.name, x.templateId]).sort()).toEqual([['GEOS215 Climate Systems', 'subject'], ['Modern Europe', 'subject']]);
    expect(effectivePeriod(subjects[0].id, useTaskStore.getState().collections)).toMatchObject({ from: id, inherited: true });
    // Its Type: the person's own copy of the Semester default, its period the Type's field; its subjects the Subject Type.
    const semType = useItemTypeStore.getState().types[c.attributes!.typeId!];
    expect(semType).toMatchObject({ name: 'Semester', builtIn: 'semester', fields: [{ type: 'period' }] });
    expect(useItemTypeStore.getState().types[subjects[0].attributes!.typeId!].name).toBe('Subject');
    expect(subjects.find((x) => x.name.startsWith('GEOS215'))!.attributes!.values).toEqual({ code: 'GEOS215' });
    // Its notebook holds its subjects' (the user, 2026-10-30: a sub-Endeavour's notebook goes inside).
    const tags = Object.values(useNoteStore.getState().noteTags);
    const semNb = tags.find((t) => t.collectionId === id)!;
    expect(tags.filter((t) => subjects.some((x) => x.id === t.collectionId)).map((t) => t.parentTagId)).toEqual([semNb.id, semNb.id]);
    expect(Object.values(useListStore.getState().lists).map((l) => [l.name, l.collectionId])).toEqual([['Semester 2 admin', id]]);
    // Planning the week is repeating Work on the semester (phase 7 (e): no rhythm).
    expect(Object.values(useCalendarStore.getState().deadlines).map((d) => [d.title, d.collectionId, d.repeat?.daysOfWeek])).toEqual([['Plan the week', id, [0]]]);
    expect(Object.values(useTaskStore.getState().collections).some((x) => x.kind === 'routine')).toBe(false);
    expect(Object.values(useGoalStore.getState().goals).map((g) => g.title)).toContain('Average 75% this semester');
    expect(Object.values(useItemTypeStore.getState().types).map((t) => t.name)).toContain('Assessment');

    undo();
    expect(Object.keys(useTaskStore.getState().collections)).toHaveLength(0);
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
    expect(Object.keys(useNoteStore.getState().noteTags)).toHaveLength(0);
    expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0);
    expect(Object.keys(useItemTypeStore.getState().types)).toHaveLength(0);
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
  });

  it('"+ Subject" adds a subject part of it, and a suggestion can be taken up later', () => {
    const t = TEMPLATE_BY_ID.semester;
    const { id } = applyTemplate(t.plan({ ...initialValues(t), name: 'Sem 1', admin: false, planDay: -1, average: null }), null);
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
    const { id: sub } = addSubject(id, 'HIST110 Modern Europe');
    expect(useTaskStore.getState().collections[sub]).toMatchObject({ name: 'HIST110 Modern Europe', templateId: 'subject' });
    expect(childrenOf(id, useTaskStore.getState().collections)).toEqual([sub]);
    const { undo } = addToEndeavour(id, { ...t.plan({ ...initialValues(t), name: 'Sem 1', planDay: -1, average: null }), parts: [] });
    expect(Object.values(useListStore.getState().lists).map((l) => l.collectionId)).toEqual([id]);
    undo();
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
  });
});

describe('the Subject template', () => {
  it('makes a small subject that remembers its template; its items are added in its editor', () => {
    const t = TEMPLATE_BY_ID.subject;
    const { id } = applyTemplate(t.plan({ ...initialValues(t), code: 'GEOS215', name: 'Climate Systems' }), null);
    expect(useTaskStore.getState().collections[id]).toMatchObject({ name: 'GEOS215 Climate Systems', templateId: 'subject' });
    expect(Object.values(useNoteStore.getState().noteTags).map((n) => n.name)).toEqual(['GEOS215 Climate Systems']);
    expect(Object.values(useGoalStore.getState().goals)[0].title).toBe('At least 75% in GEOS215');
  });
});

describe('the other templates', () => {
  it('a training plan: sessions as repeating classes, the aim and keeping them up as goals', () => {
    const t = TEMPLATE_BY_ID['training-plan'];
    const plan = t.plan({ ...initialValues(t), name: 'Half marathon', goal: '21 km under 2 hours', by: '2027-04-01' });
    expect(planLines(plan)).toEqual(['🎯 Half marathon', '🔄 Session · Every week on Tue, Thu, Sat', '🎯 21 km under 2 hours', '🎯 Keep up the sessions']);
    const { id } = applyTemplate(plan, null);
    const session = Object.values(useCalendarStore.getState().events).find((e) => e.title === 'Session')!;
    expect(session).toMatchObject({ collectionId: id, repeat: { freq: 'weekly', daysOfWeek: [2, 4, 6] } });
    expect(Object.values(useGoalStore.getState().goals).find((g) => g.title === 'Keep up the sessions')!.measure).toEqual({ kind: 'keepUp', itemIds: [session.id], count: 3, outOf: 4 });
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
