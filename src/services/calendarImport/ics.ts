import type { ICSEvent } from '@/utils/icsParser';
import { rezoneWallClock } from '@/utils/timezone';
import { parseRecurrence, icalDate } from '@/utils/rrule';
import { BIRTHDAY_REPEAT } from '@/utils/calendarItemInput';
import { importKey, normalizeFields, type ImportDraft, type ImportedFields } from './draft';
import { looksLikeBirthday, travelModeFromTitle } from './classify';

// An .ics file's events as ImportDrafts. `partial` names the drafts whose repeat rule the app
// can't show exactly: only their first date is imported, and the review says so.

export interface IcsImport {
  drafts:  ImportDraft[];
  partial: Set<string>;   // draft keys
}

export function icsToDrafts(events: ICSEvent[], fileName: string, zone: string): IcsImport {
  const drafts: ImportDraft[] = [];
  const partial = new Set<string>();

  for (const ev of events) {
    let { date, startTime, endTime } = ev;
    // Re-project into the app's zone if the source carried an explicit zone that differs —
    // floating times (tzid === null) already mean "whatever zone reads this".
    if (ev.tzid && ev.tzid !== zone && startTime) {
      const r = rezoneWallClock(ev.date, startTime, ev.tzid, zone);
      date = r.date;
      startTime = r.time;
      if (endTime) endTime = rezoneWallClock(ev.date, endTime, ev.tzid, zone).time;
    }

    const recurrenceDate = ev.recurrenceId ? icalDate(ev.recurrenceId.value, zone) : null;
    const eventId = ev.uid
      ? (recurrenceDate ? `${ev.uid}@${recurrenceDate}` : ev.uid)
      : `${ev.title}|${date}|${startTime ?? ''}`;
    const key = importKey('ics', fileName, null, eventId);

    const allDay = !startTime;
    const birthday = allDay && looksLikeBirthday(ev.title);
    let repeat = null;
    if (ev.recurrence.length && !ev.recurrenceId) {
      repeat = birthday ? BIRTHDAY_REPEAT : (ev.endDate ? null : parseRecurrence(ev.recurrence, date, zone));
      if (!repeat) partial.add(key);
    }
    const travelMode = birthday ? null : travelModeFromTitle(ev.title, false);

    const fields: ImportedFields = {
      title:      ev.title,
      notes:      ev.notes,
      location:   ev.location,
      date,
      endDate:    birthday ? null : ev.endDate,
      startTime,
      endTime,
      repeat,
      eventType:  birthday ? 'birthday' : travelMode ? 'travel' : 'default',
      travelMode,
      background: !birthday && allDay && !!ev.endDate && ev.transparent,
      color:      null,
      status:     ev.tentative ? 'tentative' : 'confirmed',
      notifyBeforeValue: null,
      notifyBeforeUnit:  'hours',
    };

    drafts.push({
      key,
      uid:          ev.uid ? eventId : null,
      fields:       normalizeFields(fields),
      source:       'ics',
      account:      fileName,
      connectionId: null,
      calendarId:   null,
      eventId,
      raw:          { ...ev },
      series:       ev.uid && recurrenceDate ? { key: importKey('ics', fileName, null, ev.uid), date: recurrenceDate } : null,
      cancelled:    ev.cancelled,
    });
  }
  return { drafts, partial };
}

// The kind a person picked in the import review, applied to a draft's fields: a birthday has no
// times and repeats every year; anything else keeps what the file said.
export function withEventType(fields: ImportedFields, eventType: ImportedFields['eventType']): ImportedFields {
  if (eventType === fields.eventType) return fields;
  if (eventType === 'birthday') return normalizeFields({ ...fields, eventType, endDate: null, startTime: null, endTime: null, repeat: BIRTHDAY_REPEAT, travelMode: null, background: false });
  return normalizeFields({ ...fields, eventType, travelMode: eventType === 'travel' ? fields.travelMode : null });
}
