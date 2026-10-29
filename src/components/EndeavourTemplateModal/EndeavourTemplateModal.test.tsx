// @vitest-environment jsdom
//
// Templates and restructuring (docs/features/endeavours.md phase 6): a subject set up from a
// pasted course outline, and a part split off an Endeavour, each with Undo in the toast.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EndeavourTemplateModal } from './EndeavourTemplateModal';
import { RestructureModal } from '@/components/RestructureModal/RestructureModal';
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

describe('starting from a template', () => {
  it('a subject from a pasted outline: shown before it is made, set up, and undone from the toast', () => {
    useUIStore.getState().showTemplates(null);
    render(<EndeavourTemplateModal />);
    fireEvent.click(screen.getByText(/University subject/));
    fireEvent.click(screen.getByRole('button', { name: LABELS.magicWand.label }));
    const box = screen.getByRole('textbox', { name: LABELS.magicWand.label });
    fireEvent.change(box, { target: { value: 'GEOS215 Climate Systems\nLectures: Tuesday 12–1pm\nEssay, 40%, due 23 October' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    const preview = screen.getByRole('region', { name: 'This will make' });
    expect(preview).toHaveTextContent('GEOS215 Climate Systems');
    expect(preview).toHaveTextContent('🏁 Essay · 2026-10-23 (Essay)');
    fireEvent.click(screen.getByRole('button', { name: 'Set it up' }));

    const made = Object.values(useTaskStore.getState().collections).find((c) => c.name === 'GEOS215 Climate Systems')!;
    expect(useUIStore.getState().endeavourHomeId).toBe(made.id);
    expect(Object.values(useCalendarStore.getState().deadlines).some((d) => d.title === 'Essay' && d.collectionId === made.id)).toBe(true);
    useToastStore.getState().current!.actions![0].onClick();
    expect(useTaskStore.getState().collections[made.id]).toBeUndefined();
  }, 15_000);   // renders the whole form and sets up a subject: over 1 s alone, slower under a full run
});

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
