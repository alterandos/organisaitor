// Tiered "grandfather" thinning for automatic local backup snapshots — the same idea behind
// Time Machine's hourly→daily→weekly thinning or tools like rsnapshot: keep a small number of
// snapshots spaced at INCREASING intervals into the past (recent history is dense, older
// history is sparse) rather than an even spread or a simple "keep the last N" — the point of
// snapshots taken by change-VOLUME rather than by a clock is that they can cluster tightly
// during a busy editing session, so "keep the last N" could easily mean "keep four snapshots
// all from this afternoon" instead of real historical coverage.
//
// A pure function on purpose (no IndexedDB/store access) — verified in isolation first, same
// "algorithm before wiring" approach already used for expandScheduleBlock/timezone conversion
// elsewhere in this codebase, since off-by-one bucket assignment is the realistic failure mode
// here, not the concept itself.

export interface SnapshotMeta {
  id: number;
  createdAt: string; // ISO 8601
}

// For each target age (closest-target-first, so two targets can't fight over the same
// snapshot), claims whichever not-yet-claimed snapshot's actual age is nearest that target.
// The single most recent snapshot is always force-kept regardless of bucket math — it's
// naturally the best fit for the smallest target age anyway, but pinning it explicitly avoids
// an edge case where the newest snapshot is younger than every target and could otherwise lose
// a tie-break to an older one. Returns the set of ids to KEEP; everything else should be deleted.
export function selectSnapshotsToKeep(
  snapshots: readonly SnapshotMeta[],
  targetAgesDays: readonly number[],
  now: Date = new Date(),
): Set<number> {
  if (snapshots.length === 0) return new Set();

  const withAge = snapshots.map((s) => ({
    id: s.id,
    ageDays: (now.getTime() - new Date(s.createdAt).getTime()) / 86_400_000,
  }));

  const keep = new Set<number>();
  const newest = withAge.reduce((a, b) => (a.ageDays <= b.ageDays ? a : b));
  keep.add(newest.id);

  for (const target of [...targetAgesDays].sort((a, b) => a - b)) {
    let best: (typeof withAge)[number] | null = null;
    let bestDiff = Infinity;
    for (const s of withAge) {
      if (keep.has(s.id)) continue;
      const diff = Math.abs(s.ageDays - target);
      if (diff < bestDiff) { bestDiff = diff; best = s; }
    }
    if (best) keep.add(best.id);
  }

  return keep;
}
