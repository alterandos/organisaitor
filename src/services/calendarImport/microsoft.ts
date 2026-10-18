import type { RepeatConfig } from '@/types';
import { addDaysToIso } from '@/utils/date';
import { utcToZonedTime } from '@/utils/timezone';
import { expandRepeat } from '@/utils/recurrence';
import { minutesToNotify } from '@/utils/googleReminders';
import { sameClock, windowsZoneToIana } from '@/utils/windowsZones';
import { BIRTHDAY_REPEAT } from '@/utils/calendarItemInput';
import { importKey, normalizeFields, type ImportDraft, type ImportedFields } from './draft';
import { looksLikeBirthday, travelModeFromTitle } from './classify';

// Outlook / Microsoft 365 events (Microsoft Graph, fetched with times in UTC and text bodies) as
// ImportDrafts. Pure; docs/features/external-calendar-sync.md "Outlook".

export interface MsDateTime { dateTime: string; timeZone?: string }

export interface MsEventRaw {
  id:                    string;
  type?:                 string;   // singleInstance | occurrence | exception | seriesMaster
  seriesMasterId?:       string | null;
  subject?:              string;
  body?:                 { contentType?: string; content?: string };
  bodyPreview?:          string;
  location?:             { displayName?: string };
  start?:                MsDateTime;
  end?:                  MsDateTime;
  originalStart?:        string | null;   // a changed date: the date-time it stands in for
  originalStartTimeZone?: string;
  isAllDay?:             boolean;
  isCancelled?:          boolean;
  showAs?:               string;   // free | tentative | busy | oof | workingElsewhere | unknown
  responseStatus?:       { response?: string };
  iCalUId?:              string;
  isReminderOn?:         boolean;
  reminderMinutesBeforeStart?: number;
  recurrence?:           MsRecurrence | null;
  lastModifiedDateTime?: string;
}

export interface MsRecurrence {
  pattern: {
    type: string;               // daily | weekly | absoluteMonthly | relativeMonthly | absoluteYearly | relativeYearly
    interval?: number;
    daysOfWeek?: string[];
    dayOfMonth?: number;
    month?: number;
    index?: string;             // first | second | third | fourth | last
    firstDayOfWeek?: string;
  };
  range: {
    type: string;               // endDate | noEnd | numbered
    startDate?: string;
    endDate?: string;
    numberOfOccurrences?: number;
    recurrenceTimeZone?: string;
  };
}

export interface MsCalendarContext { name?: string; color?: string | null; canEdit?: boolean }

export interface MsMapContext {
  account:      string;
  connectionId: string;
  calendarId:   string;
  zone:         string;
  calendar?:    MsCalendarContext;
  standalone?:  boolean;   // one date of a series imported on its own (the series can't be native)
}

const DAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const INDEX: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };

// Graph date-times carry no offset; with times asked for in UTC they are UTC.
function instant(t: MsDateTime): Date {
  const iso = t.dateTime.replace(/(\.\d{3})\d*$/, '$1');
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}

// The calendar date an all-day value means. Graph writes it as midnight; asked for UTC it may
// have moved that midnight out of the event's own zone, so a value that isn't midnight is moved
// back (into the event's zone, else the account's).
function allDayDate(t: MsDateTime, eventZone: string | null, zone: string): string {
  const [date, time = ''] = t.dateTime.split('T');
  if (/^00:00(:00)?/.test(time)) return date;
  return utcToZonedTime(instant(t), eventZone ?? zone).date;
}

