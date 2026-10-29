// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateInput } from './DateInput';

afterEach(cleanup);

const seg = (name: 'Day' | 'Month' | 'Year') => screen.getByLabelText(name, { selector: 'input' }) as HTMLInputElement;
const type = (el: HTMLInputElement, keys: string) => { for (const key of keys) fireEvent.keyDown(el, { key }); };

describe('DateInput — the suite’s date field', () => {
  it('each segment typed on its own, in any order, makes the date; complete segments move on', () => {
    const onChange = vi.fn();
    render(<form><DateInput value="" onChange={onChange} /><input aria-label="after" /></form>);
    act(() => seg('Year').focus());
    type(seg('Year'), '2026');
    act(() => seg('Day').focus());
    type(seg('Day'), '22');
    act(() => seg('Month').focus());
    type(seg('Month'), '10');
    expect(onChange).toHaveBeenLastCalledWith('2026-10-22');
  });

  it('the year fills in as this year once the day and month are typed; typing over it still works, and it can be cleared', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30));
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} />);
    act(() => seg('Day').focus());
    type(seg('Day'), '14');
    act(() => seg('Month').focus());
    type(seg('Month'), '11');
    expect(seg('Year').value).toBe('2026');
    expect(onChange).toHaveBeenLastCalledWith('2026-11-14');
    act(() => seg('Year').focus());
    type(seg('Year'), '2027');
    expect(onChange).toHaveBeenLastCalledWith('2027-11-14');
    act(() => seg('Year').focus());
    for (let i = 0; i < 4; i++) fireEvent.keyDown(seg('Year'), { key: 'Backspace' });
    expect(seg('Year').value).toBe('');
    vi.useRealTimers();
  });

  it('a digit nothing can follow is complete at once ("4" as a day, "3" as a month)', () => {
    render(<DateInput value="" onChange={vi.fn()} />);
    act(() => seg('Day').focus());
    type(seg('Day'), '4');
    expect(seg('Day').value).toBe('04');
    act(() => seg('Month').focus());
    type(seg('Month'), '3');
    expect(seg('Month').value).toBe('03');
  });

  it('too big a day or month becomes the largest allowed, and stays selected', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-02-10" onChange={onChange} />);
    act(() => seg('Day').focus());
    type(seg('Day'), '35');
    expect(seg('Day').value).toBe('28');            // February 2026 has 28 days
    expect(seg('Day')).toHaveFocus();
    act(() => seg('Month').focus());
    type(seg('Month'), '13');
    expect(seg('Month').value).toBe('12');
    expect(onChange).toHaveBeenLastCalledWith('2026-12-28');
  });

  it('↑ ↓ and the wheel step a segment; a later month keeps the day within its length', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-01-31" onChange={onChange} />);
    fireEvent.keyDown(seg('Month'), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('2026-02-28');
    fireEvent.wheel(seg('Year'), { deltaY: -100 });
    expect(onChange).toHaveBeenLastCalledWith('2027-02-28');
  });

  it('a date before min becomes min; Delete clears', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-05-10" onChange={onChange} min="2026-05-08" />);
    fireEvent.keyDown(seg('Day'), { key: 'ArrowDown' });
    fireEvent.keyDown(seg('Day'), { key: 'ArrowDown' });
    fireEvent.keyDown(seg('Day'), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('2026-05-08');
    fireEvent.keyDown(seg('Day'), { key: 'Delete' });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('▾ opens the calendar; picking a day sets it and closes', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-10-01" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Choose a date'));
    fireEvent.click(screen.getAllByRole('button', { name: '15' })[0]);
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15');
    expect(screen.queryByRole('button', { name: '15' })).not.toBeInTheDocument();
  });
});
