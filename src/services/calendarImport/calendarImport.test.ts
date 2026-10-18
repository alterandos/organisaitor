import { beforeEach, describe, expect, it } from 'vitest';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrashStore } from '@/store/trashStore';
import { restoreFromTrash } from '@/services/trash';
import { parseICS } from '@/utils/icsParser';
import type { CalendarEvent, CalendarEventId } from '@/types';
import { mapGoogleEvent, type GoogleEventRaw, type GoogleMapContext } from './google';
import { applyImport, findExisting, removeImportedEvents } from './reconcile';
import { icsToDrafts } from './ics';
import { importedEventId } from './ids';
import { birthdayKey, travelModeFromTitle } from './classify';
import type { ImportDraft } from './draft';

const ZONE = 'Australia/Sydney';
const ctx = (over: Partial<GoogleMapContext> = {}): GoogleMapContext => ({
  account: 'me@example.com', connectionId: 'conn-1', calendarId: 'primary', zone: ZONE,
  calendar: { backgroundColor: '#039be5', timeZone: ZONE, accessRole: 'owner', defaultReminders: [] }, ...over,
});

function draft(raw: GoogleEventRaw, over: Partial<GoogleMapContext> = {}): ImportDraft {
  const r = mapGoogleEvent(raw, ctx(over));
  if (r.kind !== 'draft') throw new Error(`expected a draft, got ${r.kind}`);
  return r.draft;
}

const timed = (over: Partial<GoogleEventRaw> = {}): GoogleEventRaw => ({
  id: 'ev1', status: 'confirmed', summary: 'Standup', iCalUID: 'ev1@google.com',
  start: { dateTime: '2026-10-19T09:00:00+11:00', timeZone: ZONE },
  end: { dateTime: '2026-10-19T09:30:00+11:00', timeZone: ZONE }, ...over,
});

const opts = { idFor: (key: string) => importedEventId('user-1', key) };
const events = () => Object.values(useCalendarStore.getState().events);
const only = (): CalendarEvent => { const all = events(); expect(all).toHaveLength(1); return all[0]; };

beforeEach(() => {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
});

