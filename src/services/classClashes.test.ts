import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { applyClassReplacements } from './classClashes';
import { saveSubjectItem } from './subjectItems';
import { blankDraft, draftFromDeadline, draftFromEvent } from '@/utils/subjectItems';
import { clashingClasses, duringIndex, withReplaced } from '@/utils/classClashes';
import { expandRepeat } from '@/utils/recurrence';
import type { CalendarDeadlineId, CalendarEventId, CollectionId } from '@/types';

// An item in a class's time (agreed with the user 2026-10-30): instead of the class that day (an
// in-class essay), during it (a quiz, drawn on the class), or both, as a clash.

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
});

const cal = () => useCalendarStore.getState();

function subjectWithLecture() {
  const sub = useTaskStore.getState().addCollection({ kind: 'project', name: 'GEOS215' });
  useTaskStore.getState().updateCollection(sub, { templateId: 'subject' });
  const lec = cal().addEvent({ title: 'GEOS215 lecture', date: '2031-03-04', startTime: '12:00', endTime: '14:00', collectionId: sub,
    repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [2], exceptions: ['2031-03-25'] } });
  return { sub: sub as CollectionId, lec: lec as CalendarEventId };
}

describe('items in a class\'s time', () => {
  it('finds the class an item falls in: same Endeavour, the class on that day, the times overlapping', () => {
    const { sub } = subjectWithLecture();
    const at = (date: string, start: string, end: string | null = null, collectionId: string | null = sub) => clashingClasses({ date, start, end, collectionId }, cal().events).length;
    expect(at('2031-03-11', '12:30')).toBe(1);             // a quiz at 12:30, in the lecture
    expect(at('2031-03-11', '12:00', '14:00')).toBe(1);    // the whole slot
    expect(at('2031-03-11', '14:00')).toBe(0);             // as it ends
    expect(at('2031-03-12', '12:30')).toBe(0);             // not a lecture day
    expect(at('2031-03-25', '12:30')).toBe(0);             // a date the person skipped
    expect(at('2031-03-11', '12:30', null, null)).toBe(0); // not filed under the subject
  });

  it('instead: the class that day is skipped, and comes back when the item moves or goes; the person\'s own skips stay', () => {
    const { sub, lec } = subjectWithLecture();
    const essay = saveSubjectItem(sub, { ...blankDraft('schedule', '2031-03-18'), title: 'In-class essay', start: '12:00', end: '14:00',
      onClass: { eventId: lec, date: '2031-03-18', mode: 'replaces' } }) as CalendarEventId;
    applyClassReplacements();
    const dates = () => expandRepeat(cal().events[lec].date, cal().events[lec].repeat!, '2031-03-10', '2031-03-31');
    expect(dates()).toEqual(['2031-03-11']);   // the 18th replaced, the 25th the person's own skip
    expect(cal().events[lec].repeat!.replacedSkips).toEqual(['2031-03-18']);
    // Still asked about the class when it's opened again (the replaced date is still the class's).
    expect(clashingClasses({ id: essay, date: '2031-03-18', start: '12:00', end: '14:00', collectionId: sub }, cal().events)).toHaveLength(1);

    saveSubjectItem(sub, { ...draftFromEvent(cal().events[essay]), date: '2031-03-19' }, essay);   // moved off the lecture
    expect(cal().events[essay].onClass).toBeNull();
    applyClassReplacements();
    expect(dates()).toEqual(['2031-03-11', '2031-03-18']);
    expect(cal().events[lec].repeat!.exceptions).toEqual(['2031-03-25']);
  });

  it('during: a quiz in the lecture is drawn on it, and the lecture keeps its date', () => {
    const { sub, lec } = subjectWithLecture();
    const quiz = saveSubjectItem(sub, { ...blankDraft('work', '2031-03-11'), title: 'Quiz 1', start: '13:30',
      onClass: { eventId: lec, date: '2031-03-11', mode: 'during' } }) as CalendarDeadlineId;
    applyClassReplacements();
    expect(duringIndex(cal().events, cal().deadlines).get(`${lec}|2031-03-11`)).toEqual([{ id: quiz, title: 'Quiz 1' }]);
    expect(cal().events[lec].repeat!.replacedSkips).toBeUndefined();
    // Both again: nothing linked.
    saveSubjectItem(sub, { ...draftFromDeadline(cal().deadlines[quiz], {}), onClass: null }, quiz);
    expect(duringIndex(cal().events, cal().deadlines).size).toBe(0);
  });

  it('replaced dates are kept apart from the other skips', () => {
    const r = { freq: 'weekly' as const, interval: 1, endKind: 'forever' as const, count: null, until: null, exceptions: ['2031-03-25'] };
    const on = withReplaced(r, ['2031-03-18']);
    expect(on).toMatchObject({ exceptions: ['2031-03-18', '2031-03-25'], replacedSkips: ['2031-03-18'] });
    expect(withReplaced(on, [])).toEqual(r);
  });
});
