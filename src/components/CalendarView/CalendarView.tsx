import { useState, useMemo } from 'react';
import type { TaskId, CalendarEventId, CalendarReminderId, CollectionId, RepeatConfig, CalendarEvent } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatTime } from '@/utils/date';
import styles from './CalendarView.module.css';

// ── Types ──────────────────────────────────────────────────────────────────────

type CalDisplayItem =
  | { kind: 'task';     id: TaskId;             title: string; time: string | null; isMilestone: boolean; collectionId: CollectionId | null; completed: boolean; notes: string | null; typeIcon: string }
  | { kind: 'event';    id: CalendarEventId;    title: string; time: string | null; collectionId: CollectionId | null; notes: string | null; typeIcon: string }
  | { kind: 'reminder'; id: CalendarReminderId; title: string; time: string | null; collectionId: CollectionId | null; notes: string | null; typeIcon: string };

interface SpanSlot {
  eventId:      CalendarEventId;
  title:        string;
  startCol:     number;   // 1-indexed column in 7-col week grid
  colSpan:      number;
  row:          number;   // 0-indexed stacking row within spanRow
  isStart:      boolean;  // event starts in this week
  isEnd:        boolean;  // event ends in this week
  collectionId: CollectionId | null;
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
  const kindOrder = { event: 0, task: 1, reminder: 2 } as const;
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
    });
  }

  return slots;
}

