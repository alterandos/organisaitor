import { useMemo } from 'react';
import {
  buildHourLayout, layoutDayTimeGrid, timeToMinutes, markActiveHours,
  yToMinutes, snapMinutes, type TimeGridEntry,
} from '@/utils/timeGrid';
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
}

export function ScheduleWeekGridPreview({ entries, onCellClick }: Props) {
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

  const handleClick = (day: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCellClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    onCellClick(day, snapMinutes(yToMinutes(y, grid.layout)));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.grid} style={{ height: grid.layout.total }}>
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
                return (
                  <div
                    key={i}
                    className={styles.block}
                    style={{
                      top, height,
                      left: `${col * widthPct}%`,
                      width: `calc(${widthPct}% - 2px)`,
                      background: item.color ? `color-mix(in srgb, ${item.color} 22%, var(--color-surface))` : 'var(--color-primary-subtle)',
                      borderLeftColor: item.color ?? 'var(--color-primary)',
                    }}
                    title={item.groupLabel ? `${item.title} (${item.groupLabel})` : item.title}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.title}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
