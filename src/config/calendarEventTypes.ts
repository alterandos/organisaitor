import type { CalendarEventType } from '@/types';
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
