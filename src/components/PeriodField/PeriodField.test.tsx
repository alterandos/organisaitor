// @vitest-environment jsdom
//
// An Endeavour's period and breaks in its editor: taken from above until it sets its own.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PeriodField } from './PeriodField';
import { useTaskStore } from '@/store/taskStore';

beforeEach(() => { useTaskStore.setState(useTaskStore.getInitialState(), true); });
afterEach(cleanup);

describe('PeriodField', () => {
  it('shows the semester’s; a subject can set its own, add a break, and take the semester’s again', () => {
    const s = useTaskStore.getState();
    const sem = s.addCollection({ kind: 'list', name: 'Autumn 2026' });
    s.updateCollection(sem, { period: { start: '2026-09-14', end: '2026-12-18', breaks: [] } });
    const geos = s.addCollection({ kind: 'project', name: 'GEOS215' });
    s.addEndeavourLink(geos, 'partOf', sem);

    render(<PeriodField id={geos} />);
    expect(screen.getByText(/From Autumn 2026:/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Set its own'));
    expect(useTaskStore.getState().collections[geos].period).toEqual({ start: '2026-09-14', end: '2026-12-18', breaks: [] });
    fireEvent.click(screen.getByText('+ Add a break'));
    expect(useTaskStore.getState().collections[geos].period?.breaks).toHaveLength(1);
    fireEvent.click(screen.getByText('Take Autumn 2026’s instead'));
    expect(useTaskStore.getState().collections[geos].period).toBeUndefined();
  });
});
