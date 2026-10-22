import type { CalendarDeadline, CalendarEvent, CalendarReminder, NotifyUnit } from '@/types';
import { addDaysToIso } from './date';
import { zonedTimeToUtc } from './timezone';
import { LABELS } from '@/config/labels';

// One notify setting for every calendar item (agreed with the user 2026-10-22): told N minutes /
// hours / days before its time; N days before, at a time of day; or, a timed reminder, at its own
// time. THE reading of the stored fields (events: notifyBeforeValue/Unit, notifyAtTime,
// notifyMode; reminders and deadlines: notify, notifyMode, notifyBeforeValue/Unit,
// notifyDaysBefore, notifyAtTime) and the writing back, for the panes, the note's chips, and
// services/notifications/plan.ts, so the three can't drift. Storing the gap (not a moment) is what
// keeps it right when the item's date or time changes, and for every date of a repeating item.

export type NotifyRule =
  | { kind: 'off' }
  | { kind: 'before'; value: number; unit: NotifyUnit }
  | { kind: 'daysAt'; days: number; at: string }
  | { kind: 'atTime' };

export type NotifyRuleKind = NotifyRule['kind'];
export const DEFAULT_NOTIFY_AT = '17:00';

// What an item of each kind may use: 'before' and 'atTime' need a time; only a reminder notifies
// at its own time (a deadline is due then: too late to be told).
export function ruleKindsFor(item: 'event' | 'reminder' | 'deadline', timed: boolean): Exclude<NotifyRuleKind, 'off'>[] {
  if (!timed) return ['daysAt'];
  return item === 'reminder' ? ['atTime', 'before', 'daysAt'] : ['before', 'daysAt'];
}

// The rule a newly switched-on Notify starts with.
export function defaultRule(item: 'event' | 'reminder' | 'deadline', timed: boolean): NotifyRule {
  if (item === 'reminder' && timed) return { kind: 'atTime' };
  if (item === 'event' && timed) return { kind: 'before', value: 1, unit: 'hours' };
  return { kind: 'daysAt', days: 1, at: DEFAULT_NOTIFY_AT };
}

// ── Events ──────────────────────────────────────────────────────────────────

type EventNotify = Pick<CalendarEvent, 'notifyBeforeValue' | 'notifyBeforeUnit' | 'notifyAtTime' | 'notifyMode' | 'startTime'>;

export function eventRule(ev: EventNotify): NotifyRule {
  if (ev.notifyBeforeValue === null) return { kind: 'off' };
  if (ev.notifyMode === 'daysAt') return { kind: 'daysAt', days: ev.notifyBeforeValue, at: ev.notifyAtTime ?? DEFAULT_NOTIFY_AT };
  return { kind: 'before', value: ev.notifyBeforeValue, unit: ev.notifyBeforeUnit };
}

export function eventPatch(rule: NotifyRule): Partial<CalendarEvent> {
  switch (rule.kind) {
    case 'off':    return { notifyBeforeValue: null };
    case 'before': return { notifyMode: 'before', notifyBeforeValue: rule.value, notifyBeforeUnit: rule.unit };
    case 'daysAt': return { notifyMode: 'daysAt', notifyBeforeValue: rule.days, notifyBeforeUnit: 'days', notifyAtTime: rule.at };
    case 'atTime': return { notifyMode: 'before', notifyBeforeValue: 0, notifyBeforeUnit: 'minutes' };
  }
}

// ── Reminders and deadlines ─────────────────────────────────────────────────

type DatedNotify = Pick<CalendarReminder & CalendarDeadline, 'notify' | 'notifyMode' | 'notifyBeforeValue' | 'notifyBeforeUnit' | 'notifyDaysBefore' | 'notifyAtTime' | 'time'>;

// A mode that needs a time falls back to "days before, at" once the item has none.
export function datedRule(item: DatedNotify, kind: 'reminder' | 'deadline'): NotifyRule {
  if (item.notify === false) return { kind: 'off' };
  const daysAt: NotifyRule = { kind: 'daysAt', days: item.notifyDaysBefore ?? 1, at: item.notifyAtTime ?? DEFAULT_NOTIFY_AT };
  if (!item.time) return daysAt;
  if (item.notifyMode === 'before' && item.notifyBeforeValue !== null && item.notifyBeforeValue !== undefined) {
    return { kind: 'before', value: item.notifyBeforeValue, unit: item.notifyBeforeUnit ?? 'hours' };
  }
  // No mode at all (a record from before 2026-10-22 not yet migrated): a timed reminder notified at its time.
  if (kind === 'reminder' && (item.notifyMode === 'atTime' || item.notifyMode === undefined)) return { kind: 'atTime' };
  return daysAt;
}

export function datedPatch(rule: NotifyRule): Partial<CalendarReminder & CalendarDeadline> {
  switch (rule.kind) {
    case 'off':    return { notify: false };
    case 'before': return { notify: true, notifyMode: 'before', notifyBeforeValue: rule.value, notifyBeforeUnit: rule.unit };
    case 'daysAt': return { notify: true, notifyMode: 'daysAt', notifyDaysBefore: rule.days, notifyAtTime: rule.at };
    case 'atTime': return { notify: true, notifyMode: 'atTime' };
  }
}

// ── When ────────────────────────────────────────────────────────────────────

export const leadMinutes = (value: number, unit: NotifyUnit): number =>
  unit === 'days' ? value * 1440 : unit === 'hours' ? value * 60 : value;

// How many days before an occurrence its notification can come (to know which occurrences to look at).
export function leadDays(rule: NotifyRule): number {
  if (rule.kind === 'daysAt') return rule.days;
  if (rule.kind === 'before') return Math.ceil(leadMinutes(rule.value, rule.unit) / 1440);
  return 0;
}

// The moment an occurrence on `date` notifies. `time` is the item's own (an all-day item counts
// "before" from midnight, as events always have).
export function notifyMoment(rule: NotifyRule, date: string, time: string | null, zone: string): Date | null {
  switch (rule.kind) {
    case 'off':    return null;
    case 'atTime': return zonedTimeToUtc(date, time ?? '00:00', zone);
    case 'daysAt': return zonedTimeToUtc(addDaysToIso(date, -rule.days), rule.at, zone);
    case 'before': return new Date(zonedTimeToUtc(date, time ?? '00:00', zone).getTime() - leadMinutes(rule.value, rule.unit) * 60_000);
  }
}

// ── Fitting and describing ──────────────────────────────────────────────────

// A rule that fits the item: one needing a time becomes "days before, at" on an item without one.
export function fitRule(rule: NotifyRule, item: 'event' | 'reminder' | 'deadline', timed: boolean): NotifyRule {
  if (rule.kind === 'off' || ruleKindsFor(item, timed).includes(rule.kind)) return rule;
  return defaultRule(item, false);
}

// What a rule says, short (the note's chips, a tooltip).
export function describeRule(rule: NotifyRule, clock: (t: string) => string): string {
  switch (rule.kind) {
    case 'off':    return LABELS.calendarForm.notifyOffShort;
    case 'atTime': return LABELS.calendarForm.atItsTimeOption;
    case 'before': return LABELS.calendarForm.beforePreset(rule.value, rule.unit);
    case 'daysAt': return LABELS.calendarForm.daysAtShort(rule.days, clock(rule.at));
  }
}

