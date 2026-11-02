// @vitest-environment jsdom
//
// An Endeavour's "Everything in it" view (agreed with the user 2026-10-30): its things by kind,
// each opened where it's edited, several moved at once with Undo.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EndeavourContentsModal, EndeavourContentsSummary } from './EndeavourContentsModal';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { LABELS } from '@/config/labels';

const L = LABELS.endeavourContents;

beforeEach(() => {
  for (const s of [useTaskStore, useCalendarStore, useToastStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => { cleanup(); });

describe('everything in an Endeavour', () => {
  it('counts by kind, opens one where it’s edited, and moves the chosen with Undo', () => {
    const geos = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
    const other = useTaskStore.getState().addCollection({ kind: 'project', name: 'HIST110' });
    const essay = addTaskWithCalendar({ title: 'Plan the essay', collectionId: geos });
    addTaskWithCalendar({ title: 'Read chapter 3', collectionId: geos });
    useCalendarStore.getState().addEvent({ title: 'Field trip', date: '2031-03-04', collectionId: geos });

    render(<EndeavourContentsSummary id={geos} />);
    expect(screen.getByRole('group', { name: L.summary })).toHaveTextContent('2 Tasks');
    fireEvent.click(screen.getByRole('button', { name: /2 Tasks/ }));
    expect(useUIStore.getState()).toMatchObject({ openModal: 'endeavour-contents', contentsFor: { id: geos, kind: 'task' } });
    cleanup();

    render(<EndeavourContentsModal />);
    const dialog = screen.getByRole('dialog', { name: L.title('GEOS215') });
    expect(within(dialog).queryByText('Field trip')).toBeNull();            // opened on Tasks
    fireEvent.click(within(dialog).getByRole('button', { name: `${L.all} · 3` }));
    expect(within(dialog).getByText('Field trip')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: `${L.choose}: Plan the essay` }));
    fireEvent.click(within(dialog).getByText(L.nowhere));
    fireEvent.click(within(dialog).getByText('HIST110'));
    fireEvent.click(within(dialog).getByRole('button', { name: L.move }));
    expect(useTaskStore.getState().tasks[essay].collectionId).toBe(other);
    useToastStore.getState().current!.actions![0].onClick();
    expect(useTaskStore.getState().tasks[essay].collectionId).toBe(geos);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Read chapter 3' }));
    expect(useUIStore.getState().openModal).toBeNull();
    expect(useUIStore.getState().editingTaskId).toBeTruthy();
  });
});