// An Outlook rule as the app's RepeatConfig, for a series starting on `startDate`; null when the
// app can't show it exactly (several weekdays on a monthly rule, a day number that isn't the
// start's, every N weeks on several days with weeks starting on another day than Monday).
export function msRecurrenceToRepeat(rec: MsRecurrence, startDate: string): RepeatConfig | null {
  const p = rec.pattern;
  const start = new Date(startDate + 'T00:00:00');
  const interval = Math.max(1, p.interval ?? 1);
  const days = (p.daysOfWeek ?? []).map((d) => DAYS[d.toLowerCase()]).filter((d) => d !== undefined);
  let repeat: RepeatConfig;

  switch (p.type) {
    case 'daily':
      repeat = { freq: 'daily', interval, endKind: 'forever', count: null, until: null };
      break;
    case 'weekly': {
      repeat = { freq: 'weekly', interval, endKind: 'forever', count: null, until: null };
      const unique = [...new Set(days)].sort((a, b) => a - b);
      const weekStart = (p.firstDayOfWeek ?? 'sunday').toLowerCase();
      if (unique.length > 1 && interval > 1 && weekStart !== 'monday') return null;
      if (unique.length && !(unique.length === 1 && unique[0] === start.getDay())) repeat.daysOfWeek = unique;
      break;
    }
    case 'absoluteMonthly':
      if (p.dayOfMonth && p.dayOfMonth !== start.getDate()) return null;
      repeat = { freq: 'monthly', interval, endKind: 'forever', count: null, until: null };
      break;
    case 'relativeMonthly':
    case 'relativeYearly': {
      if (days.length !== 1 || !p.index || INDEX[p.index] === undefined) return null;
      if (p.type === 'relativeYearly' && p.month && p.month !== start.getMonth() + 1) return null;
      repeat = { freq: p.type === 'relativeMonthly' ? 'monthly' : 'yearly', interval, endKind: 'forever', count: null, until: null, monthWeekday: { week: INDEX[p.index], day: days[0] } };
      break;
    }
    case 'absoluteYearly':
      if ((p.month && p.month !== start.getMonth() + 1) || (p.dayOfMonth && p.dayOfMonth !== start.getDate())) return null;
      repeat = { freq: 'yearly', interval, endKind: 'forever', count: null, until: null };
      break;
    default:
      return null;
  }

  const r = rec.range;
  if (r.type === 'numbered' && r.numberOfOccurrences) Object.assign(repeat, { endKind: 'count', count: r.numberOfOccurrences });
  else if (r.type === 'endDate' && r.endDate) Object.assign(repeat, { endKind: 'until', until: r.endDate });
  else if (r.type !== 'noEnd') return null;
  return repeat;
}

export type MsMapResult = { kind: 'draft'; draft: ImportDraft } | { kind: 'skip' } | { kind: 'instances' };

export function mapMsEvent(raw: MsEventRaw, ctx: MsMapContext): MsMapResult {
  const key = importKey('microsoft', ctx.account, ctx.calendarId, raw.id);
  const title = raw.subject?.trim() || '(Untitled)';
  const allDay = !!raw.isAllDay;
  const eventZone = windowsZoneToIana(raw.originalStartTimeZone);
  if (!raw.start) return { kind: 'skip' };

  // "Working elsewhere" all day is Outlook's working-location marker, not an event.
  if (allDay && raw.showAs === 'workingElsewhere') return { kind: 'skip' };

  const cancelled = !!raw.isCancelled || raw.responseStatus?.response === 'declined';
  const originalDate = raw.originalStart
    ? (allDay ? allDayDate({ dateTime: raw.originalStart }, eventZone, ctx.zone) : utcToZonedTime(new Date(raw.originalStart), ctx.zone).date)
    : null;
  const series = raw.type === 'exception' && raw.seriesMasterId && originalDate && !ctx.standalone
    ? { key: importKey('microsoft', ctx.account, ctx.calendarId, raw.seriesMasterId), date: originalDate }
    : null;

  let date: string, startTime: string | null = null, endTime: string | null = null, endDate: string | null = null;
  if (allDay) {
    date = allDayDate(raw.start, eventZone, ctx.zone);
    const endExclusive = raw.end ? allDayDate(raw.end, eventZone, ctx.zone) : addDaysToIso(date, 1);
    endDate = endExclusive > addDaysToIso(date, 1) ? addDaysToIso(endExclusive, -1) : null;
  } else {
    const s = utcToZonedTime(instant(raw.start), ctx.zone);
    date = s.date;
    startTime = s.time;
    if (raw.end) {
      const e = utcToZonedTime(instant(raw.end), ctx.zone);
      endTime = e.time;
      if (e.date !== date) endDate = e.date;
    }
  }

  const birthdayCalendar = /birthday/i.test(ctx.calendar?.name ?? '');
  const birthday = allDay && (birthdayCalendar || looksLikeBirthday(title));

  let repeat: RepeatConfig | null = birthday && raw.type !== 'exception' && raw.type !== 'occurrence' ? BIRTHDAY_REPEAT : null;
  if (raw.type === 'seriesMaster' && raw.recurrence && !birthday) {
    if (endDate) return { kind: 'instances' };
    if (!allDay) {
      // A series keeps one clock time, so its own zone must keep the account zone's clock.
      const ruleZone = windowsZoneToIana(raw.recurrence.range.recurrenceTimeZone) ?? eventZone;
      if (!ruleZone || !sameClock(ruleZone, ctx.zone, instant(raw.start))) return { kind: 'instances' };
    }
    if (raw.recurrence.range.startDate && raw.recurrence.range.startDate !== date) return { kind: 'instances' };
    repeat = msRecurrenceToRepeat(raw.recurrence, date);
    if (!repeat) return { kind: 'instances' };
  }

  const travelMode = birthday ? null : travelModeFromTitle(title, false);
  const background = !birthday && !!endDate && (raw.showAs === 'oof' || (allDay && raw.showAs === 'free'));
  const notify = raw.isReminderOn && typeof raw.reminderMinutesBeforeStart === 'number'
    ? minutesToNotify(raw.reminderMinutesBeforeStart)
    : { value: null, unit: 'hours' as const };

  const fields: ImportedFields = {
    title,
    notes:      (raw.body?.contentType === 'text' ? raw.body.content : raw.bodyPreview)?.trim() || null,
    location:   raw.location?.displayName?.trim() || null,
    date,
    endDate:    birthday ? null : endDate,
    startTime:  birthday ? null : startTime,
    endTime:    birthday ? null : endTime,
    repeat,
    eventType:  birthday ? 'birthday' : travelMode ? 'travel' : 'default',
    travelMode,
    background,
    color:      ctx.calendar?.color || null,
    status:     raw.showAs === 'tentative' || raw.responseStatus?.response === 'tentativelyAccepted' ? 'tentative' : 'confirmed',
    notifyBeforeValue: notify.value,
    notifyBeforeUnit:  notify.unit,
  };

  return {
    kind: 'draft',
    draft: {
      key, source: 'microsoft', account: ctx.account, connectionId: ctx.connectionId, calendarId: ctx.calendarId,
      eventId: raw.id, raw: raw as unknown as Record<string, unknown>, series, cancelled,
      // Every date of a series shares its UID, so one date's is the UID and the date.
      uid: raw.iCalUId ? (originalDate || raw.type === 'occurrence' ? `${raw.iCalUId}@${originalDate ?? date}` : raw.iCalUId) : null,
      fields: normalizeFields(fields),
    },
  };
}

