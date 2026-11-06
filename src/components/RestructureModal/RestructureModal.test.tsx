// @vitest-environment jsdom
//
// Restructuring (docs/features/endeavours.md phase 6): a part split off an Endeavour, a merge.
// Making and editing one is EndeavourCreator.test.tsx.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RestructureModal } from './RestructureModal';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useGoalStore } from '@/store/goalStore';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { LABELS } from '@/config/labels';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 20, 10, 0));
  for (const s of [useTaskStore, useCalendarStore, useItemTypeStore, useGoalStore, useToastStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
  useUIStore.setState({ ...useUIStore.getInitialState(), activeView: 'endeavours' }, true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('restructuring', () => {
  it('splits the chosen things off into a new part', () => {
    const geos = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    const plan = addTaskWithCalendar({ title: 'Plan the essay', collectionId: geos });
    addTaskWithCalendar({ title: 'Lab report', collectionId: geos });
    useUIStore.getState().showRestructure(geos, 'split');
    render(<RestructureModal />);
    fireEvent.change(screen.getByLabelText('The new part'), { target: { value: 'Essay' } });
    const tasks = screen.getByRole('group', { name: /Tasks/ });
    fireEvent.click(within(tasks).getByLabelText('Plan the essay'));
    fireEvent.click(screen.getByRole('button', { name: 'Split off' }));
    const part = Object.values(useTaskStore.getState().collections).find((c) => c.name === 'Essay')!;
    expect(useTaskStore.getState().tasks[plan].collectionId).toBe(part.id);
    expect(part.links?.[0]).toMatchObject({ kind: 'partOf', targetId: geos });
  });

  it('merging offers only Endeavours outside this one', () => {
    const a = useTaskStore.getState().addCollection({ kind: 'project', name: 'Assignment 1' });
    const inside = useTaskStore.getState().addCollection({ kind: 'project', name: 'Its draft' });
    useTaskStore.getState().addEndeavourLink(inside, 'partOf', a);
    useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    useUIStore.getState().showRestructure(a, 'merge');
    render(<RestructureModal />);
    fireEvent.click(screen.getByText(`— ${LABELS.collection} —`));
    expect(screen.getByText('GEOS215')).toBeInTheDocument();
    expect(screen.queryByText('Its draft')).toBeNull();
  });
});
