import type { RepeatConfig } from '@/types';
import { addDaysToIso } from '@/utils/date';
import { utcToZonedTime } from '@/utils/timezone';
import { parseRecurrence } from '@/utils/rrule';
import { deriveNotifyBefore, type GoogleCalendarMeta, type GoogleEventReminders } from '@/utils/googleReminders';
import { BIRTHDAY_REPEAT } from '@/utils/calendarItemInput';
import { importKey, normalizeFields, type ImportDraft, type ImportedFields } from './draft';
import { looksLikeBirthday, travelModeFromTitle } from './classify';

// One Google Calendar event (the Events resource, fetched with singleEvents=false and
// showDeleted=true) turned into an ImportDraft. Pure: the account's time zone and the calendar's
// details come in as context.

export interface GoogleEventRaw {
  id:                 string;
  status?:            string;   // confirmed | tentative | cancelled
  summary?:           string;
  description?:       string;
  location?:          string;
  start?:             { date?: string; dateTime?: string; timeZone?: string };
  end?:               { date?: string; dateTime?: string; timeZone?: string };
  recurrence?:        string[];
  recurringEventId?:  string;
  originalStartTime?: { date?: string; dateTime?: string; timeZone?: string };
  iCalUID?:           string;
  eventType?:         string;   // default | birthday | fromGmail | outOfOffice | focusTime | workingLocation
  transparency?:      string;   // opaque | transparent ("Free")
  colorId?:           string;
  attendees?:         { self?: boolean; responseStatus?: string }[];
  reminders?:         GoogleEventReminders;
  updated?:           string;
}

export interface GoogleCalendarContext extends GoogleCalendarMeta {
  backgroundColor?: string;
  timeZone?:        string;
}

export interface GoogleMapContext {
  account:      string;
  connectionId: string;
  calendarId:   string;
  zone:         string;   // the account's effective time zone (settingsStore.timezone)
  calendar?:    GoogleCalendarContext;
  // Single dates Google expanded for a series the app can't show (kind 'instances'): each is its
  // own event, not a changed date of a series.
  standalone?:  boolean;
}

// 'instances': a repeating event whose rule the app can't show exactly (or one that can't be a
// native series: it spans days, or keeps another time zone's clock). Its single dates are fetched
// from Google instead (api/google-calendar-instances.ts) and imported one by one.
export type GoogleMapResult = { kind: 'draft'; draft: ImportDraft } | { kind: 'skip' } | { kind: 'instances' };

// Google's event colours (colorId 1–11), as its own web app draws them.
const GOOGLE_EVENT_COLOUR_BY_ID: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};

// Event types that aren't events to show: a working-hours location, a focus block.
const SKIPPED_TYPES = new Set(['focusTime', 'workingLocation']);

function whenOf(t: { date?: string; dateTime?: string } | undefined, zone: string): { date: string; time: string | null } | null {
  if (t?.date) return { date: t.date, time: null };
  if (t?.dateTime) return utcToZonedTime(new Date(t.dateTime), zone);
  return null;
}

