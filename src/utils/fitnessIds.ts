import { stableId } from '@/utils/stableId';
import type { Activity, ActivityId } from '@/types/fitness';

// A Strava activity's id: the same on every device for the same account and Strava activity
// (utils/stableId.ts; approved by the user 2026-10-22), so two devices that sync Strava make one
// record, not two.
export function stravaActivityId(userId: string, stravaId: string): ActivityId {
  return stableId('strava', userId, stravaId) as ActivityId;
}

// Strava activities imported before Fitness synced have random ids. On each load they take their
// stable id, and where the stable record is already here (from the cloud) the older copy is
// dropped, the more recently changed of the two kept, so they never upload as duplicates.
// Returns the same object when nothing changes.
export function withStableStravaIds(activities: Record<string, Activity>, userId: string): Record<string, Activity> {
  let out: Record<string, Activity> | null = null;
  for (const a of Object.values(activities)) {
    if (a.source !== 'strava' || !a.sourceId) continue;
    const id = stravaActivityId(userId, a.sourceId);
    if (a.id === id) continue;
    out ??= { ...activities };
    delete out[a.id];
    const there = out[id];
    if (!there || there.updatedAt < a.updatedAt) out[id] = { ...a, id };
  }
  return out ?? activities;
}
