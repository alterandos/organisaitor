import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type {
  Activity, ActivityId, CreateActivityInput,
  ActivityType, ActivityTypeId, CreateActivityTypeInput,
} from '@/types/fitness';
import { BUILTIN_ACTIVITY_TYPE_SEEDS } from '@/config/activityTypes';
import { now } from '@/utils/date';
import { persistStorage } from '@/utils/persistStorage';

interface FitnessData {
  activities:    Record<ActivityId, Activity>;
  activityTypes: Record<ActivityTypeId, ActivityType>;
}

function seedBuiltinTypes(): Record<ActivityTypeId, ActivityType> {
  const ts = now();
  const types: Record<ActivityTypeId, ActivityType> = {} as Record<ActivityTypeId, ActivityType>;
  for (const seed of BUILTIN_ACTIVITY_TYPE_SEEDS) {
    types[seed.id] = {
      id:             seed.id,
      name:           seed.name,
      icon:           seed.icon,
      color:          null,
      tracksDistance: seed.tracksDistance,
      fieldSchema:    [],
      isBuiltIn:      true,
      archivedAt:     null,
      createdAt:      ts,
      updatedAt:      ts,
    };
  }
  return types;
}

const EMPTY: FitnessData = {
  activities:    {},
  activityTypes: seedBuiltinTypes(),
};

export interface FitnessActions {
  addActivity:    (input: CreateActivityInput) => ActivityId;
  updateActivity: (id: ActivityId, changes: Partial<Omit<Activity, 'id' | 'createdAt'>>) => void;
  deleteActivity: (id: ActivityId) => void;

  // Import support (Phase 2 — Strava sync will call this to upsert by source+sourceId
  // without creating duplicates on repeat syncs)
  upsertBySource: (source: Activity['source'], sourceId: string, input: CreateActivityInput) => ActivityId;

  // Activity types (customisation)
  addActivityType:    (input: CreateActivityTypeInput) => ActivityTypeId;
  updateActivityType: (id: ActivityTypeId, changes: Partial<Pick<ActivityType, 'name' | 'icon' | 'color' | 'tracksDistance' | 'fieldSchema' | 'archivedAt'>>) => void;
  deleteActivityType: (id: ActivityTypeId) => void;
}

type FitnessStore = FitnessData & FitnessActions;

export const useFitnessStore = create<FitnessStore>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      addActivity: (input) => {
        const ts = now();
        const id = nanoid() as ActivityId;
        const activity: Activity = {
          id,
          type:               input.type,
          title:               input.title.trim(),
          startedAt:           input.startedAt,
          timezone:            null,
          distanceMeters:      input.distanceMeters      ?? null,
          movingTimeSeconds:   input.movingTimeSeconds   ?? null,
          elapsedTimeSeconds:  input.elapsedTimeSeconds  ?? null,
          averageSpeedMps:     input.averageSpeedMps     ?? null,
          data:                input.data                ?? {},
          notes:               input.notes               ?? null,
          purposeIds:          input.purposeIds           ?? [],
          source:              input.source               ?? 'manual',
          sourceId:            input.sourceId             ?? null,
          sourceRaw:           input.sourceRaw            ?? null,
          archivedAt:          null,
          createdAt:           ts,
          updatedAt:           ts,
        };
        set((state) => ({ activities: { ...state.activities, [id]: activity } }));
        return id;
      },

      updateActivity: (id, changes) =>
        set((state) => {
          const activity = state.activities[id];
          if (!activity) return {};
          return {
            activities: {
              ...state.activities,
              [id]: { ...activity, ...changes, updatedAt: now() },
            },
          };
        }),

      deleteActivity: (id) =>
        set((state) => {
          const activities = { ...state.activities };
          delete activities[id];
          return { activities };
        }),

      upsertBySource: (source, sourceId, input) => {
        const existing = Object.values(get().activities).find(
          (a) => a.source === source && a.sourceId === sourceId
        );
        if (existing) {
          get().updateActivity(existing.id, {
            title:              input.title.trim(),
            startedAt:          input.startedAt,
            distanceMeters:     input.distanceMeters      ?? null,
            movingTimeSeconds:  input.movingTimeSeconds   ?? null,
            elapsedTimeSeconds: input.elapsedTimeSeconds  ?? null,
            averageSpeedMps:    input.averageSpeedMps     ?? null,
            sourceRaw:          input.sourceRaw            ?? null,
          });
          return existing.id;
        }
        return get().addActivity({ ...input, source, sourceId });
      },

      // ── Activity types ─────────────────────────────────────────────────────

      addActivityType: (input) => {
        const ts = now();
        const id = nanoid() as ActivityTypeId;
        const type: ActivityType = {
          id,
          name:           input.name.trim(),
          icon:           input.icon?.trim() || '⛰️',
          color:          input.color ?? null,
          tracksDistance: input.tracksDistance ?? true,
          fieldSchema:    input.fieldSchema ?? [],
          isBuiltIn:      false,
          archivedAt:     null,
          createdAt:      ts,
          updatedAt:      ts,
        };
        set((state) => ({ activityTypes: { ...state.activityTypes, [id]: type } }));
        return id;
      },

      updateActivityType: (id, changes) =>
        set((state) => {
          const type = state.activityTypes[id];
          if (!type) return {};
          return {
            activityTypes: {
              ...state.activityTypes,
              [id]: { ...type, ...changes, updatedAt: now() },
            },
          };
        }),

      deleteActivityType: (id) =>
        set((state) => {
          const type = state.activityTypes[id];
          if (!type || type.isBuiltIn) return {};
          const activityTypes = { ...state.activityTypes };
          delete activityTypes[id];
          return { activityTypes };
        }),
    }),
    {
      name:    'fitness-storage',
      storage: persistStorage(),
      version: 3,
      migrate: (persisted, fromVersion) => {
        let state = persisted as FitnessData;
        if (fromVersion < 2) {
          // v1 had no activityTypes registry — seed built-ins. v1's Activity.type held
          // plain 'run'/'hike' strings, which already match the fixed built-in ids, so
          // existing activities keep working with no further migration.
          state = { ...state, activityTypes: seedBuiltinTypes() };
        }
        if (fromVersion < 3) {
          // tracksDistance backfill — built-ins get their correct per-type default
          // (Strength/Yoga -> false, everything else -> true); any custom type a user
          // already created defaults to true (matches addActivityType's default).
          const seedById = new Map(BUILTIN_ACTIVITY_TYPE_SEEDS.map((s) => [s.id, s]));
          const activityTypes: Record<ActivityTypeId, ActivityType> = {} as Record<ActivityTypeId, ActivityType>;
          for (const [id, type] of Object.entries(state.activityTypes ?? {})) {
            const t = type as ActivityType & { tracksDistance?: boolean };
            activityTypes[id as ActivityTypeId] = {
              ...t,
              tracksDistance: t.tracksDistance ?? seedById.get(id as ActivityTypeId)?.tracksDistance ?? true,
            };
          }
          state = { ...state, activityTypes };
        }
        return state;
      },
    }
  )
);
