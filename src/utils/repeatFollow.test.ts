import { beforeEach, describe, expect, it } from 'vitest';
import { expandRepeat } from './recurrence';
import { followedDates } from './repeatFollow';
import { repeatSummary } from '@/services/recurringTasks';
import { useCalendarStore } from '@/store/calendarStore';
import { bringFollowersInStep } from '@/services/repeatFollow';
import type { CalendarEvent, RepeatConfig } from '@/types';

beforeEach(() => { useCalendarStore.setState(useCalendarStore.getInitialState(), true); });

describe('a repeat on a list of dates', () => {
  it('is just those dates, less any skipped, the first being the item’s own', () => {
    const quiz: RepeatConfig = { freq: 'dates', interval: 1, endKind: 'forever', count: null, until: null, dates: ['2026-09-18', '2026-09-25', '2026-10-02', '2026-10-16'], exceptions: ['2026-10-02'] };
    expect(expandRepeat('2026-09-18', quiz, '2026-09-01', '2026-12-31')).toEqual(['2026-09-25', '2026-10-16']);
    expect(repeatSummary(quiz)).toBe('On 4 dates');
  });
});

const weeklyWed = (until: string): RepeatConfig => ({ freq: 'weekly', interval: 1, endKind: 'until', count: null, until, daysOfWeek: [3] });

describe('a repeat that follows other events', () => {
  it('each lecture’s date moved by the offset; a skipped lecture drops out; a moved one counts where it went', () => {
    const lecture = { id: 'lec', title: 'Lecture', date: '2026-09-16', repeat: { ...weeklyWed('2026-10-07'), exceptions: ['2026-09-30'] }, archivedAt: null, seriesId: null } as unknown as CalendarEvent;
    const moved = { id: 'm', title: 'Lecture', date: '2026-09-25', repeat: null, archivedAt: null, seriesId: 'lec', seriesDate: '2026-09-23' } as unknown as CalendarEvent;
    const events = { lec: { ...lecture, repeat: { ...lecture.repeat!, exceptions: ['2026-09-30', '2026-09-23'] } }, m: moved };
    expect(followedDates({ ids: ['lec'], offsetDays: -1 }, events, '2026-09-01')).toEqual(['2026-09-15', '2026-09-24', '2026-10-06']);
  });

  it('a reading kept in step: when the lecture moves, so does every reading, and its own date is the first', () => {
    const cal = useCalendarStore.getState();
    const lec = cal.addEvent({ title: 'Lecture', date: '2026-09-16', startTime: '12:15', endTime: '14:00', repeat: weeklyWed('2026-09-30') });
    const reading = cal.addDeadline({ title: 'Reading', date: '2026-09-15', repeat: { freq: 'dates', interval: 1, endKind: 'forever', count: null, until: null, dates: [], follows: { ids: [lec], offsetDays: -1 } } });
    bringFollowersInStep();
    expect(useCalendarStore.getState().deadlines[reading].repeat?.dates).toEqual(['2026-09-15', '2026-09-22', '2026-09-29']);
    // The lecture moves to Thursdays.
    useCalendarStore.getState().updateEvent(lec, { date: '2026-09-17', repeat: { ...weeklyWed('2026-10-01'), daysOfWeek: [4] } });
    bringFollowersInStep();
    const d = useCalendarStore.getState().deadlines[reading];
    expect(d.repeat?.dates).toEqual(['2026-09-16', '2026-09-23', '2026-09-30']);
    expect(d.date).toBe('2026-09-16');
  });
});
