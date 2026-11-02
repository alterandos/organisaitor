// @vitest-environment jsdom
//
// Templates and restructuring (docs/features/endeavours.md phases 6 and 7 (d)): a subject set up
// and opened in its own editor, Edit routing by template, and a part split off an Endeavour.
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
  it('a subject: made, its own editor opened, and undone from the toast', () => {
    useUIStore.getState().showTemplates(null);
    render(<EndeavourTemplateModal />);
    fireEvent.click(screen.getByText(/^🎓 Subject/));
    fireEvent.change(screen.getByPlaceholderText('GEOS215'), { target: { value: 'GEOS215' } });
    fireEvent.change(screen.getByPlaceholderText('Climate Systems'), { target: { value: 'Climate Systems' } });
    expect(screen.getByRole('region', { name: 'This will make' })).toHaveTextContent('GEOS215 Climate Systems');
    fireEvent.click(screen.getByRole('button', { name: 'Set it up' }));

    const made = Object.values(useTaskStore.getState().collections).find((c) => c.name === 'GEOS215 Climate Systems')!;
    expect(made.templateId).toBe('subject');
    expect(useUIStore.getState().endeavourHomeId).toBe(made.id);
    expect(useUIStore.getState()).toMatchObject({ openModal: 'subject-editor', editingCollection: { id: made.id } });
    useToastStore.getState().current!.actions![0].onClick();
    expect(useTaskStore.getState().collections[made.id]).toBeUndefined();
  }, 15_000);

  it('Edit opens the editor of the template an Endeavour came from, else the ordinary one', () => {
    const a = useTaskStore.getState().addCollection({ kind: 'project', name: 'Semester 2' });
    useTaskStore.getState().updateCollection(a, { templateId: 'semester' });
    useUIStore.getState().openEditCollection(useTaskStore.getState().collections[a]);
    expect(useUIStore.getState().openModal).toBe('semester-editor');
    useUIStore.getState().openEndeavourSettings(useTaskStore.getState().collections[a]);
    expect(useUIStore.getState().openModal).toBe('add-collection');
    const b = useTaskStore.getState().addCollection({ kind: 'project', name: 'By hand' });
    useUIStore.getState().openEditCollection(useTaskStore.getState().collections[b]);
    expect(useUIStore.getState().openModal).toBe('add-collection');
  });
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
