// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotifyRuleField } from './NotifyLead';

afterEach(cleanup);
const unitSelect = () => screen.queryByLabelText('Minutes, hours or days') as HTMLSelectElement | null;

describe('the one Notify field for every calendar item', () => {
  it('ticking it starts from the usual rule; an item with no time offers only days before, at a time', () => {
    const onChange = vi.fn();
    const { rerender } = render(<NotifyRuleField item="event" timed={false} rule={{ kind: 'off' }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Notify me'));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'daysAt', days: 1, at: '17:00' });
    rerender(<NotifyRuleField item="event" timed={false} rule={{ kind: 'daysAt', days: 1, at: '17:00' }} onChange={onChange} />);
    expect(unitSelect()).toBeNull();
    expect(screen.getByLabelText('Hour', { selector: 'input' })).toBeInTheDocument();
  });

  it('a timed reminder offers at its time, before its time, and days before at a time; switching keeps the amount', () => {
    const onChange = vi.fn();
    render(<NotifyRuleField item="reminder" timed rule={{ kind: 'before', value: 20, unit: 'minutes' }} onChange={onChange} />);
    expect([...unitSelect()!.options].map((o) => o.value)).toEqual(['atTime', 'before:minutes', 'before:hours', 'before:days', 'daysAt']);
    fireEvent.change(unitSelect()!, { target: { value: 'before:hours' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'before', value: 20, unit: 'hours' });
  });

  it('a rule an item can no longer use (before, once its time is gone) shows as days before, at', () => {
    render(<NotifyRuleField item="deadline" timed={false} rule={{ kind: 'before', value: 3, unit: 'hours' }} onChange={vi.fn()} />);
    expect(screen.getByText('day before')).toBeInTheDocument();
  });
});
