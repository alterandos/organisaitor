// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TimeInput } from './TimeInput';
import { useSettingsStore } from '@/store/settingsStore';

beforeEach(() => {
  useSettingsStore.setState({ clockFormat: '24h' });
});

afterEach(() => {
  cleanup();
});

function hourInput() { return screen.getByLabelText('Hour') as HTMLInputElement; }
function minuteInput() { return screen.getByLabelText('Minute') as HTMLInputElement; }
function type(input: HTMLInputElement, key: string) { fireEvent.keyDown(input, { key }); }

describe('TimeInput — 24-hour mode', () => {
  it('typing a full realistic sequence ("2","3","5","9") auto-advances hour->minute and commits "23:59"', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());

    type(hourInput(), '2');
    expect(hourInput().value).toBe('2');
    expect(onChange).not.toHaveBeenCalled(); // still ambiguous — could become 20-23

    type(hourInput(), '3');
    // Two digits in -> auto-advances and commits with minute defaulted to "00".
    expect(onChange).toHaveBeenLastCalledWith('23:00');
    expect(minuteInput()).toHaveFocus();

    type(minuteInput(), '5');
    expect(minuteInput().value).toBe('5');
    type(minuteInput(), '9');
    expect(onChange).toHaveBeenLastCalledWith('23:59');
  });

  it('an impossible first hour digit (24h: only 0/1/2 can start an hour) flashes red and clears, rather than silently swallowing the keystroke', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());

    type(hourInput(), '3');
    expect(hourInput().value).toBe('');
    expect(onChange).toHaveBeenCalledWith('');
    expect(hourInput().className).toMatch(/segmentError|Error/);

    act(() => { vi.advanceTimersByTime(420); });
    expect(hourInput().className).not.toMatch(/segmentError|Error/);
    vi.useRealTimers();
  });

  it('a minute\'s first digit above 5 (tens digit can never stay <=59) flashes and clears', () => {
    const onChange = vi.fn();
    render(<TimeInput value="09:00" onChange={onChange} />);
    fireEvent.focus(minuteInput());
    type(minuteInput(), '6');
    expect(minuteInput().value).toBe('');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('the auto-advance commit is not double-fired by the blur it causes (the blur-before-flush race)', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());
    type(hourInput(), '1');
    type(hourInput(), '0'); // "10" -> auto-advances to minute, focuses it (jsdom fires the real blur)
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('10:00');
  });

  it('a lone typed digit is finalized (padded and committed) on blur, not left un-padded', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());
    type(hourInput(), '2'); // ambiguous (20-23 also possible) — 24h never auto-advances on 1 digit
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(hourInput());
    expect(hourInput().value).toBe('02');
    expect(onChange).toHaveBeenLastCalledWith('02:00');
  });

  it('Backspace immediately after focusing (select-all semantics) clears the whole time, not just one character', () => {
    const onChange = vi.fn();
    render(<TimeInput value="14:30" onChange={onChange} />);
    fireEvent.focus(hourInput());
    fireEvent.keyDown(hourInput(), { key: 'Backspace' });
    expect(hourInput().value).toBe('');
    expect(minuteInput().value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('Backspace on a segment already being edited only removes the last character', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());
    type(hourInput(), '1'); // now mid-edit — the "just focused" flag is spent
    fireEvent.keyDown(hourInput(), { key: 'Backspace' });
    expect(hourInput().value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('the ✕ clear button empties both segments and commits ""', () => {
    const onChange = vi.fn();
    render(<TimeInput value="14:30" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Clear time'));
    expect(hourInput().value).toBe('');
    expect(minuteInput().value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('a non-digit keystroke is rejected outright, not swallowed silently into nothing shown', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    const prevented = !fireEvent(hourInput(), event);
    expect(prevented).toBe(true);
    expect(hourInput().value).toBe('');
  });
});

describe('TimeInput — 12-hour mode', () => {
  beforeEach(() => {
    useSettingsStore.setState({ clockFormat: '12h' });
  });

  it('a single digit that can only extend upward past 12 auto-finalizes immediately (e.g. "3" can\'t become "30"+)', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());
    type(hourInput(), '3');
    // 3*10=30 > 12, so it's already unambiguous — auto-advances without waiting for a 2nd digit.
    expect(onChange).toHaveBeenLastCalledWith('03:00');
    expect(minuteInput()).toHaveFocus();
  });

  it('"1" stays ambiguous (could become 10/11/12) until a second digit or blur', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());
    type(hourInput(), '1');
    expect(onChange).not.toHaveBeenCalled();
    type(hourInput(), '2');
    // Default meridiem is AM, and 12 AM is midnight in 24h terms.
    expect(onChange).toHaveBeenLastCalledWith('00:00');
  });

  it('displays the existing 24h value converted to 12h + the right meridiem', () => {
    render(<TimeInput value="14:05" onChange={vi.fn()} />);
    expect(hourInput().value).toBe('2');
    expect(minuteInput().value).toBe('05');
    expect(screen.getByRole('button', { name: 'PM' })).toHaveClass(/meridiemBtnActive|Active/);
  });

  it('clicking AM/PM re-commits using the already-typed hour/minute', () => {
    const onChange = vi.fn();
    render(<TimeInput value="09:15" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'PM' }));
    expect(onChange).toHaveBeenLastCalledWith('21:15');
  });
});

describe('TimeInput — quick-pick dropdown', () => {
  it('opens on focus and picking an entry commits that time and closes it', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: '09:30' }));
    expect(onChange).toHaveBeenLastCalledWith('09:30');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Escape closes the dropdown without clearing the value', () => {
    const onChange = vi.fn();
    render(<TimeInput value="09:00" onChange={onChange} />);
    fireEvent.focus(hourInput());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
