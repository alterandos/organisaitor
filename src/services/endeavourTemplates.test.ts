import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useGoalStore } from '@/store/goalStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useTrashStore } from '@/store/trashStore';
import { useListStore } from '@/store/listStore';
import { planFromValues, type TemplateValues } from '@/config/endeavourTemplates';
import { DEFAULT_TEMPLATES, DEFAULT_TEMPLATE_BY_ID } from '@/config/defaultTemplates';
import { planFromTemplate } from '@/utils/templatePlan';
import { applyTemplate, planLines } from './endeavourTemplates';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import { childrenOf } from '@/utils/endeavourGraph';
import { effectivePeriod } from '@/utils/endeavourPeriod';

beforeEach(() => {
  for (const s of [useTaskStore, useCalendarStore, useNoteStore, useScheduleStore, useGoalStore, useItemTypeStore, useTrashStore, useListStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});

// The agent's semester (planFromValues): a built-in template with the values it was given.
function semester(): TemplateValues {
  return {
    name: 'Semester 2', start: '2026-07-27', end: '2026-11-06', examsFrom: '2026-11-09', examsTo: '2026-11-21',
    breaks: [{ _id: 'b1', label: 'Mid-semester break', from: '2026-09-28', to: '2026-10-02' }],
    subjects: 'GEOS215 Climate Systems\nModern Europe',
    // What the agent can ask for; the creator only suggests them (on the home).
    admin: true, planDay: 0, average: 75,
  };
}

describe('the Semester template', () => {
  it('plans its period, subjects and suggestions', () => {
    const lines = planLines(planFromValues('semester', semester()));
    expect(lines[1]).toMatch(/^📅 .+ – .+ · 1 break · exams .+ – .+$/);
    expect(lines.filter((_, i) => i !== 1)).toEqual([
      '🎯 Semester 2',
      '📓 Semester 2',
      '📋 Semester 2 admin',
      `${ITEM_TYPE_ICON.task} Plan the week`,
      '🎯 Average 75% this semester',
      '🎓 GEOS215 Climate Systems',
      '🎓 Modern Europe',
    ]);
  });

  it('makes the semester and its subjects, which take its period live; Undo leaves nothing', () => {
    const { id, undo } = applyTemplate(planFromValues('semester', semester()), null);
    const c = useTaskStore.getState().collections[id];
    expect(c).toMatchObject({ name: 'Semester 2', templateId: 'semester', deadline: '2026-11-21' });
    expect(c.period).toMatchObject({ start: '2026-07-27', end: '2026-11-06', exams: { from: '2026-11-09', to: '2026-11-21' } });
    const subjects = childrenOf(id, useTaskStore.getState().collections).map((k) => useTaskStore.getState().collections[k]).filter((x) => x.kind === 'project');
    expect(subjects.map((x) => [x.name, x.templateId]).sort()).toEqual([['GEOS215 Climate Systems', 'subject'], ['Modern Europe', 'subject']]);
    expect(effectivePeriod(subjects[0].id, useTaskStore.getState().collections)).toMatchObject({ from: id, inherited: true });
    // Types are switched off (config/features.ts): no Type is made; a subject's Code is a detail of its own.
    expect(c.attributes?.typeId ?? null).toBeNull();
    const geos = subjects.find((x) => x.name.startsWith('GEOS215'))!;
    expect(geos.attributes).toMatchObject({ typeId: null, fields: [{ id: 'code', name: 'Code', type: 'text' }], values: { code: 'GEOS215' } });
    // Its notebook holds its subjects' (the user, 2026-10-30: a sub-Endeavour's notebook goes inside).
    const tags = Object.values(useNoteStore.getState().noteTags);
    const semNb = tags.find((t) => t.collectionId === id)!;
    expect(tags.filter((t) => subjects.some((x) => x.id === t.collectionId)).map((t) => t.parentTagId)).toEqual([semNb.id, semNb.id]);
    expect(Object.values(useListStore.getState().lists).map((l) => [l.name, l.collectionId])).toEqual([['Semester 2 admin', id]]);
    // Planning the week is a repeating task on the semester (2026-11-04: tasks, not Work).
    expect(Object.values(useTaskStore.getState().tasks).filter((x) => !x.parentId).map((x) => [x.title, x.collectionId, x.repeat?.daysOfWeek])).toEqual([['Plan the week', id, [0]]]);
    expect(Object.values(useTaskStore.getState().collections).some((x) => x.kind === 'routine')).toBe(false);
    expect(Object.values(useGoalStore.getState().goals).map((g) => g.title)).toContain('Average 75% this semester');
    expect(Object.keys(useItemTypeStore.getState().types)).toHaveLength(0);

    undo();
    expect(Object.keys(useTaskStore.getState().collections)).toHaveLength(0);
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
    expect(Object.keys(useNoteStore.getState().noteTags)).toHaveLength(0);
    expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0);
    expect(Object.keys(useItemTypeStore.getState().types)).toHaveLength(0);
    expect(Object.keys(useTrashStore.getState().entries)).toHaveLength(0);
  });

  it('made from the template, it makes only itself and its notebook; a subject added is part of it', () => {
    const t = DEFAULT_TEMPLATE_BY_ID.semester;
    const { id } = applyTemplate(planFromTemplate(t, { name: 'Sem 1' }), null);
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);
    expect(Object.values(useNoteStore.getState().noteTags).map((n) => n.name)).toEqual(['Sem 1']);
    const { id: sub } = applyTemplate(planFromTemplate(DEFAULT_TEMPLATE_BY_ID[t.partsFrom!], { name: 'HIST110 Modern Europe' }), id);
    expect(useTaskStore.getState().collections[sub]).toMatchObject({ name: 'HIST110 Modern Europe', templateId: 'subject' });
    expect(useTaskStore.getState().collections[sub].attributes?.values).toEqual({ code: 'HIST110' });
    expect(childrenOf(id, useTaskStore.getState().collections)).toEqual([sub]);
  });
});

