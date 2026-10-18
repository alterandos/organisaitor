// One VEVENT, as written. A repeating event is ONE entry with its rule (`recurrence`), and a date
// changed in it is another entry with `recurrenceId`; services/calendarImport/ics.ts turns them
// into the app's series and linked copies.
export interface ICSEvent {
  title:     string;
  date:      string;        // YYYY-MM-DD
  endDate:   string | null; // last day of an all-day event over several days (DTEND is exclusive)
  startTime: string | null; // HH:MM (24h) or null for all-day
  endTime:   string | null;
  notes:     string | null;
  location:  string | null;
  // 'UTC' if DTSTART carried a trailing Z, an IANA name if it carried TZID=..., or null for a
  // "floating" time (RFC 5545's term for a wall-clock time with no zone attached at all) or an
  // all-day value — floating/all-day need no re-projection, they mean whatever the app's zone says.
  tzid:      string | null;
  // STATUS:TENTATIVE in the source, imported as the app's tentative event.
  tentative: boolean;
  // STATUS:CANCELLED. Kept only for one date of a series (it takes that date out); a whole
  // cancelled event isn't returned at all.
  cancelled: boolean;
  uid:       string | null;
  // RECURRENCE-ID: this entry stands in for that date of the series with the same UID (the raw
  // value and its parameters; the caller reads the date in the account's zone).
  recurrenceId: { value: string; params: string } | null;
  recurrence:  string[];    // the RRULE / EXDATE / RDATE / EXRULE lines, as written
  transparent: boolean;     // TRANSP:TRANSPARENT ("free")
}

export { looksLikeBirthday } from '@/services/calendarImport/classify';

// RFC 5545: folded lines (CRLF + SPACE/TAB) are joined
function unfold(raw: string): string {
  return raw.replace(/\r?\n[ \t]/g, '');
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// `params` must be the ORIGINAL-CASE parameter string — IANA zone names in TZID are
// case-sensitive (e.g. "America/New_York"), so this must never be run against an uppercased copy.
function parseDateValue(value: string, params: string): { date: string; time: string | null; tzid: string | null } {
  const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!dateMatch) return { date: '', time: null, tzid: null };

  const date       = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const isDateOnly = params.toUpperCase().includes('VALUE=DATE') || !value.includes('T');
  if (isDateOnly) return { date, time: null, tzid: null };

  const timeMatch = value.match(/T(\d{2})(\d{2})/);
  if (!timeMatch) return { date, time: null, tzid: null };
  const time = `${timeMatch[1]}:${timeMatch[2]}`;

  if (value.endsWith('Z')) return { date, time, tzid: 'UTC' };

  const tzidMatch = params.match(/TZID=([^;]+)/i);
  return { date, time, tzid: tzidMatch ? tzidMatch[1] : null };
}

function unescape(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function parseICS(raw: string): ICSEvent[] {
  const lines = unfold(raw).split(/\r?\n/);
  const events: ICSEvent[] = [];
  let inEvent = false;
  let ev: Partial<ICSEvent> & { endExclusive?: string } = {};

  for (const line of lines) {
    if (line.trim() === 'BEGIN:VEVENT') { inEvent = true; ev = { recurrence: [] }; continue; }
    if (line.trim() === 'END:VEVENT') {
      if (inEvent && ev.title && ev.date && (!ev.cancelled || ev.recurrenceId)) {
        let endDate: string | null = null;
        if (!ev.startTime && ev.endExclusive && ev.endExclusive > ev.date) {
          const d = new Date(ev.endExclusive + 'T00:00:00');
          d.setDate(d.getDate() - 1);
          endDate = toDateStr(d) > ev.date ? toDateStr(d) : null;
        }
        events.push({
          title:        ev.title,
          date:         ev.date,
          endDate,
          startTime:    ev.startTime ?? null,
          endTime:      ev.endTime   ?? null,
          notes:        ev.notes     ?? null,
          location:     ev.location  ?? null,
          tzid:         ev.tzid      ?? null,
          tentative:    ev.tentative ?? false,
          cancelled:    ev.cancelled ?? false,
          uid:          ev.uid ?? null,
          recurrenceId: ev.recurrenceId ?? null,
          recurrence:   ev.recurrence ?? [],
          transparent:  ev.transparent ?? false,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const keyPart = line.slice(0, colonIdx);
    const val     = line.slice(colonIdx + 1);
    const semiIdx = keyPart.indexOf(';');
    const key     = (semiIdx === -1 ? keyPart : keyPart.slice(0, semiIdx)).toUpperCase().trim();
    const params  = semiIdx === -1 ? '' : keyPart.slice(semiIdx + 1);

    switch (key) {
      case 'SUMMARY':
        ev.title = unescape(val.trim());
        break;
      case 'UID':
        ev.uid = val.trim() || null;
        break;
      case 'STATUS': {
        const s = val.trim().toUpperCase();
        ev.tentative = s === 'TENTATIVE';
        ev.cancelled = s === 'CANCELLED';
        break;
      }
      case 'TRANSP':
        ev.transparent = val.trim().toUpperCase() === 'TRANSPARENT';
        break;
      case 'LOCATION':
        ev.location = unescape(val.trim()) || null;
        break;
      case 'DTSTART': {
        const p = parseDateValue(val.trim(), params);
        ev.date      = p.date;
        ev.startTime = p.time;
        ev.tzid      = p.tzid;
        break;
      }
      case 'DTEND': {
        const p = parseDateValue(val.trim(), params);
        ev.endTime = p.time;
        if (!p.time) ev.endExclusive = p.date;
        break;
      }
      case 'RECURRENCE-ID':
        ev.recurrenceId = { value: val.trim(), params };
        break;
      case 'RRULE':
      case 'EXDATE':
      case 'RDATE':
      case 'EXRULE':
        ev.recurrence?.push(`${keyPart}:${val.trim()}`);
        break;
      case 'DESCRIPTION':
        ev.notes = unescape(val.trim()) || null;
        break;
    }
  }

  return events;
}
