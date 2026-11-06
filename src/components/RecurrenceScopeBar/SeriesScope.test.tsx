// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { useCalendarStore } from '@/store/calendarStore';
import { SeriesScopeLine } from './SeriesScope';
import { useSeriesScope } from './useSeriesScope';
import type { CalendarEventId, RepeatConfig } from '@/types';

// The slim line at the top of a repeating item's pane (2026-11-05): nothing is copied until a
// change, then the change goes to this date (or this and the following) only; Delete likewise.

const WEEKLY: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
beforeEach(() => useCalendarStore.setState(useCalendarStore.getInitialState(), true));
afterEach(() => cleanup());

const events = () => Object.values(useCalendarStore.getState().events);
const setup = () => {
  const id = useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2026-11-02', repeat: WEEKLY });
  const onSwitch = vi.fn();
  const update = (itemId: string, patch: { title: string }) => useCalendarStore.getState().updateEvent(itemId as CalendarEventId, patch);
  const hook = renderHook(() => useSeriesScope({ kind: 'event', id, repeats: true, occurrence: '2026-11-16', update, onSwitch }));
  return { id, hook, onSwitch };
};

describe('which dates a repeating item’s pane changes', () => {
  it('All dates changes the series; choosing Only this date copies nothing until a change, then that date alone', () => {
    const { id, hook, onSwitch } = setup();
    act(() => hook.result.current.update(id, { title: 'Lecture 1' }));
    expect(events()).toHaveLength(1);
    expect(useCalendarStore.getState().events[id as CalendarEventId].title).toBe('Lecture 1');
    act(() => hook.result.current.setScope('this'));
    expect(events()).toHaveLength(1);   // nothing copied yet
    act(() => hook.result.current.update(id, { title: 'Moved lecture' }));
    const copy = events().find((e) => e.id !== id)!;
    expect(copy).toMatchObject({ title: 'Moved lecture', date: '2026-11-16', seriesId: id });
    expect(useCalendarStore.getState().events[id as CalendarEventId].title).toBe('Lecture 1');
    expect(onSwitch).toHaveBeenCalledWith(copy.id);
  });

  it('Delete follows the choice: this date only, or this and the following', () => {
    const { id, hook } = setup();
    act(() => hook.result.current.setScope('this'));
    expect(hook.result.current.deleteLabel('Delete all dates')).toBe('Delete this date');
    act(() => { hook.result.current.deleteScoped(); });
    expect(useCalendarStore.getState().events[id as CalendarEventId].repeat?.exceptions).toEqual(['2026-11-16']);
    act(() => hook.result.current.setScope('following'));
    act(() => { hook.result.current.deleteScoped(); });
    expect(useCalendarStore.getState().events[id as CalendarEventId].repeat).toMatchObject({ endKind: 'until' });
  });

  it('the line says how it repeats and from when, and offers the three choices as pills (not "following" on its first date)', () => {
    render(<SeriesScopeLine repeat={{ ...WEEKLY, exceptions: ['2026-11-09'] }} firstDate="2026-11-02" occurrence="2026-11-16" scope="all" onScope={() => {}} />);
    expect(screen.queryByText(/removed/)).toBeNull();   // clutter, taken out 2026-11-05
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'All dates' })).toHaveAttribute('aria-checked', 'true');
    cleanup();
    render(<SeriesScopeLine repeat={WEEKLY} firstDate="2026-11-02" occurrence="2026-11-02" scope="all" onScope={() => {}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});