describe('mapGoogleEvent', () => {
  it('maps a timed event into the account zone, with its calendar colour and where it came from', () => {
    const d = draft(timed());
    expect(d.key).toBe('google|me@example.com|primary|ev1');
    expect(d.fields).toMatchObject({ title: 'Standup', date: '2026-10-19', startTime: '09:00', endTime: '09:30', color: '#039be5', eventType: 'default', repeat: null });
    expect(d).toMatchObject({ source: 'google', account: 'me@example.com', uid: 'ev1@google.com' });
  });

  it('an event colour beats the calendar colour', () => {
    expect(draft(timed({ colorId: '11' })).fields.color).toBe('#d50000');
  });

  it('a repeating event is one series: weekdays, the nth weekday, and dates taken out', () => {
    const weekly = draft(timed({ recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=Australia/Sydney:20261026T090000'] }));
    expect(weekly.fields.repeat).toMatchObject({ freq: 'weekly', daysOfWeek: [1, 3], exceptions: ['2026-10-26'] });
    const monthly = draft(timed({ start: { dateTime: '2026-10-13T09:00:00+11:00' }, end: { dateTime: '2026-10-13T10:00:00+11:00' }, recurrence: ['RRULE:FREQ=MONTHLY;BYDAY=2TU'] }));
    expect(monthly.fields.repeat).toMatchObject({ freq: 'monthly', monthWeekday: { week: 2, day: 2 } });
  });

  it('asks for single dates when a series can\'t be shown exactly', () => {
    expect(mapGoogleEvent(timed({ recurrence: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15'] }), ctx()).kind).toBe('instances');
    // Kept in another zone's clock: it would drift across daylight saving here.
    expect(mapGoogleEvent(timed({ start: { dateTime: '2026-10-19T09:00:00-04:00', timeZone: 'America/New_York' }, recurrence: ['RRULE:FREQ=WEEKLY'] }), ctx()).kind).toBe('instances');
    // Over several days: the calendar can't repeat those.
    expect(mapGoogleEvent({ id: 'x', summary: 'Camp', start: { date: '2026-10-19' }, end: { date: '2026-10-22' }, recurrence: ['RRULE:FREQ=YEARLY'] }, ctx()).kind).toBe('instances');
  });

  it('a birthday is a yearly birthday event with no times, from Google\'s type or its title', () => {
    const fromType = draft({ id: 'b1', eventType: 'birthday', summary: 'Jane Doe', start: { date: '1990-05-04' }, end: { date: '1990-05-05' }, recurrence: ['RRULE:FREQ=YEARLY'] });
    expect(fromType.fields).toMatchObject({ eventType: 'birthday', startTime: null, repeat: { freq: 'yearly', interval: 1, endKind: 'forever' } });
    const fromTitle = draft({ id: 'b2', summary: "Sam's birthday 🎂", start: { date: '2026-11-02' }, end: { date: '2026-11-03' } });
    expect(fromTitle.fields).toMatchObject({ eventType: 'birthday', repeat: { freq: 'yearly' } });
  });

  it('journeys are travel with their mode; out of office and free multi-day events are background', () => {
    expect(draft(timed({ eventType: 'fromGmail', summary: 'Flight to London (BA 15)' })).fields).toMatchObject({ eventType: 'travel', travelMode: 'flight' });
    expect(draft(timed({ summary: 'Train to Paris' })).fields).toMatchObject({ eventType: 'travel', travelMode: 'train' });
    expect(draft(timed({ summary: 'Train the new starter' })).fields.eventType).toBe('default');
    expect(draft({ id: 'o', eventType: 'outOfOffice', summary: 'Away', start: { date: '2026-10-19' }, end: { date: '2026-10-24' } }).fields.background).toBe(true);
    expect(draft({ id: 'f', transparency: 'transparent', summary: 'Vietnam', start: { date: '2026-10-19' }, end: { date: '2026-10-24' } }).fields.background).toBe(true);
    expect(draft({ id: 'g', transparency: 'transparent', summary: 'Busy-free day', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } }).fields.background).toBe(false);
    expect(mapGoogleEvent(timed({ eventType: 'focusTime' }), ctx()).kind).toBe('skip');
    expect(mapGoogleEvent(timed({ eventType: 'workingLocation' }), ctx()).kind).toBe('skip');
  });

  it('tentative replies are tentative; a declined invitation counts as deleted', () => {
    expect(draft(timed({ attendees: [{ self: true, responseStatus: 'tentative' }] })).fields.status).toBe('tentative');
    expect(draft(timed({ attendees: [{ self: true, responseStatus: 'declined' }] })).cancelled).toBe(true);
  });

  it('a changed date of a series names its series and the date it stands in for', () => {
    const d = draft(timed({ id: 'ev1_20261021', recurringEventId: 'ev1', originalStartTime: { dateTime: '2026-10-21T09:00:00+11:00' }, start: { dateTime: '2026-10-22T10:00:00+11:00' }, end: { dateTime: '2026-10-22T10:30:00+11:00' } }));
    expect(d.series).toEqual({ key: 'google|me@example.com|primary|ev1', date: '2026-10-21' });
    expect(d.uid).toBe('ev1@google.com@2026-10-21');
  });
});

describe('travelModeFromTitle / birthdayKey', () => {
  it('reads modes conservatively outside reservations', () => {
    expect(travelModeFromTitle('Bus to Canberra', false)).toBe('bus');
    expect(travelModeFromTitle('Ferry from Manly', false)).toBe('ferry');
    expect(travelModeFromTitle('Drive to Mum\'s', false)).toBe('car');
    expect(travelModeFromTitle('Flight review meeting', false)).toBeNull();
    expect(travelModeFromTitle('Hotel stay at Hilton', true)).toBeNull();
  });
  it('is the same for the same person written differently', () => {
    expect(birthdayKey("Jane Doe's Birthday", '1990-05-04')).toBe(birthdayKey('Birthday: jane doe', '2026-05-04'));
  });
});

describe('applyImport', () => {
  it('creates an event once, with the same id on every device, and leaves it alone when nothing changed', () => {
    expect(applyImport([draft(timed())], opts).created).toBe(1);
    const ev = only();
    expect(ev.id).toBe(importedEventId('user-1', 'google|me@example.com|primary|ev1'));
    expect(ev).toMatchObject({ source: 'google', sourceAccount: 'me@example.com', sourceCalendarId: 'primary', sourceUid: 'ev1@google.com' });
    const before = ev.updatedAt;
    expect(applyImport([draft(timed())], opts)).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(only().updatedAt).toBe(before);
  });

  it('follows Google field by field, except where the event was edited here', () => {
    applyImport([draft(timed())], opts);
    const id = only().id;
    useCalendarStore.getState().updateEvent(id, { title: 'My standup' });
    applyImport([draft(timed({ summary: 'Daily standup', start: { dateTime: '2026-10-19T10:00:00+11:00' }, end: { dateTime: '2026-10-19T10:30:00+11:00' } }))], opts);
    expect(only()).toMatchObject({ title: 'My standup', startTime: '10:00', endTime: '10:30' });
  });

  it('deleted in Google: removed if never edited (and not again once restored), kept and marked if edited', () => {
    applyImport([draft(timed()), draft(timed({ id: 'ev2', iCalUID: 'ev2@google.com', summary: 'Lunch' }))], opts);
    const lunch = events().find((e) => e.title === 'Lunch')!;
    useCalendarStore.getState().updateEvent(lunch.id, { location: 'The usual' });
    const r = applyImport([draft({ id: 'ev1', status: 'cancelled' }), draft({ id: 'ev2', status: 'cancelled' })], opts);
    expect(r.removed).toBe(1);
    expect(only()).toMatchObject({ title: 'Lunch', sourceRaw: expect.objectContaining({ deleted: true }) });

    const entry = Object.values(useTrashStore.getState().entries)[0];
    restoreFromTrash(entry.id);
    applyImport([draft({ id: 'ev1', status: 'cancelled' })], opts);
    expect(events().map((e) => e.title).sort()).toEqual(['Lunch', 'Standup']);
  });

  it('never brings back an event deleted here', () => {
    applyImport([draft(timed())], opts);
    useCalendarStore.getState().deleteEvent(only().id);
    applyImport([draft(timed({ summary: 'Changed since' }))], opts);
    expect(events()).toHaveLength(0);
  });

  it('a changed date becomes a linked copy and leaves the series; a deleted date just leaves it', () => {
    const series = timed({ recurrence: ['RRULE:FREQ=WEEKLY'] });
    const moved = timed({ id: 'ev1_a', recurringEventId: 'ev1', originalStartTime: { dateTime: '2026-10-26T09:00:00+11:00' }, start: { dateTime: '2026-10-27T09:00:00+11:00' }, end: { dateTime: '2026-10-27T09:30:00+11:00' } });
    const gone = { id: 'ev1_b', status: 'cancelled', recurringEventId: 'ev1', originalStartTime: { dateTime: '2026-11-02T09:00:00+11:00' } };
    applyImport([draft(moved), draft(gone), draft(series)], opts);
    const master = events().find((e) => e.repeat)!;
    expect(master.repeat!.exceptions).toEqual(['2026-10-26', '2026-11-02']);
    const copy = events().find((e) => e.seriesId)!;
    expect(copy).toMatchObject({ seriesId: master.id, seriesDate: '2026-10-26', date: '2026-10-27' });
  });

  it('one birthday per person, whichever calendar or file it comes from', () => {
    useCalendarStore.getState().addEvent({ title: 'Jane Doe', date: '1990-05-04', eventType: 'birthday' });
    applyImport([draft({ id: 'b1', eventType: 'birthday', summary: "Jane Doe's birthday", start: { date: '1990-05-04' }, end: { date: '1990-05-05' }, recurrence: ['RRULE:FREQ=YEARLY'] })], opts);
    applyImport([draft({ id: 'b2', summary: 'Birthday: Sam', start: { date: '2026-11-02' }, end: { date: '2026-11-03' } }),
      draft({ id: 'b3', summary: "Sam's bday", start: { date: '2027-11-02' }, end: { date: '2027-11-03' } }, { calendarId: 'family' })], opts);
    expect(events().map((e) => e.title).sort()).toEqual(['Birthday: Sam', 'Jane Doe']);
  });

  it('the same meeting in two calendars is one event', () => {
    applyImport([draft(timed()), draft(timed({ id: 'other-id' }), { account: 'work@example.com', connectionId: 'conn-2' })], opts);
    expect(only().sourceAccount).toBe('me@example.com');
  });

  it('removing an account\'s events forgets them, so connecting it again imports them again', () => {
    applyImport([draft(timed())], opts);
    expect(removeImportedEvents('google', 'me@example.com')).toBe(1);
    expect(events()).toHaveLength(0);
    applyImport([draft(timed())], opts);
    expect(events()).toHaveLength(1);
  });
});

describe('.ics import', () => {
  const file = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'UID:s1', 'SUMMARY:Gym', 'DTSTART:20261019T070000', 'DTEND:20261019T080000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:s1', 'SUMMARY:Gym (late)', 'RECURRENCE-ID:20261022T070000', 'DTSTART:20261022T090000', 'DTEND:20261022T100000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b1', 'SUMMARY:Mum\'s Birthday', 'DTSTART;VALUE=DATE:19600310', 'RRULE:FREQ=YEARLY', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:odd', 'SUMMARY:Odd one', 'DTSTART:20261019T070000', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('keeps series native, links a changed date, marks rules it can\'t show, and finds itself on a second import', () => {
    const { drafts, partial } = icsToDrafts(parseICS(file), 'family.ics', ZONE);
    expect([...partial]).toEqual(['ics|odd']);
    applyImport(drafts);
    const gym = events().find((e) => e.title === 'Gym')!;
    expect(gym.repeat).toMatchObject({ freq: 'weekly', daysOfWeek: [1, 4], exceptions: ['2026-10-22'] });
    expect(events().find((e) => e.title === 'Gym (late)')).toMatchObject({ seriesId: gym.id, seriesDate: '2026-10-22', startTime: '09:00' });
    expect(events().find((e) => e.eventType === 'birthday')).toMatchObject({ source: 'ics', sourceAccount: 'family.ics' });

    const again = icsToDrafts(parseICS(file), 'renamed.ics', ZONE).drafts;
    expect(again.every((d) => findExisting(d))).toBe(true);
    expect(applyImport(again).created).toBe(0);
  });

  it('ids from an .ics import are ordinary new ones', () => {
    applyImport(icsToDrafts(parseICS(file), 'family.ics', ZONE).drafts);
    expect(events().some((e) => (e.id as CalendarEventId).startsWith('imp_'))).toBe(false);
  });
});
