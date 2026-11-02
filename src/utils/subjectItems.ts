import type { CalendarDeadline, CalendarEvent, ClassLink, Collection, ItemTypeId, RepeatConfig } from '@/types';
import type { ScheduleBounds } from '@/utils/scheduleItems';
import { breakDates, effectivePeriod } from '@/utils/endeavourPeriod';
import type { CourseOutline } from '@/utils/courseOutline';
import { addDaysToIso } from '@/utils/date';

// A subject's items, as its editor shows them (docs/features/endeavours.md phase 7 (d)), pure.
// Two lists of the Endeavour's real items, so a change made in the calendar shows there too:
// Schedule (what you go to: its calendar events) and Work (what you do or hand in: its Deadlines).
// Making and changing them is services/subjectItems.ts.

export type SubjectItemKind = 'schedule' | 'work';

// One item as the editor edits it.
export interface SubjectItemDraft {
  kind:   SubjectItemKind;
  title:  string;
  typeId: ItemTypeId | null;
  date:   string;                 // its first date (a Schedule item), or when it's due (Work)
  start:  string | null;          // Schedule: from; Work: by
  end:    string | null;          // Schedule only
  place:  string | null;          // Schedule only
  // Its Type's field values (a Work item's worth is the Weight field: worthOf).
  typeFields: Record<string, unknown>;
  // Which of its Type's tasks (a Revise, a Check the result) to make when it's new or its Type
  // changes: chosen in the editor, all of them when absent (the outline, the agent). An item whose
  // Type stays the same makes none.
  partIds?: string[];
  // In a class's time: instead of it or during it (utils/classClashes.ts); absent, never asked.
  onClass?: ClassLink | null;
  notes:  string | null;
  repeat: RepeatConfig | null;
  // Work: before or after each class of this title ("1 day before each GEOS215 lecture"), kept in
  // step by services/repeatFollow.ts. Negative: days before.
  follow: { title: string; offsetDays: number } | null;
}

// The Type field a Work item's worth is kept in (the University Types' Assessment has it).
export const WORTH_FIELD = 'weight';
export const worthOf = (d: Pick<SubjectItemDraft, 'typeFields'>): number | null => (typeof d.typeFields[WORTH_FIELD] === 'number' ? d.typeFields[WORTH_FIELD] as number : null);

const notTaken = <T extends { seriesId: string | null; archivedAt: string | null }>(x: T) => !x.seriesId && !x.archivedAt;
const weekday = (e: CalendarEvent) => e.repeat?.daysOfWeek?.[0] ?? new Date(e.date + 'T00:00:00').getDay();
const mondayFirst = (d: number) => (d + 6) % 7;

// Its Schedule list: the events filed directly under it (not dates taken out of a series): what
// repeats first, by weekday and time, then the one-offs by date.
export function scheduleListOf(id: string, events: Record<string, CalendarEvent>): CalendarEvent[] {
  return Object.values(events)
    .filter((e) => e.collectionId === id && notTaken(e))
    .sort((a, b) => Number(!a.repeat) - Number(!b.repeat)
      || (a.repeat && b.repeat ? mondayFirst(weekday(a)) - mondayFirst(weekday(b)) : a.date.localeCompare(b.date))
      || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title));
}

