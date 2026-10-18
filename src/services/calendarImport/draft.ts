import type { CalendarEvent, CalendarEventType, EventStatus, NotifyUnit, RepeatConfig, TravelMode } from '@/types';

// The shared shape every calendar import (Google sync, an .ics file) is turned into before it
// touches the calendar: services/calendarImport/reconcile.ts is the one place that applies it.

// The fields an import owns: what the source says about the event. Everything else on the event
// (its Endeavour, Important, notes links, done marks) is the person's own and never imported.
export interface ImportedFields {
  title:             string;
  notes:             string | null;
  location:          string | null;
  date:              string;
  endDate:           string | null;
  startTime:         string | null;
  endTime:           string | null;
  repeat:            RepeatConfig | null;
  eventType:         CalendarEventType;
  travelMode:        TravelMode | null;
  background:        boolean;
  color:             string | null;
  status:            EventStatus;
  notifyBeforeValue: number | null;
  notifyBeforeUnit:  NotifyUnit;
}

export const IMPORTED_FIELD_KEYS: (keyof ImportedFields)[] = [
  'title', 'notes', 'location', 'date', 'endDate', 'startTime', 'endTime', 'repeat',
  'eventType', 'travelMode', 'background', 'color', 'status', 'notifyBeforeValue', 'notifyBeforeUnit',
];

export interface ImportDraft {
  key:        string;              // importKey(): the event's identity at its source
  uid:        string | null;       // iCalendar UID (+ '@date' for one date of a series): the same event from elsewhere
  fields:     ImportedFields;
  source:     'google' | 'microsoft' | 'ics';
  account:    string;              // the Google account's email, or the .ics file's name
  connectionId: string | null;
  calendarId: string | null;
  eventId:    string;
  raw:        Record<string, unknown>;
  // One date of a series that was changed or deleted at the source: which series (its key) and
  // which of its dates it stands in for.
  series:     { key: string; date: string } | null;
  cancelled:  boolean;             // deleted at the source (or an invitation declined)
}

// An event's identity at its source. The account is part of a Google key and not the connection
// id, which changes when an account is reconnected. An .ics key is the event's UID alone, so
// importing the same file again (under any name) finds the same events.
export function importKey(source: string, account: string | null, calendarId: string | null, eventId: string): string {
  return source === 'ics' ? `ics|${eventId}` : `${source}|${account ?? ''}|${calendarId ?? ''}|${eventId}`;
}

export function importKeyOf(ev: Pick<CalendarEvent, 'source' | 'sourceAccount' | 'sourceCalendarId' | 'sourceEventId'>): string | null {
  if (!ev.source || !ev.sourceEventId) return null;
  return importKey(ev.source, ev.sourceAccount, ev.sourceCalendarId, ev.sourceEventId);
}

// The same rules addEvent and buildCalendarEventInput apply, so what is stored equals what was
// imported and "has it been edited here?" compares like with like.
export function normalizeFields(f: ImportedFields): ImportedFields {
  const birthday = f.eventType === 'birthday';
  return {
    ...f,
    title:      f.title.trim() || '(Untitled)',
    notes:      f.notes || null,
    location:   f.location || null,
    endDate:    f.endDate && f.endDate > f.date ? f.endDate : null,
    startTime:  birthday ? null : f.startTime || null,
    endTime:    birthday ? null : f.endTime || null,
    travelMode: f.eventType === 'travel' ? f.travelMode : null,
  };
}

export function pickFields(ev: CalendarEvent): ImportedFields {
  return {
    title: ev.title, notes: ev.notes, location: ev.location, date: ev.date, endDate: ev.endDate,
    startTime: ev.startTime, endTime: ev.endTime, repeat: ev.repeat, eventType: ev.eventType,
    travelMode: ev.travelMode ?? null, background: ev.background ?? false, color: ev.color ?? null,
    status: ev.status ?? 'confirmed', notifyBeforeValue: ev.notifyBeforeValue, notifyBeforeUnit: ev.notifyBeforeUnit,
  };
}

// A repeat rule without the dates taken out of it: two rules are "the same rule" on this.
export function ruleOf(r: RepeatConfig | null | undefined): RepeatConfig | null {
  if (!r) return null;
  const rule = { ...r };
  delete rule.exceptions;
  return rule;
}

function stable(v: unknown): string {
  if (v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function sameField(key: keyof ImportedFields, a: ImportedFields, b: ImportedFields): boolean {
  if (key === 'repeat') return stable(ruleOf(a.repeat)) === stable(ruleOf(b.repeat));
  return stable(a[key]) === stable(b[key]);
}

export function sameFields(a: ImportedFields, b: ImportedFields): boolean {
  return IMPORTED_FIELD_KEYS.every((k) => sameField(k, a, b));
}
