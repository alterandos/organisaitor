// @vitest-environment jsdom
//
// The form for an Endeavour (docs/features/endeavours.md "Creating an Endeavour", 2026-11-04): Create
// makes it and opens its home; a template only fills in defaults and makes nothing extra; dates and
// details; the red notes; the toast's Undo; and the same form editing one that exists.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EndeavourCreator } from './EndeavourCreator';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useGoalStore } from '@/store/goalStore';
import { useListStore } from '@/store/listStore';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';
import { LABELS } from '@/config/labels';

const L = LABELS.endeavourCreator;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 20, 10, 0));
  for (const s of [useTaskStore, useCalendarStore, useItemTypeStore, useGoalStore, useListStore, useNoteStore, useToastStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
  useUIStore.setState({ ...useUIStore.getInitialState(), activeView: 'endeavours' }, true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const byName = (name: string) => Object.values(useTaskStore.getState().collections).find((c) => c.name === name);
const create = () => fireEvent.click(screen.getByRole('button', { name: L.create }));

describe('making an Endeavour', () => {
  it('Create makes just the Endeavour and opens its home', () => {
    useUIStore.getState().showAddCollection();
    render(<EndeavourCreator />);
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Kitchen' } });
    fireEvent.change(screen.getByLabelText(L.description), { target: { value: 'New benches' } });
    fireEvent.click(screen.getByRole('button', { name: L.endsList }));
    create();
    const made = byName('Kitchen')!;
    expect(made).toMatchObject({ kind: 'list', description: 'New benches', deadline: null });
    expect(useUIStore.getState().creator).toBeNull();
    expect(useUIStore.getState().endeavourHomeId).toBe(made.id);
    expect(Object.keys(useNoteStore.getState().noteTags)).toHaveLength(0);
  });

  it('a missing name gets a red note under the field, and nothing is made', () => {
    render(<EndeavourCreator />);
    create();
    expect(screen.getByText(L.nameNeeded)).toBeInTheDocument();
    expect(screen.getByLabelText(L.name)).toHaveAttribute('aria-invalid', 'true');
    expect(Object.keys(useTaskStore.getState().collections)).toHaveLength(0);
  });

  it('a blank one has no dates until added, and then no exam period; details are one line each', () => {
    render(<EndeavourCreator />);
    expect(screen.queryByLabelText(LABELS.period.start)).toBeNull();
    fireEvent.click(screen.getByText(L.addDates));
    expect(screen.getByLabelText(LABELS.period.start)).toBeInTheDocument();
    expect(screen.queryByLabelText(LABELS.period.examsFrom)).toBeNull();
    fireEvent.click(screen.getByText(L.addDetail));
    fireEvent.change(screen.getByLabelText(L.detailName), { target: { value: 'Builder' } });
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Kitchen' } });
    create();
    const made = byName('Kitchen')!;
    expect(made.period).toMatchObject({ start: null, end: null, breaks: [] });
    expect(made.attributes?.fields.map((f) => f.name)).toEqual(['Builder']);
  });

  it('time off with no name or dates gets a red note', () => {
    render(<EndeavourCreator />);
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Term' } });
    fireEvent.click(screen.getByText(L.addDates));
    fireEvent.click(screen.getByText(LABELS.period.addBreak));
    create();
    expect(screen.getByText(LABELS.period.breakNeeded)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(LABELS.period.breakLabel), { target: { value: 'Holiday' } });
    create();
    expect(screen.getByText(LABELS.period.breakDates)).toBeInTheDocument();
    expect(byName('Term')).toBeUndefined();
  });

  it('a semester shows its dates with an exam period, and makes its notebook but nothing it only suggests', () => {
    render(<EndeavourCreator />);
    fireEvent.click(screen.getByRole('button', { name: /Semester/ }));
    expect(screen.getByLabelText(LABELS.period.examsFrom)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Semester 2' } });
    create();
    const sem = byName('Semester 2')!;
    expect(sem.templateId).toBe('semester');
    expect(Object.values(useNoteStore.getState().noteTags).map((t) => t.name)).toEqual(['Semester 2']);
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
    expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0);
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);
  });

  it('a subject takes its code from its name, and has no goal', () => {
    render(<EndeavourCreator />);
    fireEvent.click(screen.getByRole('button', { name: /Subject/ }));
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'GEOS215 Climate Systems' } });
    create();
    const subj = byName('GEOS215 Climate Systems')!;
    expect(subj.attributes?.values.code).toBe('GEOS215');
    expect(Object.keys(useGoalStore.getState().goals)).toHaveLength(0);
  });

  it('the toast’s Undo takes it away with what was made in it since', () => {
    render(<EndeavourCreator />);
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Kitchen' } });
    create();
    const id = byName('Kitchen')!.id;
    useListStore.getState().addList({ name: 'Quotes', collectionId: id });
    act(() => useToastStore.getState().current?.actions?.find((a) => a.label === L.undo)?.onClick());
    expect(byName('Kitchen')).toBeUndefined();
    expect(Object.keys(useListStore.getState().lists)).toHaveLength(0);
  });

  it('made from a home, it starts as part of that Endeavour', () => {
    const home = useTaskStore.getState().addCollection({ kind: 'project', name: 'Degree' });
    useUIStore.getState().openEndeavourHome(home);
    render(<EndeavourCreator />);
    expect(screen.getByText(L.partOfSummary('Degree'))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Year 1' } });
    create();
    expect(byName('Year 1')!.links?.[0]).toMatchObject({ kind: 'partOf', targetId: home });
  });
});

describe('editing an Endeavour', () => {
  it('Edit opens this form for every Endeavour, template or not, and Save keeps the changes', () => {
    const a = useTaskStore.getState().addCollection({ kind: 'project', name: 'Semester 2' });
    useTaskStore.getState().updateCollection(a, { templateId: 'semester' });
    useUIStore.getState().openEditCollection(useTaskStore.getState().collections[a]);
    expect(useUIStore.getState().openModal).toBe('add-collection');
    render(<EndeavourCreator editing={useTaskStore.getState().collections[a]} />);
    expect(screen.getByRole('heading', { name: L.titleEdit('Semester 2') })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: L.startFrom })).toBeNull();
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Semester 2, 2026' } });
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    expect(useTaskStore.getState().collections[a].name).toBe('Semester 2, 2026');
    expect(useUIStore.getState().openModal).toBeNull();
  });

  it('Archive archives it', () => {
    const a = useTaskStore.getState().addCollection({ kind: 'project', name: 'Old' });
    useUIStore.getState().openEditCollection(useTaskStore.getState().collections[a]);
    render(<EndeavourCreator editing={useTaskStore.getState().collections[a]} />);
    const footer = screen.getByRole('button', { name: L.archive });
    fireEvent.click(within(footer.parentElement!).getByRole('button', { name: L.archive }));
    expect(useTaskStore.getState().collections[a].archivedAt).not.toBeNull();
  });
});
