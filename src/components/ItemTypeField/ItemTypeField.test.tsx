// @vitest-environment jsdom
//
// Types in the creation forms and the Type editor (docs/features/endeavours.md phase 3): a Type
// chosen from the speed dial starts the form; its fields are filled in; its parts are made with
// the item; and a Type is made in the editor.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AddCalendarItemModal } from '@/components/AddCalendarItemModal/AddCalendarItemModal';
import { AddTaskModal } from '@/components/AddTaskModal/AddTaskModal';
import { ItemTypeModal } from '@/components/ItemTypeModal/ItemTypeModal';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useUIStore } from '@/store/uiStore';
import { addStarterSet } from '@/services/itemTypes';
import type { ItemTypeId } from '@/types';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 29, 10, 0));
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useItemTypeStore.setState(useItemTypeStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const typeId = (name: string) => Object.values(useItemTypeStore.getState().types).find((t) => t.name === name)!.id as ItemTypeId;

describe('a Type in the creation forms', () => {
  it('shows nothing while the person has no Types', () => {
    render(<AddTaskModal />);
    expect(screen.queryByLabelText('Type')).toBeNull();
  });

  it('an Exam from the speed dial: an event form titled for it, Important on, its fields, and its parts made with it', () => {
    addStarterSet('university');
    useUIStore.getState().showAddTyped(typeId('Exam'), 'event');
    render(<AddCalendarItemModal />);
    expect(screen.getByText('New Exam')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toHaveValue(typeId('Exam'));
    fireEvent.change(screen.getByPlaceholderText('Event title'), { target: { value: 'GEOS215 final' } });
    fireEvent.change(screen.getByText('Room').nextElementSibling!.querySelector('input')!, { target: { value: 'B12' } });
    expect(screen.getByLabelText(/Revise/)).toBeChecked();
    fireEvent.click(screen.getByLabelText(/Check the result/));
    fireEvent.submit(document.querySelector('form')!);

    const ev = Object.values(useCalendarStore.getState().events)[0];
    expect(ev).toMatchObject({ title: 'GEOS215 final', important: true, typeId: typeId('Exam'), typeFields: { room: 'B12' } });
    expect(Object.values(useTaskStore.getState().tasks).map((t) => t.title)).toEqual(['Revise: GEOS215 final']);
  });

  it('choosing a Type in the task form sets its defaults; with no date, no parts', () => {
    addStarterSet('university');
    render(<AddTaskModal />);
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: typeId('Essay') } });
    expect(screen.getByText('New Essay')).toBeInTheDocument();
    expect(screen.getByText('Give it a date to make these.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('What needs to be done?'), { target: { value: 'Someday essay' } });
    fireEvent.submit(document.querySelector('form')!);

    const tasks = Object.values(useTaskStore.getState().tasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ typeId: typeId('Essay'), priority: 'high' });
  });

  it("with a date its parts are made as sub-tasks; a priority already chosen (the quick-add bar's) is kept", () => {
    addStarterSet('university');
    useUIStore.setState({ quickAddPrefill: { title: 'Essay 1', deadline: '2026-11-20', priority: 'low', collectionId: null } });
    render(<AddTaskModal />);
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: typeId('Essay') } });
    expect(screen.queryByText('Give it a date to make these.')).toBeNull();
    fireEvent.submit(document.querySelector('form')!);

    const tasks = Object.values(useTaskStore.getState().tasks);
    const essay = tasks.find((t) => t.title === 'Essay 1')!;
    expect(essay).toMatchObject({ typeId: typeId('Essay'), priority: 'low' });
    expect(tasks.filter((t) => t.parentId === essay.id).map((t) => t.title).sort()).toEqual(['Draft: Essay 1', 'Plan: Essay 1', 'Proofread: Essay 1']);
  });
});

describe('the Type editor', () => {
  it('makes a Type that extends another, with a field and a part', () => {
    addStarterSet('university');
    render(<ItemTypeModal />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lab report' } });
    fireEvent.change(screen.getByLabelText('A kind of'), { target: { value: typeId('Assessment') } });
    expect(screen.getByText(/From Assessment: Weight, Mark, Status/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Field'));
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'Lab partner' } });
    fireEvent.click(screen.getByText('+ Part'));
    fireEvent.change(screen.getByLabelText('What to do'), { target: { value: 'Write up' } });
    fireEvent.submit(document.querySelector('form')!);

    const t = useItemTypeStore.getState().types[typeId('Lab report')];
    expect(t).toMatchObject({ extendsId: typeId('Assessment'), fields: [{ name: 'Lab partner', type: 'text' }], parts: [{ title: 'Write up', kind: 'task', offsetDays: 1 }] });
  });

  it('will not offer a Type it would make a kind of itself', () => {
    addStarterSet('university');
    useUIStore.getState().openEditItemType(typeId('Assessment'));
    render(<ItemTypeModal />);
    const options = Array.from((screen.getByLabelText('A kind of') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options.some((o) => o?.includes('Exam'))).toBe(false);
    expect(options.some((o) => o?.includes('Reading'))).toBe(true);
  });
});
