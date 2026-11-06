// @vitest-environment jsdom
//
// What's in an Endeavour, on its home (components/EndeavourPieces): each thing a card saying what it
// is that opens it; "+ Add" through the app's own panes, with a choice where a tile holds several
// kinds; a deadline's "+ Task for this"; a template's suggestions (Add, Not needed); a semester's
// subjects added by name.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EndeavourPieces } from './EndeavourPieces';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useGoalStore } from '@/store/goalStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { LABELS } from '@/config/labels';

const L = LABELS.endeavourPieces;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 20, 10, 0));
  for (const s of [useTaskStore, useCalendarStore, useItemTypeStore, useGoalStore, useListStore, useNoteStore, useToastStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
  useUIStore.setState({ ...useUIStore.getInitialState(), activeView: 'endeavours' }, true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const endeavour = (name: string, templateId?: string) => {
  const id = useTaskStore.getState().addCollection({ kind: 'project', name });
  if (templateId) useTaskStore.getState().updateCollection(id, { templateId });
  return id;
};

describe('EndeavourPieces', () => {
  it('shows each thing as a card saying what it is, and opens it', () => {
    const id = endeavour('Kitchen');
    const t = addTaskWithCalendar({ title: 'Get quotes', collectionId: id, deadline: '2026-07-24' });
    useCalendarStore.getState().addDeadline({ title: 'Council permit', date: '2026-08-01', collectionId: id });
    render(<EndeavourPieces id={id} />);
    const tasks = screen.getByRole('region', { name: L.tasks });
    expect(within(tasks).getByText('Get quotes')).toBeInTheDocument();
    expect(within(tasks).getByText(/Task · due/)).toBeInTheDocument();
    const cal = screen.getByRole('region', { name: L.calendar });
    expect(within(cal).getByText(/Deadline · /)).toBeInTheDocument();
    fireEvent.click(within(tasks).getByText('Get quotes'));
    expect(useUIStore.getState().editingTaskId).toBe(t);
  });

  it('the calendar’s + Add offers each kind, saying what it is', () => {
    const id = endeavour('Kitchen');
    render(<EndeavourPieces id={id} />);
    fireEvent.click(screen.getByRole('button', { name: L.addTo(L.calendar) }));
    expect(screen.getByText(L.kindHints.timetable)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${L.kinds.deadline}`) }));
    expect(useUIStore.getState().openModal).toBe('add-calendar-item');
  });

  it('a deadline offers a task for it, linked to it', () => {
    const id = endeavour('Essay');
    const d = useCalendarStore.getState().addDeadline({ title: 'Essay due', date: '2026-08-01', collectionId: id });
    render(<EndeavourPieces id={id} />);
    fireEvent.click(screen.getByRole('button', { name: L.taskFor }));
    expect(useUIStore.getState().openModal).toBe('add-task');
    expect(useUIStore.getState().pendingEventLink).toEqual({ kind: 'prepFor', targetType: 'deadline', targetId: d });
  });

  it('a semester suggests, making nothing until asked; Not needed hides one', () => {
    const id = endeavour('Semester 2', 'semester');
    render(<EndeavourPieces id={id} />);
    const group = screen.getByRole('group', { name: L.suggested });
    expect(within(group).getByText('Semester 2 admin')).toBeInTheDocument();
    expect(within(group).getByText(L.suggestWeekly('Sunday'))).toBeInTheDocument();
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
    fireEvent.click(within(group).getAllByRole('button', { name: L.addSuggestion })[0]);
    expect(Object.values(useListStore.getState().lists).map((l) => l.name)).toEqual(['Semester 2 admin']);
    expect(within(screen.getByRole('group', { name: L.suggested })).queryByText('Semester 2 admin')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: L.notNeeded }));
    expect(screen.queryByRole('group', { name: L.suggested })).toBeNull();
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);
  });

  it('a semester adds its subjects by name, the code split off', () => {
    const id = endeavour('Semester 2', 'semester');
    render(<EndeavourPieces id={id} />);
    fireEvent.click(screen.getByRole('button', { name: L.add }));
    expect(screen.getByText(L.partNeeded('Subject'))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(L.partName('Subject')), { target: { value: 'GEOS215 Climate Systems' } });
    fireEvent.keyDown(screen.getByLabelText(L.partName('Subject')), { key: 'Enter' });
    const subj = Object.values(useTaskStore.getState().collections).find((c) => c.name === 'GEOS215 Climate Systems')!;
    expect(subj.links?.[0]).toMatchObject({ kind: 'partOf', targetId: id });
    expect(subj.attributes?.values.code).toBe('GEOS215');
  });
});
