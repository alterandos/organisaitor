import { useMemo, useRef, useState } from 'react';
import {
  buildHourLayout, layoutDayTimeGrid, timeToMinutes, markActiveHours,
  yToMinutes, minutesToY, MIN_BLOCK_HEIGHT, type TimeGridEntry,
} from '@/utils/timeGrid';
import { formatTime } from '@/utils/date';
import { useSettingsStore } from '@/store/settingsStore';
import { useTimeGridDrag } from '@/hooks/useTimeGridDrag';
import styles from './ScheduleWeekGridPreview.module.css';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CELL_MINUTES = 30;

// What the pointer is over (the user, 2026-11-07, in place of a crosshair cursor): a half-hour cell,
// or a block. Its day's column and its time's row are shaded lightly, the cell or block itself more.
interface Hover { day: number; start: number; end: number; block: boolean }

export interface PreviewEntry {
  key:        string;
  title:      string;
  daysOfWeek: number[];
  startTime:  string;
  endTime:    string;
  color:      string | null;
  groupLabel?: string; // shown in the hover title, e.g. the parent schedule's name
}

interface Props {
  entries: PreviewEntry[];
  // If provided, clicking an empty area of a day column calls this with the day (0=Sun) and a
  // half-hour-snapped start minute-of-day — the Schedule builder's "add a block by clicking
  // the calendar" entry point. Omit for a read-only preview (e.g. the schedule manager's compare view).
  onCellClick?: (day: number, minutes: number) => void;
  // If provided, clicking an existing block calls this with its `key` instead of the block
  // just swallowing the click (stopPropagation only, doing nothing) — lets a caller like
  // AddScheduleModal jump straight to that block's edit row instead of requiring the user to
  // scroll down and find it manually.
  onEntryClick?: (key: string) => void;
  // If provided, blocks become draggable — reuses the same hooks/useTimeGridDrag.ts mechanism
  // CalendarView's week/day time grids use (see CLAUDE.md "Calendar drag-to-move / resize").
  // Dragging one rendered occurrence of a block across days edits the underlying template's
  // daysOfWeek (swaps the dragged-from day for the dragged-to day, leaving its other days
  // untouched) rather than moving a single dated item, since a block IS the recurring
  // template here, not a per-occurrence record. Called with the block's `key` and only the
  // fields that changed.
  onBlockChange?: (key: string, patch: { daysOfWeek?: number[]; startTime?: string; endTime?: string }) => void;
}

// Drag keys are compounded as `${blockKey}__${originDay}` since one block renders once per day
// it's active on, and a drag needs to know *which* rendered occurrence (i.e. which origin day)
// was grabbed, not just which block — see onBlockChange's doc above.
function dragKeyFor(blockKey: string, day: number): string { return `${blockKey}__${day}`; }
const minutesToTimeStr = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function parseDragKey(key: string): { blockKey: string; originDay: number } | null {
  const match = /^(.+)__(\d)$/.exec(key);
  if (!match) return null;
  return { blockKey: match[1], originDay: Number(match[2]) };
}

