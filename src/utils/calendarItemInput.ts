import type {
  CalendarEventType, CollectionId, CreateCalendarEventInput, CreateCalendarReminderInput, CreateCalendarDeadlineInput,
  CrossAppRef, EventStatus, NotifyUnit, RepeatConfig, TravelMode, NotifyMode,
} from '@/types';
import { mergeNewLinks } from '@/utils/links';

export const BIRTHDAY_REPEAT: RepeatConfig = { freq: 'yearly', interval: 1, endKind: 'forever', count: null, until: null };

export interface CalendarEventFields {
  title:              string;
  date:               string;
  endDate?:           string | null;
  startTime?:         string | null;
  endTime?:           string | null;
  notes?:             string | null;
  links?:             string[];
  location?:          string | null;
  eventType?:         CalendarEventType;
  travelMode?:        TravelMode | null;
  collectionId?:      CollectionId | null;
  notifyBeforeValue?: number | null;
  notifyBeforeUnit?:  NotifyUnit;
  notifyAtTime?:      string | null;
  notifyMode?:        NotifyMode;
  repeat?:            RepeatConfig | null;
  status?:            EventStatus;
  important?:         boolean;
  background?:        boolean;
  color?:             string | null;
  crossAppRefs?:      CrossAppRef[];
}

// The rules for turning what a person (or an agent) supplied for a new event into what is stored.
// Empty strings become null, an end date only counts if it is after the start date, a birthday has
// no times and repeats yearly, and links typed into the notes are copied into the links list.
export function buildCalendarEventInput(f: CalendarEventFields): CreateCalendarEventInput {
  const eventType = f.eventType ?? 'default';
  const birthday = eventType === 'birthday';
  return {
    title:             f.title,
    date:              f.date,
    endDate:           (f.endDate && f.endDate > f.date) ? f.endDate : null,
    startTime:         birthday ? null : f.startTime || null,
    endTime:           birthday ? null : f.endTime || null,
    notes:             f.notes || null,
    links:             mergeNewLinks(f.links ?? [], f.notes),
    location:          f.location || null,
    eventType,
    travelMode:        eventType === 'travel' ? f.travelMode ?? null : null,
    collectionId:      f.collectionId || null,
    notifyBeforeValue: f.notifyBeforeValue ?? null,
    notifyBeforeUnit:  f.notifyBeforeUnit,
    notifyAtTime:      birthday || f.notifyMode === 'daysAt' ? f.notifyAtTime || null : null,
    notifyMode:        f.notifyMode,
    repeat:            birthday ? (f.repeat ?? BIRTHDAY_REPEAT) : (f.repeat ?? null),
    status:            f.status,
    important:         f.important,
    background:        f.background,
    color:             f.color,
    crossAppRefs:      f.crossAppRefs,
  };
}

export interface CalendarReminderFields {
  title:             string;
  date:              string;
  time?:             string | null;
  notes?:            string | null;
  links?:            string[];
  collectionId?:     CollectionId | null;
  repeat?:           RepeatConfig | null;
  status?:           EventStatus;
  important?:        boolean;
  crossAppRefs?:     CrossAppRef[];
  notifyDaysBefore?: number;
  notifyAtTime?:     string;
  notify?:           boolean;
  notifyMode?:        NotifyMode;
  notifyBeforeValue?: number | null;
  notifyBeforeUnit?:  NotifyUnit;
}

export function buildCalendarReminderInput(f: CalendarReminderFields): CreateCalendarReminderInput {
  return {
    title:            f.title,
    date:             f.date,
    time:             f.time || null,
    notes:            f.notes || null,
    links:            mergeNewLinks(f.links ?? [], f.notes),
    collectionId:     f.collectionId || null,
    repeat:           f.repeat ?? null,
    status:           f.status,
    important:        f.important,
    crossAppRefs:     f.crossAppRefs,
    notifyDaysBefore: f.notifyDaysBefore,
    notifyAtTime:     f.notifyAtTime,
    notify:           f.notify,
    notifyMode:        f.notifyMode,
    notifyBeforeValue: f.notifyBeforeValue,
    notifyBeforeUnit:  f.notifyBeforeUnit,
  };
}

export interface CalendarDeadlineFields {
  title:             string;
  date:              string;
  time?:             string | null;
  notes?:            string | null;
  links?:            string[];
  collectionId?:     CollectionId | null;
  repeat?:           RepeatConfig | null;
  status?:           EventStatus;
  important?:        boolean;
  crossAppRefs?:     CrossAppRef[];
  notifyDaysBefore?: number;
  notifyAtTime?:     string;
  notify?:           boolean;
  notifyMode?:        NotifyMode;
  notifyBeforeValue?: number | null;
  notifyBeforeUnit?:  NotifyUnit;
}

export function buildCalendarDeadlineInput(f: CalendarDeadlineFields): CreateCalendarDeadlineInput {
  return {
    title:            f.title,
    date:             f.date,
    time:             f.time || null,
    notes:            f.notes || null,
    links:            mergeNewLinks(f.links ?? [], f.notes),
    collectionId:     f.collectionId || null,
    repeat:           f.repeat ?? null,
    status:           f.status,
    important:        f.important,
    crossAppRefs:     f.crossAppRefs,
    notifyDaysBefore: f.notifyDaysBefore,
    notifyAtTime:     f.notifyAtTime,
    notify:           f.notify,
    notifyMode:        f.notifyMode,
    notifyBeforeValue: f.notifyBeforeValue,
    notifyBeforeUnit:  f.notifyBeforeUnit,
  };
}