export function mapGoogleEvent(raw: GoogleEventRaw, ctx: GoogleMapContext): GoogleMapResult {
  if (raw.eventType && SKIPPED_TYPES.has(raw.eventType)) return { kind: 'skip' };
  const key = importKey('google', ctx.account, ctx.calendarId, raw.id);
  const self = raw.attendees?.find((a) => a.self);
  const cancelled = raw.status === 'cancelled' || self?.responseStatus === 'declined';

  const original = raw.recurringEventId ? whenOf(raw.originalStartTime, ctx.zone) : null;
  const series = raw.recurringEventId && original && !ctx.standalone
    ? { key: importKey('google', ctx.account, ctx.calendarId, raw.recurringEventId), date: original.date }
    : null;

  const start = whenOf(raw.start, ctx.zone);
  const base = {
    key, source: 'google' as const, account: ctx.account, connectionId: ctx.connectionId, calendarId: ctx.calendarId,
    eventId: raw.id, raw: raw as unknown as Record<string, unknown>, series, cancelled,
    // Every date of a series shares the series' UID, so one date's is the UID and the date.
    uid: raw.iCalUID ? (original ? `${raw.iCalUID}@${original.date}` : raw.iCalUID) : null,
  };

  // A deleted event comes back with little more than its id: nothing to import, only to remove.
  if (!start) {
    if (!cancelled) return { kind: 'skip' };
    const date = series?.date ?? '';
    return { kind: 'draft', draft: { ...base, fields: normalizeFields(emptyFields(raw.summary ?? '', date)) } };
  }

  const allDay = !!raw.start?.date;
  let endDate: string | null = null;
  let endTime: string | null = null;
  if (allDay) {
    // Google's end date is exclusive: a one-day event ends the next day.
    const endExclusive = raw.end?.date ?? start.date;
    endDate = endExclusive > addDaysToIso(start.date, 1) ? addDaysToIso(endExclusive, -1) : null;
  } else {
    const end = whenOf(raw.end, ctx.zone);
    if (end) {
      endTime = end.time;
      if (end.date !== start.date) endDate = end.date;
    }
  }

  const title = raw.summary?.trim() || '(Untitled)';
  const birthday = raw.eventType === 'birthday' || (allDay && looksLikeBirthday(title));

  // A birthday always repeats every year, even when it came as one year's date.
  let repeat: RepeatConfig | null = birthday && !raw.recurringEventId ? BIRTHDAY_REPEAT : null;
  if (raw.recurrence?.length && !raw.recurringEventId && !birthday) {
    if (endDate) return { kind: 'instances' };
    if (!allDay) {
      // A series keeps one clock time. One kept in another zone's clock would drift by an hour
      // across daylight saving here, and one that lands on another day here would move weekdays.
      const tz = raw.start?.timeZone ?? ctx.calendar?.timeZone;
      if (tz && tz !== ctx.zone) return { kind: 'instances' };
      if (raw.start?.dateTime && raw.start.dateTime.slice(0, 10) !== start.date) return { kind: 'instances' };
    }
    repeat = parseRecurrence(raw.recurrence, start.date, ctx.zone);
    if (!repeat) return { kind: 'instances' };
  }

  const travelMode = birthday ? null : travelModeFromTitle(title, raw.eventType === 'fromGmail');
  const multiDay = !!endDate;
  const background = !birthday && multiDay && (raw.eventType === 'outOfOffice' || (allDay && raw.transparency === 'transparent'));
  const notify = deriveNotifyBefore(raw.reminders, ctx.calendar, allDay || birthday);

  const fields: ImportedFields = {
    title,
    notes:      raw.description ?? null,
    location:   raw.location ?? null,
    date:       start.date,
    endDate:    birthday ? null : endDate,
    startTime:  birthday ? null : start.time,
    endTime:    birthday ? null : endTime,
    repeat,
    eventType:  birthday ? 'birthday' : travelMode ? 'travel' : 'default',
    travelMode,
    background,
    color:      (raw.colorId && GOOGLE_EVENT_COLOUR_BY_ID[raw.colorId]) || ctx.calendar?.backgroundColor || null,
    status:     raw.status === 'tentative' || self?.responseStatus === 'tentative' ? 'tentative' : 'confirmed',
    notifyBeforeValue: notify.value,
    notifyBeforeUnit:  notify.unit,
  };
  return { kind: 'draft', draft: { ...base, fields: normalizeFields(fields) } };
}

function emptyFields(title: string, date: string): ImportedFields {
  return {
    title, notes: null, location: null, date, endDate: null, startTime: null, endTime: null, repeat: null,
    eventType: 'default', travelMode: null, background: false, color: null, status: 'confirmed',
    notifyBeforeValue: null, notifyBeforeUnit: 'hours',
  };
}