// Its Work list: its Deadlines (not a task's own), what repeats first, then by date.
export function workListOf(id: string, deadlines: Record<string, CalendarDeadline>): CalendarDeadline[] {
  return Object.values(deadlines)
    .filter((d) => d.collectionId === id && d.deadlineType !== 'task' && notTaken(d))
    .sort((a, b) => Number(!a.repeat) - Number(!b.repeat) || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

// An Endeavour made from the Subject template (its Work takes its period, below).
export const isSubject = (c: Collection | undefined): boolean => c?.templateId === 'subject';

// What a subject's repeating Work is bounded by: its period (its own, or the semester's, live),
// ending with it and skipping its breaks, as its Schedule's classes are.
export function workBounds(subjectId: string, collections: Record<string, Collection>): ScheduleBounds {
  const period = effectivePeriod(subjectId, collections)?.period ?? null;
  return { start: period?.start ?? null, end: period?.end ?? null, breaks: breakDates(period) };
}

// Work the bounds apply to: a repeating Deadline of its own (not following the classes, which are
// bounded already; not a task's; not a date taken out of a series).
export function isBoundedWork(d: CalendarDeadline, collections: Record<string, Collection>): boolean {
  return !!d.repeat && !d.repeat.follows && d.deadlineType !== 'task' && !d.seriesId && !d.archivedAt
    && !!d.collectionId && isSubject(collections[d.collectionId]);
}

// The classes Work can follow: each repeating Schedule item's title, once.
export function classTitles(schedule: CalendarEvent[]): string[] {
  return [...new Set(schedule.filter((e) => e.repeat && !e.repeat.follows).map((e) => e.title))];
}
export function followIdsFor(title: string, schedule: CalendarEvent[]): string[] {
  return schedule.filter((e) => e.repeat && !e.repeat.follows && e.title === title).map((e) => e.id);
}

export function draftFromEvent(e: CalendarEvent): SubjectItemDraft {
  return {
    kind: 'schedule', title: e.title, typeId: e.typeId ?? null, date: e.date, start: e.startTime, end: e.endTime,
    place: e.location, typeFields: { ...(e.typeFields ?? {}) }, notes: e.notes, repeat: e.repeat, follow: null, onClass: e.onClass,
  };
}

export function draftFromDeadline(d: CalendarDeadline, events: Record<string, CalendarEvent>): SubjectItemDraft {
  const follows = d.repeat?.follows;
  const followed = follows ? events[follows.ids[0]]?.title : undefined;
  return {
    kind: 'work', title: d.title, typeId: d.typeId ?? null, date: d.date, start: d.time, end: null, place: null,
    typeFields: { ...(d.typeFields ?? {}) }, notes: d.notes, repeat: d.repeat, onClass: d.onClass,
    follow: follows && followed ? { title: followed, offsetDays: follows.offsetDays } : null,
  };
}

export function blankDraft(kind: SubjectItemKind, date: string): SubjectItemDraft {
  return { kind, title: '', typeId: null, date, start: null, end: null, place: null, typeFields: {}, notes: null, repeat: null, follow: null };
}

// The first date on or after `from` that falls on `day` (0 = Sunday).
export function firstWeekdayOn(from: string, day: number): string {
  const gap = (day - new Date(from + 'T00:00:00').getDay() + 7) % 7;
  return addDaysToIso(from, gap);
}

// A subject's short name for its items' titles: its code when its name starts with one
// ("GEOS215 Climate Systems" → "GEOS215"), else its name.
export function subjectShort(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /\d/.test(first) ? first : name.trim();
}

const weekly = (day: number): RepeatConfig => ({ freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [day] });

// What a course outline adds to a subject: its regular classes (weekly from `start`), one-off
// classes, assessments (with their Type and weight) and, when it mentions readings, a reading the
// day before each lecture. Classes first, so the reading has its lectures to follow.
export function outlineDrafts(o: CourseOutline, short: string, start: string, typeIdOf: (name: string) => ItemTypeId | null): SubjectItemDraft[] {
  const classTitle = (type: string) => `${short} ${type.toLowerCase()}`;
  const classes = o.classes.map((c): SubjectItemDraft => ({
    ...blankDraft('schedule', firstWeekdayOn(start, c.day)), title: classTitle(c.type), typeId: typeIdOf(c.type),
    start: c.start, end: c.end, place: c.location, repeat: weekly(c.day),
  }));
  const oneOffs = o.oneOffs.map((c): SubjectItemDraft => ({
    ...blankDraft('schedule', c.date), title: `${short} ${c.title}`, typeId: typeIdOf(c.type), start: c.start, end: c.end, place: c.location,
  }));
  const assessments = o.assessments.map((a): SubjectItemDraft => ({
    ...blankDraft('work', a.date), title: a.title, typeId: typeIdOf(a.typeName), typeFields: a.weight !== null ? { [WORTH_FIELD]: a.weight } : {},
  }));
  const reading: SubjectItemDraft[] = o.readings && o.classes.some((c) => c.type === 'Lecture')
    ? [{ ...blankDraft('work', start), title: 'Reading', typeId: typeIdOf('Reading'), follow: { title: classTitle('Lecture'), offsetDays: -1 } }]
    : [];
  return [...classes, ...oneOffs, ...assessments, ...reading];
}
