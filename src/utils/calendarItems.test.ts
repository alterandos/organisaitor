// What the calendar shows on each date (utils/calendarItems.ts): here, an item during a class
// (utils/classClashes.ts) drawn on the class rather than on its own.
import { describe, expect, it } from 'vitest';
import { calendarItemsByDate, type CalendarItemsInput } from './calendarItems';
import type { CalendarEvent } from '@/types';

const LAYERS = { taskDeadlines: true, taskScheduled: true, events: true, tentative: true, reminders: true, deadlines: true };
const FILTER = { layers: LAYERS, endeavourScope: null, tagFilter: null, today: '2026-09-07' };

const event = (e: Omit<Partial<CalendarEvent>, 'id'> & { id: string; title: string; date: string }): CalendarEvent => ({
  startTime: null, endTime: null, endDate: null, location: null, notes: null, links: [], collectionId: null, repeat: null,
  status: 'confirmed', important: false, archivedAt: null, crossAppRefs: [], createdAt: '', updatedAt: '', ...e,
} as unknown as CalendarEvent);

const input = (events: CalendarEvent[]): CalendarItemsInput => ({
  tasks: {}, events: Object.fromEntries(events.map((e) => [e.id, e])), reminders: {}, deadlines: {}, schedules: {}, collections: {}, trackerEntries: {},
});

describe('calendarItemsByDate', () => {
  const lecture = event({ id: 'lec', title: 'Lecture', date: '2026-09-02', startTime: '10:00', endTime: '12:00', collectionId: 'geos' as never,
    repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [3] } });
  const quiz = event({ id: 'quiz', title: 'Quiz', date: '2026-09-09', startTime: '11:00', endTime: '11:30', collectionId: 'geos' as never,
    onClass: { eventId: 'lec', date: '2026-09-09', mode: 'during' } });

  it('an item during a class is drawn on the class that day: its title after the class’s, 📌, and listed under it', () => {
    const map = calendarItemsByDate(input([lecture, quiz]), '2026-09-01', '2026-09-30', FILTER);
    const day = map.get('2026-09-09') ?? [];
    expect(day.map((i) => i.id)).toEqual(['lec']);
    const lec = day[0];
    expect(lec.title).toBe('Lecture · Quiz');
    expect(lec.typeIcon.startsWith('📌')).toBe(true);
    expect(lec.kind === 'event' && lec.during?.map((d) => d.title)).toEqual(['Quiz']);
    // Other weeks' lectures are left alone.
    expect(map.get('2026-09-16')?.[0].title).toBe('Lecture');
  });

  it('an item instead of the class (replaces) shows on its own', () => {
    const essay = { ...quiz, id: 'essay' as CalendarEvent['id'], title: 'Essay', onClass: { eventId: 'lec', date: '2026-09-09', mode: 'replaces' as const } };
    const map = calendarItemsByDate(input([lecture, essay]), '2026-09-01', '2026-09-30', FILTER);
    expect(map.get('2026-09-09')?.map((i) => i.title)).toContain('Essay');
  });
});
