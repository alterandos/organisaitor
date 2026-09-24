import { beforeEach, describe, expect, it } from 'vitest';
import { useCalendarStore } from '@/store/calendarStore';
import type { RepeatConfig } from '@/types';

beforeEach(() => {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
});

const weekly: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
const weeklyCount5: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'count', count: 5, until: null };

describe('skipEventOccurrence / skipReminderOccurrence', () => {
  it('adds the date to the repeat\'s exceptions, leaving the event itself and other occurrences alone', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', repeat: weekly });
    useCalendarStore.getState().skipEventOccurrence(id, '2030-01-15');
    expect(useCalendarStore.getState().events[id].repeat?.exceptions).toEqual(['2030-01-15']);
    expect(useCalendarStore.getState().events[id].date).toBe('2030-01-01');
  });

  it('is a no-op on a non-repeating event', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    useCalendarStore.getState().skipEventOccurrence(id, '2030-01-15');
    expect(useCalendarStore.getState().events[id].repeat).toBeNull();
  });

  it('reminder: same behaviour', () => {
    const id = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01', repeat: weekly });
    useCalendarStore.getState().skipReminderOccurrence(id, '2030-01-15');
    expect(useCalendarStore.getState().reminders[id].repeat?.exceptions).toEqual(['2030-01-15']);
  });
});

describe('endEventSeriesBefore / endReminderSeriesBefore', () => {
  it('deletes the whole item when the cutoff is on or before its own start date', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', repeat: weekly });
    useCalendarStore.getState().endEventSeriesBefore(id, '2030-01-01');
    expect(useCalendarStore.getState().events[id]).toBeUndefined();
  });

  it('otherwise trims the series to end the day before the cutoff', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', repeat: weekly });
    useCalendarStore.getState().endEventSeriesBefore(id, '2030-02-01');
    const repeat = useCalendarStore.getState().events[id].repeat!;
    expect(repeat.endKind).toBe('until');
    expect(repeat.until).toBe('2030-01-31');
  });

  it('is a no-op on a non-repeating event (never deletes it)', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    useCalendarStore.getState().endEventSeriesBefore(id, '2030-01-01');
    expect(useCalendarStore.getState().events[id]).toBeDefined();
  });

  it('reminder: deletes when cutoff <= start, else trims', () => {
    const id = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01', repeat: weekly });
    useCalendarStore.getState().endReminderSeriesBefore(id, '2030-01-01');
    expect(useCalendarStore.getState().reminders[id]).toBeUndefined();
  });
});

describe('detachEventOccurrence / detachReminderOccurrence', () => {
  it('adds the date as an exception on the original AND creates a standalone, non-repeating copy at that date', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', repeat: weekly, location: 'Room 1' });
    const newId = useCalendarStore.getState().detachEventOccurrence(id, '2030-01-15');

    expect(useCalendarStore.getState().events[id].repeat?.exceptions).toEqual(['2030-01-15']);
    expect(newId).not.toBeNull();
    const copy = useCalendarStore.getState().events[newId!];
    expect(copy.date).toBe('2030-01-15');
    expect(copy.repeat).toBeNull();
    expect(copy.title).toBe('E');
    expect(copy.location).toBe('Room 1');
  });

  it('returns null and changes nothing for a non-repeating event', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    const result = useCalendarStore.getState().detachEventOccurrence(id, '2030-01-15');
    expect(result).toBeNull();
    expect(Object.keys(useCalendarStore.getState().events)).toEqual([id]);
  });

  it('a detached copy does not carry over cross-app refs or external-sync provenance from the source', () => {
    const id = useCalendarStore.getState().addEvent({
      title: 'E', date: '2030-01-01', repeat: weekly,
      crossAppRefs: [{ type: 'note', id: 'n1' }],
    });
    const newId = useCalendarStore.getState().detachEventOccurrence(id, '2030-01-15')!;
    expect(useCalendarStore.getState().events[newId].crossAppRefs).toEqual([]);
  });

  it('reminder: same detach behaviour', () => {
    const id = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01', repeat: weekly });
    const newId = useCalendarStore.getState().detachReminderOccurrence(id, '2030-01-15');
    expect(useCalendarStore.getState().reminders[id].repeat?.exceptions).toEqual(['2030-01-15']);
    expect(useCalendarStore.getState().reminders[newId!].repeat).toBeNull();
  });
});

