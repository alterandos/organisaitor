import { beforeEach, describe, expect, it } from 'vitest';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrashStore } from '@/store/trashStore';
import { windowsZoneToIana, sameClock } from '@/utils/windowsZones';
import { mapMsEvent, msRecurrenceToRepeat, removedDraft, seriesDrafts, type MsEventRaw, type MsMapContext } from './microsoft';
import { mapGoogleEvent } from './google';
import { applyImport } from './reconcile';
import { importedEventId } from './ids';
import type { ImportDraft } from './draft';

const ZONE = 'Australia/Sydney';
const ctx = (over: Partial<MsMapContext> = {}): MsMapContext => ({
  account: 'me@outlook.com', connectionId: 'ms-1', calendarId: 'cal-a', zone: ZONE, calendar: { name: 'Calendar', color: '#a4bdfc' }, ...over,
});
const opts = { idFor: (key: string) => importedEventId('user-1', key) };
const events = () => Object.values(useCalendarStore.getState().events);

function draft(raw: MsEventRaw, over: Partial<MsMapContext> = {}): ImportDraft {
  const r = mapMsEvent(raw, ctx(over));
  if (r.kind !== 'draft') throw new Error(`expected a draft, got ${r.kind}`);
  return r.draft;
}

// 9:00–9:30 Monday 19 Oct 2026 in Sydney (UTC+11) is 22:00–22:30 UTC on the 18th.
const single = (over: Partial<MsEventRaw> = {}): MsEventRaw => ({
  id: 'AAA1', type: 'singleInstance', subject: 'Standup', iCalUId: 'uid-1',
  start: { dateTime: '2026-10-18T22:00:00.0000000', timeZone: 'UTC' },
  end: { dateTime: '2026-10-18T22:30:00.0000000', timeZone: 'UTC' },
  originalStartTimeZone: 'AUS Eastern Standard Time', showAs: 'busy', isReminderOn: true, reminderMinutesBeforeStart: 15, ...over,
});

