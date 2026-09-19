import { useState, useMemo, useEffect, useRef } from 'react';
import type { TaskId, CalendarEventId, CalendarReminderId, CollectionId, CalendarEvent, ScheduleId, EventStatus } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePlatform } from '@/hooks/usePlatform';
import { formatTime, timeAddMinutes } from '@/utils/date';
import { resolveTimezone, todayIsoInZone, utcToZonedTime } from '@/utils/timezone';
import { expandScheduleBlock } from '@/utils/scheduleOccurrences';
import { expandRepeat, isOccurrenceSkipped } from '@/utils/recurrence';
import {
  buildHourLayout, minutesToY, layoutDayTimeGrid, timeToMinutes,
  yToMinutes, snapMinutes,
  DEFAULT_EVENT_DURATION_MIN, DEFAULT_POINT_DURATION_MIN,
  type TimeGridEntry as TimeGridEntryG,
  type HourLayout,
} from '@/utils/timeGrid';
import { ScheduleOccurrencePopover } from '@/components/ScheduleOccurrencePopover/ScheduleOccurrencePopover';
import { CalendarSidePane } from '@/components/CalendarSidePane/CalendarSidePane';
import styles from './CalendarView.module.css';

// ── Types ──────────────────────────────────────────────────────────────────────

type CalDisplayItem =
  | { kind: 'task';     id: TaskId;             title: string; time: string | null; isMilestone: boolean; collectionId: CollectionId | null; completed: boolean; notes: string | null; typeIcon: string }
  | { kind: 'event';    id: CalendarEventId;    title: string; time: string | null; collectionId: CollectionId | null; notes: string | null; typeIcon: string; status: EventStatus; important: boolean; occurrenceDate: string }
  | { kind: 'reminder'; id: CalendarReminderId; title: string; time: string | null; collectionId: CollectionId | null; notes: string | null; typeIcon: string; important: boolean; occurrenceDate: string }
  | { kind: 'schedule'; id: string; scheduleId: ScheduleId; blockId: string; date: string; title: string; time: string | null; endTime: string; location: string | null; collectionId: CollectionId | null; notes: string | null; typeIcon: string; committed: boolean };

interface SpanSlot {
  eventId:      CalendarEventId;
  title:        string;
  startCol:     number;   // 1-indexed column in 7-col week grid
  colSpan:      number;
  row:          number;   // 0-indexed stacking row within spanRow
  isStart:      boolean;  // event starts in this week
  isEnd:        boolean;  // event ends in this week
  collectionId: CollectionId | null;
  status:       EventStatus;
  important:    boolean;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildCalendarDays(year: number, month: number): { date: Date; isCurrentMonth: boolean }[] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth  = new Date(year, month + 1, 0);

  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(lastOfMonth);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push({ date: new Date(cur), isCurrentMonth: cur.getMonth() === month });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function sortItems(items: CalDisplayItem[]): CalDisplayItem[] {
  const kindOrder = { event: 0, schedule: 1, task: 2, reminder: 3 } as const;
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
    if (!a.time && b.time) return 1;
    if (a.time && !b.time) return -1;
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return 0;
  });
}

function getWeekSpanSlots(weekDateStrs: string[], spanEvents: CalendarEvent[]): SpanSlot[] {
  const weekStart   = weekDateStrs[0];
  const weekEnd     = weekDateStrs[6];
  const slots: SpanSlot[] = [];
  const rowGrid: boolean[][] = [];
  const weekStartMs = new Date(weekStart + 'T00:00:00').getTime();

  for (const ev of spanEvents) {
    const evEnd = ev.endDate!;
    if (ev.date > weekEnd || evEnd < weekStart) continue;

    const clampedStart = ev.date < weekStart ? weekStart : ev.date;
    const clampedEnd   = evEnd   > weekEnd   ? weekEnd   : evEnd;

    const startIdx = Math.round((new Date(clampedStart + 'T00:00:00').getTime() - weekStartMs) / 86400000);
    const endIdx   = Math.round((new Date(clampedEnd   + 'T00:00:00').getTime() - weekStartMs) / 86400000);

    if (startIdx < 0 || endIdx > 6 || startIdx > endIdx) continue;

    let row = 0;
    while (true) {
      if (!rowGrid[row]) rowGrid[row] = new Array(7).fill(false);
      if (!rowGrid[row].slice(startIdx, endIdx + 1).some(Boolean)) break;
      row++;
    }
    if (!rowGrid[row]) rowGrid[row] = new Array(7).fill(false);
    for (let i = startIdx; i <= endIdx; i++) rowGrid[row][i] = true;

    slots.push({
      eventId:      ev.id,
      title:        ev.title,
      startCol:     startIdx + 1,
      colSpan:      endIdx - startIdx + 1,
      row,
      isStart:      ev.date >= weekStart,
      isEnd:        evEnd <= weekEnd,
      collectionId: ev.collectionId,
      status:       ev.status ?? 'confirmed',
      important:    ev.important ?? false,
    });
  }

  return slots;
}

// Week/day time-grid layout: see src/utils/timeGrid.ts for the shared, generic implementation
// (also reused by the Schedule manager's overlay-preview grid).
type TimeGridEntry = TimeGridEntryG<CalDisplayItem>;

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MAX_VISIBLE = 3;

