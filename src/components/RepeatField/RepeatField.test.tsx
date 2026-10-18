// @vitest-environment jsdom
//
// THE repeat editor (tasks, the add-calendar-item modal, the event/reminder/deadline panes).
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RepeatField } from './RepeatField';
import type { RepeatConfig } from '@/types';

afterEach(() => { cleanup(); });

let last: RepeatConfig | null = null;
function Host({ initial, date }: { initial: RepeatConfig | null; date?: string }) {
  const [value, setValue] = useState(initial);
  return <RepeatField value={value} onChange={(r) => { last = r; setValue(r); }} date={date} />;
}

const weekly: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };

describe('RepeatField', () => {
  it('on starts weekly, forever; off hands back null', () => {
    render(<Host initial={null} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(last).toEqual(weekly);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(last).toBeNull();
  });

  it('every N, the unit, and the end (after N times / on a date)', () => {
    render(<Host initial={weekly} />);
    const [interval] = screen.getAllByRole('spinbutton');
    fireEvent.change(interval, { target: { value: '3' } });
    expect(last).toMatchObject({ interval: 3 });
    const [unit, ends] = screen.getAllByRole('combobox');
    fireEvent.change(unit, { target: { value: 'monthly' } });
    expect(last).toMatchObject({ freq: 'monthly', interval: 3 });
    fireEvent.change(ends, { target: { value: 'count' } });
    expect(last).toMatchObject({ endKind: 'count', count: 10, until: null });
    fireEvent.change(ends, { target: { value: 'until' } });
    expect(last).toMatchObject({ endKind: 'until', count: null });
  });

  it("keeps what it doesn't edit: a calendar series' exceptions survive a change", () => {
    render(<Host initial={{ ...weekly, exceptions: ['2026-10-12'] }} />);
    const [interval] = screen.getAllByRole('spinbutton');
    fireEvent.change(interval, { target: { value: '2' } });
    expect(last).toMatchObject({ interval: 2, exceptions: ['2026-10-12'] });
  });

  it('weekly: picks weekdays, starting from the date’s own; leaving weekly drops them', () => {
    // 2026-10-19 is a Monday.
    render(<Host initial={weekly} date="2026-10-19" />);
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday' }));
    expect(last).toMatchObject({ daysOfWeek: [1, 3] });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'daily' } });
    expect(last).not.toHaveProperty('daysOfWeek');
  });

  it('monthly: on the same day number, or the nth / last weekday of the date', () => {
    // 2026-10-27 is the 4th and last Tuesday of October.
    render(<Host initial={{ ...weekly, freq: 'monthly' }} date="2026-10-27" />);
    const on = screen.getAllByRole('combobox')[1];
    expect(Array.from(on.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['On day 27', 'On the fourth Tuesday', 'On the last Tuesday']);
    fireEvent.change(on, { target: { value: 'last' } });
    expect(last).toMatchObject({ freq: 'monthly', monthWeekday: { week: -1, day: 2 } });
    fireEvent.change(on, { target: { value: 'day' } });
    expect(last).not.toHaveProperty('monthWeekday');
  });
});
