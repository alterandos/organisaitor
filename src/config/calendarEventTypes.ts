import type { CalendarEvent, CalendarEventType, RepeatConfig, TravelMode } from '@/types';
import { LABELS } from '@/config/labels';
import { iconText } from '@/components/IconPicker/iconValue';
import type { ShowAs } from '@/utils/showAs';
import { eventPatch, type NotifyRule } from '@/utils/notifyRule';

// The kinds of event (2026-11-05, agreed with the user: a few built in, instead of Types, which were
// switched off). An event's kind is its `eventType`; a kind is presets plus a field or two of its
// own, never a schema the person builds. Kept short on purpose (Google Calendar's handful of kinds,
// not a long list where Birthday gets lost). A new kind is one entry here, its label, and any field
// of its own in components/EventKindField. 'task' is not pickable: it marks a task's calendar copy,
// set only by taskCalendarLinks.
export interface EventKind {
  value:   Exclude<CalendarEventType, 'task'>;
  label:   string;
  icon:    string;
  // What choosing it sets (still the person's to change): no times, a yearly repeat, how it shows.
  presets: { allDay?: boolean; repeat?: RepeatConfig; showAs?: ShowAs; notify?: NotifyRule };
}

export const YEARLY: RepeatConfig = { freq: 'yearly', interval: 1, endKind: 'forever', count: null, until: null };

export const EVENT_KINDS: EventKind[] = [
  { value: 'default',  label: LABELS.calendarEventType.default,  icon: '📅', presets: {} },
  // A birthday: all day, every year on its date, forever; notified on the day at noon (the user, 2026-11-06).
  { value: 'birthday', label: LABELS.calendarEventType.birthday, icon: '🎉', presets: { allDay: true, repeat: YEARLY, notify: { kind: 'daysAt', days: 0, at: '12:00' } } },
  // Travel: Background (Quiet within one day, where a line behind the days can't be drawn), ✈️.
  { value: 'travel',   label: LABELS.calendarEventType.travel,   icon: '✈️', presets: { showAs: 'background' } },
];
// Older name, still read by the import review.
export const PICKABLE_EVENT_TYPES = EVENT_KINDS;

export const eventKind = (value: CalendarEventType | undefined): EventKind =>
  EVENT_KINDS.find((k) => k.value === value) ?? EVENT_KINDS[0];

// Shown before the title on the calendar. '' = no icon.
export const EVENT_TYPE_ICON: Record<CalendarEventType, string> = {
  default:  '',
  birthday: '🎉',
  travel:   '✈️',
  task:     '',
};

// How a journey travels (CalendarEvent.travelMode), each with the icon it shows instead of 🧳.
export const TRAVEL_MODES: { value: TravelMode; label: string; icon: string }[] = [
  { value: 'flight', label: LABELS.travelMode.flight, icon: '✈️' },
  { value: 'train',  label: LABELS.travelMode.train,  icon: '🚆' },
  { value: 'car',    label: LABELS.travelMode.car,    icon: '🚗' },
  { value: 'bus',    label: LABELS.travelMode.bus,    icon: '🚌' },
  { value: 'ferry',  label: LABELS.travelMode.ferry,  icon: '⛴️' },
  { value: 'bike',   label: LABELS.travelMode.bike,   icon: '🚲' },
  { value: 'walk',   label: LABELS.travelMode.walk,   icon: '🚶' },
];

// The icon a kind gives an event (a journey's is its mode's), when the person hasn't chosen one.
export function kindIcon(ev: Pick<CalendarEvent, 'eventType' | 'travelMode'>): string {
  const type = ev.eventType ?? 'default';
  if (type === 'travel' && ev.travelMode) return TRAVEL_MODES.find((m) => m.value === ev.travelMode)?.icon ?? EVENT_TYPE_ICON.travel;
  return EVENT_TYPE_ICON[type];
}

// The icon an event shows before its title: its own (a picture icon shows nothing here, where only
// text goes), else its kind's.
export function eventTypeIcon(ev: Pick<CalendarEvent, 'eventType' | 'travelMode' | 'icon'>): string {
  if (ev.icon) return iconText(ev.icon, '');
  return kindIcon(ev);
}

// A birthday's age on a date: the years since its first date, when that's in the past (its first
// date is the day they were born; "Year born" sets its year).
export function birthdayAge(firstDate: string, on: string): number | null {
  const born = Number(firstDate.slice(0, 4));
  const now = Number(on.slice(0, 4));
  return born && now > born ? now - born : null;
}

// Changing an existing event's kind: the kind, what it presets that the event doesn't have yet (a
// birthday's yearly repeat, no times and noon notice; a journey's Background, read as Quiet within
// one day), and a journey's mode cleared when it stops being one.
export function kindPatch(ev: Pick<CalendarEvent, 'repeat' | 'quiet' | 'background' | 'travelMode'>, k: EventKind['value']): Partial<CalendarEvent> {
  const p = eventKind(k).presets;
  return {
    eventType: k,
    ...(k !== 'travel' && ev.travelMode ? { travelMode: null } : {}),
    ...(p.allDay ? { startTime: null, endTime: null } : {}),
    ...(p.repeat && !ev.repeat ? { repeat: p.repeat } : {}),
    ...(p.showAs === 'quiet' && !ev.background ? { quiet: true } : {}),
    ...(p.showAs === 'background' ? { quiet: true, background: true } : {}),
    ...(p.notify ? eventPatch(p.notify) : {}),
  };
}

// What one date of an event says on the calendar: its title, and for a birthday the age it turns.
export function occurrenceTitle(ev: Pick<CalendarEvent, 'title' | 'eventType' | 'date'>, on: string): string {
  const age = ev.eventType === 'birthday' ? birthdayAge(ev.date, on) : null;
  return age === null ? ev.title : `${ev.title} · ${LABELS.calendarForm.turns(age)}`;
}
