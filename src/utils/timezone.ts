// A user's chosen app-wide timezone is stored as an IANA zone name (e.g. "America/New_York"),
// or the literal 'system' meaning "whatever the host machine currently reports" — the app's
// pre-existing implicit behaviour, kept as the default so nobody's data reinterprets on upgrade.

export const SYSTEM_TIMEZONE = 'system';

const FALLBACK_TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Jerusalem',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland',
];

// Every IANA zone name the runtime knows about, for the Settings picker.
// Intl.supportedValuesOf is baked into every evergreen browser/webview this app targets;
// the fallback only guards against an unexpectedly old embedded webview.
export function listTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

// Resolves the setting's stored value ('system' or an explicit IANA name) to a concrete zone.
export function resolveTimezone(tz: string): string {
  if (tz !== SYSTEM_TIMEZONE) return tz;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatInZone(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const hour = get('hour') === '24' ? 0 : Number(get('hour'));
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour, minute: Number(get('minute')), second: Number(get('second')) };
}

// Converts a wall-clock date+time as understood in `timeZone` into the real instant it represents.
// Standard two-pass Intl round-trip: guess an instant, see what wall clock it renders as in the
// target zone, correct by the difference. Two passes converge even across a DST transition.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi]    = timeStr.split(':').map(Number);

  // Fixed reference: the target wall-clock digits, read as if they were UTC.
  const target = Date.UTC(y, mo - 1, d, h, mi, 0);
  let guess = target;

  for (let i = 0; i < 2; i++) {
    const r = formatInZone(new Date(guess), timeZone);
    const renderedAsUtc = Date.UTC(r.year, r.month - 1, r.day, r.hour, r.minute, r.second);
    // How far the CURRENT guess's rendering drifts from the target — always diffed against the
    // fixed target, not the evolving guess, or the second pass overshoots past the right answer.
    guess -= renderedAsUtc - target;
  }

  return new Date(guess);
}

// The inverse: what date+time does this real instant show as, when read in `timeZone`.
export function utcToZonedTime(instant: Date, timeZone: string): { date: string; time: string } {
  const r = formatInZone(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${r.year}-${pad(r.month)}-${pad(r.day)}`,
    time: `${pad(r.hour)}:${pad(r.minute)}`,
  };
}

// Re-expresses a wall-clock date+time from one zone's frame into another's, preserving the
// real-world instant it names (e.g. "2:00 PM in New York" -> "11:00 AM" once re-read in Los Angeles).
export function rezoneWallClock(dateStr: string, timeStr: string, fromZone: string, toZone: string): { date: string; time: string } {
  return utcToZonedTime(zonedTimeToUtc(dateStr, timeStr, fromZone), toZone);
}

// "Today" as a YYYY-MM-DD string, per the given zone rather than the host machine's raw clock.
export function todayIsoInZone(timeZone: string): string {
  return utcToZonedTime(new Date(), timeZone).date;
}