describe('the Subject template', () => {
  it('makes a small subject that remembers its template, with no goal unless a mark is asked for', () => {
    const t = DEFAULT_TEMPLATE_BY_ID.subject;
    const { id } = applyTemplate(planFromTemplate(t, { name: 'GEOS215 Climate Systems' }), null);
    expect(useTaskStore.getState().collections[id]).toMatchObject({ name: 'GEOS215 Climate Systems', templateId: 'subject' });
    expect(useTaskStore.getState().collections[id].attributes?.values).toEqual({ code: 'GEOS215' });
    expect(Object.values(useNoteStore.getState().noteTags).map((n) => n.name)).toEqual(['GEOS215 Climate Systems']);
    expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0);
    applyTemplate(planFromValues('subject', { code: 'HIST110', name: 'Modern Europe', target: 75 }), null);
    expect(Object.values(useGoalStore.getState().goals)[0].title).toBe('At least 75% in HIST110');
  });
  it('reads a code only from a first word with a digit', () => {
    applyTemplate(planFromTemplate(DEFAULT_TEMPLATE_BY_ID.subject, { name: 'Modern Europe' }), null);
    expect(Object.values(useTaskStore.getState().collections).find((c) => c.name === 'Modern Europe')!.attributes?.values).toEqual({});
  });
});

describe('the other templates', () => {
  it('a training plan and a project make only themselves (a project its notebook): their sessions and goals are added on the home', () => {
    const { id: plan } = applyTemplate(planFromTemplate(DEFAULT_TEMPLATE_BY_ID['training-plan'], { name: 'Half marathon' }), null);
    expect(useTaskStore.getState().collections[plan]).toMatchObject({ kind: 'project', templateId: 'training-plan' });
    const { id } = applyTemplate(planFromTemplate(DEFAULT_TEMPLATE_BY_ID.project, { name: 'Renovation' }), null);
    expect(Object.values(useNoteStore.getState().noteTags).map((n) => [n.name, n.collectionId])).toEqual([['Renovation', id]]);
    expect(Object.keys(useCalendarStore.getState().events)).toHaveLength(0);
    expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0);
  });

  it('every built-in template plans something', () => {
    for (const t of DEFAULT_TEMPLATES) expect(planFromTemplate(t, { name: 'X' }).endeavour).toMatchObject({ name: 'X', templateId: t.id });
  });
});
