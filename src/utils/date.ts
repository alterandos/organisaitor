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
