import { describe, expect, it } from 'vitest';
import {
  buildHourLayout,
  layoutDayTimeGrid,
  markActiveHours,
  minutesToY,
  snapMinutes,
  timeToMinutes,
  yToMinutes,
  HOUR_HEIGHT_ACTIVE,
  HOUR_HEIGHT_EMPTY,
  MIN_BLOCK_HEIGHT,
} from '@/utils/timeGrid';

describe('timeToMinutes', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});

describe('buildHourLayout', () => {
  it('gives active hours the full height and empty hours the collapsed height', () => {
    const layout = buildHourLayout(new Set([9, 10]));
    expect(layout.heights[9]).toBe(HOUR_HEIGHT_ACTIVE);
    expect(layout.heights[10]).toBe(HOUR_HEIGHT_ACTIVE);
    expect(layout.heights[8]).toBe(HOUR_HEIGHT_EMPTY);
    expect(layout.offsets).toHaveLength(24);
    expect(layout.total).toBe(layout.offsets[23] + layout.heights[23]);
  });

  it('offsets accumulate the preceding heights', () => {
    const layout = buildHourLayout(new Set());
    expect(layout.offsets[0]).toBe(0);
    expect(layout.offsets[1]).toBe(HOUR_HEIGHT_EMPTY);
    expect(layout.offsets[2]).toBe(HOUR_HEIGHT_EMPTY * 2);
  });
});

describe('minutesToY / yToMinutes inverse', () => {
  const layout = buildHourLayout(new Set([9]));

  it('minutesToY places the top of an active hour at its offset', () => {
    expect(minutesToY(9 * 60, layout)).toBe(layout.offsets[9]);
  });

  it('yToMinutes recovers a minute value close to what minutesToY produced', () => {
    for (const minutes of [0, 30, 9 * 60, 9 * 60 + 45, 23 * 60 + 59]) {
      const y = minutesToY(minutes, layout);
      const back = yToMinutes(y, layout);
      // Rounding to the nearest minute inside an hour band, so allow +/-1.
      expect(Math.abs(back - minutes)).toBeLessThanOrEqual(1);
    }
  });

  it('clamps minutesToY to within the 24h grid', () => {
    expect(minutesToY(-100, layout)).toBe(minutesToY(0, layout));
    expect(minutesToY(100000, layout)).toBe(minutesToY(24 * 60 - 1, layout));
  });
});

describe('snapMinutes', () => {
  it('snaps to the nearest step', () => {
    expect(snapMinutes(37, 30)).toBe(30);
    expect(snapMinutes(44, 30)).toBe(30);
    expect(snapMinutes(46, 30)).toBe(60); // Math.round rounds 1.5 up, so 45+ already tips to the next step
  });

  it('clamps within the day, leaving room for a full step at the end', () => {
    expect(snapMinutes(24 * 60 - 5, 30)).toBe(24 * 60 - 30);
    expect(snapMinutes(-10, 30)).toBe(0);
  });
});

describe('markActiveHours', () => {
  it('marks every hour an interval touches', () => {
    const hours = new Set<number>();
    markActiveHours(hours, 9 * 60 + 30, 11 * 60 + 15);
    expect([...hours].sort((a, b) => a - b)).toEqual([9, 10, 11]);
  });

  it('an interval ending exactly on the hour does not mark that hour', () => {
    const hours = new Set<number>();
    markActiveHours(hours, 9 * 60, 10 * 60);
    expect([...hours]).toEqual([9]);
  });

  it('clamps at hour 23', () => {
    const hours = new Set<number>();
    markActiveHours(hours, 23 * 60, 25 * 60);
    expect([...hours]).toEqual([23]);
  });
});

describe('layoutDayTimeGrid — overlap columns', () => {
  const layout = buildHourLayout(new Set([9, 10, 11]));

  it('non-overlapping items each get column 0 of a single-column cluster', () => {
    const items = layoutDayTimeGrid(
      [
        { item: 'a', startMin: 9 * 60, endMin: 9 * 60 + 30 },
        { item: 'b', startMin: 10 * 60, endMin: 10 * 60 + 30 },
      ],
      layout
    );
    expect(items.every((i) => i.col === 0 && i.totalCols === 1)).toBe(true);
  });

  it('two overlapping items split into two side-by-side columns', () => {
    const items = layoutDayTimeGrid(
      [
        { item: 'a', startMin: 9 * 60, endMin: 10 * 60 },
        { item: 'b', startMin: 9 * 60 + 15, endMin: 9 * 60 + 45 },
      ],
      layout
    );
    expect(items.map((i) => i.totalCols)).toEqual([2, 2]);
    expect(new Set(items.map((i) => i.col))).toEqual(new Set([0, 1]));
  });

  it('three overlapping items get three columns', () => {
    const items = layoutDayTimeGrid(
      [
        { item: 'a', startMin: 9 * 60, endMin: 10 * 60 },
        { item: 'b', startMin: 9 * 60, endMin: 10 * 60 },
        { item: 'c', startMin: 9 * 60, endMin: 10 * 60 },
      ],
      layout
    );
    expect(items[0].totalCols).toBe(3);
  });

  it('a later item that starts after an earlier one ends can reuse its column', () => {
    const items = layoutDayTimeGrid(
      [
        { item: 'a', startMin: 9 * 60, endMin: 9 * 60 + 30 },
        { item: 'b', startMin: 9 * 60, endMin: 10 * 60 },
        { item: 'c', startMin: 9 * 60 + 30, endMin: 10 * 60 },
      ],
      layout
    );
    // a and c don't overlap each other, so c can reuse a's column (0), while b (overlaps both) gets column 1.
    const byItem = Object.fromEntries(items.map((i) => [i.item, i]));
    expect(byItem.a.col).toBe(0);
    expect(byItem.c.col).toBe(0);
    expect(byItem.b.col).toBe(1);
  });

  it('enforces a minimum block height for very short items', () => {
    const items = layoutDayTimeGrid([{ item: 'a', startMin: 9 * 60, endMin: 9 * 60 + 1 }], layout);
    expect(items[0].height).toBeGreaterThanOrEqual(MIN_BLOCK_HEIGHT);
  });
});
