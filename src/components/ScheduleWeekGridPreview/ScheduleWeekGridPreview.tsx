import { useMemo, useRef } from 'react';
import {
  buildHourLayout, layoutDayTimeGrid, timeToMinutes, markActiveHours,
  yToMinutes, snapMinutes, minutesToY, MIN_BLOCK_HEIGHT, type TimeGridEntry,
} from '@/utils/timeGrid';
import { formatTime } from '@/utils/date';
import { useSettingsStore } from '@/store/settingsStore';
import { useTimeGridDrag } from '@/hooks/useTimeGridDrag';
import styles from './ScheduleWeekGridPreview.module.css';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    const minutesToTimeStr = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (result.startMin !== timeToMinutes(entry.startTime)) patch.startTime = minutesToTimeStr(result.startMin);
    if (result.endMin !== timeToMinutes(entry.endTime)) patch.endTime = minutesToTimeStr(result.endMin);
    onBlockChange(parsed.blockKey, patch);
  };

  const { preview: dragPreview, startMove, startResize, consumeSuppressedClick } = useTimeGridDrag(handleDragCommit);

  const handleClick = (day: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCellClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    onCellClick(day, snapMinutes(yToMinutes(y, grid.layout)));
  };

  const draggedEntry = dragPreview ? entries.find((e) => e.key === parseDragKey(dragPreview.key)?.blockKey) ?? null : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        <div className={styles.gutter}>
          <div className={styles.dayHeader} />
          <div className={styles.gutterBody} style={{ height: grid.layout.total }}>
            {grid.layout.offsets.map((top, h) => (
              <div key={h} className={styles.gutterLabel} style={{ top }}>
                {formatTime(`${String(h).padStart(2, '0')}:00`, clockFormat)}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.daysRow} ref={daysRowRef}>
          {DAY_NAMES.map((dayName, day) => (
            <div key={day} className={styles.dayCol}>
              <div className={styles.dayHeader}>{dayName}</div>
              <div
                className={`${styles.dayBody} ${onCellClick ? styles.dayBodyClickable : ''}`}
                style={{ height: grid.layout.total }}
                onClick={(e) => handleClick(day, e)}
              >
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
                      className={`${styles.block} ${dragKey ? styles.blockDraggable : ''}`}
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
