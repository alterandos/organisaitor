import { resolveTimezone, zonedTimeToUtc, SYSTEM_TIMEZONE } from './timezone';

export type ClockFormat = 'system' | '12h' | '24h';

export const now = (): string => new Date().toISOString();

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const formatTime = (time: string, clockFormat: ClockFormat = 'system'): string => {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  const hour12 = clockFormat === 'system' ? undefined : clockFormat === '12h';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12 });
};

export const formatDeadline = (date: string, time: string | null, clockFormat: ClockFormat = 'system'): string =>
  time ? `${formatDate(date)} ${formatTime(time, clockFormat)}` : formatDate(date);

// "3m ago" / "2h ago" / "5d ago" / falls back to formatDate beyond a week. Used by
// RecyclingBinPane's "deleted …" rows; general enough to belong here rather than trash-specific.
export const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1)   return 'just now';
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)      return `${days}d ago`;
  return formatDate(iso);
};

export const isOverdue = (date: string, time: string | null = null, timezone: string = SYSTEM_TIMEZONE): boolean => {
  const target = zonedTimeToUtc(date, time ?? '00:00', resolveTimezone(timezone));
  return target < new Date();
};

// Adds (or subtracts) minutes to a HH:MM string, clamped to 00:00–23:59.
export const timeAddMinutes = (time: string, minutes: number): string => {
  const [h, m] = time.split(':').map(Number);
  const total  = Math.max(0, Math.min(1439, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const addDaysToIso = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Wrap-aware minute arithmetic used only by computeLinkedEndTime below — timeAddMinutes itself
// intentionally clamps at 23:59 (it's used all over the calendar UI, where a single time-of-day
// field silently wrapping past midnight would be surprising), but a linked end time legitimately
// can, and should, roll into the next day (e.g. a 23:30 start with a 60-minute default).
const wrapMinutes = (total: number): { time: string; dayOffset: number } => {
  const dayOffset = Math.floor(total / 1440);
  const clamped = ((total % 1440) + 1440) % 1440;
  return {
    time: `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`,
    dayOffset,
  };
};

// Given a newly-typed start time and whatever end time currently stands, decides what the end
// time should become so it's genuinely after the start — without clobbering minutes the user
// already chose. Only acts when the end time isn't already after the start:
//   - no end time set yet            -> start + 60 minutes
//   - an end time was already set    -> keep its minutes, nudge only its hour forward (by 0 or 1)
//                                        until, combined with those minutes, it's later than start
// `dayOffset` is 1 when the result wraps past midnight, so a caller that also tracks an end
// *date* can bump it by the same amount.
export function computeLinkedEndTime(startTime: string, currentEndTime: string): { time: string; dayOffset: number } {
  const [sh, sm] = startTime.split(':').map(Number);
  const startMin = sh * 60 + sm;
  if (!currentEndTime) return wrapMinutes(startMin + 60);
  if (currentEndTime > startTime) return { time: currentEndTime, dayOffset: 0 };
  const [, em] = currentEndTime.split(':').map(Number);
  const sameHourTotal = sh * 60 + em;
  if (sameHourTotal > startMin) return wrapMinutes(sameHourTotal);
  return wrapMinutes((sh + 1) * 60 + em);
}
