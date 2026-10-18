import type { CalendarEvent, CalendarEventType, TravelMode } from '@/types';
import { LABELS } from '@/config/labels';

// The event types a person can pick (AddCalendarItemModal, CalendarEventPane, the import review).
// 'task' is not pickable — it marks a task's shadow event and is set only by taskCalendarLinks.
export const PICKABLE_EVENT_TYPES: { value: Exclude<CalendarEventType, 'task'>; label: string; icon: string }[] = [
  { value: 'default',  label: LABELS.calendarEventType.default,  icon: '' },
  { value: 'birthday', label: LABELS.calendarEventType.birthday, icon: '🎉' },
  { value: 'travel',   label: LABELS.calendarEventType.travel,   icon: '🧳' },
];

// Shown before the title on the calendar. '' = no icon.
export const EVENT_TYPE_ICON: Record<CalendarEventType, string> = {
  default:  '',
  birthday: '🎉',
  travel:   '🧳',
  task:     '',
};

// How a journey travels (CalendarEvent.travelMode), each with the icon it shows instead of 🧳.
export const TRAVEL_MODES: { value: TravelMode; label: string; icon: string }[] = [
  { value: 'flight', label: LABELS.travelMode.flight, icon: '✈️' },
  { value: 'train',  label: LABELS.travelMode.train,  icon: '🚆' },
  { value: 'bus',    label: LABELS.travelMode.bus,    icon: '🚌' },
  { value: 'car',    label: LABELS.travelMode.car,    icon: '🚗' },
  { value: 'ferry',  label: LABELS.travelMode.ferry,  icon: '⛴️' },
];

// The icon an event shows before its title: its travel mode's for a journey, else its type's.
export function eventTypeIcon(ev: Pick<CalendarEvent, 'eventType' | 'travelMode'>): string {
  const type = ev.eventType ?? 'default';
  if (type === 'travel' && ev.travelMode) return TRAVEL_MODES.find((m) => m.value === ev.travelMode)?.icon ?? EVENT_TYPE_ICON.travel;
  return EVENT_TYPE_ICON[type];
}
