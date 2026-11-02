import { useCalendarStore, buildEvent } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useTaskStore } from '@/store/taskStore';
import { isHydrating, onLoaded } from '@/services/sync/hydrating';
import { blockToItem, boundedRepeat, COMMITTED_NOTIFY_MINUTES, itemToBlock, sameRepeat, scheduleBounds } from '@/utils/scheduleItems';
import { newCalendarEventId } from '@/utils/id';
import type { CalendarEvent, CalendarEventId, CollectionId, CreateCalendarEventInput, CreateScheduleInput, RepeatConfig, RhythmStream, ScheduleBlock, ScheduleId } from '@/types';

// Schedules rebuilt on calendar events (docs/features/endeavours.md phase 7 (c)): a Schedule's
// items are repeating events with its `scheduleId`. Everything that makes, changes or removes an
// item as a Schedule's goes through here; one occurrence is edited, skipped or moved like any
// event's ("only this one", "this and following"). Rules: utils/scheduleItems.ts.

const cal = () => useCalendarStore.getState();

export function addScheduleItem(scheduleId: ScheduleId, block: ScheduleBlock): CalendarEventId | null {
  const schedule = useScheduleStore.getState().schedules[scheduleId];
  if (!schedule) return null;
  const input = blockToItem(schedule, block, scheduleBounds(schedule, useTaskStore.getState().collections));
  return input ? cal().addEvent(input) : null;
}

// An item with any repeat (the subject editor: weekly, on a list of dates, following other events)
// or none, made as the Schedule's: filed under its Endeavour, its bounds applied when it repeats.
export function addScheduleEvent(scheduleId: ScheduleId, input: CreateCalendarEventInput): CalendarEventId | null {
  const schedule = useScheduleStore.getState().schedules[scheduleId];
  if (!schedule) return null;
  const repeat = input.repeat && !input.repeat.follows ? boundedRepeat(input.repeat, scheduleBounds(schedule, useTaskStore.getState().collections)) : input.repeat ?? null;
  return cal().addEvent({ ...input, repeat, scheduleId, collectionId: schedule.collectionId });
}

// An event changed, and made one of a Schedule's items or taken out of it (null). The bounds
// watcher applies the Schedule's period and breaks to its repeat.
export function setScheduleEvent(eventId: CalendarEventId, changes: Partial<CalendarEvent>, scheduleId: ScheduleId | null): void {
  const e = cal().events[eventId];
  if (!e) return;
  const schedule = scheduleId ? useScheduleStore.getState().schedules[scheduleId] : undefined;
  const repeat = changes.repeat === undefined ? e.repeat : changes.repeat;
  const unbounded = repeat && !schedule ? withoutBreakSkips(repeat) : repeat;
  const filing = schedule ? { scheduleId: schedule.id, collectionId: schedule.collectionId } : e.scheduleId ? { scheduleId: null } : {};
  cal().updateEvent(eventId, { ...changes, repeat: unbounded, ...filing });
}

// The break days a Schedule added, taken off again (an item leaving its Schedule).
function withoutBreakSkips(repeat: RepeatConfig): RepeatConfig {
  if (!repeat.breakSkips?.length) return repeat;
  const skips = new Set(repeat.breakSkips);
  const next: RepeatConfig = { ...repeat, exceptions: (repeat.exceptions ?? []).filter((d) => !skips.has(d)) };
  delete next.breakSkips;
  return next;
}

