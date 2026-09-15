export interface ICSEvent {
  title:     string;
  date:      string;        // YYYY-MM-DD
  startTime: string | null; // HH:MM (24h) or null for all-day
  endTime:   string | null;
  notes:     string | null;
  location:  string | null;
  // 'UTC' if DTSTART carried a trailing Z, an IANA name if it carried TZID=..., or null for a
  // "floating" time (RFC 5545's term for a wall-clock time with no zone attached at all) or an
  // all-day value — floating/all-day need no re-projection, they mean whatever the app's zone says.
  tzid:      string | null;
}

// Recognizes the common Google/Outlook/Apple "Contacts" birthday export shape (e.g.
// "Jane Doe's Birthday", "Birthday: Jane Doe") so the import review step can default these
// to the app's dedicated birthday event type instead of a plain event.
export function looksLikeBirthday(title: string): boolean {
  return /\bbirthday\b/i.test(title);
}

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

interface ParsedRRule {
  freq:     'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count:    number | null;
  until:    string | null; // YYYY-MM-DD
}

function parseRRule(raw: string): ParsedRRule | null {
  const upper = raw.toUpperCase();
  const get = (key: string): string | undefined => {
    const m = upper.match(new RegExp(`(?:^|;)${key}=([^;]+)`));
    return m?.[1];
  };

  const freq = get('FREQ') as ParsedRRule['freq'];
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;

  const interval = parseInt(get('INTERVAL') ?? '1', 10) || 1;
  const countVal = get('COUNT');
  const count    = countVal ? parseInt(countVal, 10) : null;

  const untilStr = get('UNTIL');
  let until: string | null = null;
  if (untilStr) {
    const m = untilStr.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) until = `${m[1]}-${m[2]}-${m[3]}`;
  }

  return { freq, interval, count, until };
}

function advanceDate(dateStr: string, freq: ParsedRRule['freq'], interval: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  switch (freq) {
    case 'DAILY':   d.setDate(d.getDate() + interval);            break;
    case 'WEEKLY':  d.setDate(d.getDate() + interval * 7);        break;
    case 'MONTHLY': d.setMonth(d.getMonth() + interval);          break;
    case 'YEARLY':  d.setFullYear(d.getFullYear() + interval);    break;
  }
  return toDateStr(d);
}

// Returns all occurrence dates from baseDate up to horizonDate (or COUNT/UNTIL limit),
// skipping any date present in `exdates` (RFC 5545 EXDATE — a recurrence exception, e.g.
// "skip just this one occurrence").
function expandRecurrences(baseDate: string, rrule: ParsedRRule, horizonDate: string, exdates: Set<string>): string[] {
  const result: string[] = [];
  if (!exdates.has(baseDate)) result.push(baseDate);
  let current = baseDate;
  const cap = rrule.count ?? 1000;

  for (let i = 1; i < cap; i++) {
    current = advanceDate(current, rrule.freq, rrule.interval);
    if (rrule.until && current > rrule.until) break;
    if (current > horizonDate) break;
    if (!exdates.has(current)) result.push(current);
  }

  return result;
}

export function parseICS(raw: string): ICSEvent[] {
  const lines = unfold(raw).split(/\r?\n/);
  const events: ICSEvent[] = [];

  // Expand recurring events up to 3 years ahead
  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + 3);
  const horizonStr = toDateStr(horizon);

  let inEvent = false;
  let ev: Partial<ICSEvent> & { rrule?: ParsedRRule | null; exdates?: Set<string> } = {};

  const pushEvent = (date: string) => {
    events.push({
      title:     ev.title!,
      date,
      startTime: ev.startTime ?? null,
      endTime:   ev.endTime   ?? null,
      notes:     ev.notes     ?? null,
      location:  ev.location  ?? null,
      tzid:      ev.tzid      ?? null,
    });
  };

  for (const line of lines) {
    if (line.trim() === 'BEGIN:VEVENT') { inEvent = true; ev = { exdates: new Set() }; continue; }
    if (line.trim() === 'END:VEVENT') {
      if (inEvent && ev.title && ev.date) {
        if (ev.rrule) {
          for (const date of expandRecurrences(ev.date, ev.rrule, horizonStr, ev.exdates ?? new Set())) {
            pushEvent(date);
          }
        } else {
          pushEvent(ev.date);
        }
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
        break;
      }
      case 'EXDATE': {
        for (const part of val.split(',')) {
          const p = parseDateValue(part.trim(), params);
          if (p.date) ev.exdates?.add(p.date);
        }
        break;
      }
      case 'DESCRIPTION':
        ev.notes = unescape(val.trim()) || null;
        break;
      case 'RRULE':
        ev.rrule = parseRRule(val.trim()) ?? null;
        break;
    }
  }

  return events;
}
