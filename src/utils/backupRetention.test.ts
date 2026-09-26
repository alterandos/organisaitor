import { describe, expect, it } from 'vitest';
import { selectSnapshotsToKeep, type SnapshotMeta } from '@/utils/backupRetention';

const NOW = new Date('2030-01-31T00:00:00.000Z');
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('selectSnapshotsToKeep', () => {
  it('keeps nothing when there are no snapshots', () => {
    expect(selectSnapshotsToKeep([], [1, 7, 14, 30], NOW)).toEqual(new Set());
  });

  it('with exactly one snapshot per target age, keeps every one of them', () => {
    const snapshots: SnapshotMeta[] = [
      { id: 1, createdAt: daysAgo(1) },
      { id: 2, createdAt: daysAgo(7) },
      { id: 3, createdAt: daysAgo(14) },
      { id: 4, createdAt: daysAgo(30) },
    ];
    expect(selectSnapshotsToKeep(snapshots, [1, 7, 14, 30], NOW)).toEqual(new Set([1, 2, 3, 4]));
  });

  it('always force-keeps the single most recent snapshot, even if younger than every target', () => {
    const snapshots: SnapshotMeta[] = [{ id: 1, createdAt: daysAgo(0.01) }];
    expect(selectSnapshotsToKeep(snapshots, [1, 7, 14, 30], NOW)).toEqual(new Set([1]));
  });

  it('picks the closest snapshot to each target when there are more snapshots than targets', () => {
    // Dense cluster around "1 day ago" (the realistic change-volume-triggered case — several
    // snapshots from one busy afternoon) plus one much older one.
    const snapshots: SnapshotMeta[] = [
      { id: 1, createdAt: daysAgo(0.1) },
      { id: 2, createdAt: daysAgo(0.5) },
      { id: 3, createdAt: daysAgo(0.9) }, // closest to target 1
      { id: 4, createdAt: daysAgo(20) },  // closest to target 14
    ];
    const kept = selectSnapshotsToKeep(snapshots, [1, 7, 14, 30], NOW);
    // Newest (id 1) is always force-kept. Target 1 claims id 3 (nearest, diff 0.1). Target 7
    // has only id 2 and id 4 left — id 2 (diff 6.5) is nearer than id 4 (diff 13), so it wins
    // even though it "looks like" a target-1 match too; every snapshot is closest to SOME
    // target once its nearer neighbours are already claimed. Target 14 then takes id 4 (the
    // only one left). Target 30 has nothing left to claim — with only 4 snapshots for 4
    // targets, one target inevitably goes unfilled once the newest is force-kept outside the
    // normal claiming order. All four snapshots end up kept.
    expect(kept).toEqual(new Set([1, 2, 3, 4]));
  });

  it("two targets don't fight over the same snapshot — each claims its own nearest match, closest-target-first", () => {
    const snapshots: SnapshotMeta[] = [
      { id: 1, createdAt: daysAgo(0) },
      { id: 2, createdAt: daysAgo(5) },
      { id: 3, createdAt: daysAgo(9) },
    ];
    // Target 1 → id 2 (|5-1|=4) is closer than id 3 (|9-1|=8). Target 7 processed next, id 2
    // already claimed, so it takes id 3 (|9-7|=2).
    const kept = selectSnapshotsToKeep(snapshots, [1, 7], NOW);
    expect(kept).toEqual(new Set([1, 2, 3]));
  });

  it('a target with no remaining candidates (everything already claimed) is simply left unfilled, not an error', () => {
    const snapshots: SnapshotMeta[] = [{ id: 1, createdAt: daysAgo(0) }];
    expect(() => selectSnapshotsToKeep(snapshots, [1, 7, 14, 30], NOW)).not.toThrow();
    expect(selectSnapshotsToKeep(snapshots, [1, 7, 14, 30], NOW)).toEqual(new Set([1]));
  });

  it('actually thins the set — a dense run of snapshots leaves several dropped, not just reordered', () => {
    // One snapshot roughly every 2 days for 40 days — realistic for a change-volume trigger
    // firing regularly. Should end up close to 4 kept, not all 20.
    const snapshots: SnapshotMeta[] = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      createdAt: daysAgo(i * 2),
    }));
    const kept = selectSnapshotsToKeep(snapshots, [1, 7, 14, 30], NOW);
    expect(kept.size).toBeLessThan(snapshots.length);
    // At most one slot per target (4) plus the always-forced newest (5) — never all 20.
    expect(kept.size).toBeLessThanOrEqual(5);
    // The newest is always in the kept set.
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