// ── Hover tooltip ─────────────────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  title: string;
  notes: string | null;
  collectionName: string | null;
  collectionColor: string | null;
  time: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CalendarView() {
  const timezone     = useSettingsStore((s) => s.timezone);
  const effectiveZone = resolveTimezone(timezone);
  const todayIsoStr  = todayIsoInZone(effectiveZone);
  const [todayYear, todayMonth] = todayIsoStr.split('-').map(Number);

  const [year,        setYear]        = useState(todayYear);
  const [month,       setMonth]       = useState(todayMonth - 1);
  // Lifted into uiStore (calendarViewMode) rather than local state so it survives
  // switching to another app and back — CalendarView unmounts on section switch.
  const desktopMode    = useUIStore((s) => s.calendarViewMode);
  const setDesktopMode = useUIStore((s) => s.setCalendarViewMode);
  const [tooltip,     setTooltip]     = useState<TooltipState | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [dayPaneDate, setDayPaneDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayIsoStr);

  const tasks             = useTaskStore((s) => s.tasks);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const events            = useCalendarStore((s) => s.events);
  const reminders         = useCalendarStore((s) => s.reminders);
  const schedules         = useScheduleStore((s) => s.schedules);
  const [occurrencePopover, setOccurrencePopover] = useState<{ item: Extract<CalDisplayItem, { kind: 'schedule' }>; x: number; y: number } | null>(null);

  const { isAndroid }            = usePlatform();
  const openTaskPane             = useUIStore((s) => s.openTaskPane);
  const openCalendarEventPane    = useUIStore((s) => s.openCalendarEventPane);
  const openCalendarReminderPane = useUIStore((s) => s.openCalendarReminderPane);
  const showAddCalendarItem      = useUIStore((s) => s.showAddCalendarItem);
  const showCalendarQuickAdd     = useUIStore((s) => s.showCalendarQuickAdd);
  const openSchedules            = useUIStore((s) => s.openSchedules);
  const toggleSchedules          = useUIStore((s) => s.toggleSchedules);
  const activeCollectionId       = useUIStore(selectActiveCollectionId) as CollectionId | null;
  const openModal                = useUIStore((s) => s.openModal);
  const editingTaskId            = useUIStore((s) => s.editingTaskId);
  const editingCalendarEventId    = useUIStore((s) => s.editingCalendarEventId);
  const editingCalendarReminderId = useUIStore((s) => s.editingCalendarReminderId);

  const shadePastDays         = useSettingsStore((s) => s.shadePastDays);
  const shadeWeekends         = useSettingsStore((s) => s.shadeWeekends);
  const weekendShadeColor     = useSettingsStore((s) => s.weekendShadeColor);
  const strikethroughPastDays = useSettingsStore((s) => s.strikethroughPastDays);
  const clockFormat           = useSettingsStore((s) => s.clockFormat);
  const layerVisibility       = useSettingsStore((s) => s.calendarLayerVisibility);

  const days = useMemo(() => buildCalendarDays(year, month), [year, month]);

  const spanEventsArray = useMemo(
    () => Object.values(events).filter(ev => !ev.archivedAt && ev.endDate != null && ev.endDate > ev.date),
    [events]
  );

  const spanEventIds = useMemo(
    () => new Set(spanEventsArray.map(ev => ev.id)),
    [spanEventsArray]
  );

  const weekBlocks = useMemo(() => {
    const blocks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) blocks.push(days.slice(i, i + 7));
    return blocks;
  }, [days]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalDisplayItem[]>();
    const push = (date: string, item: CalDisplayItem) => {
      const list = map.get(date) ?? [];
      list.push(item);
      map.set(date, list);
    };

    const rangeStart = days.length > 0 ? toDateStr(days[0].date) : '';
    const rangeEnd   = days.length > 0 ? toDateStr(days[days.length - 1].date) : '';

    Object.values(tasks).forEach((task) => {
      if (task.archived) return;
      if (task.deadline) {
        if (!layerVisibility.taskDeadlines) return;
        if (activeCollectionId && task.collectionId !== activeCollectionId) return;
        push(task.deadline, {
          kind: 'task',
          id: task.id,
          title: task.title,
          time: task.deadlineTime,
          isMilestone: task.kind === 'milestone',
          collectionId: task.collectionId,
          completed: task.completed,
          notes: task.notes,
          // Matches TaskItem.tsx's own ❗ deadline pill, shown regardless of milestone status there too.
          typeIcon: '❗',
        });
      }
    });

    const taskLinkedEventIds = new Set(
      Object.values(tasks).map((t) => t.calendarEventId).filter((id): id is CalendarEventId => !!id)
    );

    // An archived task's shadow event is kept (restoring the task brings it back) but hidden.
    const archivedTaskEventIds = new Set(
      Object.values(tasks).filter((t) => t.archived && t.calendarEventId).map((t) => t.calendarEventId)
    );

    Object.values(events).forEach((ev) => {
      if (ev.archivedAt || archivedTaskEventIds.has(ev.id)) return;
      const isTaskEvent = (ev.eventType ?? 'default') === 'task';
      if (isTaskEvent ? !layerVisibility.taskScheduled : !layerVisibility.events) return;
      // Tentative is a filter on top of the 'events' layer, not a separate one — a task-linked
      // shadow event is never user-marked tentative, so this only ever applies to plain events.
      if (!isTaskEvent && (ev.status ?? 'confirmed') === 'tentative' && !layerVisibility.tentative) return;
      if (activeCollectionId && ev.collectionId !== activeCollectionId) return;
      const item: CalDisplayItem = {
        kind: 'event',
        id: ev.id,
        title: ev.title,
        time: ev.startTime,
        collectionId: ev.collectionId,
        notes: ev.notes,
        // Birthday takes priority in the vanishingly rare case both apply; otherwise 🕐 marks an
        // event auto-created from a task's scheduledAt (see Task.calendarEventId) so the calendar
        // reads as task-linked without changing the event's click/edit behaviour.
        typeIcon: `${ev.important ? '❗' : ''}${(ev.eventType ?? 'default') === 'birthday' ? '🎉' : taskLinkedEventIds.has(ev.id) ? '🕐' : ''}`,
        status: ev.status ?? 'confirmed',
        important: ev.important ?? false,
        occurrenceDate: ev.date,
      };

      if (ev.endDate && ev.endDate > ev.date) {
        // Multi-day event: push to all covered dates within view range
        let cur = ev.date;
        while (cur <= ev.endDate) {
          if (cur >= rangeStart && cur <= rangeEnd) push(cur, { ...item, occurrenceDate: cur });
          const d = new Date(cur + 'T00:00:00');
          d.setDate(d.getDate() + 1);
          cur = toDateStr(d);
        }
      } else {
        if (!isOccurrenceSkipped(ev.repeat, ev.date)) push(ev.date, item);
        if (ev.repeat) {
          for (const d of expandRepeat(ev.date, ev.repeat, rangeStart, rangeEnd)) push(d, { ...item, occurrenceDate: d });
        }
      }
    });

    Object.values(reminders).forEach((rem) => {
      if (rem.archivedAt) return;
      // Task-deadline-derived reminders (reminderType: 'task') are excluded here — the
      // deadline already rendered above as its own dedicated kind:'task' pill (synthesized
      // directly from the Task, so it gets live completion styling and opens TaskPane in
      // one click). This row exists only for sync + notification purposes; rendering it
      // here too would duplicate the pill.
      if (rem.reminderType === 'task') return;
      if (!layerVisibility.reminders) return;
      if (activeCollectionId && rem.collectionId !== activeCollectionId) return;
      const item: CalDisplayItem = {
        kind: 'reminder',
        id: rem.id,
        title: rem.title,
        time: rem.time,
        collectionId: rem.collectionId,
        notes: rem.notes,
        typeIcon: rem.important ? '❗' : '',
        important: rem.important ?? false,
        occurrenceDate: rem.date,
      };
      if (!isOccurrenceSkipped(rem.repeat, rem.date)) push(rem.date, item);
      if (rem.repeat) {
        for (const d of expandRepeat(rem.date, rem.repeat, rangeStart, rangeEnd)) push(d, { ...item, occurrenceDate: d });
      }
    });

    Object.values(schedules).forEach((schedule) => {
      if (!schedule.active) return;
      if (activeCollectionId && schedule.collectionId !== activeCollectionId) return;
      for (const block of schedule.blocks) {
        // Commitment mode (see ScheduleBlock.requiresCommitment, CLAUDE.md "Schedule
        // commitment mode"): a block that doesn't require commitment renders exactly as
        // before (always "committed"); one that does only counts as committed on dates the
        // user has explicitly committed to — everything else renders muted (isTentativeItem-
        // style hatch, applied at each render site below) as a heads-up to help decide.
        const requiresCommitment = block.requiresCommitment ?? false;
        const committedSet = new Set(block.committedDates ?? []);
        for (const date of expandScheduleBlock(block, schedule, rangeStart, rangeEnd)) {
          push(date, {
            kind: 'schedule',
            id: `${schedule.id}::${block.id}::${date}`,
            scheduleId: schedule.id,
            blockId: block.id,
            date,
            title: block.title,
            time: block.startTime,
            endTime: block.endTime,
            location: block.location,
            collectionId: schedule.collectionId,
            notes: block.notes,
            // A committed occurrence in commitment mode gets a distinct ✅ icon — not just the
            // hatch removal — so the state reads clearly even without relying on color/pattern.
            typeIcon: requiresCommitment && committedSet.has(date) ? '✅' : '🗓',
            committed: !requiresCommitment || committedSet.has(date),
          });
        }
      }
    });

    map.forEach((list, date) => map.set(date, sortItems(list)));
    return map;
  }, [tasks, events, reminders, schedules, activeCollectionId, days, layerVisibility]);

  // ── Mobile week strip & desktop week view ─────────────────────────────────
  const weekDays = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(sun);
      day.setDate(sun.getDate() + i);
      return day;
    });
  }, [selectedDate]);

  const weekViewDateStrs = useMemo(() => weekDays.map(toDateStr), [weekDays]);

  const weekViewSpanSlots = useMemo(
    () => getWeekSpanSlots(weekViewDateStrs, spanEventsArray),
    [weekViewDateStrs, spanEventsArray]
  );

  // Shared by both the week and day time grids (and their block renderers below) so a real
  // end time is computed exactly once per item kind — this is the single source of truth for
  // "how long does this block visually span." Previously week and day view each duplicated
  // this logic, and the day-view copy was missing the 'schedule' branch entirely, so every
  // Schedule occurrence (a recurring class/timetable block) silently fell back to the generic
  // 30-minute default in day view regardless of its real length, while week view sized it
  // correctly — a real bug, not a display-only quirk, since both views read from this value.
  const getItemEndMinutes = (item: CalDisplayItem, startMin: number): number => {
    if (item.kind === 'event') {
      const full = events[item.id];
      const explicitEnd = full?.endTime ? timeToMinutes(full.endTime) : null;
      return explicitEnd !== null && explicitEnd > startMin ? explicitEnd : startMin + DEFAULT_EVENT_DURATION_MIN;
    }
    if (item.kind === 'schedule') {
      const explicitEnd = timeToMinutes(item.endTime);
      return explicitEnd > startMin ? explicitEnd : startMin + DEFAULT_EVENT_DURATION_MIN;
    }
    return startMin + DEFAULT_POINT_DURATION_MIN;
  };

  const minutesToTimeStr = (min: number): string => {
    const clamped = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
  };

  const getItemLocation = (item: CalDisplayItem): string | null => {
    if (item.kind === 'event') return events[item.id]?.location || null;
    if (item.kind === 'schedule') return item.location;
    return null;
  };

  const weekTimeGrid = useMemo(() => {
    const perDayEntries: TimeGridEntry[][] = [];
    const perDayUntimed: CalDisplayItem[][] = [];
    const activeHours = new Set<number>();

    for (const dateStr of weekViewDateStrs) {
      const dayItems = (itemsByDate.get(dateStr) ?? []).filter(
        (item) => item.kind !== 'event' || !spanEventIds.has(item.id as CalendarEventId)
      );
      const timedEntries: TimeGridEntry[] = [];
      const untimed: CalDisplayItem[] = [];

      for (const item of dayItems) {
        if (!item.time) { untimed.push(item); continue; }
        const startMin = timeToMinutes(item.time);
        const endMin = getItemEndMinutes(item, startMin);
        timedEntries.push({ item, startMin, endMin });

        const startH = Math.floor(startMin / 60);
        const endH   = Math.floor(Math.max(startMin, endMin - 1) / 60);
        for (let h = startH; h <= Math.min(23, endH); h++) activeHours.add(h);
      }

      perDayEntries.push(timedEntries);
      perDayUntimed.push(untimed);
    }

    const layout = buildHourLayout(activeHours);
    const perDayLayout = perDayEntries.map((entries) => layoutDayTimeGrid(entries, layout));

    return { layout, perDayLayout, perDayUntimed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekViewDateStrs, itemsByDate, spanEventIds, events]);

  const weekScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (desktopMode !== 'week') return;
    const firstActive = [...weekTimeGrid.layout.activeHours].sort((a, b) => a - b)[0];
    if (firstActive === undefined) return;
    const targetTop = Math.max(0, weekTimeGrid.layout.offsets[firstActive] - 40);
    weekScrollRef.current?.scrollTo({ top: targetTop });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopMode, selectedDate]);

  // Keeps the "now" line drifting correctly while week/day view stays open.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (desktopMode !== 'week' && desktopMode !== 'day') return;
    const id = setInterval(() => setNowTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [desktopMode]);

  const weekNowY = useMemo(() => {
    if (!weekViewDateStrs.includes(todayIsoStr)) return null;
    const nowTime = utcToZonedTime(new Date(), effectiveZone).time;
    return minutesToY(timeToMinutes(nowTime), weekTimeGrid.layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekViewDateStrs, todayIsoStr, effectiveZone, weekTimeGrid.layout, nowTick]);

  // ── Day view time grid ── same hour-compression/overlap machinery as week view, scoped to
  // one day. Only computed meaningfully when the day actually has items — the empty state
  // keeps its original simple design untouched (see JSX below), so `hasAny` gates that.
  const dayTimeGrid = useMemo(() => {
    const dayItems = itemsByDate.get(selectedDate) ?? [];
    const timedEntries: TimeGridEntry[] = [];
    const untimed: CalDisplayItem[] = [];
    const activeHours = new Set<number>();

    for (const item of dayItems) {
      if (!item.time) { untimed.push(item); continue; }
      const startMin = timeToMinutes(item.time);
      const endMin = getItemEndMinutes(item, startMin);
      timedEntries.push({ item, startMin, endMin });

      const startH = Math.floor(startMin / 60);
      const endH   = Math.floor(Math.max(startMin, endMin - 1) / 60);
      for (let h = startH; h <= Math.min(23, endH); h++) activeHours.add(h);
    }

    const layout = buildHourLayout(activeHours);
    const timedLayout = layoutDayTimeGrid(timedEntries, layout);
    return { layout, timedLayout, untimed, hasAny: dayItems.length > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, itemsByDate, events]);

  const dayScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (desktopMode !== 'day' || !dayTimeGrid.hasAny) return;
    if (selectedDate === todayIsoStr) {
      // Default to "now" near the top, with ~1.5h of context above it, rather than the very top.
      const nowTime = utcToZonedTime(new Date(), effectiveZone).time;
      const targetY = minutesToY(Math.max(0, timeToMinutes(nowTime) - 90), dayTimeGrid.layout);
      dayScrollRef.current?.scrollTo({ top: targetY });
    } else {
      const firstActive = [...dayTimeGrid.layout.activeHours].sort((a, b) => a - b)[0];
      if (firstActive === undefined) return;
      dayScrollRef.current?.scrollTo({ top: Math.max(0, dayTimeGrid.layout.offsets[firstActive] - 40) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopMode, selectedDate]);

  const dayNowY = useMemo(() => {
    if (selectedDate !== todayIsoStr) return null;
    const nowTime = utcToZonedTime(new Date(), effectiveZone).time;
    return minutesToY(timeToMinutes(nowTime), dayTimeGrid.layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, todayIsoStr, effectiveZone, dayTimeGrid.layout, nowTick]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => {
    const t = todayIsoInZone(effectiveZone);
    const [y, m] = t.split('-').map(Number);
    setYear(y);
    setMonth(m - 1);
    setSelectedDate(t);
  };

  // "Go to date" (CalendarSidePane) — jumps year/month AND selectedDate together, the same
  // pair every other navigation action here already keeps in sync (see goToday/shiftWeek/
  // shiftDay below), so whichever of month/week/day view is active lands on the right
  // place: month reads year/month, week/day read selectedDate.
  const jumpToDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDate(dateStr);
  };

  // A request from elsewhere to show a particular date (e.g. clicking a note's link to an
  // event). Also runs on mount, since navigating here from another section mounts this view
  // with the request already pending.
  const pendingCalendarDate = useUIStore((s) => s.pendingCalendarDate);
  useEffect(() => {
    if (!pendingCalendarDate) return;
    jumpToDate(pendingCalendarDate);
    useUIStore.getState().clearPendingCalendarDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCalendarDate]);

  const shiftWeek = (delta: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    const str = toDateStr(d);
    setSelectedDate(str);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const shiftDay = (delta: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const str = toDateStr(d);
    setSelectedDate(str);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const desktopNavLabel = (() => {
    if (desktopMode === 'month') return `${MONTH_NAMES[month]} ${year}`;
    if (desktopMode === 'week') {
      const s = weekDays[0]; const e = weekDays[6];
      const sm = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const em = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${sm} – ${em}`;
    }
    return new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  })();

  const desktopPrev = () => {
    if (desktopMode === 'month') prevMonth();
    else if (desktopMode === 'week') shiftWeek(-1);
    else shiftDay(-1);
  };
  const desktopNext = () => {
    if (desktopMode === 'month') nextMonth();
    else if (desktopMode === 'week') shiftWeek(1);
    else shiftDay(1);
  };

  // Android: swipe left/right anywhere on the calendar body advances/retreats one period,
  // calling the exact same desktopNext()/desktopPrev() the nav arrows already call — purely a
  // new gesture trigger, not new navigation logic (docs/android/02-calendar-app.md §4). The
  // outer ~24dp of each edge is excluded from the gesture's *start* detection so this never
  // steals Android's own system back-gesture, which captures edge swipes on real devices.
  const calendarBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isAndroid) return;
    const el = calendarBodyRef.current;
    if (!el) return;
    const EDGE_EXCLUSION_PX = 24 * 2.625; // ~24dp in device px at this emulator's density
    const dragRef: { startX: number; startY: number; locked: 'h' | 'v' | null } = { startX: 0, startY: 0, locked: null };
    let active = false;

    const onTouchStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      if (x < EDGE_EXCLUSION_PX || x > window.innerWidth - EDGE_EXCLUSION_PX) { active = false; return; }
      active = true;
      dragRef.startX = x;
      dragRef.startY = e.touches[0].clientY;
      dragRef.locked = null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      const dx = e.touches[0].clientX - dragRef.startX;
      const dy = e.touches[0].clientY - dragRef.startY;
      if (dragRef.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        dragRef.locked = Math.abs(dx) > Math.abs(dy) * 2 ? 'h' : 'v';
      }
      if (dragRef.locked === 'h') e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!active || dragRef.locked !== 'h') { active = false; return; }
      const dx = e.changedTouches[0].clientX - dragRef.startX;
      if (dx > 60) desktopPrev();
      else if (dx < -60) desktopNext();
      active = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAndroid, desktopMode, year, month, selectedDate]);

  // O toggles CalendarSidePane; ← / → / PgUp / PgDn navigate to the previous/next period for
  // the current view (month/week/day); Tab cycles Month → Week → Day → Month. Scoped to this
  // component (not App.tsx's central handler) since it only makes sense while the Calendar
  // section is mounted — same precedent as ChronicleView's own arrow-key handling in the Notes
  // section. Suppressed while typing (the usual isTyping guard) or while any modal/pane that can
  // be open over the calendar is open, so e.g. Tab still moves focus normally inside
  // AddCalendarItemModal's form instead of switching views.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable;
      if (isTyping) return;
      if (openModal || editingTaskId || editingCalendarEventId || editingCalendarReminderId || dayPaneDate) return;

      if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        toggleSchedules();
        return;
      }

      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setDesktopMode(
          e.shiftKey
            ? (desktopMode === 'month' ? 'day'  : desktopMode === 'week' ? 'month' : 'week')
            : (desktopMode === 'month' ? 'week' : desktopMode === 'week' ? 'day'   : 'month')
        );
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        desktopPrev();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        desktopNext();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopMode, year, month, selectedDate, openModal, editingTaskId, editingCalendarEventId, editingCalendarReminderId, dayPaneDate, toggleSchedules]);

  const todayStr = todayIsoStr;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleItemClick = (e: React.MouseEvent, item: CalDisplayItem) => {
    e.stopPropagation();
    if (item.kind === 'task')     openTaskPane(item.id);
    if (item.kind === 'event')    openCalendarEventPane(item.id, item.occurrenceDate);
    if (item.kind === 'reminder') openCalendarReminderPane(item.id, item.occurrenceDate);
    if (item.kind === 'schedule') {
      const rect = e.currentTarget.getBoundingClientRect();
      setOccurrencePopover({ item, x: rect.left, y: rect.bottom + 4 });
    }
  };

  // Android: tapping empty calendar space opens the fast MobileCalendarQuickAdd sheet instead
  // of the full AddCalendarItemModal (docs/android/02-calendar-app.md §3.1) — same time-prefill
  // math either way, just a different (faster) destination component on mobile. Desktop's click
  // behaviour is completely unchanged.
  const openCreateAt = (dateStr: string, time?: string) => {
    if (isAndroid) showCalendarQuickAdd(dateStr, time ?? null);
    else showAddCalendarItem(dateStr, undefined, time);
  };

  // Clicking a row in the week/day time grid should prefill the time that row represents,
  // unlike clicking the heading row (date-only, see the header's own onClick above) — computed
  // from the click's pixel position via the same yToMinutes/snapMinutes helpers the Schedule
  // click-to-add-block builder uses, so a click at "the 2pm row" reliably means 14:00.
  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, dateStr: string, layout: HourLayout) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = snapMinutes(yToMinutes(y, layout));
    openCreateAt(dateStr, timeAddMinutes('00:00', minutes));
  };

  const handleItemMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, item: CalDisplayItem) => {
    if (!item.notes && !item.collectionId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const collectionColor = item.collectionId ? (collectionsRecord[item.collectionId]?.color ?? null) : null;
    setTooltip({
      x: rect.left,
      y: rect.top,
      title: item.title,
      notes: item.notes,
      collectionName: item.collectionId ? (collectionsRecord[item.collectionId]?.name ?? null) : null,
      collectionColor,
      time: item.time,
    });
  };

  // ── Style helpers ─────────────────────────────────────────────────────────
  const getCellStyle = (date: Date, dateStr: string, isCurrentMonth: boolean): React.CSSProperties => {
    const isPast    = dateStr < todayStr;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const style: React.CSSProperties = {};

    if (shadePastDays && isPast)         style.backgroundColor = 'var(--color-cal-past)';
    else if (shadeWeekends && isWeekend) style.backgroundColor = weekendShadeColor;
    else if (!isCurrentMonth)            style.backgroundColor = 'var(--color-cal-other-month)';

    if (strikethroughPastDays && isPast) {
      style.backgroundImage =
        'linear-gradient(to top left, transparent calc(50% - 10px), var(--color-cal-strikethrough) 50%, transparent calc(50% + 10px))';
    }

    return style;
  };

  // Diagonal-hatch/muted rendering for anything not yet settled: a self-created event marked
  // "tentative — not confirmed yet" (AddCalendarItemModal/CalendarEventPane's checkbox,
  // matching Outlook's own convention for tentative time), or a Schedule occurrence in
  // commitment mode that hasn't been committed to yet (ScheduleBlock.requiresCommitment —
  // see CLAUDE.md "Schedule commitment mode"). Both reuse the same visual language on
  // purpose — both mean "this is a possibility on your calendar, not yet a sure thing."
  const isTentativeItem = (item: CalDisplayItem): boolean =>
    (item.kind === 'event' && item.status === 'tentative') || (item.kind === 'schedule' && !item.committed);

  const isImportantItem = (item: CalDisplayItem): boolean =>
    (item.kind === 'event' || item.kind === 'reminder') && item.important;

  const getPillStyle = (item: CalDisplayItem): React.CSSProperties => {
    // A Schedule's own colour takes priority — it's the whole point of the "layer" model that
    // its blocks read as belonging to that schedule, regardless of any Endeavour filing.
    if (item.kind === 'schedule') {
      const scheduleColor = schedules[item.scheduleId]?.color;
      if (scheduleColor) return { borderLeft: `3px solid ${scheduleColor}` };
    }
    if (!item.collectionId) return {};
    const col = collectionsRecord[item.collectionId];
    if (!col?.color) return {};
    return { borderLeft: `3px solid ${col.color}` };
  };

  const getSpanPillStyle = (slot: SpanSlot): React.CSSProperties => {
    if (slot.collectionId) {
      const col = collectionsRecord[slot.collectionId];
      if (col?.color) return { background: col.color, color: '#fff' };
    }
    return {};
  };

  const isPastItem = (dateStr: string, time: string | null): boolean => {
    if (dateStr < todayStr) return true;
    if (dateStr === todayStr && time) {
      const nowTime = utcToZonedTime(new Date(), effectiveZone).time;
      const [nowH, nowM] = nowTime.split(':').map(Number);
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m < nowH * 60 + nowM;
    }
    return false;
  };

  return (
    <div className={styles.wrapper} onMouseLeave={() => setTooltip(null)}>

      {/* ── Mobile: week strip + day list ── */}
      <div className={styles.mobileView}>
        <div className={styles.weekHeader}>
          <button className={styles.navBtn} onClick={() => shiftWeek(-1)} aria-label="Previous week">‹</button>
          <span className={styles.weekTitle}>
            {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' – '}
            {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button className={styles.navBtn} onClick={() => shiftWeek(1)} aria-label="Next week">›</button>
        </div>

        <div className={styles.weekStrip}>
          {weekDays.map((d) => {
            const str      = toDateStr(d);
            const isToday  = str === todayStr;
            const isActive = str === selectedDate;
            const hasDot   = (itemsByDate.get(str) ?? []).length > 0;
            return (
              <button
                key={str}
                className={`${styles.weekDay} ${isActive ? styles.weekDayActive : ''}`}
                onClick={() => setSelectedDate(str)}
              >
                <span className={styles.weekDayName}>{DAY_NAMES[d.getDay()]}</span>
                <span className={`${styles.weekDayNum} ${isToday ? styles.weekDayNumToday : ''} ${isActive ? styles.weekDayNumActive : ''}`}>
                  {d.getDate()}
                </span>
                {hasDot && <span className={`${styles.weekDot} ${isActive ? styles.weekDotActive : ''}`} />}
              </button>
            );
          })}
        </div>

        <div className={styles.dayList}>
          <div className={styles.dayListHeader}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {(itemsByDate.get(selectedDate) ?? []).length === 0 ? (
            <div className={styles.dayListEmpty}>Nothing scheduled</div>
          ) : (
            (itemsByDate.get(selectedDate) ?? []).map((item) => {
              const past      = item.kind !== 'task' ? isPastItem(selectedDate, item.time) : false;
              const completed = item.kind === 'task' && item.completed;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  className={`${styles.dayListItem} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''} ${isTentativeItem(item) ? styles.calItemTentative : ''} ${isImportantItem(item) ? styles.calItemImportant : ''}`}
                  style={getPillStyle(item)}
                  onClick={(e) => handleItemClick(e, item)}
                >
                  {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                  {item.time && <span className={styles.calItemTime}>{formatTime(item.time, clockFormat)}</span>}
                  <span className={styles.dayListItemTitle}>{item.title}</span>
                </button>
              );
            })
          )}
          <button
            className={styles.dayListAddBtn}
            onClick={() => openCreateAt(selectedDate)}
          >
            + Add item
          </button>
        </div>
      </div>

      {/* ── Desktop ── */}
      <div className={styles.desktopView}>
        <CalendarSidePane
          viewMode={desktopMode}
          anchorDate={desktopMode === 'month' ? `${year}-${String(month + 1).padStart(2, '0')}-01` : selectedDate}
          onJumpToDate={jumpToDate}
        />
        <div className={styles.calendarBody} ref={calendarBodyRef}>

          {/* Unified header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <button className={styles.navBtn} onClick={desktopPrev} aria-label="Previous">‹</button>
              <h2 className={styles.monthTitle}>{desktopNavLabel}</h2>
              <button className={styles.navBtn} onClick={desktopNext} aria-label="Next">›</button>
              <button className={styles.todayBtn} onClick={goToday}>Today</button>
            </div>
            <div className={styles.viewToggle}>
              {(['month', 'week', 'day'] as const).map((m) => (
                <button
                  key={m}
                  className={`${styles.viewToggleBtn} ${desktopMode === m ? styles.viewToggleBtnActive : ''}`}
                  onClick={() => setDesktopMode(m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            {isAndroid && (
              // Desktop's trigger for this is the app-wide header hamburger (App.tsx),
              // repurposed for Calendar — but that button is hidden entirely on Android, so
              // Calendar needs its own visible trigger there. Opens the exact same
              // CalendarSidePane, which renders itself as a full-screen sheet on Android
              // rather than the desktop inline panel — see the component itself.
              <button className={styles.schedulesBtn} onClick={openSchedules} title="Layers & Schedules" aria-label="Layers & Schedules">
                ☰
              </button>
            )}
          </div>

          {/* ── Month view ── */}
          {desktopMode === 'month' && <>
            <div className={styles.dayHeaders}>
              {DAY_NAMES.map((d) => (
                <div key={d} className={styles.dayHeader}>{d}</div>
              ))}
            </div>
            <div className={styles.monthGrid}>
              {weekBlocks.map((week, wi) => {
                const weekDateStrs = week.map(({ date }) => toDateStr(date));
                const slots = getWeekSpanSlots(weekDateStrs, spanEventsArray);
                const maxRow = slots.length > 0 ? Math.max(...slots.map(s => s.row)) + 1 : 0;
                return (
                  <div key={wi} className={styles.weekBlock}>
                    {/* Date numbers — always visible at top of each week row */}
                    <div className={styles.dateNumRow}>
                      {week.map(({ date, isCurrentMonth }) => {
                        const dateStr = toDateStr(date);
                        const isToday = dateStr === todayStr;
                        return (
                          <div
                            key={dateStr}
                            className={`${styles.dateNumCell} ${!isCurrentMonth ? styles.dayCellOtherMonth : ''}`}
                            style={getCellStyle(date, dateStr, isCurrentMonth)}
                            onClick={() => openCreateAt(dateStr)}
                          >
                            <span className={`${styles.dayNum} ${isToday ? styles.dayNumToday : ''}`}>
                              {date.getDate()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Spanning event pills — below date numbers */}
                    {maxRow > 0 && (
                      <div
                        className={styles.spanRow}
                        style={{ '--span-rows': maxRow } as React.CSSProperties}
                      >
                        {slots.map(slot => (
                          <button
                            key={slot.eventId}
                            className={`${styles.spanPill} ${slot.isStart ? styles.spanPillStart : ''} ${slot.isEnd ? styles.spanPillEnd : ''} ${slot.status === 'tentative' ? styles.calItemTentative : ''} ${slot.important ? styles.calItemImportant : ''}`}
                            style={{
                              gridColumn: `${slot.startCol} / span ${slot.colSpan}`,
                              gridRow: slot.row + 1,
                              ...getSpanPillStyle(slot),
                            }}
                            onClick={(e) => { e.stopPropagation(); openCalendarEventPane(slot.eventId); }}
                          >
                            {slot.isStart && <span className={styles.spanPillTitle}>{slot.title}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Per-day events */}
                    <div className={styles.eventsRow}>
                      {week.map(({ date, isCurrentMonth }) => {
                        const dateStr  = toDateStr(date);
                        const dayItems = (itemsByDate.get(dateStr) ?? []).filter(
                          item => item.kind !== 'event' || !spanEventIds.has(item.id as CalendarEventId)
                        );
                        const overflow = dayItems.length - MAX_VISIBLE;
                        return (
                          <div
                            key={dateStr}
                            className={`${styles.eventsCell} ${!isCurrentMonth ? styles.dayCellOtherMonth : ''}`}
                            style={getCellStyle(date, dateStr, isCurrentMonth)}
                            onClick={() => openCreateAt(dateStr)}
                          >
                            {dayItems.slice(0, MAX_VISIBLE).map((item) => {
                              const past      = item.kind !== 'task' ? isPastItem(dateStr, item.time) : false;
                              const completed = item.kind === 'task' && item.completed;
                              return (
                                <button
                                  key={`${item.kind}-${item.id}`}
                                  className={`${styles.calItem} ${styles[`calItem_${item.kind === 'task' && item.isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''} ${isTentativeItem(item) ? styles.calItemTentative : ''} ${isImportantItem(item) ? styles.calItemImportant : ''}`}
                                  style={getPillStyle(item)}
                                  onClick={(e) => handleItemClick(e, item)}
                                  onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                                  onMouseLeave={() => setTooltip(null)}
                                  title=""
                                >
                                  {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                                  {item.time    && <span className={styles.calItemTime}>{formatTime(item.time, clockFormat)}</span>}
                                  <span className={styles.calItemTitle}>{item.title}</span>
                                </button>
                              );
                            })}
                            {overflow > 0 && (
                              <button className={styles.overflow} onClick={(e) => { e.stopPropagation(); setDayPaneDate(dateStr); }}>
                                +{overflow} more
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>}

          {/* ── Week view ── */}
          {desktopMode === 'week' && (
            <div className={styles.weekViewContainer}>
              <div className={styles.weekTimeHeaderRow}>
                <div className={styles.weekTimeGutterHeader} />
                {weekDays.map((d) => {
                  const dateStr   = toDateStr(d);
                  const isToday   = dateStr === todayStr;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={dateStr}
                      className={`${styles.weekViewColHeader} ${isWeekend && shadeWeekends ? styles.weekViewColWeekend : ''}`}
                      onClick={() => openCreateAt(dateStr)}
                    >
                      <span className={styles.weekViewDayName}>{DAY_NAMES[d.getDay()]}</span>
                      <span className={`${styles.weekViewDayNum} ${isToday ? styles.dayNumToday : ''}`}>
                        {d.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* All-day-ish content (multi-day spans, untimed items incl. deadlines) sits below
                  the header row, only expanding when the week actually has any — each row's own
                  gutter spacer keeps its columns aligned with the header/hourly-grid's day columns. */}
              {weekViewSpanSlots.length > 0 && (
                <div className={styles.weekSpanRowWrap}>
                  <div className={styles.weekSpanGutter} />
                  <div className={styles.weekSpanRow}>
                    {weekViewSpanSlots.map(slot => (
                      <button
                        key={slot.eventId}
                        className={`${styles.spanPill} ${slot.isStart ? styles.spanPillStart : ''} ${slot.isEnd ? styles.spanPillEnd : ''} ${slot.status === 'tentative' ? styles.calItemTentative : ''} ${slot.important ? styles.calItemImportant : ''}`}
                        style={{
                          gridColumn: `${slot.startCol} / span ${slot.colSpan}`,
                          gridRow: slot.row + 1,
                          ...getSpanPillStyle(slot),
                        }}
                        onClick={() => openCalendarEventPane(slot.eventId)}
                      >
                        {slot.isStart && <span className={styles.spanPillTitle}>{slot.title}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {weekTimeGrid.perDayUntimed.some((list) => list.length > 0) && (
                <div className={styles.weekUntimedRowWrap}>
                  <div className={styles.weekUntimedGutter} />
                  <div className={styles.weekUntimedRow}>
                    {weekViewDateStrs.map((dateStr, i) => (
                      <div key={dateStr} className={styles.weekUntimedCol}>
                        {weekTimeGrid.perDayUntimed[i].map((item) => {
                          const completed = item.kind === 'task' && item.completed;
                          return (
                            <button
                              key={`${item.kind}-${item.id}`}
                              className={`${styles.weekViewItem} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${isTentativeItem(item) ? styles.calItemTentative : ''} ${isImportantItem(item) ? styles.calItemImportant : ''}`}
                              style={getPillStyle(item)}
                              onClick={(e) => handleItemClick(e, item)}
                              onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                              onMouseLeave={() => setTooltip(null)}
                              title=""
                            >
                              {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                              <span className={styles.calItemTitle}>{item.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.weekTimeScroll} ref={weekScrollRef}>
                <div className={styles.weekTimeGridInner} style={{ height: weekTimeGrid.layout.total }}>
                  <div className={styles.weekTimeGutter}>
                    {weekTimeGrid.layout.offsets.map((top, h) => (
                      <div
                        key={`hit-${h}`}
                        className={`${styles.weekTimeRowHit} ${hoveredHour === h ? styles.weekTimeRowHitActive : ''}`}
                        style={{ top, height: weekTimeGrid.layout.heights[h] }}
                        onMouseEnter={() => setHoveredHour(h)}
                        onMouseLeave={() => setHoveredHour(null)}
                      />
                    ))}
                    {weekTimeGrid.layout.offsets.map((top, h) => (
                      <div
                        key={h}
                        className={`${styles.weekTimeGutterLabel} ${weekTimeGrid.layout.activeHours.has(h) ? styles.weekTimeGutterLabelActive : ''} ${hoveredHour === h ? styles.weekTimeGutterLabelHovered : ''}`}
                        style={{ top }}
                      >
                        <span>{formatTime(`${String(h).padStart(2, '0')}:00`, clockFormat)}</span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.weekTimeDays}>
                    {weekDays.map((d, i) => {
                      const dateStr    = weekViewDateStrs[i];
                      const isToday    = dateStr === todayStr;
                      const isWeekend  = d.getDay() === 0 || d.getDay() === 6;
                      const dayLayout  = weekTimeGrid.perDayLayout[i];
                      return (
                        <div
                          key={dateStr}
                          className={`${styles.weekTimeDayCol} ${isToday ? styles.weekViewColToday : ''} ${isWeekend && shadeWeekends ? styles.weekViewColWeekend : ''}`}
                          onClick={(e) => handleColumnClick(e, dateStr, weekTimeGrid.layout)}
                        >
                          {weekTimeGrid.layout.offsets.map((top, h) => (
                            <div
                              key={`hit-${h}`}
                              className={`${styles.weekTimeRowHit} ${hoveredHour === h ? styles.weekTimeRowHitActive : ''}`}
                              style={{ top, height: weekTimeGrid.layout.heights[h] }}
                              onMouseEnter={() => setHoveredHour(h)}
                              onMouseLeave={() => setHoveredHour(null)}
                            />
                          ))}
                          {weekTimeGrid.layout.offsets.slice(1).map((top, h) => (
                            <div key={h} className={styles.weekTimeHourLine} style={{ top }} />
                          ))}
                          {isToday && weekNowY !== null && (
                            <div className={styles.weekTimeNowLine} style={{ top: weekNowY }}>
                              <span className={styles.weekTimeNowDot} />
                            </div>
                          )}
                          {dayLayout.map(({ item, top, height, col, totalCols }) => {
                            const past      = item.kind !== 'task' ? isPastItem(dateStr, item.time) : false;
                            const completed = item.kind === 'task' && item.completed;
                            const widthPct  = 100 / totalCols;
                            const startMin  = timeToMinutes(item.time!);
                            const endMin    = getItemEndMinutes(item, startMin);
                            return (
                              <button
                                key={`${item.kind}-${item.id}`}
                                className={`${styles.weekTimeBlock} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''} ${isTentativeItem(item) ? styles.calItemTentative : ''} ${isImportantItem(item) ? styles.calItemImportant : ''}`}
                                style={{
                                  top, height,
                                  left:  `${col * widthPct}%`,
                                  width: `calc(${widthPct}% - 2px)`,
                                  ...getPillStyle(item),
                                }}
                                onClick={(e) => handleItemClick(e, item)}
                                onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                                onMouseLeave={() => setTooltip(null)}
                                title=""
                              >
                                <span className={styles.weekTimeBlockTime}>
                                  {formatTime(item.time!, clockFormat)}–{formatTime(minutesToTimeStr(endMin), clockFormat)}
                                </span>
                                <span className={styles.weekTimeBlockTitle}>{item.title}</span>
                                {getItemLocation(item) && (
                                  <span className={styles.weekTimeBlockLocation}>📍 {getItemLocation(item)}</span>
                                )}
                                {item.notes && <span className={styles.weekTimeBlockNotes}>{item.notes}</span>}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Day view ── */}
          {desktopMode === 'day' && (
            <div className={styles.dayViewContainer}>
              {!dayTimeGrid.hasAny ? (
                <div className={styles.dayViewEmptyWrap}>
                  <div className={styles.dayViewEmpty}>Nothing scheduled — click to add an item.</div>
                  <button className={styles.dayPaneAddBtn} onClick={() => openCreateAt(selectedDate)}>
                    + Add item
                  </button>
                </div>
              ) : (
                <div className={styles.dayTimeGridContainer}>
                  {dayTimeGrid.untimed.length > 0 && (
                    <div className={styles.dayUntimedRow}>
                      {dayTimeGrid.untimed.map((item) => {
                        const completed = item.kind === 'task' && item.completed;
                        return (
                          <button
                            key={`${item.kind}-${item.id}`}
                            className={`${styles.weekViewItem} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${isTentativeItem(item) ? styles.calItemTentative : ''} ${isImportantItem(item) ? styles.calItemImportant : ''}`}
                            style={getPillStyle(item)}
                            onClick={(e) => handleItemClick(e, item)}
                            onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                            <span className={styles.calItemTitle}>{item.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className={styles.dayTimeScroll} ref={dayScrollRef}>
                    <div className={styles.weekTimeGridInner} style={{ height: dayTimeGrid.layout.total }}>
                      <div className={styles.weekTimeGutter}>
                        {dayTimeGrid.layout.offsets.map((top, h) => (
                          <div
                            key={`hit-${h}`}
                            className={`${styles.weekTimeRowHit} ${hoveredHour === h ? styles.weekTimeRowHitActive : ''}`}
                            style={{ top, height: dayTimeGrid.layout.heights[h] }}
                            onMouseEnter={() => setHoveredHour(h)}
                            onMouseLeave={() => setHoveredHour(null)}
                          />
                        ))}
                        {dayTimeGrid.layout.offsets.map((top, h) => (
                          <div
                            key={h}
                            className={`${styles.weekTimeGutterLabel} ${dayTimeGrid.layout.activeHours.has(h) ? styles.weekTimeGutterLabelActive : ''} ${hoveredHour === h ? styles.weekTimeGutterLabelHovered : ''}`}
                            style={{ top }}
                          >
                            <span>{formatTime(`${String(h).padStart(2, '0')}:00`, clockFormat)}</span>
                          </div>
                        ))}
                      </div>
                      <div
                        className={styles.weekTimeDayCol}
                        style={{ flex: 1 }}
                        onClick={(e) => handleColumnClick(e, selectedDate, dayTimeGrid.layout)}
                      >
                        {dayTimeGrid.layout.offsets.map((top, h) => (
                          <div
                            key={`hit-${h}`}
                            className={`${styles.weekTimeRowHit} ${hoveredHour === h ? styles.weekTimeRowHitActive : ''}`}
                            style={{ top, height: dayTimeGrid.layout.heights[h] }}
                            onMouseEnter={() => setHoveredHour(h)}
                            onMouseLeave={() => setHoveredHour(null)}
                          />
                        ))}
                        {dayTimeGrid.layout.offsets.slice(1).map((top, h) => (
                          <div key={h} className={styles.weekTimeHourLine} style={{ top }} />
                        ))}
                        {dayNowY !== null && (
                          <div className={styles.weekTimeNowLine} style={{ top: dayNowY }}>
                            <span className={styles.weekTimeNowDot} />
                          </div>
                        )}
                        {dayTimeGrid.timedLayout.map(({ item, top, height, col, totalCols }) => {
                          const past      = item.kind !== 'task' ? isPastItem(selectedDate, item.time) : false;
                          const completed = item.kind === 'task' && item.completed;
                          const widthPct  = 100 / totalCols;
                          const startMin  = timeToMinutes(item.time!);
                          const endMin    = getItemEndMinutes(item, startMin);
                          return (
                            <button
                              key={`${item.kind}-${item.id}`}
                              className={`${styles.weekTimeBlock} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''} ${isTentativeItem(item) ? styles.calItemTentative : ''} ${isImportantItem(item) ? styles.calItemImportant : ''}`}
                              style={{
                                top, height,
                                left:  `${col * widthPct}%`,
                                width: `calc(${widthPct}% - 2px)`,
                                ...getPillStyle(item),
                              }}
                              onClick={(e) => handleItemClick(e, item)}
                              onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              <span className={styles.weekTimeBlockTime}>
                                {formatTime(item.time!, clockFormat)}–{formatTime(minutesToTimeStr(endMin), clockFormat)}
                              </span>
                              <span className={styles.weekTimeBlockTitle}>{item.title}</span>
                              {getItemLocation(item) && (
                                <span className={styles.weekTimeBlockLocation}>📍 {getItemLocation(item)}</span>
                              )}
                              {item.notes && <span className={styles.weekTimeBlockNotes}>{item.notes}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <button className={styles.dayPaneAddBtnGrid} onClick={() => openCreateAt(selectedDate)}>
                    + Add item
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Day pane (month-view overflow) */}
        {dayPaneDate && desktopMode === 'month' && (
          <>
            <div className={styles.dayPaneOverlay} onClick={() => setDayPaneDate(null)} />
            <aside className={styles.dayPane}>
              <header className={styles.dayPaneHeader}>
                <span className={styles.dayPaneTitle}>
                  {new Date(dayPaneDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                <button className={styles.dayPaneClose} onClick={() => setDayPaneDate(null)}>×</button>
              </header>
              <div className={styles.dayPaneBody}>
                {(itemsByDate.get(dayPaneDate) ?? []).map((item) => {
                  const past      = item.kind !== 'task' ? isPastItem(dayPaneDate, item.time) : false;
                  const completed = item.kind === 'task' && item.completed;
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      className={`${styles.dayPaneItem} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''} ${isTentativeItem(item) ? styles.calItemTentative : ''} ${isImportantItem(item) ? styles.calItemImportant : ''}`}
                      style={getPillStyle(item)}
                      onClick={(e) => { handleItemClick(e, item); setDayPaneDate(null); }}
                    >
                      {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                      {item.time    && <span className={styles.calItemTime}>{formatTime(item.time, clockFormat)}</span>}
                      <span>{item.title}</span>
                    </button>
                  );
                })}
                <button className={styles.dayPaneAddBtn} onClick={() => { openCreateAt(dayPaneDate!); setDayPaneDate(null); }}>
                  + Add item
                </button>
              </div>
            </aside>
          </>
        )}
      </div>{/* end desktopView */}

      {/* ── Hover tooltip ── */}
      {tooltip && (
        <div
          className={styles.hoverTooltip}
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y - 8}px`,
            transform: 'translateY(-100%)',
            ...(tooltip.collectionColor ? { borderColor: tooltip.collectionColor } : {}),
          }}
          onMouseEnter={() => setTooltip(null)}
        >
          {tooltip.collectionName && (
            <span
              className={styles.tooltipCollection}
              style={tooltip.collectionColor ? { color: tooltip.collectionColor } : undefined}
            >
              {tooltip.collectionName}
            </span>
          )}
          {tooltip.notes && (
            <span className={styles.tooltipNotes}>{tooltip.notes}</span>
          )}
        </div>
      )}

      {occurrencePopover && (
        <ScheduleOccurrencePopover
          scheduleId={occurrencePopover.item.scheduleId}
          blockId={occurrencePopover.item.blockId}
          date={occurrencePopover.item.date}
          title={occurrencePopover.item.title}
          startTime={occurrencePopover.item.time ?? occurrencePopover.item.endTime}
          endTime={occurrencePopover.item.endTime}
          location={occurrencePopover.item.location}
          x={occurrencePopover.x}
          y={occurrencePopover.y}
          onClose={() => setOccurrencePopover(null)}
        />
      )}
    </div>
  );
}
