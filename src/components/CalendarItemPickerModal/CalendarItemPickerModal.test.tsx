// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCalendarStore } from '@/store/calendarStore';
import { CalendarItemPickerModal } from './CalendarItemPickerModal';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const ev = (id: string, title: string, date: string, extra: Record<string, unknown> = {}) =>
  ({ id, title, date, notes: null, collectionId: null, repeat: null, archivedAt: null, eventType: 'default', ...extra });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 7, 12));
  useCalendarStore.setState({
    events: {
      e1: ev('e1', 'Exam', '2026-11-20'),
      e2: ev('e2', 'Lecture', '2026-09-01', { repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [2] } }),
      e3: ev('e3', 'Old talk', '2026-10-01', { archivedAt: '2026-10-02' }),
      e4: ev('e4', 'Do the task', '2026-11-08', { eventType: 'task' }),
    } as never,
    reminders: { r1: ev('r1', 'Call the bank', '2026-11-12', { reminderType: 'default' }), r2: ev('r2', 'Task reminder', '2026-11-12', { reminderType: 'task' }) } as never,
    deadlines: { d1: ev('d1', 'Essay due', '2026-11-15', { deadlineType: 'default' }), d2: ev('d2', 'Task due', '2026-11-16', { deadlineType: 'task' }) } as never,
  });
});

describe('CalendarItemPickerModal: linking a task to a calendar item', () => {
  it('offers events, Reminders and Deadlines, not archived ones or a task’s own entries; a repeating one says so', () => {
    render(<CalendarItemPickerModal suggestFrom="" excludeIds={new Set()} onPick={() => {}} onClose={() => {}} />);
    const titles = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(titles.some((t) => t.includes('Exam'))).toBe(true);
    expect(titles.some((t) => t.includes('Essay due'))).toBe(true);
    expect(titles.some((t) => t.includes('Call the bank'))).toBe(true);
    expect(titles.some((t) => t.includes('Lecture') && t.includes('repeats'))).toBe(true);
    expect(titles.some((t) => /Old talk|Do the task|Task due|Task reminder/.test(t))).toBe(false);
  });

  it('a one-off item: one pick, carrying how it relates (Preparation first)', () => {
    const onPick = vi.fn();
    render(<CalendarItemPickerModal suggestFrom="" excludeIds={new Set()} onPick={onPick} onClose={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Preparation' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Related' }));
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Exam'))!);
    expect(onPick).toHaveBeenCalledWith([{ type: 'event', id: 'e1', kind: 'related', occurrence: null }]);
  });

  it('a repeating item: its dates, none ticked, 20 at a time; tick several and link them, or link all dates (2026-11-07)', () => {
    const onPick = vi.fn();
    render(<CalendarItemPickerModal suggestFrom="" excludeIds={new Set()} linked={new Set(['event:e2:2026-11-17'])} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Lecture'))!);
    expect(onPick).not.toHaveBeenCalled();
    const boxes = () => screen.getAllByRole('checkbox');
    expect(boxes()).toHaveLength(20);
    expect(boxes().filter((b) => (b as HTMLInputElement).checked)).toHaveLength(1);   // the one already linked
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
    expect(boxes()).toHaveLength(40);
    fireEvent.click(boxes()[2]);
    fireEvent.click(boxes()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Link 2 dates' }));
    expect(onPick).toHaveBeenLastCalledWith([
      { type: 'event', id: 'e2', kind: 'prepFor', occurrence: '2026-11-10' },
      { type: 'event', id: 'e2', kind: 'prepFor', occurrence: '2026-11-24' },
    ]);
  });

  it('a repeating item: Tick all ticks every date (2026-11-07: it used to link at once); Link then links the whole series', () => {
    const onPick = vi.fn();
    render(<CalendarItemPickerModal suggestFrom="" excludeIds={new Set()} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Lecture'))!);
    fireEvent.click(screen.getByRole('button', { name: 'Tick all' }));
    expect(onPick).not.toHaveBeenCalled();
    const boxes = () => screen.getAllByRole('checkbox');
    expect(boxes().every((b) => (b as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Untick all' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Link \d+ dates$/ }));
    expect(onPick).toHaveBeenCalledWith([{ type: 'event', id: 'e2', kind: 'prepFor', occurrence: null }]);
  });

  it('a repeating item, all ticked then one unticked: each date left is linked on its own', () => {
    const onPick = vi.fn();
    render(<CalendarItemPickerModal suggestFrom="" excludeIds={new Set()} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Lecture'))!);
    fireEvent.click(screen.getByRole('button', { name: 'Tick all' }));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Link \d+ dates$/ }));
    const picks = onPick.mock.calls[0][0] as { occurrence: string | null }[];
    expect(picks.length).toBeGreaterThan(1);
    expect(picks.every((p) => p.occurrence)).toBe(true);
  });

  it('reopened on a series already chosen: its dates start ticked', () => {
    render(<CalendarItemPickerModal suggestFrom="" excludeIds={new Set()} onPick={() => {}} onClose={() => {}}
      start={{ type: 'event', id: 'e2', kind: 'followUpOf', dates: ['2026-11-10'] }} />);
    const ticked = screen.getAllByRole('checkbox').filter((b) => (b as HTMLInputElement).checked);
    expect(ticked).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Follow-up' })).toHaveAttribute('aria-checked', 'true');
  });
});