export function ScheduleWeekGridPreview({ entries, onCellClick, onEntryClick, onBlockChange }: Props) {
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const grid = useMemo(() => {
    const perDayEntries: TimeGridEntry<PreviewEntry>[][] = Array.from({ length: 7 }, () => []);
    const activeHours = new Set<number>();

    for (const entry of entries) {
      const startMin = timeToMinutes(entry.startTime);
      const endMin   = timeToMinutes(entry.endTime);
      for (const day of entry.daysOfWeek) {
        perDayEntries[day].push({ item: entry, startMin, endMin });
      }
      markActiveHours(activeHours, startMin, endMin);
    }

    const layout = buildHourLayout(activeHours);
    const perDayLayout = perDayEntries.map((dayEntries) => layoutDayTimeGrid(dayEntries, layout));
    return { layout, perDayLayout };
  }, [entries]);

  const daysRowRef = useRef<HTMLDivElement>(null);

  const handleDragCommit = (key: string, result: { startMin: number; endMin: number; colIndex: number }) => {
    const parsed = parseDragKey(key);
    if (!parsed || !onBlockChange) return;
    const entry = entries.find((e) => e.key === parsed.blockKey);
    if (!entry) return;
    const patch: { daysOfWeek?: number[]; startTime?: string; endTime?: string } = {};
    if (result.colIndex !== parsed.originDay) {
      const days = new Set(entry.daysOfWeek);
      days.delete(parsed.originDay);
      days.add(result.colIndex);
      patch.daysOfWeek = [...days].sort((a, b) => a - b);
    }
    if (result.startMin !== timeToMinutes(entry.startTime)) patch.startTime = minutesToTimeStr(result.startMin);
    if (result.endMin !== timeToMinutes(entry.endTime)) patch.endTime = minutesToTimeStr(result.endMin);
    onBlockChange(parsed.blockKey, patch);
  };

  const { preview: dragPreview, startMove, startResize, consumeSuppressedClick } = useTimeGridDrag(handleDragCommit);

  const [hover, setHover] = useState<Hover | null>(null);
  // The half-hour cell under the pointer: the one shaded, and the one a click starts a block in.
  const cellAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    return Math.min(24 * 60 - CELL_MINUTES, Math.max(0, Math.floor(yToMinutes(y, grid.layout) / CELL_MINUTES) * CELL_MINUTES));
  };

  const handleClick = (day: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCellClick) return;
    onCellClick(day, cellAt(e));
  };

  const handleMove = (day: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCellClick || (e.target as HTMLElement).closest('[data-preview-block]')) return;
    const start = cellAt(e);
    if (hover && !hover.block && hover.day === day && hover.start === start) return;
    setHover({ day, start, end: start + CELL_MINUTES, block: false });
  };

  const shownHover = dragPreview ? null : hover;
  const band = (h: Hover) => {
    const top = minutesToY(h.start, grid.layout);
    return { top, height: Math.max(minutesToY(h.end, grid.layout) - top, 2) };
  };

  const draggedEntry = dragPreview ? entries.find((e) => e.key === parseDragKey(dragPreview.key)?.blockKey) ?? null : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        <div className={styles.gutter}>
          <div className={styles.dayHeader} />
          <div className={styles.gutterBody} style={{ height: grid.layout.total }}>
            {shownHover && (
              <div className={styles.gutterHover} style={band(shownHover)}>
                {formatTime(minutesToTimeStr(shownHover.start), clockFormat)}
              </div>
            )}
            {grid.layout.offsets.map((top, h) => (
              <div key={h} className={styles.gutterLabel} style={{ top }}>
                {formatTime(`${String(h).padStart(2, '0')}:00`, clockFormat)}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.daysRow} ref={daysRowRef} onMouseLeave={() => setHover(null)}>
          {DAY_NAMES.map((dayName, day) => (
            <div key={day} className={`${styles.dayCol} ${shownHover?.day === day ? styles.dayColHover : ''}`}>
              <div className={`${styles.dayHeader} ${shownHover?.day === day ? styles.dayHeaderHover : ''}`}>{dayName}</div>
              <div
                className={`${styles.dayBody} ${onCellClick ? styles.dayBodyClickable : ''}`}
                style={{ height: grid.layout.total }}
                onClick={(e) => handleClick(day, e)}
                onMouseMove={(e) => handleMove(day, e)}
              >
                {shownHover && (
                  <div className={shownHover.day === day && !shownHover.block ? styles.cellHover : styles.rowHover} style={band(shownHover)} />
                )}
                {grid.layout.offsets.slice(1).map((top, h) => (
                  <div key={h} className={styles.hourLine} style={{ top }} />
                ))}
                {grid.perDayLayout[day].map(({ item, top, height, col, totalCols }, i) => {
                  const widthPct = 100 / totalCols;
                  const dragKey  = onBlockChange ? dragKeyFor(item.key, day) : null;
                  const dragging = !!dragKey && dragPreview?.key === dragKey;
                  const liveTop    = dragging ? minutesToY(dragPreview!.startMin, grid.layout) : top;
                  const liveHeight = dragging ? Math.max(minutesToY(dragPreview!.endMin, grid.layout) - liveTop, MIN_BLOCK_HEIGHT) : height;
                  // A cross-day move renders as a ghost on the target day (below) instead of here.
                  if (dragging && dragPreview!.mode === 'move' && dragPreview!.colIndex !== day) return null;
                  return (
                    <div
                      key={i}
                      data-preview-block
                      className={`${styles.block} ${dragKey ? styles.blockDraggable : ''} ${shownHover?.block && shownHover.day === day && shownHover.start === timeToMinutes(item.startTime) && shownHover.end === timeToMinutes(item.endTime) ? styles.blockHover : ''}`}
                      onMouseEnter={() => setHover({ day, start: timeToMinutes(item.startTime), end: timeToMinutes(item.endTime), block: true })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        top: liveTop, height: liveHeight,
                        left: `${col * widthPct}%`,
                        width: `calc(${widthPct}% - 2px)`,
                        background: item.color ? `color-mix(in srgb, ${item.color} 22%, var(--color-surface))` : 'var(--color-primary-subtle)',
                        borderLeftColor: item.color ?? 'var(--color-primary)',
                        cursor: dragKey ? 'grab' : (onEntryClick ? 'pointer' : 'default'),
                      }}
                      title={item.groupLabel ? `${item.title} (${item.groupLabel})` : item.title}
                      onPointerDown={dragKey ? (e) => startMove(e, {
                        key: dragKey, startMin: timeToMinutes(item.startTime), endMin: timeToMinutes(item.endTime), colIndex: day,
                        layout: grid.layout, columnsRef: daysRowRef, columnCount: 7,
                      }) : undefined}
                      onClick={(e) => { e.stopPropagation(); if (dragKey && consumeSuppressedClick(dragKey)) return; onEntryClick?.(item.key); }}
                    >
                      {item.title}
                      {dragKey && (
                        <>
                          <span
                            className={styles.resizeTop}
                            onPointerDown={(e) => { e.stopPropagation(); startResize(e, 'start', {
                              key: dragKey, startMin: timeToMinutes(item.startTime), endMin: timeToMinutes(item.endTime), colIndex: day,
                              layout: grid.layout, columnsRef: daysRowRef, columnCount: 7,
                            }); }}
                          />
                          <span
                            className={styles.resizeBottom}
                            onPointerDown={(e) => { e.stopPropagation(); startResize(e, 'end', {
                              key: dragKey, startMin: timeToMinutes(item.startTime), endMin: timeToMinutes(item.endTime), colIndex: day,
                              layout: grid.layout, columnsRef: daysRowRef, columnCount: 7,
                            }); }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {dragPreview?.mode === 'move' && draggedEntry && (() => {
            const top = minutesToY(dragPreview.startMin, grid.layout);
            const height = Math.max(minutesToY(dragPreview.endMin, grid.layout) - top, MIN_BLOCK_HEIGHT);
            const widthPct = 100 / 7;
            return (
              <div
                className={`${styles.block} ${styles.blockGhost}`}
                style={{
                  top, height,
                  left: `${dragPreview.colIndex * widthPct}%`,
                  width: `calc(${widthPct}% - 2px)`,
                  background: draggedEntry.color ? `color-mix(in srgb, ${draggedEntry.color} 22%, var(--color-surface))` : 'var(--color-primary-subtle)',
                  borderLeftColor: draggedEntry.color ?? 'var(--color-primary)',
                }}
              >
                {draggedEntry.title}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