// A removed event (Graph's delta `@removed`), as a deletion the reconcile applies.
export function removedDraft(id: string, ctx: MsMapContext): ImportDraft {
  return {
    key: importKey('microsoft', ctx.account, ctx.calendarId, id), source: 'microsoft', account: ctx.account,
    connectionId: ctx.connectionId, calendarId: ctx.calendarId, eventId: id, raw: { id }, series: null, cancelled: true, uid: null,
    fields: normalizeFields({
      title: '', notes: null, location: null, date: '', endDate: null, startTime: null, endTime: null, repeat: null,
      eventType: 'default', travelMode: null, background: false, color: null, status: 'confirmed', notifyBeforeValue: null, notifyBeforeUnit: 'hours',
    }),
  };
}

// One repeating event: its master and its dates in the window (from api/microsoft-calendar-series),
// as drafts. A series the app can show is one native series, its changed dates linked copies, and
// a date missing from the window (deleted in Outlook) taken out of it. One it can't show is its
// dates, each imported on its own. A series that no longer exists is a deletion of the master.
export function seriesDrafts(
  s: { id: string; deleted?: boolean; master?: MsEventRaw; instances?: MsEventRaw[] },
  ctx: MsMapContext,
  window: { start: string; end: string },
): ImportDraft[] {
  if (s.deleted || !s.master) return [removedDraft(s.id, ctx)];
  const masterResult = mapMsEvent({ ...s.master, type: 'seriesMaster' }, ctx);
  const instances = s.instances ?? [];

  if (masterResult.kind === 'instances') {
    return instances.flatMap((i) => {
      const r = mapMsEvent(i, { ...ctx, standalone: true });
      return r.kind === 'draft' ? [r.draft] : [];
    });
  }
  if (masterResult.kind !== 'draft') return [];
  const master = masterResult.draft;
  const drafts: ImportDraft[] = [master];

  const present = new Set<string>();
  for (const i of instances) {
    const r = mapMsEvent({ ...i, seriesMasterId: i.seriesMasterId ?? s.id }, ctx);
    if (r.kind !== 'draft') continue;
    const original = r.draft.series?.date ?? r.draft.fields.date;
    if (!r.draft.cancelled) present.add(original);
    if (i.type === 'exception' || r.draft.cancelled) {
      drafts.push(r.draft.series ? r.draft : { ...r.draft, series: { key: master.key, date: original } });
    }
  }

  // Dates the rule gives inside the window that Outlook no longer has: deleted there. The window's
  // first and last days are left alone (a date there may sit just outside it in UTC).
  const repeat = master.fields.repeat;
  if (repeat && master.fields.eventType !== 'birthday') {
    const from = addDaysToIso(utcToZonedTime(new Date(window.start), ctx.zone).date, 1);
    const to = addDaysToIso(utcToZonedTime(new Date(window.end), ctx.zone).date, -1);
    const due = [master.fields.date, ...expandRepeat(master.fields.date, repeat, from, to)].filter((d) => d >= from && d <= to);
    for (const date of due) {
      if (present.has(date)) continue;
      drafts.push({ ...removedDraft(`${s.id}@${date}`, ctx), series: { key: master.key, date } });
    }
  }
  return drafts;
}
