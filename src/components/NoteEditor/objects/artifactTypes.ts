import { createElement, type ComponentType, type ReactNode } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListStore } from '@/store/listStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toggleTaskCompletion } from '@/services/taskCompletion';
import { listView } from '@/services/listSecrets';
import { isOverdue } from '@/utils/date';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import type { CalendarEvent, CalendarEventId, CrossAppRefType, ListId, RepeatConfig, TaskId } from '@/types';
import { changedDatesOf, type SeriesKind } from '@/services/calendarSeries';
import { formatObjectDay, formatObjectTimeRange, formatObjectWhen, formatRepeatRule } from './format';
import { CalendarItemBody } from './CalendarItemBody';
import { EventBody } from './EventBody';
import { endAfter, readWhenInput } from './whenInput';
import { calendarFlags, type ArtifactFlag } from './flags';
import { currentOccurrence, datedItem, occurrenceWindow, todayInZone, updateDated, type DatedItem, type DatedKind } from './calendarItems';

// What linked text in a note shows about the item it links to, live: one entry per CrossAppRefType
// a note can link to. Used by the link rendering (artifactGroups.ts: the pane's heading — kind,
// when, flags, state — and its expanded body) and the link's right-click menu, for links made by
// `\` and by Ctrl+Q alike.

export type { ArtifactFlag } from './flags';

// done — ticked off; past — an event that has ended; overdue — past its time and not done (a
// reminder, deadline or task: it still needs doing, so it stays prominent, in the warning colour).
// done and past are drawn faded (the practice of calendar and to-do apps), never struck through.
export type ArtifactState = 'open' | 'done' | 'past' | 'overdue' | 'archived';

export interface ArtifactSummary {
  title:     string;
  when:      string | null;   // "Tomorrow, 17:00" (tooltips, toasts)
  dateLabel: string | null;   // "Tomorrow" — the heading shows date and time as two clickable parts
  timeLabel: string | null;   // "17:00" / "12:00–13:00"; null = whole day (or no time)
  state:     ArtifactState;
  done:      boolean | null;  // null = this item has no done state (or it repeats)
  repeats:   boolean;
  important: boolean;
  tentative: boolean;
  // The date this summary is about: a one-off item's own; a repeating one's current occurrence
  // (currentOccurrence: the first from today on that isn't done).
  occurrence: string | null;
}

// A repeating item's dates, for the pane's list (opened from its date): a few before the current
// one and the next several, each openable, and tickable where the item has a done state.
export interface ArtifactOccurrences {
  rule:  string;   // "Every week"
  // changedId: a date taken out of the series and edited on its own (services/calendarSeries.ts) —
  // listed at the date it stands in for, labelled with its own date, opening that item.
  items: { date: string; label: string; done: boolean | null; current: boolean; past: boolean; changedId?: string }[];
}

// What a kind's Body gets: the item; the start of the second heading line (date, time, the
// options that are on, state — WhenLine) to put first in its own heading line; and onToggle,
// which collapses the pane (a click on that line's empty space, like the top bar's).
export interface ArtifactBodyProps { id: string; heading: ReactNode; onToggle: () => void }

export interface ArtifactTypeDef {
  label:      string;
  icon:       string;
  // null = the item no longer exists (deleted; it may be in the Recycling Bin).
  summarize:  (id: string, now?: Date) => ArtifactSummary | null;
  // Calls back whenever anything summarize reads may have changed.
  subscribe:  (onChange: () => void) => () => void;
  // Done / not done, for items that have it (summary.done !== null).
  toggleDone?: (id: string) => void;
  // Clicking the date or time in the heading: what was typed ("fri", "12 oct 3pm", "1-2pm", "" for
  // no time). Returns false when it isn't understood. Without it the date and time aren't editable.
  editWhen?:  (id: string, part: 'date' | 'time', raw: string) => boolean;
  // The item's on/off options (see ArtifactFlag).
  flags?:     (id: string) => ArtifactFlag[];
  // A repeating item's dates (null when it doesn't repeat), and ticking one of them.
  occurrences?:         (id: string) => ArtifactOccurrences | null;
  toggleOccurrenceDone?: (id: string, date: string) => void;
  // The expanded pane's body, under the heading: what the heading doesn't show (notes, links,
  // Endeavour, place, notifications, the options that are off), visual first, each part
  // click-to-edit. Without it the body only points to Open.
  Body?:      ComponentType<ArtifactBodyProps>;
}

const tz = () => useSettingsStore.getState().timezone;

