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

// Keeps the newest snapshot, and for each target age the YOUNGEST snapshot at least that old:
// "how things stood at least 3 minutes / 10 minutes / an hour / a day … ago". When none is that old
// yet, the oldest snapshot is kept for it, so the furthest-back state survives.
//
// Changed 2026-10-22 after a note was lost: the rule used to keep whichever snapshot was NEAREST
// each target, so a burst of snapshots of the damaged state (the damage itself crossed the change
// threshold, several times within seconds) counted as "near" the short targets and the good
// snapshots before it were deleted. A snapshot younger than a target can never fill it now, so
// new snapshots can't push older ones out of their slots. Returns the ids to KEEP.
export function selectSnapshotsToKeep(
  snapshots: readonly SnapshotMeta[],
  targetAgesDays: readonly number[],
  now: Date = new Date(),
): Set<number> {
  if (snapshots.length === 0) return new Set();

  const byAge = snapshots
    .map((s) => ({ id: s.id, ageDays: (now.getTime() - new Date(s.createdAt).getTime()) / 86_400_000 }))
    .sort((a, b) => a.ageDays - b.ageDays);

  const keep = new Set<number>([byAge[0].id]);
  for (const target of targetAgesDays) {
    const atLeast = byAge.find((s) => s.ageDays >= target);
    keep.add((atLeast ?? byAge[byAge.length - 1]).id);
  }
  return keep;
}
