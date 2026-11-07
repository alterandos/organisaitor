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

  it('a blank one: a period added runs during it by default; details are one line each', () => {
    render(<EndeavourCreator />);
    expect(screen.getByText(LABELS.periods.nothing)).toBeInTheDocument();
    fireEvent.click(screen.getByText(LABELS.periods.add));
    fireEvent.change(screen.getByRole('textbox', { name: LABELS.periods.name }), { target: { value: 'Build' } });
    expect(screen.getByLabelText(`${LABELS.periods.role}: Build`)).toHaveValue('runs');
    fireEvent.click(screen.getByText(L.addDetail));
    fireEvent.change(screen.getByLabelText(L.detailName), { target: { value: 'Builder' } });
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Kitchen' } });
    create();
    const made = byName('Kitchen')!;
    const build = made.attributes!.fields.find((f) => f.name === 'Build')!;
    expect(build.type).toBe('dateRange');
    expect(made.attributes?.fields.map((f) => f.name).sort()).toEqual(['Build', 'Builder']);
    expect(made.dateUse).toEqual({ runs: [build.id], pauses: [] });
    expect(made.kind).toBe('list');   // no dates yet, so no end
  });

  it('a period with no name gets a red note', () => {
    render(<EndeavourCreator />);
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Term' } });
    fireEvent.click(screen.getByText(LABELS.periods.add));
    create();
    expect(screen.getByText(LABELS.periods.nameNeeded)).toBeInTheDocument();
    expect(byName('Term')).toBeUndefined();
  });

  it('a semester starts with Teaching (runs during it) and Exams (not used), and makes its notebook', () => {
    render(<EndeavourCreator />);
    fireEvent.click(screen.getByRole('button', { name: /Semester/ }));
    expect(screen.getByLabelText(`${LABELS.periods.role}: Teaching`)).toHaveValue('runs');
    expect(screen.getByLabelText(`${LABELS.periods.role}: Exams`)).toHaveValue('');
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Semester 2' } });
    create();
    const sem = byName('Semester 2')!;
    expect(sem.templateId).toBe('semester');
    const teaching = sem.attributes!.fields.find((f) => f.name === 'Teaching')!;
    expect(sem.dateUse).toEqual({ runs: [teaching.id], pauses: [] });
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

describe('what it takes from what it’s part of, and its notebook (2026-11-06)', () => {
  it('a blank one makes a notebook only when ticked', () => {
    render(<EndeavourCreator />);
    expect(screen.getByLabelText(L.notebook)).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Kitchen' } });
    fireEvent.click(screen.getByLabelText(L.notebook));
    create();
    expect(Object.values(useNoteStore.getState().noteTags).map((n) => [n.name, n.collectionId])).toEqual([['Kitchen', byName('Kitchen')!.id]]);
  });

  it('a template fills in its tags and ticks its notebook; unticked, none is made', () => {
    render(<EndeavourCreator />);
    fireEvent.click(screen.getByRole('button', { name: /Semester/ }));
    expect(screen.getByText('University')).toBeInTheDocument();
    expect(screen.getByLabelText(L.notebook)).toBeChecked();
    fireEvent.click(screen.getByLabelText(L.notebook));
    fireEvent.change(screen.getByLabelText(L.name), { target: { value: 'Sem 1' } });
    create();
    const sem = byName('Sem 1')!;
    expect(sem.tagIds.map((t) => useTaskStore.getState().tags[t]?.name)).toEqual(['University']);
    expect(Object.keys(useNoteStore.getState().noteTags)).toHaveLength(0);
  });

  it('under a semester: its tags, dates and colour show as from it; the subject keeps only its own; its notebook goes inside', () => {
    const sem = useTaskStore.getState().addCollection({ kind: 'project', name: 'Sem 2', color: '#1d4ed8' });
    useTaskStore.getState().addTag({ id: 'uni' as never, name: 'University' });
    useTaskStore.getState().updateCollection(sem, {
      tagIds: ['uni' as never],
      attributes: { typeId: null, fields: [{ id: 'teach', name: 'Teaching', type: 'dateRange' }], values: { teach: { from: '2026-07-27', to: '2026-11-06' } } },
      dateUse: { runs: ['teach'], pauses: [] },
    });
    const semNb = useNoteStore.getState().addNoteTag({ name: 'Sem 2', kind: 'area', collectionId: sem, parentTagId: null });
    useUIStore.getState().openEndeavourHome(sem);
    // From the semester's Subjects tile: the form starts as a Subject, named, part of it.
    render(<EndeavourCreator partOf={sem} template="subject" name="BIOL101 Biology" />);
    expect(screen.getByRole('button', { name: /Subject/, pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText(L.name)).toHaveValue('BIOL101 Biology');
    expect(screen.getByTitle(LABELS.tagField.from('Sem 2'))).toHaveTextContent('University');
    expect(screen.getAllByText(L.from('Sem 2')).length).toBeGreaterThan(0);
    expect(screen.getByText(L.colourFrom('Sem 2'))).toBeInTheDocument();
    expect(screen.getByLabelText(L.inside)).toHaveDisplayValue('Sem 2');
    // Its periods come from the semester, used as the semester uses them, until it chooses its own.
    expect(screen.getByLabelText(`${LABELS.periods.role}: Teaching`)).toHaveValue('runs');
    expect(screen.getByText(LABELS.periods.asEndeavour('Sem 2'), { exact: false })).toBeInTheDocument();
    create();
    const bio = byName('BIOL101 Biology')!;
    expect(bio.tagIds.map((t) => useTaskStore.getState().tags[t]?.name)).toEqual(['Subject']);
    expect(bio.color).toBeNull();
    expect(bio.period).toBeUndefined();
    expect(bio.dateUse).toBeUndefined();
    expect(bio.kind).toBe('project');   // it ends when the semester's teaching does
    expect(Object.values(useNoteStore.getState().noteTags).find((n) => n.collectionId === bio.id)?.parentTagId).toBe(semNb);
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

  it('periods and details set later are edited here too, and whether it ends follows its dates', () => {
    const a = useTaskStore.getState().addCollection({ kind: 'list', name: 'Thesis' });
    render(<EndeavourCreator editing={useTaskStore.getState().collections[a]} />);
    expect(screen.queryByRole('group', { name: 'Does it end?' })).toBeNull();
    fireEvent.click(screen.getByText(LABELS.periods.add));
    fireEvent.change(screen.getByRole('textbox', { name: LABELS.periods.name }), { target: { value: 'Writing' } });
    fireEvent.click(screen.getByRole('button', { name: L.addDetail }));
    fireEvent.change(screen.getByLabelText(L.detailName), { target: { value: 'Supervisor' } });
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    const c = useTaskStore.getState().collections[a];
    expect(c.attributes?.fields.map((f) => f.name).sort()).toEqual(['Supervisor', 'Writing']);
    expect(c.dateUse?.runs).toHaveLength(1);
    expect(c.kind).toBe('list');
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
