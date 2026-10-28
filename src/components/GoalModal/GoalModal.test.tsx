// @vitest-environment jsdom
//
// Goals (docs/features/endeavours.md phase 5): made in the goal editor, shown on their Endeavour's
// home with how far along they are, checked in by hand, and settled by the person.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GoalModal } from './GoalModal';
import { EndeavoursSection } from '@/components/EndeavoursSection/EndeavoursSection';
import { useGoalStore } from '@/store/goalStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import type { CollectionId } from '@/types';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0));
  useGoalStore.setState(useGoalStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState({ ...useUIStore.getInitialState(), activeView: 'endeavours' }, true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const goals = () => Object.values(useGoalStore.getState().goals);

describe('the goal editor', () => {
  it('makes a goal on the Endeavour it was opened from, measured by hand', () => {
    const geos = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    useUIStore.getState().showAddGoal(geos);
    render(<GoalModal />);
    fireEvent.change(screen.getByLabelText('What do you want?'), { target: { value: 'Distinction in GEOS215' } });
    fireEvent.change(screen.getAllByLabelText('Target')[1], { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '%' } });
    fireEvent.submit(document.querySelector('form')!);
    expect(goals()[0]).toMatchObject({
      title: 'Distinction in GEOS215', target: { type: 'endeavour', id: geos }, status: 'active',
      measure: { kind: 'manual', unit: '%', target: 75, direction: 'atLeast' },
    });
  });

  it('measured by its tasks: switching the measure keeps the rest', () => {
    const geos = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    useUIStore.getState().showAddGoal(geos);
    render(<GoalModal />);
    fireEvent.change(screen.getByLabelText('What do you want?'), { target: { value: 'All done' } });
    fireEvent.click(screen.getByLabelText('Getting its tasks done'));
    fireEvent.click(screen.getByLabelText('Only its milestones'));
    fireEvent.submit(document.querySelector('form')!);
    expect(goals()[0].measure).toEqual({ kind: 'completion', milestonesOnly: true });
  });
});

describe('goals on the home', () => {
  function setUp(): CollectionId {
    const geos = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    useGoalStore.getState().addGoal({ title: 'Distinction', target: { type: 'endeavour', id: geos }, by: '2026-11-30', measure: { kind: 'manual', unit: '%', target: 75, direction: 'atLeast' } });
    act(() => { useUIStore.getState().openEndeavourHome(geos); });
    return geos;
  }

  it('shows how far along it is; a check-in moves it, and reaching it suggests achieved', () => {
    setUp();
    render(<EndeavoursSection />);
    const card = screen.getByRole('article', { name: 'Distinction' });
    expect(card).toHaveTextContent('No check-ins yet');
    expect(card).toHaveTextContent('33 days left');
    fireEvent.click(within(card).getByText('+ Check in'));
    fireEvent.change(within(card).getByLabelText('Where it stands now'), { target: { value: '72' } });
    fireEvent.click(within(card).getByText('Record'));
    expect(card).toHaveTextContent('72% (target 75%)');
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '96');
    fireEvent.click(within(card).getByText('+ Check in'));
    fireEvent.change(within(card).getByLabelText('Where it stands now'), { target: { value: '78' } });
    fireEvent.click(within(card).getByText('Record'));
    expect(card).toHaveTextContent('Reached. Mark it achieved?');
    fireEvent.click(within(card).getByText('Mark achieved'));
    expect(goals()[0].status).toBe('achieved');
    expect(card).toHaveTextContent('Achieved');
  });

  it('the home offers "+ Goal", opening the editor for this Endeavour', () => {
    const geos = setUp();
    render(<EndeavoursSection />);
    fireEvent.click(screen.getByText('+ Goal'));
    expect(useUIStore.getState()).toMatchObject({ openModal: 'add-goal', pendingGoalEndeavourId: geos });
  });
});
