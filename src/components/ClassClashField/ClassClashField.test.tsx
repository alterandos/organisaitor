// @vitest-environment jsdom
//
// The clash question (2026-11-07): several clashes are chosen between; tentative events never ask.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClassClashField } from './ClassClashField';
import { useCalendarStore } from '@/store/calendarStore';

beforeEach(() => useCalendarStore.setState(useCalendarStore.getInitialState(), true));
afterEach(cleanup);

const add = (title: string, start: string, end: string, status: 'confirmed' | 'tentative' = 'confirmed') =>
  useCalendarStore.getState().addEvent({ title, date: '2031-03-07', startTime: start, endTime: end, status });

describe('ClassClashField', () => {
  it('clashing with two: picks which one to answer for; the answer names it', () => {
    add('Lecture', '12:00', '13:00');
    const lab = add('Lab', '12:30', '14:00');
    add('Maybe gym', '12:00', '13:00', 'tentative');
    const onChange = vi.fn();
    render(<ClassClashField item={{ date: '2031-03-07', start: '12:15', end: '12:45' }} value={null} onChange={onChange} />);
    const select = screen.getByRole('combobox');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text.split(' (')[0])).toEqual(['Lecture', 'Lab']);
    fireEvent.change(select, { target: { value: lab } });
    expect(screen.getByText(/during Lab/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^During it/ }));
    expect(onChange).toHaveBeenLastCalledWith({ eventId: lab, date: '2031-03-07', mode: 'during' });
  });

  it('a single clash asks with no choice; a tentative item asks nothing', () => {
    add('Lecture', '12:00', '13:00');
    const { rerender } = render(<ClassClashField item={{ date: '2031-03-07', start: '12:15' }} value={null} onChange={() => {}} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/during Lecture/)).toBeInTheDocument();
    rerender(<ClassClashField item={{ date: '2031-03-07', start: '12:15', status: 'tentative' }} value={null} onChange={() => {}} />);
    expect(screen.queryByText(/during Lecture/)).toBeNull();
  });
});
