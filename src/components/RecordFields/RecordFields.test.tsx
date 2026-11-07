// @vitest-environment jsdom
//
// A tracker and a routine are made with the same fields they're edited with (2026-11-07,
// "Creating and editing a thing is one form").
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AddTrackerModal } from '@/components/AddTrackerModal/AddTrackerModal';
import { AddRoutineModal } from '@/components/AddRoutineModal/AddRoutineModal';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';

const L = LABELS.recordFields;

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(cleanup);

describe('a new tracker', () => {
  it('starts from a template whose fields can be changed before it is made', () => {
    render(<AddTrackerModal />);
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Reading' } });
    fireEvent.click(screen.getByRole('button', { name: /^Books/ }));
    expect(screen.getByText(L.columnCount(4))).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: L.remove })[1]);   // Author
    fireEvent.click(screen.getByRole('button', { name: L.addColumn }));
    fireEvent.change(screen.getByPlaceholderText(L.columnName), { target: { value: 'Pages' } });
    fireEvent.click(screen.getByRole('button', { name: L.add }));
    fireEvent.click(screen.getByRole('button', { name: LABELS.recordModals.create }));
    const t = Object.values(useTaskStore.getState().collections).find((c) => c.name === 'Reading')!;
    expect(t.fieldSchema.map((f) => f.name)).toEqual(['Title', 'Status', 'Rating', 'Pages']);
  });
});

describe('a new routine', () => {
  it('shows every field its edit pane has (no "Advanced options"), and steps can be reordered', () => {
    useUIStore.setState({ openModal: 'add-routine' });
    render(<AddRoutineModal />);
    expect(screen.getByText(L.colour)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Morning' } });
    for (const step of ['Stretch', 'Run']) {
      fireEvent.change(screen.getByPlaceholderText(L.addStep), { target: { value: step } });
      fireEvent.click(screen.getByRole('button', { name: L.add }));
    }
    fireEvent.click(screen.getAllByRole('button', { name: L.moveUp })[1]);
    fireEvent.click(screen.getByRole('button', { name: L.weekdays }));
    fireEvent.click(screen.getByRole('button', { name: LABELS.recordModals.create }));
    const r = Object.values(useTaskStore.getState().collections).find((c) => c.name === 'Morning')!;
    expect(r.routineTasks.map((t) => t.title)).toEqual(['Run', 'Stretch']);
    expect(r.repeatConfig?.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });
});
