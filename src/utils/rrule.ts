import type { RepeatConfig } from '@/types';
import { utcToZonedTime } from '@/utils/timezone';

// Reading iCalendar repeat rules (RFC 5545 RRULE, as Google, Outlook, Apple and .ics files send
// them) into the app's own RepeatConfig. Only rules the app can show exactly are read: anything
// else returns null, and the caller falls back to the rule's single dates (Google expands them
// for us) rather than showing a series that is subtly wrong.

const DAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const KNOWN = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST']);

// An iCalendar date or date-time value as a calendar date: a UTC time (trailing Z) is moved into
// `zone` first; a local or floating time, or a plain date, keeps its own date.
export function icalDate(value: string, zone: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (m[7]) {
    const instant = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
    return utcToZonedTime(instant, zone).date;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseByDay(v: string): { week: number | null; day: number }[] | null {
  const out: { week: number | null; day: number }[] = [];
  for (const part of v.split(',')) {
    const m = part.trim().match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
    if (!m) return null;
    out.push({ week: m[1] ? parseInt(m[1], 10) : null, day: DAY_CODES[m[2]] });
  }
  return out;
}

const validWeek = (w: number) => w === -1 || (w >= 1 && w <= 5);

// One RRULE value ("FREQ=WEEKLY;BYDAY=MO,WE") for a series starting on `startDate`.
export function parseRRule(rule: string, startDate: string, zone: string): RepeatConfig | null {
  const parts = new Map<string, string>();
  for (const seg of rule.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = seg.split('=');
    if (!k || v === undefined) continue;
    parts.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }
  for (const k of parts.keys()) if (!KNOWN.has(k)) return null;

  const freqCode = parts.get('FREQ');
  const freq = freqCode === 'DAILY' ? 'daily' : freqCode === 'WEEKLY' ? 'weekly' : freqCode === 'MONTHLY' ? 'monthly' : freqCode === 'YEARLY' ? 'yearly' : null;
  if (!freq) return null;
  const interval = Math.max(1, parseInt(parts.get('INTERVAL') ?? '1', 10) || 1);

  const start = new Date(startDate + 'T00:00:00');
  const repeat: RepeatConfig = { freq, interval, endKind: 'forever', count: null, until: null };
  const count = parts.get('COUNT');
  const until = parts.get('UNTIL');
  if (count) {
    const n = parseInt(count, 10);
    if (!(n > 0)) return null;
    Object.assign(repeat, { endKind: 'count', count: n });
  } else if (until) {
    const d = icalDate(until, zone);
    if (!d) return null;
    Object.assign(repeat, { endKind: 'until', until: d });
  }

  const byDay = parts.has('BYDAY') ? parseByDay(parts.get('BYDAY')!) : null;
  if (parts.has('BYDAY') && !byDay) return null;
  const byMonthDay = parts.get('BYMONTHDAY');
  const byMonth = parts.get('BYMONTH');
  const bySetPos = parts.get('BYSETPOS');

  // A BYMONTHDAY / BYMONTH that only restates the start date adds nothing.
  if (byMonthDay !== undefined && (byMonthDay.includes(',') || parseInt(byMonthDay, 10) !== start.getDate())) return null;
  if (byMonth !== undefined && (freq !== 'yearly' || byMonth.includes(',') || parseInt(byMonth, 10) !== start.getMonth() + 1)) return null;

  if (freq === 'daily' || freq === 'weekly') {
    if (bySetPos !== undefined || byMonthDay !== undefined) return null;
    if (byDay) {
      if (byDay.some((d) => d.week !== null)) return null;
      // "Every day on Mon–Fri" (Outlook writes weekdays this way) is a weekly rule.
      if (freq === 'daily' && interval !== 1) return null;
      const days = [...new Set(byDay.map((d) => d.day))].sort((a, b) => a - b);
      const wkst = parts.get('WKST');
      if (wkst && wkst !== 'MO' && interval > 1 && days.length > 1) return null;
      repeat.freq = 'weekly';
      if (!(days.length === 1 && days[0] === start.getDay())) repeat.daysOfWeek = days;
    }
    return repeat;
  }

  // Monthly / yearly.
  if (byDay) {
    if (byDay.length !== 1) return null;
    const { day } = byDay[0];
    let week = byDay[0].week;
    if (week === null) {
      if (bySetPos === undefined || bySetPos.includes(',')) return null;
      week = parseInt(bySetPos, 10);
    } else if (bySetPos !== undefined) return null;
    if (!validWeek(week) || byMonthDay !== undefined) return null;
    repeat.monthWeekday = { week, day };
    return repeat;
  }
  if (bySetPos !== undefined) return null;
  return repeat;
}

// A whole recurrence (Google's `recurrence` array, or a VEVENT's RRULE / EXDATE lines): the
// series, plus the dates taken out of it (EXDATE). null when there's anything the app can't show:
// RDATE, EXRULE, more than one RRULE, or a rule parseRRule doesn't read.
export function parseRecurrence(lines: string[], startDate: string, zone: string): RepeatConfig | null {
  let repeat: RepeatConfig | null = null;
  const exdates: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const colon = line.indexOf(':');
    if (colon < 0) return null;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (name === 'RRULE') {
      if (repeat) return null;
      repeat = parseRRule(value, startDate, zone);
      if (!repeat) return null;
    } else if (name === 'EXDATE') {
      for (const v of value.split(',')) {
        const d = icalDate(v.trim(), zone);
        if (d) exdates.push(d);
      }
    } else {
      return null;
    }
  }
  if (!repeat) return null;
  return exdates.length ? { ...repeat, exceptions: [...new Set(exdates)].sort() } : repeat;
}
