// Endeavour templates as data (services/templates.ts, utils/templatePlan.ts): built-in ones replaced by
// the person's copy once changed, Restore default, saving from an Endeavour, and what a template makes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTemplateStore } from '@/store/templateStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useGoalStore } from '@/store/goalStore';
import { useTrashStore } from '@/store/trashStore';
import { DEFAULT_TEMPLATE_BY_ID } from '@/config/defaultTemplates';
import { allTemplates, blankTemplate, captureTemplate, restoreDefault, saveTemplate, templateFor } from './templates';
import { applyTemplate } from './endeavourTemplates';
import { dateOfWhen, planFromTemplate } from '@/utils/templatePlan';
import type { EndeavourTemplateDef } from '@/types/templates';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 20, 10, 0));   // Monday 20 July 2026
  for (const s of [useTemplateStore, useTaskStore, useCalendarStore, useNoteStore, useListStore, useGoalStore, useTrashStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});
afterEach(() => vi.useRealTimers());

describe('built-in templates and the person’s own', () => {
  it('editing a built-in one keeps a copy in its place; Restore default brings the original back', () => {
    expect(allTemplates().map((t) => t.id)).toEqual(['semester', 'subject', 'training-plan', 'project']);
    const id = saveTemplate({ ...DEFAULT_TEMPLATE_BY_ID.subject, goals: [{ id: 'g', title: 'At least 80% in {short}', measure: { kind: 'manual', unit: '%', target: 80 } }] });
    const copy = useTemplateStore.getState().templates[id];
    expect(copy.builtIn).toBe('subject');
    expect(allTemplates().map((t) => t.id)).toEqual(['semester', id, 'training-plan', 'project']);
    // Endeavours made from the built-in one before find the copy.
    expect(templateFor('subject')?.id).toBe(id);
    restoreDefault(copy);
    expect(templateFor('subject')).toBe(DEFAULT_TEMPLATE_BY_ID.subject);
    expect(Object.values(useTrashStore.getState().entries).map((e) => e.kind)).toEqual(['endeavourTemplate']);
  });

  it('a new template is the person’s own, after the built-in ones', () => {
    const id = saveTemplate({ ...blankTemplate('House move'), notebooks: [{ id: 'n', name: '{name}' }] });
    expect(allTemplates().at(-1)?.id).toBe(id);
    expect(useTemplateStore.getState().templates[id].builtIn).toBeUndefined();
  });

  it('a goal in every subject: a copy of Subject with a goal makes it, named with the code', () => {
    saveTemplate({ ...DEFAULT_TEMPLATE_BY_ID.subject, goals: [{ id: 'g', title: 'At least 80% in {short}', measure: { kind: 'manual', unit: '%', target: 80 } }] });
    applyTemplate(planFromTemplate(templateFor('subject')!, { name: 'GEOS215 Climate Systems' }), null);
    expect(Object.values(useGoalStore.getState().goals).map((g) => [g.title, g.measure])).toEqual([['At least 80% in GEOS215', { kind: 'manual', unit: '%', target: 80, direction: 'atLeast' }]]);
  });
});

describe('what a template makes', () => {
  const def: EndeavourTemplateDef = {
    ...blankTemplate('Course'),
    lists: [{ id: 'l', name: '{name} reading', items: ['Ch 1', 'Ch 2', ''] }],
    classes: [{ id: 'c', title: '{name} lecture', weekdays: [3], start: '10:00', end: '12:00', place: 'Room 1', taskRules: [{ id: 'r', title: 'Prepare', side: 'before', days: 1 }] }],
    deadlines: [{ id: 'd', title: 'Essay', when: { week: 9, weekday: 5 }, time: '17:00' }],
    tasks: [{ id: 't', title: 'Plan', kind: 'action', weekly: 0, suggest: true }],
  };

  it('classes repeat weekly from its start with their tasks for each date; a one-off falls in its week; lists keep their items; suggestions wait', () => {
    const { id } = applyTemplate(planFromTemplate(def, { name: 'Bio', period: { start: '2026-07-27', end: null, breaks: [] } }), null);
    const lecture = Object.values(useCalendarStore.getState().events).find((e) => e.title === 'Bio lecture')!;
    expect(lecture).toMatchObject({ date: '2026-07-29', startTime: '10:00', location: 'Room 1', repeat: { freq: 'weekly', daysOfWeek: [3] } });
    expect(lecture.taskRules?.map((r) => r.title)).toEqual(['Prepare']);
    expect(Object.values(useCalendarStore.getState().deadlines).find((x) => x.title === 'Essay')?.date).toBe('2026-09-25');
    const list = Object.values(useListStore.getState().lists).find((l) => l.collectionId === id)!;
    expect(list.name).toBe('Bio reading');
    expect(Object.values(useListStore.getState().listItems).filter((i) => i.listId === list.id).map((i) => i.title).sort()).toEqual(['Ch 1', 'Ch 2']);
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);
  });

  it('week 1 is the week it starts', () => {
    expect(dateOfWhen({ week: 1, weekday: 1 }, '2026-07-29')).toBe('2026-07-27');
    expect(dateOfWhen({ week: 2, weekday: 0 }, '2026-07-29')).toBe('2026-08-09');
  });
});

describe('Save as template', () => {
  it('keeps what it is and holds as structure: its name and code become {name} and {short}, no dates', () => {
    const e = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215 Climate Systems' });
    useTaskStore.getState().updateCollection(e, { period: { start: '2026-07-27', end: '2026-11-06', breaks: [{ id: 'b', label: 'Mid-semester break', from: '2026-09-28', to: '2026-10-02' }] } });
    useNoteStore.getState().addNoteTag({ name: 'GEOS215 Climate Systems', kind: 'area', collectionId: e, parentTagId: null });
    const ev = useCalendarStore.getState().addEvent({ title: 'GEOS215 lecture', date: '2026-07-29', startTime: '10:00', endTime: '12:00', collectionId: e, repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [3] } });
    useCalendarStore.getState().updateEvent(ev, { taskRules: [{ id: 'r', title: 'Reading', side: 'before', days: 1, made: ['2026-07-29'] }] });
    useGoalStore.getState().addGoal({ title: 'At least 80% in GEOS215', target: { type: 'endeavour', id: e }, by: null, measure: { kind: 'manual', unit: '%', target: 80, direction: 'atLeast' } });
    const t = captureTemplate(e)!;
    expect(t).toMatchObject({ name: 'GEOS215 Climate Systems', codeFromName: true, dates: { show: true, exams: false, timeOff: ['Mid-semester break'] } });
    expect(t.notebooks.map((n) => n.name)).toEqual(['{name}']);
    expect(t.classes.map((c) => [c.title, c.weekdays, c.start, c.taskRules])).toEqual([['{short} lecture', [3], '10:00', [{ id: 'r', title: 'Reading', side: 'before', days: 1 }]]]);
    expect(t.goals.map((g) => [g.title, g.measure])).toEqual([['At least 80% in {short}', { kind: 'manual', unit: '%', target: 80 }]]);
  });
});
