import { describe, expect, it } from 'vitest';
import { selectSnapshotsToKeep, type SnapshotMeta } from '@/utils/backupRetention';

const NOW = new Date('2030-01-31T00:00:00.000Z');
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const minAgo = (n: number): string => new Date(NOW.getTime() - n * 60_000).toISOString();
const MIN = 1 / 1440;
const TARGETS = [3 * MIN, 10 * MIN, 60 * MIN, 1, 7, 14, 30];

describe('selectSnapshotsToKeep', () => {
  it('keeps nothing when there are no snapshots', () => {
    expect(selectSnapshotsToKeep([], TARGETS, NOW)).toEqual(new Set());
  });

  it('keeps the newest, and for each target the youngest snapshot at least that old', () => {
    const snapshots: SnapshotMeta[] = [
      { id: 1, createdAt: minAgo(1) },
      { id: 2, createdAt: minAgo(4) },    // ≥ 3 min
      { id: 3, createdAt: minAgo(6) },    // dropped: 2 is younger and ≥ 3 min; 4 fills 10 min
      { id: 4, createdAt: minAgo(12) },   // ≥ 10 min
      { id: 5, createdAt: minAgo(70) },   // ≥ 60 min
      { id: 6, createdAt: minAgo(200) },  // dropped
      { id: 7, createdAt: daysAgo(2) },   // ≥ 1 day
      { id: 8, createdAt: daysAgo(8) },   // ≥ 7 days
      { id: 9, createdAt: daysAgo(40) },  // ≥ 14 and ≥ 30 days
    ];
    expect(selectSnapshotsToKeep(snapshots, TARGETS, NOW)).toEqual(new Set([1, 2, 4, 5, 7, 8, 9]));
  });

  // The 2026-10-22 incident: the damage itself set off several snapshots seconds apart. They must
  // not push out the good ones from before it.
  it('a burst of new snapshots never evicts the older ones holding each slot', () => {
    const good: SnapshotMeta[] = [
      { id: 1, createdAt: minAgo(5) },
      { id: 2, createdAt: minAgo(15) },
      { id: 3, createdAt: minAgo(90) },
      { id: 4, createdAt: daysAgo(3) },
    ];
    const burst: SnapshotMeta[] = [0.05, 0.1, 0.2, 0.3].map((m, i) => ({ id: 100 + i, createdAt: minAgo(m) }));
    const kept = selectSnapshotsToKeep([...good, ...burst], TARGETS, NOW);
    for (const g of good) expect(kept.has(g.id)).toBe(true);
    expect(kept.has(100)).toBe(true);   // the newest
    expect([101, 102, 103].some((id) => kept.has(id))).toBe(false);
  });

  it('with nothing old enough for a target, the oldest snapshot fills it', () => {
    const snapshots: SnapshotMeta[] = [
      { id: 1, createdAt: minAgo(1) },
      { id: 2, createdAt: minAgo(2) },
    ];
    expect(selectSnapshotsToKeep(snapshots, TARGETS, NOW)).toEqual(new Set([1, 2]));
  });

  it('actually thins a dense run', () => {
    const snapshots: SnapshotMeta[] = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, createdAt: daysAgo(i) }));
    const kept = selectSnapshotsToKeep(snapshots, TARGETS, NOW);
    expect(kept.size).toBeLessThanOrEqual(TARGETS.length + 1);
    expect(kept.has(1)).toBe(true);
  });

  it('is independent of input order', () => {
    const snapshots: SnapshotMeta[] = [
      { id: 3, createdAt: daysAgo(14) },
      { id: 1, createdAt: daysAgo(1) },
      { id: 4, createdAt: daysAgo(30) },
      { id: 2, createdAt: daysAgo(7) },
    ];
    expect(selectSnapshotsToKeep(snapshots, [1, 7, 14, 30], NOW)).toEqual(new Set([1, 2, 3, 4]));
  });
});
