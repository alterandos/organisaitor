// Shared hourly time-grid layout math, used by CalendarView's week/day views and by the
// Schedule manager's overlay-preview grid. Hours with nothing scheduled anywhere in the
// visible range collapse to a thin row; hours with content expand to full height — see
// buildHourLayout(). Overlapping items within one column split side-by-side via
// layoutDayTimeGrid()'s greedy interval-graph colouring.

export interface TimeGridEntry<T> { item: T; startMin: number; endMin: number }
export interface TimeGridItem<T>  { item: T; top: number; height: number; col: number; totalCols: number }
export interface HourLayout       { offsets: number[]; heights: number[]; total: number; activeHours: Set<number> }

export const HOUR_HEIGHT_ACTIVE = 60;
export const HOUR_HEIGHT_EMPTY  = 18;
export const DEFAULT_EVENT_DURATION_MIN = 60;
export const DEFAULT_POINT_DURATION_MIN = 30;
export const MIN_BLOCK_HEIGHT = 20;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function buildHourLayout(activeHours: Set<number>): HourLayout {
  const offsets: number[] = [];
  const heights: number[] = [];
  let acc = 0;
  for (let h = 0; h < 24; h++) {
    offsets.push(acc);
    const height = activeHours.has(h) ? HOUR_HEIGHT_ACTIVE : HOUR_HEIGHT_EMPTY;
    heights.push(height);
    acc += height;
  }
  return { offsets, heights, total: acc, activeHours };
}

export function minutesToY(minutes: number, layout: HourLayout): number {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(clamped / 60);
  const frac = (clamped % 60) / 60;
  return layout.offsets[h] + frac * layout.heights[h];
}

// Inverse of minutesToY — given a pixel Y within the grid, returns the minute-of-day it
// corresponds to. Used to translate a click on the Schedule builder's grid into a start time.
export function yToMinutes(y: number, layout: HourLayout): number {
  for (let h = 0; h < 24; h++) {
    const top = layout.offsets[h];
    const height = layout.heights[h];
    if (y < top + height || h === 23) {
      const frac = height > 0 ? Math.max(0, Math.min(1, (y - top) / height)) : 0;
      return h * 60 + Math.round(frac * 60);
    }
  }
  return 23 * 60 + 59;
}

// Snaps a minute-of-day value to the nearest `step` minutes (default 30) — used so a click
// on the Schedule builder's grid produces a tidy start time instead of an arbitrary minute.
export function snapMinutes(minutes: number, step = 30): number {
  return Math.max(0, Math.min(24 * 60 - step, Math.round(minutes / step) * step));
}

// Greedy interval-graph colouring: overlapping items within a day split into side-by-side
// columns (like Google/Outlook week view) instead of fully overlapping each other.
export function layoutDayTimeGrid<T>(entries: TimeGridEntry<T>[], layout: HourLayout): TimeGridItem<T>[] {
  const sorted = [...entries].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result: TimeGridItem<T>[] = [];
  let cluster: TimeGridEntry<T>[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    const placed: { entry: TimeGridEntry<T>; col: number }[] = [];
    for (const entry of cluster) {
      let col = colEnds.findIndex((end) => end <= entry.startMin);
      if (col === -1) { col = colEnds.length; colEnds.push(entry.endMin); }
      else colEnds[col] = entry.endMin;
      placed.push({ entry, col });
    }
    const totalCols = colEnds.length;
    for (const { entry, col } of placed) {
      const top = minutesToY(entry.startMin, layout);
      const height = Math.max(minutesToY(entry.endMin, layout) - top, MIN_BLOCK_HEIGHT);
      result.push({ item: entry.item, top, height, col, totalCols });
    }
    cluster = [];
  };

  for (const entry of sorted) {
    if (cluster.length === 0 || entry.startMin < clusterEnd) {
      cluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.endMin);
    } else {
      flush();
      cluster = [entry];
      clusterEnd = entry.endMin;
    }
  }
  flush();
  return result;
}

// Marks every hour an entry [startMin, endMin) touches as active, in-place.
export function markActiveHours(activeHours: Set<number>, startMin: number, endMin: number): void {
  const startH = Math.floor(startMin / 60);
  const endH   = Math.floor(Math.max(startMin, endMin - 1) / 60);
  for (let h = startH; h <= Math.min(23, endH); h++) activeHours.add(h);
}
