// @vitest-environment jsdom
// The Endeavours section (docs/features/endeavours.md phase 2): the page and an Endeavour's home.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EndeavoursSection } from './EndeavoursSection';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { openNewItem } from '@/services/newItem';
import { AddTaskButton } from '@/components/AddTaskButton/AddTaskButton';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0));
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState({ ...useUIStore.getInitialState(), activeView: 'endeavours' }, true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function semester() {
  const s = useTaskStore.getState();
  const sem = s.addCollection({ kind: 'list', name: 'Semester 2' });
  const career = s.addCollection({ kind: 'list', name: 'Career' });
  const geos = s.addCollection({ kind: 'project', name: 'GEOS215' });
  const intern = s.addCollection({ kind: 'project', name: 'Internship' });
  s.addEndeavourLink(geos, 'partOf', sem);
  s.addEndeavourLink(intern, 'partOf', sem);
  s.addEndeavourLink(intern, 'partOf', career);
  s.addTask({ title: 'Reading Ch 3', collectionId: geos, deadline: '2026-10-20' });
  s.addTask({ title: 'Essay', collectionId: geos, deadline: '2026-10-31' });
  return { sem, career, geos, intern };
}

describe('the Endeavours page', () => {
  it('shows the tree, an Endeavour with two parents under each (marked), and how far behind each is', () => {
    semester();
    render(<EndeavoursSection />);
    expect(screen.getAllByRole('button', { name: /Internship/ })).toHaveLength(2);
    expect(screen.getByText('also in Career')).toBeInTheDocument();
    expect(screen.getByText('also in Semester 2')).toBeInTheDocument();
    expect(screen.getAllByText('1 behind').length).toBeGreaterThanOrEqual(2);   // GEOS215, and Semester 2 rolled up
  });

  it('opening one goes to its home, a history stop', () => {
    const { geos } = semester();
    render(<EndeavoursSection />);
    fireEvent.click(screen.getAllByRole('button', { name: /GEOS215/ })[0]);
    expect(useUIStore.getState().endeavourHomeId).toBe(geos);
    expect(screen.getByRole('heading', { name: 'GEOS215' })).toBeInTheDocument();
    act(() => { useUIStore.getState().navigateBack(); });
    expect(useUIStore.getState().endeavourHomeId).toBeNull();
  });
});

describe('an Endeavour\'s home', () => {
  it('a parent\'s home shows its parts\' work: behind, this week, and a card per part', () => {
    const { sem } = semester();
    act(() => { useUIStore.getState().openEndeavourHome(sem); });
    render(<EndeavoursSection />);
    expect(screen.getByRole('region', { name: 'Behind' })).toHaveTextContent('Reading Ch 3');
    expect(screen.getByRole('region', { name: 'This week' })).toHaveTextContent('Essay');
    expect(screen.getByRole('region', { name: 'Inside it' })).toHaveTextContent('GEOS215');
  });

  it('anything made from it is filed under it', () => {
    const { geos } = semester();
    act(() => { useUIStore.getState().openEndeavourHome(geos); });
    expect(selectActiveCollectionId(useUIStore.getState())).toBe(geos);
    openNewItem('endeavours');
    expect(useUIStore.getState().openModal).toBe('add-task');
  });
});

describe('adding to an Endeavour', () => {
  it("the + offers the five things made most often there; a goal is for this Endeavour", () => {
    const { geos } = semester();
    act(() => { useUIStore.getState().openEndeavourHome(geos); });
    render(<AddTaskButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Add here' }));
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')).filter(Boolean)).toEqual([
      'Endeavour inside', 'Notebook', 'Goal', 'Calendar item', 'Task', 'Add here',
    ].map((l) => expect.stringContaining(l.split(' ')[0])));
    fireEvent.click(screen.getByRole('button', { name: 'Goal' }));
    expect(useUIStore.getState()).toMatchObject({ openModal: 'add-goal', pendingGoalEndeavourId: geos });
  });

  it('the add row is in labelled groups', () => {
    const { geos } = semester();
    act(() => { useUIStore.getState().openEndeavourHome(geos); });
    render(<EndeavoursSection />);
    expect(screen.getByRole('group', { name: 'Plan' })).toHaveTextContent('+ Calendar item+ Goal+ Task');
    expect(screen.getByRole('group', { name: 'Shape' })).toHaveTextContent('From a template');
  });
});