const weekly = (over: Partial<MsEventRaw> = {}): MsEventRaw => single({
  id: 'SER1', type: 'seriesMaster', iCalUId: 'uid-s',
  recurrence: { pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday', 'wednesday'], firstDayOfWeek: 'sunday' }, range: { type: 'noEnd', startDate: '2026-10-19', recurrenceTimeZone: 'AUS Eastern Standard Time' } },
  ...over,
});

beforeEach(() => {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
});

describe('windowsZoneToIana / sameClock', () => {
  it('maps Windows names, passes IANA names, refuses unknown ones', () => {
    expect(windowsZoneToIana('AUS Eastern Standard Time')).toBe('Australia/Sydney');
    expect(windowsZoneToIana('Europe/London')).toBe('Europe/London');
    expect(windowsZoneToIana('tzone://Microsoft/Custom')).toBeNull();
  });
  it('tells zones that keep the same clock all year from ones that don\'t', () => {
    const at = new Date('2026-10-19T00:00:00Z');
    expect(sameClock('Australia/Melbourne', 'Australia/Sydney', at)).toBe(true);
    expect(sameClock('Australia/Brisbane', 'Australia/Sydney', at)).toBe(false);
  });
});

describe('msRecurrenceToRepeat', () => {
  const rec = (pattern: object, range: object = { type: 'noEnd' }) => ({ pattern, range } as never);
  it('reads every Outlook pattern the app can show', () => {
    expect(msRecurrenceToRepeat(rec({ type: 'daily', interval: 2 }), '2026-10-19')).toMatchObject({ freq: 'daily', interval: 2 });
    expect(msRecurrenceToRepeat(rec({ type: 'weekly', daysOfWeek: ['monday', 'friday'] }), '2026-10-19')).toMatchObject({ daysOfWeek: [1, 5] });
    expect(msRecurrenceToRepeat(rec({ type: 'absoluteMonthly', dayOfMonth: 19 }), '2026-10-19')).toMatchObject({ freq: 'monthly' });
    expect(msRecurrenceToRepeat(rec({ type: 'relativeMonthly', daysOfWeek: ['tuesday'], index: 'second' }), '2026-10-13')).toMatchObject({ monthWeekday: { week: 2, day: 2 } });
    expect(msRecurrenceToRepeat(rec({ type: 'relativeYearly', month: 11, daysOfWeek: ['thursday'], index: 'fourth' }), '2026-11-26')).toMatchObject({ freq: 'yearly', monthWeekday: { week: 4, day: 4 } });
    expect(msRecurrenceToRepeat(rec({ type: 'daily' }, { type: 'numbered', numberOfOccurrences: 5 }), '2026-10-19')).toMatchObject({ endKind: 'count', count: 5 });
    expect(msRecurrenceToRepeat(rec({ type: 'daily' }, { type: 'endDate', endDate: '2026-12-31' }), '2026-10-19')).toMatchObject({ endKind: 'until', until: '2026-12-31' });
  });
  it('refuses what it can\'t show exactly', () => {
    expect(msRecurrenceToRepeat(rec({ type: 'relativeMonthly', daysOfWeek: ['monday', 'tuesday'], index: 'first' }), '2026-10-05')).toBeNull();
    expect(msRecurrenceToRepeat(rec({ type: 'absoluteMonthly', dayOfMonth: 1 }), '2026-10-19')).toBeNull();
    // Every 2 weeks on two days, weeks starting Sunday: not the app's Monday weeks.
    expect(msRecurrenceToRepeat(rec({ type: 'weekly', interval: 2, daysOfWeek: ['sunday', 'monday'], firstDayOfWeek: 'sunday' }), '2026-10-19')).toBeNull();
  });
});

describe('mapMsEvent', () => {
  it('maps a timed event from UTC into the account zone, with its reminder, colour and where it came from', () => {
    const d = draft(single());
    expect(d).toMatchObject({ key: 'microsoft|me@outlook.com|cal-a|AAA1', source: 'microsoft', account: 'me@outlook.com', uid: 'uid-1' });
    expect(d.fields).toMatchObject({ date: '2026-10-19', startTime: '09:00', endTime: '09:30', color: '#a4bdfc', notifyBeforeValue: 15, notifyBeforeUnit: 'minutes' });
  });

  it('reads all-day dates whether Graph kept midnight or moved it into UTC', () => {
    const kept = draft(single({ isAllDay: true, start: { dateTime: '2026-10-19T00:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-10-22T00:00:00.0000000', timeZone: 'UTC' } }));
    expect(kept.fields).toMatchObject({ date: '2026-10-19', endDate: '2026-10-21', startTime: null });
    const moved = draft(single({ isAllDay: true, start: { dateTime: '2026-10-18T13:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-10-19T13:00:00.0000000', timeZone: 'UTC' } }));
    expect(moved.fields).toMatchObject({ date: '2026-10-19', endDate: null });
  });

  it('kinds: birthdays (by title or the Birthdays calendar), travel, background, tentative, declined, working elsewhere', () => {
    const allDay = { isAllDay: true, start: { dateTime: '2026-11-02T00:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-11-03T00:00:00', timeZone: 'UTC' } };
    expect(draft(single({ ...allDay, subject: "Sam's birthday" })).fields).toMatchObject({ eventType: 'birthday', repeat: { freq: 'yearly' } });
    expect(draft(single({ ...allDay, subject: 'Sam Lee' }), { calendar: { name: 'Birthdays' } }).fields.eventType).toBe('birthday');
    expect(draft(single({ subject: 'Flight to London (BA 15)' })).fields).toMatchObject({ eventType: 'travel', travelMode: 'flight' });
    const away = { isAllDay: true, start: { dateTime: '2026-10-19T00:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-10-24T00:00:00', timeZone: 'UTC' } };
    expect(draft(single({ ...away, showAs: 'oof' })).fields.background).toBe(true);
    expect(draft(single({ ...away, showAs: 'free' })).fields.background).toBe(true);
    expect(draft(single({ responseStatus: { response: 'tentativelyAccepted' } })).fields.status).toBe('tentative');
    expect(draft(single({ responseStatus: { response: 'declined' } })).cancelled).toBe(true);
    expect(draft(single({ isCancelled: true })).cancelled).toBe(true);
    expect(mapMsEvent(single({ ...allDay, showAs: 'workingElsewhere' }), ctx()).kind).toBe('skip');
  });

  it('a series is native when it can be, else its dates come one by one', () => {
    expect(draft(weekly()).fields.repeat).toMatchObject({ freq: 'weekly', daysOfWeek: [1, 3] });
    expect(mapMsEvent(weekly({ recurrence: { pattern: { type: 'weekly', daysOfWeek: ['monday'] }, range: { type: 'noEnd', startDate: '2026-10-19', recurrenceTimeZone: 'GMT Standard Time' } } }), ctx()).kind).toBe('instances');
    expect(mapMsEvent(weekly({ recurrence: { pattern: { type: 'weekly', daysOfWeek: ['monday'] }, range: { type: 'noEnd', startDate: '2026-10-19', recurrenceTimeZone: 'tzone://Microsoft/Custom' } }, originalStartTimeZone: 'tzone://Microsoft/Custom' }), ctx()).kind).toBe('instances');
  });

  it('the same meeting from Google and Outlook is one event (shared iCalendar UID)', () => {
    const g = mapGoogleEvent({ id: 'g1', summary: 'Standup', iCalUID: 'uid-1', start: { dateTime: '2026-10-19T09:00:00+11:00' }, end: { dateTime: '2026-10-19T09:30:00+11:00' } },
      { account: 'me@gmail.com', connectionId: 'g', calendarId: 'primary', zone: ZONE });
    if (g.kind !== 'draft') throw new Error('expected a draft');
    applyImport([g.draft, draft(single())], opts);
    expect(events()).toHaveLength(1);
  });
});

describe('seriesDrafts + applyImport', () => {
  const window = { start: '2026-10-01T00:00:00Z', end: '2026-11-10T00:00:00Z' };
  const occ = (date: string, over: Partial<MsEventRaw> = {}): MsEventRaw => single({
    id: `OCC-${date}`, type: 'occurrence', seriesMasterId: 'SER1', iCalUId: 'uid-s',
    start: { dateTime: `${date}T22:00:00.0000000`, timeZone: 'UTC' }, end: { dateTime: `${date}T22:30:00.0000000`, timeZone: 'UTC' }, ...over,
  });
  // Mondays and Wednesdays from Mon 19 Oct (UTC dates are the day before in Sydney).
  const sydney = ['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04', '2026-11-09'];
  const utcDay = (d: string) => new Date(Date.parse(d) - 86_400_000).toISOString().slice(0, 10);

  it('one native series; a changed date is a linked copy; a date missing in Outlook is taken out', () => {
    const instances = sydney.filter((d) => d !== '2026-10-26').map((d) => occ(utcDay(d)));
    instances.push(occ(utcDay('2026-10-28'), {
      id: 'EXC1', type: 'exception', originalStart: `${utcDay('2026-10-28')}T22:00:00Z`,
      start: { dateTime: `${utcDay('2026-10-29')}T23:00:00.0000000`, timeZone: 'UTC' }, end: { dateTime: `${utcDay('2026-10-29')}T23:30:00.0000000`, timeZone: 'UTC' },
    }));
    applyImport(seriesDrafts({ id: 'SER1', master: weekly(), instances: instances.filter((i) => i.id !== `OCC-${utcDay('2026-10-28')}`) }, ctx(), window), opts);
    const master = events().find((e) => e.repeat)!;
    expect(master.repeat).toMatchObject({ daysOfWeek: [1, 3], exceptions: ['2026-10-26', '2026-10-28'] });
    expect(events().find((e) => e.seriesId)).toMatchObject({ seriesId: master.id, seriesDate: '2026-10-28', date: '2026-10-29', startTime: '10:00' });
  });

  it('a series that no longer exists is removed (never edited here), with its linked copies', () => {
    applyImport(seriesDrafts({ id: 'SER1', master: weekly(), instances: sydney.map((d) => occ(utcDay(d))) }, ctx(), window), opts);
    expect(events()).toHaveLength(1);
    const r = applyImport(seriesDrafts({ id: 'SER1', deleted: true }, ctx(), window), opts);
    expect(r.removed).toBe(1);
    expect(events()).toHaveLength(0);
  });

  it('a removed single event goes, through the same rules as Google', () => {
    applyImport([draft(single())], opts);
    applyImport([removedDraft('AAA1', ctx())], opts);
    expect(events()).toHaveLength(0);
  });
});
