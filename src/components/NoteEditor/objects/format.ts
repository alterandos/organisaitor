import { formatTime } from '@/utils/date';
import { LABELS } from '@/config/labels';
import type { RepeatConfig } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';

// "Today" / "Tomorrow" / "Yesterday", else "Tue 7 Oct" (with the year when it isn't this year).
export function formatObjectDay(iso: string, now: Date = new Date()): string {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(y !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

export const formatObjectTime = (time: string): string => formatTime(time, useSettingsStore.getState().clockFormat);

// "12:00–13:00", or just "12:00" with no end.
export const formatObjectTimeRange = (start: string, end: string | null): string =>
  end ? `${formatObjectTime(start)}–${formatObjectTime(end)}` : formatObjectTime(start);

// "Tomorrow, 5:00 pm" / "Tue 7 Oct" / "Fri 9 Oct, 13:00–14:00".
export function formatObjectWhen(date: string, time: string | null, now: Date = new Date(), endTime: string | null = null): string {
  const day = formatObjectDay(date, now);
  return time ? `${day}, ${formatObjectTimeRange(time, endTime)}` : day;
}

const UNIT: Record<string, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

// "Every week", "Every 2 weeks, until Fri 30 Oct", "Every day, 5 times".
export function formatRepeatRule(repeat: RepeatConfig): string {
  const base = repeat.interval === 1
    ? LABELS.noteObjects.card.repeatFreq[repeat.freq]
    : `Every ${repeat.interval} ${UNIT[repeat.freq]}s`;
  if (repeat.endKind === 'until' && repeat.until) return `${base}, until ${formatObjectDay(repeat.until)}`;
  if (repeat.endKind === 'count' && repeat.count) return `${base}, ${repeat.count} times`;
  return base;
}
