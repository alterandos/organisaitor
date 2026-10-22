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

  it('a first hour digit no second digit could continue ("3": no 30s hour) is complete at once as 03', () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(hourInput());
    type(hourInput(), '3');
    expect(hourInput().value).toBe('03');
    expect(onChange).toHaveBeenLastCalledWith('03:00');
    expect(minuteInput()).toHaveFocus();
  });

  it('too big an hour ("25") becomes the largest (23), flashes, and stays in the hour, selected', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);
    act(() => hourInput().focus());
    type(hourInput(), '2');
    type(hourInput(), '5');
    expect(hourInput().value).toBe('23');
    expect(onChange).toHaveBeenLastCalledWith('23:00');
    expect(hourInput()).toHaveFocus();
    expect(hourInput().className).toMatch(/segmentError/);
    act(() => { vi.advanceTimersByTime(420); });
    expect(hourInput().className).not.toMatch(/segmentError/);
    vi.useRealTimers();
    type(hourInput(), '1'); // selected, so the next digit starts over
    expect(hourInput().value).toBe('1');
  });

  it('too big a minute ("77") becomes 59, selected, rather than being rejected', () => {
    const onChange = vi.fn();
    render(<TimeInput value="09:00" onChange={onChange} />);
    act(() => minuteInput().focus());
    type(minuteInput(), '7');
    expect(minuteInput().value).toBe('7'); // one digit: still waiting
    type(minuteInput(), '7');
    expect(minuteInput().value).toBe('59');
    expect(onChange).toHaveBeenLastCalledWith('09:59');
    expect(minuteInput()).toHaveFocus();
  });

  it('typing the minutes first, then the hour, keeps the minutes', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TimeInput value="" onChange={onChange} />);
    fireEvent.focus(minuteInput());
    type(minuteInput(), '4');
    type(minuteInput(), '5');
    expect(hourInput()).toHaveFocus(); // the hour is still empty, so it goes there
    type(hourInput(), '0');
    type(hourInput(), '9');
    expect(onChange).toHaveBeenLastCalledWith('09:45');
    rerender(<TimeInput value="09:45" onChange={onChange} />);
    expect(minuteInput().value).toBe('45');
  });

  it('a half-typed time reported as "" upward does not wipe the other segment when it echoes back', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TimeInput value="14:30" onChange={onChange} />);
    fireEvent.focus(hourInput());
    type(hourInput(), '1'); // starts the hour over
    fireEvent.keyDown(hourInput(), { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith('');
    rerender(<TimeInput value="" onChange={onChange} />);
    expect(minuteInput().value).toBe('30');
  });

  it('a value changed from outside still resets the segments', () => {
    const { rerender } = render(<TimeInput value="14:30" onChange={vi.fn()} />);
    rerender(<TimeInput value="08:15" onChange={vi.fn()} />);
    expect(hourInput().value).toBe('08');
    expect(minuteInput().value).toBe('15');
  });

  it('complete minutes in 24-hour mode move on to the next control after the field', () => {
    const onChange = vi.fn();
    render(<form><TimeInput value="10:00" onChange={onChange} /><input aria-label="after" /></form>);
    act(() => minuteInput().focus());
    type(minuteInput(), '1');
    type(minuteInput(), '5');
    expect(onChange).toHaveBeenLastCalledWith('10:15');
    expect(screen.getByLabelText('after')).toHaveFocus();
  });

  it('↑ ↓ step the hour and minute, and the ▲▼ buttons step minutes by 5', () => {
    const onChange = vi.fn();
    render(<TimeInput value="23:58" onChange={onChange} />);
    fireEvent.keyDown(hourInput(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('00:58'); // wraps
    fireEvent.keyDown(minuteInput(), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('00:57');
    fireEvent.click(screen.getByLabelText('Increase minute'));
    expect(onChange).toHaveBeenLastCalledWith('00:00'); // the next multiple of 5 is 60, which wraps
    fireEvent.click(screen.getByLabelText('Decrease hour'));
    expect(onChange).toHaveBeenLastCalledWith('23:00');
  });

  it('the wheel over a segment steps it', () => {
    const onChange = vi.fn();
    render(<TimeInput value="10:00" onChange={onChange} />);
    fireEvent.wheel(hourInput(), { deltaY: -100 });
    expect(onChange).toHaveBeenLastCalledWith('11:00');
    fireEvent.wheel(minuteInput(), { deltaY: 100 });
    expect(onChange).toHaveBeenLastCalledWith('11:55');
  });

  it('the ▾, ✕ and ▲▼ buttons are out of the Tab order', () => {
    render(<TimeInput value="10:00" onChange={vi.fn()} />);
    for (const name of ['Clear time', 'Choose a time', 'Increase hour', 'Decrease minute']) {
      expect(screen.getByLabelText(name)).toHaveAttribute('tabindex', '-1');
    }
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
    expect(onChange).not.toHaveBeenCalled(); // nothing was ever complete, so nothing to report
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
    expect(screen.getByRole('button', { name: /AM or PM, now PM/ })).toBeInTheDocument();
  });

  it('clicking AM/PM re-commits using the already-typed hour/minute', () => {
    const onChange = vi.fn();
    render(<TimeInput value="09:15" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /AM or PM/ }));
    expect(onChange).toHaveBeenLastCalledWith('21:15');
  });

  it('too big an hour ("14") becomes 12', () => {
    render(<TimeInput value="" onChange={vi.fn()} />);
    act(() => hourInput().focus());
    type(hourInput(), '1');
    type(hourInput(), '4');
    expect(hourInput().value).toBe('12');
    expect(hourInput()).toHaveFocus();
  });

  it('complete minutes move on to AM/PM, and typing P there sets PM', () => {
    const onChange = vi.fn();
    render(<TimeInput value="09:00" onChange={onChange} />);
    act(() => minuteInput().focus());
    type(minuteInput(), '1');
    type(minuteInput(), '0');
    const mer = screen.getByRole('button', { name: /AM or PM/ });
    expect(mer).toHaveFocus();
    fireEvent.keyDown(mer, { key: 'p' });
    expect(onChange).toHaveBeenLastCalledWith('21:10');
  });

  it('stepping the hour past 11 AM turns it to PM', () => {
    const onChange = vi.fn();
    render(<TimeInput value="11:30" onChange={onChange} />);
    fireEvent.keyDown(hourInput(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('12:30');
    expect(screen.getByRole('button', { name: /now PM/ })).toBeInTheDocument();
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
