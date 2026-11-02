// @vitest-environment jsdom
//
// The subject and semester editors (docs/features/endeavours.md phase 7 (d)): a subject's real
// items as two lists, each opened, changed and saved in place; a semester's subjects and
// suggestions.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SubjectEditor } from './SubjectEditor';
import { SemesterEditor } from './SemesterEditor';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useListStore } from '@/store/listStore';
import { useGoalStore } from '@/store/goalStore';
import { useNoteStore } from '@/store/noteStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';
import { LABELS } from '@/config/labels';
import { addStarterSet } from '@/services/itemTypes';
import { useTaskStore as tasksStore } from '@/store/taskStore';
import type { CollectionId } from '@/types';

const L = LABELS.subjectEditor;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 20, 10, 0));
  for (const s of [useTaskStore, useCalendarStore, useScheduleStore, useListStore, useGoalStore, useNoteStore, useItemTypeStore, useToastStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function subject(): CollectionId {
  const id = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215 Climate Systems' });
  useTaskStore.getState().updateCollection(id, { templateId: 'subject' });
  return id;
}

describe('the subject editor', () => {
  it('lists what it holds, made anywhere: a lecture in the calendar shows under Schedule', () => {
    const id = subject();
    useCalendarStore.getState().addEvent({ title: 'GEOS215 lecture', date: '2026-07-29', startTime: '10:00', endTime: '12:00', collectionId: id,
      repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [3] } });
    useCalendarStore.getState().addDeadline({ title: 'Essay', date: '2026-10-23', collectionId: id });
    render(<SubjectEditor id={id} />);
    const schedule = screen.getByRole('region', { name: L.schedule });
    expect(within(schedule).getByRole('button', { name: /GEOS215 lecture/ })).toHaveTextContent('Wed 10:00–12:00');
    expect(within(screen.getByRole('region', { name: L.work })).getByRole('button', { name: /Essay/ })).toBeInTheDocument();
  });

  it('adds an item, opens it, changes it with Ctrl+Enter; Escape closes the item first', () => {
    const id = subject();
    render(<SubjectEditor id={id} />);
    const work = screen.getByRole('region', { name: L.work });
    fireEvent.click(within(work).getByRole('button', { name: L.add }));
    const form = screen.getByRole('form', { name: L.item.newWork });
    fireEvent.change(within(form).getByLabelText(L.item.title), { target: { value: 'Weekly quiz' } });
    fireEvent.change(within(form).getByLabelText(L.item.notes), { target: { value: 'best 8 of 9 count' } });
    fireEvent.click(within(form).getByRole('button', { name: L.item.save }));
    const quiz = Object.values(useCalendarStore.getState().deadlines)[0];
    expect(quiz).toMatchObject({ title: 'Weekly quiz', notes: 'best 8 of 9 count', collectionId: id });

    fireEvent.click(within(work).getByRole('button', { name: /Weekly quiz/ }));
    const edit = screen.getByRole('form', { name: 'Weekly quiz' });
    fireEvent.change(within(edit).getByLabelText(L.item.title), { target: { value: 'Quiz' } });
    act(() => { fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true }); });
    expect(useCalendarStore.getState().deadlines[quiz.id].title).toBe('Quiz');
    expect(screen.queryByRole('form')).toBeNull();

    fireEvent.click(within(work).getByRole('button', { name: /Quiz/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();   // the editor itself stays
  });
});

describe('a Type’s tasks in the subject editor', () => {
  it('are offered ticked, can be unticked before saving, and are listed under the item after', () => {
    const id = subject();
    addStarterSet('university');
    const exam = Object.values(useItemTypeStore.getState().types).find((t) => t.name === 'Exam')!;
    render(<SubjectEditor id={id} />);
    fireEvent.click(within(screen.getByRole('region', { name: L.work })).getByRole('button', { name: L.add }));
    const form = screen.getByRole('form', { name: L.item.newWork });
    fireEvent.change(within(form).getByLabelText(L.item.title), { target: { value: 'Final exam' } });
    fireEvent.change(within(form).getByLabelText(LABELS.itemTypes.type), { target: { value: exam.id } });
    const parts = within(form).getByRole('group', { name: LABELS.itemTypes.partsMade });
    const boxes = within(parts).getAllByRole('checkbox');
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(boxes[1]);   // not "Check the result"
    fireEvent.click(within(form).getByRole('button', { name: L.item.save }));
    expect(Object.values(tasksStore.getState().tasks).map((t) => t.title)).toEqual([expect.stringContaining('Revise')]);

    fireEvent.click(within(screen.getByRole('region', { name: L.work })).getByRole('button', { name: /Final exam/ }));
    const edit = screen.getByRole('form', { name: 'Final exam' });
    expect(within(edit).getByRole('region', { name: L.item.tasks })).toHaveTextContent('Revise');
    expect(within(edit).queryByRole('group', { name: LABELS.itemTypes.partsMade })).toBeNull();   // same Type: nothing more offered
  });
});

describe('the semester editor', () => {
  it('adds a subject that takes its period, and takes up a suggestion', () => {
    const id = useTaskStore.getState().addCollection({ kind: 'project', name: 'Semester 2' });
    useTaskStore.getState().updateCollection(id, { templateId: 'semester', period: { start: '2026-07-27', end: '2026-11-06', breaks: [] } });
    render(<SemesterEditor id={id} />);
    fireEvent.change(screen.getByLabelText(LABELS.semesterEditor.subjectName), { target: { value: 'GEOS215 Climate Systems' } });
    fireEvent.click(screen.getByRole('button', { name: LABELS.semesterEditor.addSubject }));
    expect(within(screen.getByRole('region', { name: LABELS.semesterEditor.subjects })).getByRole('button', { name: /GEOS215 Climate Systems/ })).toBeInTheDocument();

    const suggested = screen.getByRole('region', { name: LABELS.semesterEditor.suggested });
    const admin = within(suggested).getByText(LABELS.semesterEditor.admin).closest('li')!;
    fireEvent.click(within(admin).getByRole('button', { name: LABELS.semesterEditor.addSuggestion }));
    expect(Object.values(useListStore.getState().lists).map((l) => l.collectionId)).toEqual([id]);
    expect(within(screen.getByRole('region', { name: LABELS.semesterEditor.suggested })).queryByText(LABELS.semesterEditor.admin)).toBeNull();
  });
});
