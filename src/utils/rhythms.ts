import type { Collection, RepeatConfig, RhythmStream, ScheduleTemplate, TickStatus, TrackerEntry } from '@/types';
import { expandRepeat } from '@/utils/recurrence';
import { expandScheduleBlock } from '@/utils/scheduleOccurrences';
import { addDaysToIso } from '@/utils/date';
import { nanoid } from 'nanoid';
import { todayIso } from '@/utils/date';
import { LEGACY_STREAM_SHOW, STREAM_KINDS } from '@/config/streamKinds';

// The rules for rhythms (docs/features/endeavours.md phase 4), pure. A rhythm is a routine with
// streams; each stream's occurrences are computed from its rule, never stored. What happened to
// one (done, skipped, not needed, its fields, its note) is a tracker entry of the rhythm, read here
// as a tick. Making and changing ticks is services/rhythms.ts.

// The keys a tick keeps in its tracker entry's `data`, beside the Type's field values (field ids
// never start with "_"). A routine's own completions (before rhythms) have none of them: they read
// as "done" on the routine's one stream, so old data needs no change.
export const TICK = { stream: '_stream', status: '_status', note: '_note' } as const;

// How far back an occurrence not dealt with counts as behind (older ones are let go quietly).
export const BEHIND_DAYS = 14;

const DAILY: RepeatConfig = { freq: 'daily', interval: 1, endKind: 'forever', count: null, until: null };

export const isRhythm = (c: Collection | undefined): c is Collection => c?.kind === 'routine';

// A routine never given streams, read as one: the routine's own name, days and id (so its earlier
// completions are this stream's ticks). Shows nowhere new.
export function legacyStream(c: Collection): RhythmStream {
  return {
    id: c.id, label: c.name, kind: 'doBy', typeId: null,
    rule: { kind: 'repeat', repeat: c.repeatConfig ?? DAILY },
    start: c.createdAt.slice(0, 10), time: null, show: LEGACY_STREAM_SHOW, notebookId: null,
  };
}

// A new stream, as the stream editor starts one: something to get done, weekly from today.
export function newStream(): RhythmStream {
  return {
    id: nanoid(8), label: '', kind: 'doBy', typeId: null,
    rule: { kind: 'repeat', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null } },
    start: todayIso(), time: null, show: { ...STREAM_KINDS.doBy.show }, notebookId: null,
  };
}

export function rhythmStreams(c: Collection): RhythmStream[] {
  return c.streams && c.streams.length > 0 ? c.streams : [legacyStream(c)];
}

const weekday = (date: string) => new Date(date + 'T00:00:00').getDay();

// The dates of a stream's occurrences in [from, to], none before its start.
export function streamDates(stream: RhythmStream, schedules: Record<string, ScheduleTemplate>, from: string, to: string): string[] {
  const lo = from > stream.start ? from : stream.start;
  if (lo > to) return [];
  if (stream.rule.kind === 'repeat') {
    const { repeat } = stream.rule;
    const dates: string[] = [];
    // The start is an occurrence unless the repeat names weekdays it isn't one of.
    const startCounts = !(repeat.freq === 'weekly' && repeat.daysOfWeek?.length && !repeat.daysOfWeek.includes(weekday(stream.start)));
    if (startCounts && stream.start >= lo && !(repeat.exceptions ?? []).includes(stream.start)) dates.push(stream.start);
    dates.push(...expandRepeat(stream.start, repeat, lo, to));
    return dates;
  }
  const { scheduleId, blockId, offsetDays, blockIds = [] } = stream.rule;
  const schedule = schedules[scheduleId];
  if (!schedule || !schedule.active) return [];
  // Every class it follows (one, or every lecture of a subject), each date once.
  const dates = new Set<string>();
  for (const block of schedule.blocks.filter((b) => b.id === blockId || blockIds.includes(b.id))) {
    for (const d of expandScheduleBlock(block, schedule, addDaysToIso(lo, -offsetDays), addDaysToIso(to, -offsetDays))) {
      const shifted = addDaysToIso(d, offsetDays);
      if (shifted >= lo && shifted <= to) dates.add(shifted);
    }
  }
  return [...dates].sort();
}

