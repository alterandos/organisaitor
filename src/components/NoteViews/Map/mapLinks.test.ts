import { describe, expect, it } from 'vitest';
import { curvePath, dotScale, standInLinks, strokeAt } from './mapLinks';

describe('keeping the Map clear (mapLinks)', () => {
  it('icons scale with the map up to 1×, then hold their size on screen (smaller next to the blobs)', () => {
    expect(dotScale(0.5)).toBe(1);
    expect(dotScale(1)).toBe(1);
    expect(dotScale(2)).toBe(0.5);
    expect(dotScale(2) * 2).toBe(1);   // the same size on screen as at 1×
    expect(dotScale(100)).toBe(0.15);
    expect(strokeAt(1, 2)).toBe(0.5);
  });

  it('links attach to what stands in for their ends: same pair, one link; same stand-in, none', () => {
    const blobOf: Record<string, string> = { 'note:a1': 'blob:A', 'note:a2': 'blob:A', 'note:b1': 'blob:B', 'note:c1': 'note:c1', 'task:t': 'task:t' };
    const out = standInLinks([
      { id: '1', from: 'note:a1', to: 'note:b1', weight: 1, kind: 'note' },
      { id: '2', from: 'note:b1', to: 'note:a2', weight: 2, kind: 'note' },
      { id: '3', from: 'note:a1', to: 'note:a2', weight: 1, kind: 'note' },
      { id: '4', from: 'note:c1', to: 'task:t', weight: 1, kind: 'item' },
      { id: '5', from: 'note:gone', to: 'note:a1', weight: 1, kind: 'note' },
    ], (k) => blobOf[k]);
    expect(out).toEqual([
      { id: 'bundle:blob:A|blob:B', from: 'blob:A', to: 'blob:B', weight: 3, count: 2, bundle: true },
      { id: '4', from: 'note:c1', to: 'task:t', weight: 1, count: 1, bundle: false },
    ]);
  });

  it('a curve trimmed to the blob edges at both ends', () => {
    expect(curvePath(0, 0, 100, 0, 10, 20, 0)).toBe('M10,0 Q45,0 80,0');
    expect(curvePath(0, 0, 10, 0, 50, 50, 0)).toBe('M5,0 Q5,0 5,0');
  });
});
