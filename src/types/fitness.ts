import type { PurposeId } from './index';

export type ActivityId = string & { readonly _brand: 'ActivityId' };
export type ActivityTypeId = string & { readonly _brand: 'ActivityTypeId' };

// Extensible — new sources (Garmin, Apple Health, Google Fit, CSV import...) just add a
// union member and a new sync function; the Activity shape itself doesn't change.
export type ActivitySource = 'manual' | 'strava';

// ── Custom field schema (per activity type) ──────────────────────────────────
// Local to Fitness, deliberately not shared with Records' FieldSchema — same
// independent-but-parallel pattern Lists already uses for ListFieldSchema.
export type ActivityFieldType = 'text' | 'number' | 'date' | 'rating' | 'select' | 'boolean' | 'url' | 'duration';

export interface ActivityFieldSchema {
  id:       string;              // nanoid(8) — stable key in Activity.data
  name:     string;
  type:     ActivityFieldType;
  required?: boolean;
  options?:  string[];           // for 'select'
  unit?:     string;             // for 'number' (e.g. "bpm")
  max?:      number;             // for 'rating' (default 5)
}

// ── Activity type (user-customisable registry, not a closed union) ───────────
// Built-ins ('run', 'hike', ...) are seeded with fixed, well-known IDs so a future
// Strava sync can map sport_type -> our type without a lookup table. Custom types
// get a random id. isBuiltIn only gates whether the row can be deleted, not edited —
// name/icon/color/fieldSchema are all user-editable regardless.
export interface ActivityType {
  id:             ActivityTypeId;
  name:           string;
  icon:           string;
  color:          string | null;
  // Whether the create/edit form shows the Distance field for this type. Moving time
  // stays universal (every activity has a session length), but distance genuinely
  // doesn't apply to some types (Strength, Yoga) — see BUILTIN_ACTIVITY_TYPE_SEEDS.
  tracksDistance: boolean;
  fieldSchema:    ActivityFieldSchema[];
  isBuiltIn:      boolean;
  archivedAt:     string | null;
  createdAt:      string;
  updatedAt:      string;
}

// ── Activity entity ──────────────────────────────────────────────────────────
export interface Activity {
  id:                  ActivityId;
  type:                ActivityTypeId;
  title:               string;
  startedAt:           string;                 // ISO 8601 timestamp (or YYYY-MM-DD for manual entries)
  timezone:            string | null;

  // Canonical units are SI (meters, seconds, m/s) regardless of display preference —
  // conversion to km/mi etc. happens at render time only.
  distanceMeters:      number | null;
  movingTimeSeconds:   number | null;
  elapsedTimeSeconds:  number | null;          // stored now, not shown in UI until Phase 2
  averageSpeedMps:     number | null;

  // Custom fields, keyed by ActivityFieldSchema.id — driven by the selected
  // ActivityType's fieldSchema. Also the extensibility valve for Phase 2+ Strava
  // fields the UI doesn't show yet (elevation gain, heart rate, splits...).
  data:                Record<string, unknown>;

  notes:               string | null;
  purposeIds:          PurposeId[];            // cross-app Purpose tagging (shared platform layer)

  // Import tracking
  source:              ActivitySource;
  sourceId:            string | null;          // e.g. Strava activity id; null for manual entries
  sourceRaw:           Record<string, unknown> | null;

  archivedAt:          string | null;          // sunset pattern, same as Collection/Purpose
  createdAt:           string;
  updatedAt:           string;
}

// ── Input types ──────────────────────────────────────────────────────────────
export interface CreateActivityInput {
  type:                ActivityTypeId;
  title:               string;
  startedAt:           string;
  distanceMeters?:      number | null;
  movingTimeSeconds?:   number | null;
  elapsedTimeSeconds?:  number | null;
  averageSpeedMps?:     number | null;
  data?:                Record<string, unknown>;
  notes?:               string | null;
  purposeIds?:          PurposeId[];
  source?:              ActivitySource;
  sourceId?:            string | null;
  sourceRaw?:            Record<string, unknown> | null;
}

export interface CreateActivityTypeInput {
  name:            string;
  icon?:           string;
  color?:          string | null;
  tracksDistance?: boolean;
  fieldSchema?:    ActivityFieldSchema[];
}