// An occurrence's time: a timetable block's start on the day itself, else the stream's own.
export function streamTime(stream: RhythmStream, schedules: Record<string, ScheduleTemplate>): string | null {
  if (stream.rule.kind === 'relative' && stream.rule.offsetDays === 0) {
    const block = schedules[stream.rule.scheduleId]?.blocks.find((b) => b.id === (stream.rule as { blockId: string }).blockId);
    return block?.startTime ?? stream.time;
  }
  return stream.time;
}

export interface Tick {
  entryId: string;
  status:  TickStatus | null;              // null: kept for its fields or note, not dealt with
  fields:  Record<string, unknown>;
  noteId:  string | null;
}

export const tickKey = (rhythmId: string, streamId: string, date: string) => `${rhythmId}|${streamId}|${date}`;

const STATUSES: ReadonlySet<string> = new Set<TickStatus>(['done', 'skipped', 'notNeeded']);

export function readTick(entry: TrackerEntry, rhythm: Collection): { streamId: string; tick: Tick } {
  const data = entry.data ?? {};
  const status = data[TICK.status];
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!k.startsWith('_')) fields[k] = v;
  return {
    streamId: typeof data[TICK.stream] === 'string' ? (data[TICK.stream] as string) : rhythm.id,
    tick: {
      entryId: entry.id,
      status: status === undefined ? 'done' : STATUSES.has(status as string) ? (status as TickStatus) : null,
      fields,
      noteId: typeof data[TICK.note] === 'string' ? (data[TICK.note] as string) : null,
    },
  };
}

// Every rhythm's ticks, by tickKey. Built once per render from the tracker entries.
export function tickIndex(entries: Record<string, TrackerEntry>, collections: Record<string, Collection>): Map<string, Tick> {
  const out = new Map<string, Tick>();
  for (const e of Object.values(entries)) {
    const rhythm = collections[e.trackerId];
    if (!isRhythm(rhythm)) continue;
    const { streamId, tick } = readTick(e, rhythm);
    out.set(tickKey(rhythm.id, streamId, e.date), tick);
  }
  return out;
}

export type OccurrenceState = TickStatus | 'behind' | 'today' | 'upcoming';

export function occurrenceState(date: string, tick: Tick | undefined, today: string): OccurrenceState {
  if (tick?.status) return tick.status;
  return date < today ? 'behind' : date === today ? 'today' : 'upcoming';
}

export const isDealtWith = (s: OccurrenceState) => s === 'done' || s === 'skipped' || s === 'notNeeded';

export interface Occurrence {
  key:    string;          // tickKey
  rhythm: Collection;
  stream: RhythmStream;
  date:   string;
  time:   string | null;
  state:  OccurrenceState;
  tick:   Tick | undefined;
}

export function rhythmOccurrences(
  rhythm: Collection, schedules: Record<string, ScheduleTemplate>, ticks: Map<string, Tick>,
  from: string, to: string, today: string,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const stream of rhythmStreams(rhythm)) {
    const time = streamTime(stream, schedules);
    for (const date of streamDates(stream, schedules, from, to)) {
      const key = tickKey(rhythm.id, stream.id, date);
      const tick = ticks.get(key);
      out.push({ key, rhythm, stream, date, time, state: occurrenceState(date, tick, today), tick });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

// Whether an occurrence shows in Tasks, by its stream's setting: near = behind, today or in the
// next two days; always = behind or in the next two weeks.
export const TASKS_NEAR_DAYS = 2;
export const TASKS_ALWAYS_DAYS = 14;

export function showsInTasks(o: Occurrence, today: string): boolean {
  if (isDealtWith(o.state) || o.stream.show.tasks === 'never') return false;
  if (o.state === 'behind') return o.date >= addDaysToIso(today, -BEHIND_DAYS);
  const ahead = o.stream.show.tasks === 'near' ? TASKS_NEAR_DAYS : TASKS_ALWAYS_DAYS;
  return o.date <= addDaysToIso(today, ahead);
}

// The Monday of a date's week (weeks run Monday to Sunday, as in RepeatConfig).
export function weekStart(date: string): string {
  const day = weekday(date);
  return addDaysToIso(date, day === 0 ? -6 : 1 - day);
}

// The board's weeks: a few behind this one and a couple ahead.
export function boardWeeks(today: string, before = 3, after = 2): string[] {
  const thisWeek = weekStart(today);
  return Array.from({ length: before + after + 1 }, (_, i) => addDaysToIso(thisWeek, (i - before) * 7));
}
