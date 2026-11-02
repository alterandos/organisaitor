import { describe, expect, it } from 'vitest';
import { buildDeadline, buildEvent } from '@/store/calendarStore';
import { behindDates, itemOccurrences, repeatingItemsOf } from './itemOccurrences';
import type { CalendarDeadline, CalendarDeadlineId, CalendarEvent, CalendarEventId, CollectionId, RepeatConfig } from '@/types';

// An Endeavour's repeating classes and Work, date by date (phase 7 (e)): only Work falls behind;
// a class is attended or not marked; a date taken out stands in for its series' date.

const SUB = 'sub' as CollectionId;
const TS = '2031-01-01T00:00:00.000Z';
const weekly = (day: number, extra: Partial<RepeatConfig> = {}): RepeatConfig => ({ freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [day], ...extra });
const TODAY = '2031-03-20';   // a Thursday

function setup() {
  const lecture: CalendarEvent = { ...buildEvent({ title: 'Lecture', date: '2031-03-03', startTime: '10:00', collectionId: SUB, repeat: weekly(1) }, 'lec' as CalendarEventId, TS), attendedDates: ['2031-03-03'] };
  const quiz: CalendarDeadline = buildDeadline({ title: 'Quiz', date: '2031-03-07', time: '17:00', collectionId: SUB, repeat: weekly(5, { exceptions: ['2031-03-14'] }), doneDates: ['2031-03-07'] }, 'quiz' as CalendarDeadlineId, TS);
  const moved: CalendarDeadline = buildDeadline({ title: 'Quiz', date: '2031-03-22', collectionId: SUB, seriesId: 'quiz', seriesDate: '2031-03-21' }, 'moved' as CalendarDeadlineId, TS);
  quiz.repeat!.exceptions = ['2031-03-14', '2031-03-21'];
  const oneOff: CalendarDeadline = buildDeadline({ title: 'Essay', date: '2031-03-10', collectionId: SUB }, 'essay' as CalendarDeadlineId, TS);
  return { events: { lec: lecture }, deadlines: { quiz, moved, essay: oneOff } } as unknown as { events: Record<string, CalendarEvent>; deadlines: Record<string, CalendarDeadline> };
}

describe('item occurrences', () => {
  it('lists the repeating classes and Work, not one-offs or taken-out dates', () => {
    const all = setup();
    expect(repeatingItemsOf(SUB, all.events, all.deadlines).map((i) => [i.kind, i.item.id])).toEqual([['class', 'lec'], ['work', 'quiz']]);
  });

  it('a class is attended or not marked (never behind); Work is done, skipped, behind or upcoming; a taken-out date stands in', () => {
    const all = setup();
    const occ = itemOccurrences(repeatingItemsOf(SUB, all.events, all.deadlines), all, '2031-03-01', '2031-03-28', TODAY);
    const by = (id: string) => occ.filter((o) => o.series.id === id).map((o) => [o.date, o.state]);
    expect(by('lec')).toEqual([['2031-03-03', 'attended'], ['2031-03-10', 'notMarked'], ['2031-03-17', 'notMarked'], ['2031-03-24', 'upcoming']]);
    expect(by('quiz')).toEqual([['2031-03-07', 'done'], ['2031-03-14', 'skipped'], ['2031-03-22', 'upcoming'], ['2031-03-28', 'upcoming']]);
    expect(occ.find((o) => o.date === '2031-03-22')!.copy?.id).toBe('moved');
  });

  it('behind: Work dates in the last two weeks not done or skipped', () => {
    const all = setup();
    expect(behindDates(all.deadlines.quiz, '2031-03-20')).toEqual([]);   // the 7th done, the 14th skipped
    expect(behindDates({ ...all.deadlines.quiz, repeat: weekly(5) }, '2031-03-20')).toEqual(['2031-03-14']);
    expect(behindDates(all.deadlines.essay, '2031-03-20')).toEqual([]);  // a one-off is behind through its own row
  });
});