describe('splitEventSeries / splitReminderSeries', () => {
  it('ends the original series the day before the split date and starts a new series from that date, carrying the remaining count', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', repeat: weeklyCount5 });
    // Split at the 3rd occurrence (2 weeks after start) — 2 occurrences (weeks 1 and 2) happened before it.
    const newId = useCalendarStore.getState().splitEventSeries(id, '2030-01-15')!;

    const original = useCalendarStore.getState().events[id].repeat!;
    expect(original.endKind).toBe('until');
    expect(original.until).toBe('2030-01-14');

    const tail = useCalendarStore.getState().events[newId].repeat!;
    expect(useCalendarStore.getState().events[newId].date).toBe('2030-01-15');
    expect(tail.endKind).toBe('count');
    expect(tail.count).toBe(3); // 5 total - 2 that already happened
  });

  it('returns null for a non-repeating event, or when the date is not after the series start', () => {
    const nonRepeating = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    expect(useCalendarStore.getState().splitEventSeries(nonRepeating, '2030-01-15')).toBeNull();

    const repeating = useCalendarStore.getState().addEvent({ title: 'E2', date: '2030-01-01', repeat: weekly });
    expect(useCalendarStore.getState().splitEventSeries(repeating, '2030-01-01')).toBeNull();
  });

  it('reminder: same split behaviour', () => {
    const id = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01', repeat: weeklyCount5 });
    const newId = useCalendarStore.getState().splitReminderSeries(id, '2030-01-15')!;
    expect(useCalendarStore.getState().reminders[id].repeat?.until).toBe('2030-01-14');
    expect(useCalendarStore.getState().reminders[newId].repeat?.count).toBe(3);
  });
});

describe('archiveEvent / restoreEvent', () => {
  it('archives with a reason, and restore clears it', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    useCalendarStore.getState().archiveEvent(id, 'cancelled');
    expect(useCalendarStore.getState().events[id].archivedAt).not.toBeNull();
    expect(useCalendarStore.getState().events[id].archiveReason).toBe('cancelled');
    useCalendarStore.getState().restoreEvent(id);
    expect(useCalendarStore.getState().events[id].archivedAt).toBeNull();
    expect(useCalendarStore.getState().events[id].archiveReason).toBeNull();
  });

  it('archiving an already-archived event is a no-op', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    useCalendarStore.getState().archiveEvent(id, 'first');
    const stamp = useCalendarStore.getState().events[id].archivedAt;
    useCalendarStore.getState().archiveEvent(id, 'second');
    expect(useCalendarStore.getState().events[id].archivedAt).toBe(stamp);
    expect(useCalendarStore.getState().events[id].archiveReason).toBe('first');
  });
});

describe('upsertSyncedEvent — external calendar sync provenance', () => {
  const input = {
    title: 'Imported', date: '2030-01-01',
    sourceConnectionId: 'conn-1', sourceCalendarId: 'cal-1', sourceEventId: 'evt-1',
  };

  it('creates a new event the first time a (connection, calendar, event) triple is seen', () => {
    const id = useCalendarStore.getState().upsertSyncedEvent(input);
    expect(id).not.toBeNull();
    expect(useCalendarStore.getState().events[id!].title).toBe('Imported');
  });

  it('never creates a second event for the same triple, even after the first is deleted', () => {
    const id = useCalendarStore.getState().upsertSyncedEvent(input)!;
    useCalendarStore.getState().deleteEvent(id);
    const second = useCalendarStore.getState().upsertSyncedEvent(input);
    expect(second).toBeNull();
    expect(Object.keys(useCalendarStore.getState().events)).toEqual([]);
  });
});
