import type { CalendarEvent } from '@/types';

// How an event shows on the calendar (2026-11-05, agreed with the user: one choice where there
// were two overlapping checkboxes, as Outlook's "Show as"): Normal; Quiet (lighter and dashed, not
// something you go to: a journey); Background (a thin line behind the days, for a long stretch: a
// trip, a holiday; only an event over several days). Stored as the two flags events already have
// (`quiet`, `background`), so nothing stored changes; read and write it only here.

export type ShowAs = 'normal' | 'quiet' | 'background';
export const SHOW_AS: ShowAs[] = ['normal', 'quiet', 'background'];

export function showAsOf(ev: Pick<CalendarEvent, 'quiet' | 'background'>, multiDay: boolean): ShowAs {
  if (ev.background && multiDay) return 'background';
  return ev.quiet ? 'quiet' : 'normal';
}

export function showAsPatch(v: ShowAs): { quiet: boolean; background: boolean } {
  return { quiet: v === 'quiet', background: v === 'background' };
}

// The choices an event has: Background only over several days.
export const showAsChoices = (multiDay: boolean): ShowAs[] => (multiDay ? SHOW_AS : ['normal', 'quiet']);