// The Schedule an Endeavour's classes go in: the first filed directly under it, or a new one
// (named `name`, taking the Endeavour's period) when `create` is set.
export function endeavourSchedule(collectionId: CollectionId, name: string, create: boolean): ScheduleId | null {
  const found = Object.values(useScheduleStore.getState().schedules)
    .filter((s) => s.collectionId === collectionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (found) return found.id;
  return create ? useScheduleStore.getState().addSchedule({ name, startDate: null, endDate: null, collectionId, blocks: [] }) : null;
}

// A Schedule and its items at once (the Schedule editor, templates, the agent). Returns each row's
// event, by the row's id.
export function createScheduleWithItems(input: CreateScheduleInput, blocks: ScheduleBlock[]): { id: ScheduleId; itemIds: Map<string, CalendarEventId> } {
  const id = useScheduleStore.getState().addSchedule({ ...input, blocks: [] });
  const itemIds = new Map<string, CalendarEventId>();
  for (const b of blocks) {
    const eid = addScheduleItem(id, b);
    if (eid) itemIds.set(b.id, eid);
  }
  return { id, itemIds };
}

// An item changed from its row: title, times, place, notes, going by default or not, its own skips,
// its Schedule's Endeavour, and (when they changed) its weekdays, every-N-weeks and first date. The
// break days are put back by the bounds watcher; dates taken out of it keep their place.
export function updateScheduleItem(eventId: CalendarEventId, block: ScheduleBlock): void {
  const e = cal().events[eventId];
  const schedule = e?.scheduleId ? useScheduleStore.getState().schedules[e.scheduleId] : undefined;
  if (!e || !schedule) return;
  const was = itemToBlock(e);
  const changes: Partial<CalendarEvent> = {
    title: block.title.trim() || e.title, startTime: block.startTime, endTime: block.endTime,
    location: block.location, notes: block.notes, status: block.requiresCommitment ? 'tentative' : 'confirmed',
    collectionId: schedule.collectionId,
  };
  let repeat = e.repeat;
  const days = [...block.daysOfWeek].sort((a, b) => a - b);
  if (days.length && (days.join() !== was.daysOfWeek.join() || block.interval !== was.interval || block.intervalAnchor !== e.date)) {
    const bounds = scheduleBounds(schedule, useTaskStore.getState().collections);
    const fresh = blockToItem(schedule, { ...block, daysOfWeek: days, exceptions: [] }, { ...bounds, start: block.intervalAnchor });
    if (fresh?.repeat) { changes.date = fresh.date; repeat = fresh.repeat; }
  }
  if (repeat) {
    const taken = Object.values(cal().events).filter((x) => x.seriesId === eventId && x.seriesDate).map((x) => x.seriesDate as string);
    changes.repeat = { ...repeat, exceptions: [...new Set([...block.exceptions, ...taken, ...(repeat.breakSkips ?? [])])].sort() };
  }
  cal().updateEvent(eventId, changes);
}

// A Schedule's rows written back as its items (the Schedule editor's Save, the agent): rows that are
// items are updated, new rows made, and items with no row any more deleted.
export function saveScheduleRows(id: ScheduleId, rows: ScheduleBlock[]): void {
  const existing = new Set(scheduleItemsOf(id));
  const kept = new Set(rows.map((r) => r.id));
  for (const eid of existing) if (!kept.has(eid)) cal().deleteEvent(eid as CalendarEventId);
  for (const r of rows) {
    if (existing.has(r.id)) updateScheduleItem(r.id as CalendarEventId, r);
    else addScheduleItem(id, r);
  }
}

const scheduleItemsOf = (id: ScheduleId) => Object.values(cal().events).filter((e) => e.scheduleId === id && !e.seriesId && !e.archivedAt).map((e) => e.id as string);

// One date of an item skipped, or put back (not a break day: the bounds put that back as skipped).
export function skipItemDate(eventId: CalendarEventId, date: string): void {
  cal().skipEventOccurrence(eventId, date);
}
export function unskipItemDate(eventId: CalendarEventId, date: string): void {
  const e = cal().events[eventId];
  if (e?.repeat) cal().updateEvent(eventId, { repeat: { ...e.repeat, exceptions: (e.repeat.exceptions ?? []).filter((d) => d !== date) } });
}

// Filing a Schedule under another Endeavour files its items (and dates taken out of them) there too.
export function moveSchedule(id: ScheduleId, to: CollectionId | null): void {
  useScheduleStore.getState().updateSchedule(id, { collectionId: to });
  for (const e of Object.values(cal().events)) if (e.scheduleId === id) cal().updateEvent(e.id, { collectionId: to });
}

// Deleting a Schedule deletes its items (each to the Recycling Bin), dates taken out of them included.
export function deleteScheduleWithItems(id: ScheduleId): void {
  for (const e of Object.values(cal().events)) if (e.scheduleId === id) cal().deleteEvent(e.id);
  useScheduleStore.getState().deleteSchedule(id);
}

// ── Commitment mode: going to one date of an item you don't always go to ──

// Takes that date out of the series as "only this one", confirmed, notifying shortly before.
export function commitOccurrence(eventId: CalendarEventId, date: string): CalendarEventId | null {
  const copy = cal().detachEventOccurrence(eventId, date);
  if (copy) cal().updateEvent(copy, { status: 'confirmed', notifyMode: 'before', notifyBeforeValue: COMMITTED_NOTIFY_MINUTES, notifyBeforeUnit: 'minutes' });
  return copy;
}

// Not going after all: the date goes back into the series, tentative again.
export function uncommitOccurrence(copyId: CalendarEventId): void {
  const copy = cal().events[copyId];
  const series = copy?.seriesId ? cal().events[copy.seriesId as CalendarEventId] : undefined;
  if (!copy || !series?.repeat || !copy.seriesDate) return;
  const date = copy.seriesDate;
  cal().updateEvent(series.id, { repeat: { ...series.repeat, exceptions: (series.repeat.exceptions ?? []).filter((d) => d !== date) } });
  cal().deleteEvent(copyId);
}

// "Not going" to a date by the series and the date (the agent).
export function uncommitDate(eventId: CalendarEventId, date: string): void {
  const copy = Object.values(cal().events).find((e) => e.seriesId === eventId && e.seriesDate === date);
  if (copy) uncommitOccurrence(copy.id as CalendarEventId);
}

// True for a date taken out of a commitment-mode item's series and confirmed.
export function isCommittedOccurrence(e: CalendarEvent): boolean {
  const series = e.seriesId ? cal().events[e.seriesId as CalendarEventId] : undefined;
  return !!e.scheduleId && !e.repeat && e.status === 'confirmed' && series?.status === 'tentative';
}

// ── Bounds: a Schedule's period and breaks on its items ──

let applying = false;

export function applyScheduleBounds(): void {
  const { schedules } = useScheduleStore.getState();
  const { collections } = useTaskStore.getState();
  const bounds = new Map<string, ReturnType<typeof scheduleBounds>>();
  applying = true;
  try {
    for (const e of Object.values(cal().events)) {
      if (!e.scheduleId || !e.repeat || e.repeat.follows) continue;
      const schedule = schedules[e.scheduleId];
      if (!schedule) continue;
      if (!bounds.has(schedule.id)) bounds.set(schedule.id, scheduleBounds(schedule, collections));
      const next = boundedRepeat(e.repeat, bounds.get(schedule.id)!);
      if (!sameRepeat(next, e.repeat)) cal().updateEvent(e.id, { repeat: next });
    }
  } finally {
    applying = false;
  }
}

// ── Schedules kept before phase 7: converted once, automatically (the user, 2026-10-30) ──

// Each row becomes an event with an ordinary new id (the user, 2026-10-30: only their one Schedule
// was left to convert, so no fixed-id exception), stamped with the Schedule's own time so a
// conversion never beats a real edit in the sync merge. A committed date becomes a
// confirmed copy taken out of the series; rhythm streams that followed a row follow its event.
export function convertLegacySchedules(): number {
  const legacy = Object.values(useScheduleStore.getState().schedules).filter((s) => s.blocks?.length);
  if (!legacy.length) return 0;
  const { collections } = useTaskStore.getState();
  const existing = cal().events;
  const put: CalendarEvent[] = [];
  const ids = new Map<string, string>();
  for (const s of legacy) {
    const bounds = scheduleBounds(s, collections);
    for (const b of s.blocks) {
      const input = blockToItem(s, b, bounds);
      if (!input?.repeat) continue;
      const id = newCalendarEventId();
      ids.set(`${s.id}::${b.id}`, id);
      const committed = b.requiresCommitment ? [...new Set(b.committedDates ?? [])].filter((d) => d >= input.date && !b.exceptions.includes(d)) : [];
      const repeat: RepeatConfig = { ...input.repeat, exceptions: [...new Set([...(input.repeat.exceptions ?? []), ...committed])].sort() };
      if (!existing[id]) put.push(buildEvent({ ...input, repeat }, id, s.updatedAt));
      for (const d of committed) {
        const cid = newCalendarEventId();
        if (!existing[cid]) put.push(buildEvent({
          ...input, date: d, repeat: null, seriesId: id, seriesDate: d, status: 'confirmed',
          notifyMode: 'before', notifyBeforeValue: COMMITTED_NOTIFY_MINUTES, notifyBeforeUnit: 'minutes',
        }, cid, s.updatedAt));
      }
    }
  }
  cal().putEvents(put);

  const tasks = useTaskStore.getState();
  for (const c of Object.values(tasks.collections)) {
    if (!c.streams?.some((st) => st.rule.kind === 'relative')) continue;
    const streams: RhythmStream[] = c.streams.map((st) => {
      if (st.rule.kind !== 'relative') return st;
      const rule = st.rule;
      const eventIds = [rule.blockId, ...(rule.blockIds ?? [])].map((b) => ids.get(`${rule.scheduleId}::${b}`)).filter((x): x is string => !!x);
      return eventIds.length ? { ...st, rule: { kind: 'follows' as const, eventIds, offsetDays: rule.offsetDays } } : st;
    });
    tasks.updateCollection(c.id as CollectionId, { streams });
  }

  for (const s of legacy) useScheduleStore.getState().updateSchedule(s.id, { blocks: [] });
  return put.length;
}

// Started once from App.tsx: converts now and after each sync load, and keeps every item's bounds in
// step with its Schedule's period and breaks (and its Endeavour's, inherited) as they change.
export function initSchedules(): () => void {
  convertLegacySchedules();
  applyScheduleBounds();
  const offLoaded = onLoaded(() => { convertLegacySchedules(); applyScheduleBounds(); });
  const react = () => { if (!applying && !isHydrating()) applyScheduleBounds(); };
  const offSchedules = useScheduleStore.subscribe((s, p) => { if (s.schedules !== p.schedules) react(); });
  const offCollections = useTaskStore.subscribe((s, p) => { if (s.collections !== p.collections) react(); });
  const offEvents = useCalendarStore.subscribe((s, p) => { if (s.events !== p.events) react(); });
  return () => { offLoaded(); offSchedules(); offCollections(); offEvents(); };
}