function expandRepeat(baseDateStr: string, repeat: RepeatConfig, rangeStart: string, rangeEnd: string): string[] {
  const dates: string[] = [];
  const base = new Date(baseDateStr + 'T00:00:00');
  let cur = new Date(base);
  let count = 0;
  const until = repeat.endKind === 'until' && repeat.until ? new Date(repeat.until + 'T00:00:00') : null;
  const maxCount = repeat.endKind === 'count' ? (repeat.count ?? 365) : 9999;

  while (count < maxCount) {
    const str = toDateStr(cur);
    if (str > rangeEnd) break;
    if (until && cur > until) break;
    if (str !== baseDateStr && str >= rangeStart && str <= rangeEnd) dates.push(str);

    count++;
    const next = new Date(cur);
    const n = repeat.interval;
    if      (repeat.freq === 'daily')   next.setDate(next.getDate() + n);
    else if (repeat.freq === 'weekly')  next.setDate(next.getDate() + n * 7);
    else if (repeat.freq === 'monthly') next.setMonth(next.getMonth() + n);
    else                                next.setFullYear(next.getFullYear() + n);
    if (toDateStr(next) === str) break;
    cur = next;
  }
  return dates;
}

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
  const today = new Date();
  const [year,        setYear]        = useState(today.getFullYear());
  const [month,       setMonth]       = useState(today.getMonth());
  const [desktopMode, setDesktopMode] = useState<'month' | 'week' | 'day'>('month');
  const [tooltip,     setTooltip]     = useState<TooltipState | null>(null);
  const [dayPaneDate, setDayPaneDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(toDateStr(today));

  const tasks             = useTaskStore((s) => s.tasks);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const events            = useCalendarStore((s) => s.events);
  const reminders         = useCalendarStore((s) => s.reminders);

  const openTaskPane             = useUIStore((s) => s.openTaskPane);
  const openCalendarEventPane    = useUIStore((s) => s.openCalendarEventPane);
  const openCalendarReminderPane = useUIStore((s) => s.openCalendarReminderPane);
  const showAddCalendarItem      = useUIStore((s) => s.showAddCalendarItem);
  const activeCollectionId       = useUIStore((s) => s.activeCollectionId) as CollectionId | null;

  const shadePastDays         = useSettingsStore((s) => s.shadePastDays);
  const shadeWeekends         = useSettingsStore((s) => s.shadeWeekends);
  const weekendShadeColor     = useSettingsStore((s) => s.weekendShadeColor);
  const strikethroughPastDays = useSettingsStore((s) => s.strikethroughPastDays);

  const days = useMemo(() => buildCalendarDays(year, month), [year, month]);

  const spanEventsArray = useMemo(
    () => Object.values(events).filter(ev => ev.endDate != null && ev.endDate > ev.date),
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
      if (task.deadline) {
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
          typeIcon: '',
        });
      }
    });

    Object.values(events).forEach((ev) => {
      if (activeCollectionId && ev.collectionId !== activeCollectionId) return;
      const item: CalDisplayItem = {
        kind: 'event',
        id: ev.id,
        title: ev.title,
        time: ev.startTime,
        collectionId: ev.collectionId,
        notes: ev.notes,
        typeIcon: (ev.eventType ?? 'default') === 'birthday' ? '🎉' : '',
      };

      if (ev.endDate && ev.endDate > ev.date) {
        // Multi-day event: push to all covered dates within view range
        let cur = ev.date;
        while (cur <= ev.endDate) {
          if (cur >= rangeStart && cur <= rangeEnd) push(cur, item);
          const d = new Date(cur + 'T00:00:00');
          d.setDate(d.getDate() + 1);
          cur = toDateStr(d);
        }
      } else {
        push(ev.date, item);
        if (ev.repeat) {
          for (const d of expandRepeat(ev.date, ev.repeat, rangeStart, rangeEnd)) push(d, item);
        }
      }
    });

    Object.values(reminders).forEach((rem) => {
      if (activeCollectionId && rem.collectionId !== activeCollectionId) return;
      const item: CalDisplayItem = {
        kind: 'reminder',
        id: rem.id,
        title: rem.title,
        time: rem.time,
        collectionId: rem.collectionId,
        notes: rem.notes,
        typeIcon: '',
      };
      push(rem.date, item);
      if (rem.repeat) {
        for (const d of expandRepeat(rem.date, rem.repeat, rangeStart, rangeEnd)) push(d, item);
      }
    });

    map.forEach((list, date) => map.set(date, sortItems(list)));
    return map;
  }, [tasks, events, reminders, activeCollectionId, days]);

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
    const t = toDateStr(today);
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(t);
  };

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

  const todayStr = toDateStr(today);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleItemClick = (e: React.MouseEvent, item: CalDisplayItem) => {
    e.stopPropagation();
    if (item.kind === 'task')     openTaskPane(item.id);
    if (item.kind === 'event')    openCalendarEventPane(item.id);
    if (item.kind === 'reminder') openCalendarReminderPane(item.id);
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

    if (shadePastDays && isPast)         style.backgroundColor = '#dcdce2';
    else if (shadeWeekends && isWeekend) style.backgroundColor = weekendShadeColor;
    else if (!isCurrentMonth)            style.backgroundColor = '#f9f9fa';

    if (strikethroughPastDays && isPast) {
      style.backgroundImage =
        'linear-gradient(to top left, transparent calc(50% - 10px), rgba(0,0,0,0.6) 50%, transparent calc(50% + 10px))';
    }

    return style;
  };

  const getPillStyle = (item: CalDisplayItem): React.CSSProperties => {
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
      const now = new Date();
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m < now.getHours() * 60 + now.getMinutes();
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
                  className={`${styles.dayListItem} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''}`}
                  style={getPillStyle(item)}
                  onClick={(e) => handleItemClick(e, item)}
                >
                  {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                  {item.time && <span className={styles.calItemTime}>{formatTime(item.time)}</span>}
                  <span className={styles.dayListItemTitle}>{item.title}</span>
                </button>
              );
            })
          )}
          <button
            className={styles.dayListAddBtn}
            onClick={() => showAddCalendarItem(selectedDate)}
          >
            + Add item
          </button>
        </div>
      </div>

      {/* ── Desktop ── */}
      <div className={styles.desktopView}>
        <div className={styles.calendarBody}>

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
                            onClick={() => showAddCalendarItem(dateStr)}
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
                            className={`${styles.spanPill} ${slot.isStart ? styles.spanPillStart : ''} ${slot.isEnd ? styles.spanPillEnd : ''}`}
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
                            onClick={() => showAddCalendarItem(dateStr)}
                          >
                            {dayItems.slice(0, MAX_VISIBLE).map((item) => {
                              const past      = item.kind !== 'task' ? isPastItem(dateStr, item.time) : false;
                              const completed = item.kind === 'task' && item.completed;
                              return (
                                <button
                                  key={`${item.kind}-${item.id}`}
                                  className={`${styles.calItem} ${styles[`calItem_${item.kind === 'task' && item.isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''}`}
                                  style={getPillStyle(item)}
                                  onClick={(e) => handleItemClick(e, item)}
                                  onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                                  onMouseLeave={() => setTooltip(null)}
                                  title=""
                                >
                                  {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                                  {item.time    && <span className={styles.calItemTime}>{formatTime(item.time)}</span>}
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
              {weekViewSpanSlots.length > 0 && (
                <div className={styles.weekSpanRow}>
                  {weekViewSpanSlots.map(slot => (
                    <button
                      key={slot.eventId}
                      className={`${styles.spanPill} ${slot.isStart ? styles.spanPillStart : ''} ${slot.isEnd ? styles.spanPillEnd : ''}`}
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
              )}
              <div className={styles.weekViewGrid}>
                {weekDays.map((d) => {
                  const dateStr  = toDateStr(d);
                  const isToday  = dateStr === todayStr;
                  const dayItems = (itemsByDate.get(dateStr) ?? []).filter(
                    item => item.kind !== 'event' || !spanEventIds.has(item.id as CalendarEventId)
                  );
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={dateStr}
                      className={`${styles.weekViewCol} ${isToday ? styles.weekViewColToday : ''} ${isWeekend && shadeWeekends ? styles.weekViewColWeekend : ''}`}
                    >
                      <div
                        className={styles.weekViewColHeader}
                        onClick={() => showAddCalendarItem(dateStr)}
                      >
                        <span className={styles.weekViewDayName}>{DAY_NAMES[d.getDay()]}</span>
                        <span className={`${styles.weekViewDayNum} ${isToday ? styles.dayNumToday : ''}`}>
                          {d.getDate()}
                        </span>
                      </div>
                      <div className={styles.weekViewItems}>
                        {dayItems.map((item) => {
                          const past      = item.kind !== 'task' ? isPastItem(dateStr, item.time) : false;
                          const completed = item.kind === 'task' && item.completed;
                          return (
                            <button
                              key={`${item.kind}-${item.id}`}
                              className={`${styles.weekViewItem} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''}`}
                              style={getPillStyle(item)}
                              onClick={(e) => handleItemClick(e, item)}
                              onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                              onMouseLeave={() => setTooltip(null)}
                              title=""
                            >
                              {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                              {item.time    && <span className={styles.calItemTime}>{formatTime(item.time)}</span>}
                              <span className={styles.calItemTitle}>{item.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Day view ── */}
          {desktopMode === 'day' && (
            <div className={styles.dayViewContainer}>
              {(itemsByDate.get(selectedDate) ?? []).length === 0 ? (
                <div className={styles.dayViewEmpty}>Nothing scheduled — click to add an item.</div>
              ) : (
                (itemsByDate.get(selectedDate) ?? []).map((item) => {
                  const past      = item.kind !== 'task' ? isPastItem(selectedDate, item.time) : false;
                  const completed = item.kind === 'task' && item.completed;
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      className={`${styles.dayViewItem} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''}`}
                      style={getPillStyle(item)}
                      onClick={(e) => handleItemClick(e, item)}
                      onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                      {item.time    && <span className={styles.dayViewItemTime}>{formatTime(item.time)}</span>}
                      <span className={styles.dayViewItemTitle}>{item.title}</span>
                    </button>
                  );
                })
              )}
              <button className={styles.dayPaneAddBtn} onClick={() => showAddCalendarItem(selectedDate)}>
                + Add item
              </button>
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
                      className={`${styles.dayPaneItem} ${styles[`calItem_${item.kind === 'task' && (item as { isMilestone: boolean }).isMilestone ? 'milestone' : item.kind}`]} ${completed ? styles.calItemCompleted : ''} ${past && !completed ? styles.calItemPast : ''}`}
                      style={getPillStyle(item)}
                      onClick={(e) => { handleItemClick(e, item); setDayPaneDate(null); }}
                    >
                      {item.typeIcon && <span className={styles.calItemIcon}>{item.typeIcon}</span>}
                      {item.time    && <span className={styles.calItemTime}>{formatTime(item.time)}</span>}
                      <span>{item.title}</span>
                    </button>
                  );
                })}
                <button className={styles.dayPaneAddBtn} onClick={() => { showAddCalendarItem(dayPaneDate); setDayPaneDate(null); }}>
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
    </div>
  );
}
