import type { Activity, ActivityType, ActivityTypeId } from '@/types/fitness';
import { DEFAULT_TOP_TYPE_IDS } from '@/config/activityTypes';

const FALLBACK_TYPE: Pick<ActivityType, 'name' | 'icon'> = { name: 'Activity', icon: '⛰️' };

// Graceful lookup — an activity can reference a type that was since deleted (only
// non-built-in types are deletable, but still). Never throws, always renders something.
export function getActivityType(
  typeId: ActivityTypeId,
  activityTypes: Record<string, ActivityType>,
): Pick<ActivityType, 'name' | 'icon'> {
  return activityTypes[typeId] ?? FALLBACK_TYPE;
}

// The N most-used activity types (by how many activities reference them), for the pill
// row in AddActivityModal. Falls back to DEFAULT_TOP_TYPE_IDS to fill any remaining
// slots so a new user always sees a sensible starting set, not an empty row.
export function getTopActivityTypes(
  activityTypes: Record<string, ActivityType>,
  activities: Record<string, Activity>,
  count = 3,
): ActivityType[] {
  const counts = new Map<string, number>();
  for (const a of Object.values(activities)) {
    counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  }

  const active = Object.values(activityTypes).filter((t) => !t.archivedAt);
  const byUsage = [...active].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));

  const result: ActivityType[] = [];
  const seen = new Set<string>();

  for (const t of byUsage) {
    if (result.length >= count) break;
    if ((counts.get(t.id) ?? 0) === 0) continue; // only include types with real usage here
    result.push(t);
    seen.add(t.id);
  }

  if (result.length < count) {
    for (const id of DEFAULT_TOP_TYPE_IDS) {
      if (result.length >= count) break;
      if (seen.has(id)) continue;
      const t = activityTypes[id];
      if (t && !t.archivedAt) { result.push(t); seen.add(id); }
    }
  }

  if (result.length < count) {
    for (const t of active) {
      if (result.length >= count) break;
      if (seen.has(t.id)) continue;
      result.push(t);
      seen.add(t.id);
    }
  }

  return result;
}