// A whole-day item (no time) is overdue only once its day is over, not from midnight.
const pastDue = (date: string, time: string | null) => isOverdue(date, time ?? '23:59', tz());

function datedLabels(date: string, time: string | null, now?: Date, endTime: string | null = null) {
  return {
    when:      formatObjectWhen(date, time, now, endTime),
    dateLabel: formatObjectDay(date, now),
    timeLabel: time ? formatObjectTimeRange(time, endTime) : null,
  };
}

// ── Reminders and Deadlines ─────────────────────────────────────────────────

// A repeating one is shown, and ticked, at its current occurrence: ticking it moves the pane on to
// the next date, the way a recurring to-do does (the ticked one stays ticked in the list of dates).
function datedSummary(item: DatedItem, now?: Date): ArtifactSummary {
  const repeats = !!item.repeat;
  const occurrence = currentOccurrence(item);
  const done = item.doneDates.includes(occurrence);
  return {
    title:     item.title,
    ...datedLabels(occurrence, item.time, now),
    state:     item.archivedAt ? 'archived' : done ? 'done' : pastDue(occurrence, item.time) ? 'overdue' : 'open',
    done,
    repeats,
    important: item.important,
    tentative: item.status === 'tentative',
    occurrence,
  };
}

function toggleDatedOn(kind: DatedKind, id: string, date: string) {
  const item = datedItem(kind, id);
  if (!item) return;
  useCalendarStore.getState().setOccurrenceDone(kind, item.id, date, !item.doneDates.includes(date));
}

const toggleDated = (kind: DatedKind, id: string) => {
  const item = datedItem(kind, id);
  if (item) toggleDatedOn(kind, id, currentOccurrence(item));
};

