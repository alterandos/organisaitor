import type { ActivityType, ActivityTypeId } from '@/types/fitness';

// Seed data for built-in activity types — used once by fitnessStore to populate
// activityTypes on first load / migration. Fixed ids (not nanoid) so a future Strava
// sync can map sport_type -> our type directly (e.g. 'Run' -> 'run') without a lookup
// table. Deleting the seed row here later does not remove it from existing users'
// stores — this is a seed list, not a live source of truth after first run.
//
// tracksDistance decides whether the create/edit form shows the Distance field for
// each type — moving time is universal (every activity has a session length), but
// distance genuinely doesn't apply to Strength or Yoga.
export const BUILTIN_ACTIVITY_TYPE_SEEDS: Pick<ActivityType, 'id' | 'name' | 'icon' | 'tracksDistance'>[] = [
  { id: 'run'      as ActivityTypeId, name: 'Run',      icon: '🏃', tracksDistance: true  },
  { id: 'hike'     as ActivityTypeId, name: 'Hike',     icon: '🥾', tracksDistance: true  },
  { id: 'walk'     as ActivityTypeId, name: 'Walk',     icon: '🚶', tracksDistance: true  },
  { id: 'ride'     as ActivityTypeId, name: 'Ride',     icon: '🚴', tracksDistance: true  },
  { id: 'swim'     as ActivityTypeId, name: 'Swim',     icon: '🏊', tracksDistance: true  },
  { id: 'strength' as ActivityTypeId, name: 'Strength', icon: '🏋️', tracksDistance: false },
  { id: 'yoga'     as ActivityTypeId, name: 'Yoga',     icon: '🧘', tracksDistance: false },
  { id: 'other'    as ActivityTypeId, name: 'Other',    icon: '⭐', tracksDistance: true  },
];

// Default "most used" order before any activities have been logged (getTopActivityTypes
// falls back to this so the pills in AddActivityModal are never empty for a new user).
export const DEFAULT_TOP_TYPE_IDS: ActivityTypeId[] = ['run', 'hike', 'ride'] as ActivityTypeId[];
