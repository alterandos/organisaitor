// Endeavour templates as data (services/templates.ts, utils/templatePlan.ts): built-in ones replaced by
// the person's copy once changed, Restore default, saving from an Endeavour, and what a template
// makes (since 2026-11-06 only the Endeavour, its tags and, if asked, its notebook).
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
import { normaliseTemplate, planFromTemplate } from '@/utils/templatePlan';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 20, 10, 0));   // Monday 20 July 2026
  for (const s of [useTemplateStore, useTaskStore, useCalendarStore, useNoteStore, useListStore, useGoalStore, useTrashStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});
afterEach(() => vi.useRealTimers());

const tagNames = (id: string) => useTaskStore.getState().collections[id as never].tagIds.map((t) => useTaskStore.getState().tags[t]?.name);

describe('built-in templates and the person’s own', () => {
  it('editing a built-in one keeps a copy in its place; Restore default brings the original back', () => {
    expect(allTemplates().map((t) => t.id)).toEqual(['semester', 'subject', 'training-plan', 'project']);
    const id = saveTemplate({ ...DEFAULT_TEMPLATE_BY_ID.subject, tags: ['Subject', 'University', 'Science'] });
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
    const id = saveTemplate({ ...blankTemplate('House move'), notebook: true });
    expect(allTemplates().at(-1)?.id).toBe(id);
    expect(useTemplateStore.getState().templates[id].builtIn).toBeUndefined();
  });
});

describe('what a template makes (nothing bulky: the user, 2026-11-06)', () => {
  it('the Endeavour with its tags (made where there’s no tag of that name), its code, and its notebook if asked', () => {
    const { id } = applyTemplate(planFromTemplate(DEFAULT_TEMPLATE_BY_ID.subject, { name: 'GEOS215 Climate Systems' }), null);
    expect(tagNames(id).sort()).toEqual(['Subject', 'University']);
    expect(useTaskStore.getState().collections[id].attributes?.values).toEqual({ code: 'GEOS215' });
    expect(Object.values(useNoteStore.getState().noteTags).map((n) => n.name)).toEqual(['GEOS215 Climate Systems']);
    expect(Object.keys(useCalendarStore.getState().events)).toHaveLength(0);
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
    expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0);
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);
  });

  it('an existing tag of that name is used, not a second one; with no notebook asked, none is made', () => {
    useTaskStore.getState().addTag({ id: 'uni' as never, name: 'university' });
    applyTemplate(planFromTemplate(DEFAULT_TEMPLATE_BY_ID.subject, { name: 'Bio', notebook: false }), null);
    expect(Object.values(useTaskStore.getState().tags).map((t) => t.name).sort()).toEqual(['Subject', 'university']);
    expect(Object.keys(useNoteStore.getState().noteTags)).toHaveLength(0);
  });

  it('a part takes its parent’s tags rather than holding a copy, and its notebook goes inside the parent’s', () => {
    const { id: sem } = applyTemplate(planFromTemplate(DEFAULT_TEMPLATE_BY_ID.semester, { name: 'Semester 2' }), null);
    const { id: sub } = applyTemplate(planFromTemplate(DEFAULT_TEMPLATE_BY_ID.subject, { name: 'Bio' }), sem);
    expect(tagNames(sem)).toEqual(['University']);
    expect(tagNames(sub)).toEqual(['Subject']);
    const books = Object.values(useNoteStore.getState().noteTags);
    expect(books.find((n) => n.name === 'Bio')?.parentTagId).toBe(books.find((n) => n.name === 'Semester 2')?.id);
  });

  it('a template saved before (with lists, tasks, classes and goals) reads as one that ticks the notebook', () => {
    const old = normaliseTemplate({ id: 'x', name: 'Old', kind: 'project', notebooks: [{ id: 'n', name: '{name}' }], lists: [{ id: 'l', name: 'L', items: [] }], classes: [], goals: [] });
    expect(old).toMatchObject({ name: 'Old', notebook: true, tags: [], details: [] });
    expect('lists' in old).toBe(false);
  });
});

describe('every built-in template only fills in the form', () => {
  it('plans no lists, tasks, calendar items, goals or parts', async () => {
    const { DEFAULT_TEMPLATES } = await import('@/config/defaultTemplates');
    for (const t of DEFAULT_TEMPLATES) {
      const p = planFromTemplate(t, { name: 'X' });
      expect([p.lists, p.tasks, p.items, p.goals, p.parts].every((x) => x.length === 0), t.id).toBe(true);
    }
  });
});

describe('Save as template', () => {
  it('keeps what the form says: its dates’ shape, time-off names, details, own tags, notebook; no dates or contents', () => {
    const e = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215 Climate Systems' });
    useTaskStore.getState().addTag({ id: 'sci' as never, name: 'Science' });
    useTaskStore.getState().updateCollection(e, {
      tagIds: ['sci' as never],
      period: { start: '2026-07-27', end: '2026-11-06', breaks: [{ id: 'b', label: 'Mid-semester break', from: '2026-09-28', to: '2026-10-02' }] },
      attributes: { typeId: null, fields: [{ id: 'lect', name: 'Lecturer', type: 'text' }], values: { lect: 'Dr Rowe' } },
    });
    useNoteStore.getState().addNoteTag({ name: 'GEOS215 Climate Systems', kind: 'area', collectionId: e, parentTagId: null });
    useCalendarStore.getState().addEvent({ title: 'GEOS215 lecture', date: '2026-07-29', startTime: '10:00', endTime: '12:00', collectionId: e });
    const t = captureTemplate(e)!;
    expect(t).toMatchObject({ name: 'GEOS215 Climate Systems', codeFromName: true, notebook: true, tags: ['Science'], dates: { show: true, exams: false, timeOff: ['Mid-semester break'] } });
    expect(t.details).toEqual([{ id: 'lect', name: 'Lecturer', type: 'text' }]);
    expect(JSON.stringify(t)).not.toContain('Dr Rowe');
    expect(JSON.stringify(t)).not.toContain('lecture');
  });
});