function occurrencesOf(kind: SeriesKind, id: string, item: { date: string; time: string | null; repeat: RepeatConfig | null; doneDates?: string[] }, doneState: boolean): ArtifactOccurrences | null {
  if (!item.repeat) return null;
  const current = currentOccurrence(item);
  const today = todayInZone();
  const own = occurrenceWindow(item).map((date) => ({
    date,
    label:   formatObjectWhen(date, item.time),
    done:    doneState ? (item.doneDates ?? []).includes(date) : null,
    current: date === current,
    past:    date < today,
  }));
  if (own.length === 0) return { rule: formatRepeatRule(item.repeat), items: own };
  const [first, last] = [own[0].date, own[own.length - 1].date];
  const changed = changedDatesOf(kind, id)
    .filter((c) => c.seriesDate && c.seriesDate >= first && c.seriesDate <= last)
    .map((c) => {
      const time = 'startTime' in c ? c.startTime : c.time;
      const done = doneState && !c.repeat && 'doneDates' in c ? c.doneDates.includes(c.date) : null;
      return { date: c.seriesDate!, label: formatObjectWhen(c.date, time), done, current: false, past: c.date < today, changedId: c.id };
    });
  return {
    rule:  formatRepeatRule(item.repeat),
    items: [...own, ...changed].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Read the way `\` reads what's typed: "fri", "12 oct", "tomorrow 3pm" for the date (a time in it
// is taken too), "5pm" / "17:30" for the time, nothing for no time.
function editDatedWhen(kind: DatedKind, id: string, part: 'date' | 'time', raw: string): boolean {
  const text = raw.trim();
  if (part === 'time') {
    if (!text) { updateDated(kind, id, { time: null }); return true; }
    const { time } = readWhenInput(text);
    if (!time) return false;
    updateDated(kind, id, { time });
    return true;
  }
  const { date, time } = readWhenInput(text);
  if (!date) return false;
  updateDated(kind, id, { date, ...(time ? { time } : {}) });
  return true;
}

const ReminderBody = (p: ArtifactBodyProps) => createElement(CalendarItemBody, { kind: 'reminder', ...p });
const DeadlineBody = (p: ArtifactBodyProps) => createElement(CalendarItemBody, { kind: 'deadline', ...p });

const datedType = (kind: DatedKind, Body: ComponentType<ArtifactBodyProps>): ArtifactTypeDef => ({
  label:      LABELS.calendarItemKind[kind],
  icon:       ITEM_TYPE_ICON[kind],
  subscribe:  (cb) => useCalendarStore.subscribe(cb),
  summarize:  (id, now) => {
    const item = datedItem(kind, id);
    return item ? datedSummary(item, now) : null;
  },
  toggleDone: (id) => toggleDated(kind, id),
  editWhen:   (id, part, raw) => editDatedWhen(kind, id, part, raw),
  occurrences: (id) => { const item = datedItem(kind, id); return item ? occurrencesOf(kind, id, item, true) : null; },
  toggleOccurrenceDone: (id, date) => toggleDatedOn(kind, id, date),
  flags:      (id) => calendarFlags(datedItem(kind, id), (changes) => updateDated(kind, id, changes)),
  Body,
});

// ── Events ──────────────────────────────────────────────────────────────────

const eventOf = (id: string): CalendarEvent | undefined => useCalendarStore.getState().events[id as CalendarEventId];
const updateEvent = (id: string, changes: Partial<CalendarEvent>) => useCalendarStore.getState().updateEvent(id as CalendarEventId, changes);

const minutesOf = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const timeOf = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// An event's times: a range ("1-2pm") sets both; a start alone keeps the event's length (or an
// hour if it had none); nothing makes it whole-day. A date may carry times too ("fri 1-2pm").
function editEventWhen(id: string, part: 'date' | 'time', raw: string): boolean {
  const ev = eventOf(id);
  if (!ev) return false;
  const text = raw.trim();
  if (part === 'time' && !text) { updateEvent(id, { startTime: null, endTime: null }); return true; }
  const read = readWhenInput(text);
  const times = (start: string | null, end: string | null) => {
    if (!start) return {};
    if (end) return { startTime: start, endTime: end };
    const length = ev.startTime && ev.endTime ? minutesOf(ev.endTime) - minutesOf(ev.startTime) : null;
    const kept = length && length > 0 && minutesOf(start) + length < 24 * 60 ? timeOf(minutesOf(start) + length) : endAfter(start);
    return { startTime: start, endTime: kept };
  };
  if (part === 'time') {
    if (!read.time) return false;
    updateEvent(id, times(read.time, read.endTime));
    return true;
  }
  if (!read.date) return false;
  updateEvent(id, { date: read.date, ...times(read.time, read.endTime) });
  return true;
}

export const ARTIFACT_TYPES: Partial<Record<CrossAppRefType, ArtifactTypeDef>> = {
  task: {
    label:     LABELS.noteObjects.task,
    icon:      ITEM_TYPE_ICON.task,
    subscribe: (cb) => useTaskStore.subscribe(cb),
    summarize: (id, now) => {
      const t = useTaskStore.getState().tasks[id as TaskId];
      if (!t) return null;
      return {
        title:     t.title,
        ...(t.deadline ? datedLabels(t.deadline, t.deadlineTime, now) : { when: null, dateLabel: null, timeLabel: null }),
        state:     t.archived ? 'archived' : t.completed ? 'done' : t.deadline && pastDue(t.deadline, t.deadlineTime) ? 'overdue' : 'open',
        done:      t.completed,
        repeats:   false,
        important: t.priority === 'high',
        tentative: false,
        occurrence: t.deadline,
      };
    },
    toggleDone: (id) => { void toggleTaskCompletion(id as TaskId); },
  },
  event: {
    label:     LABELS.calendarItemKind.event,
    icon:      ITEM_TYPE_ICON.event,
    subscribe: (cb) => useCalendarStore.subscribe(cb),
    summarize: (id, now) => {
      const e = eventOf(id);
      if (!e) return null;
      const occurrence = currentOccurrence(e);
      return {
        title:     e.title,
        ...datedLabels(occurrence, e.startTime, now, e.endTime),
        occurrence,
        state:     e.archivedAt ? 'archived' : !e.repeat && pastDue(e.endDate ?? e.date, e.endTime ?? e.startTime) ? 'past' : 'open',
        done:      null,
        repeats:   !!e.repeat,
        important: e.important,
        tentative: e.status === 'tentative',
      };
    },
    editWhen:  editEventWhen,
    occurrences: (id) => { const e = eventOf(id); return e ? occurrencesOf('event', id, { ...e, time: e.startTime }, false) : null; },
    flags:     (id) => calendarFlags(eventOf(id), (changes) => updateEvent(id, changes)),
    Body:      EventBody,
  },
  reminder: datedType('reminder', ReminderBody),
  deadline: datedType('deadline', DeadlineBody),
  list: {
    label:     LABELS.list,
    icon:      ITEM_TYPE_ICON.list,
    subscribe: (cb) => useListStore.subscribe(cb),
    summarize: (id) => {
      const l = useListStore.getState().lists[id as ListId];
      if (!l) return null;
      return { title: listView(l).name, when: null, dateLabel: null, timeLabel: null, state: 'open', done: null, repeats: false, important: false, tentative: false, occurrence: null };
    },
  },
};

export const FALLBACK_ARTIFACT_ICON = '🔗';
