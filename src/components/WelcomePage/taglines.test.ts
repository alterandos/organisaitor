import { describe, expect, it } from 'vitest';
import { pickTagline, RECENT } from './taglines';

// A seeded random, so the counts below are the same on every run.
function seeded(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

describe('pickTagline (the welcome page)', () => {
  it('never shows the same tagline twice in a row', () => {
    const random = seeded(1);
    const shown = [0];
    for (let i = 0; i < 500; i++) {
      const next = pickTagline(14, shown, random);
      expect(next).not.toBe(shown[shown.length - 1]);
      shown.push(next);
    }
  });

  it('leans hard away from the last five shown, without ruling them out', () => {
    const random = seeded(7);
    const recent = [0, 1, 2, 3, 4];
    const counts = new Array(14).fill(0);
    for (let i = 0; i < 20000; i++) counts[pickTagline(14, recent, random)]++;
    expect(counts[4]).toBe(0);                                  // the one showing now
    const recentShare = counts.slice(0, 4).reduce((a, b) => a + b, 0) / 20000;
    expect(recentShare).toBeGreaterThan(0);
    expect(recentShare).toBeLessThan(0.08);                     // 4 × 0.1 of 9.4 ≈ 4%
    expect(counts.slice(5).every((c) => c > 1500)).toBe(true);  // the fresh ones, about evenly
  });

  it('only the last RECENT turns count as recent', () => {
    const random = () => 0;                                     // picks the first allowed with weight
    expect(RECENT).toBe(5);
    // 0 was shown six turns ago: it counts as fresh again, so a zero draw picks it.
    expect(pickTagline(14, [0, 1, 2, 3, 4, 5], random)).toBe(0);
  });

  it('copes with one tagline, or none', () => {
    expect(pickTagline(1, [0])).toBe(0);
    expect(pickTagline(0, [])).toBe(0);
  });
});
