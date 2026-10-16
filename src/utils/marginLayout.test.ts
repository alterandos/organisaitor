import { describe, expect, it } from 'vitest';
import { layoutMarginRows, spansLines } from './marginLayout';

describe('the margin column layout', () => {
  it('marks starting on the same line share a row; up to three icons, then the rest as +N', () => {
    const rows = layoutMarginRows([
      { key: 'a', top: 100, bottom: 120 }, { key: 'b', top: 102, bottom: 120 }, { key: 'c', top: 99, bottom: 160 },
      { key: 'd', top: 101, bottom: 120 }, { key: 'e', top: 200, bottom: 220 },
    ], 26);
    expect(rows).toEqual([
      { top: 99, keys: ['c', 'a', 'd'], more: ['b'] },
      { top: 200, keys: ['e'], more: [] },
    ]);
  });

  it('a row that would overlap the one above moves down', () => {
    const rows = layoutMarginRows([{ key: 'a', top: 100, bottom: 120 }, { key: 'b', top: 110, bottom: 130 }], 26);
    expect(rows.map((r) => r.top)).toEqual([100, 126]);
  });

  it('a passage over more than one line gets a bracket', () => {
    expect(spansLines({ key: 'a', top: 0, bottom: 22 }, 22)).toBe(false);
    expect(spansLines({ key: 'a', top: 0, bottom: 66 }, 22)).toBe(true);
  });
});
