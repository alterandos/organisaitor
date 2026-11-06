import type { TypeUse } from '@/types';
import { BIRTHDAY_REPEAT } from '@/utils/calendarItemInput';
import { STARTER_SETS, type StarterType } from '@/config/typeStarters';

// The default Types (docs/features/endeavours.md "Attributes and Types for Endeavours", agreed with
// the user 2026-10-30): read-only originals, always there to start from. Choosing one gives the
// person their own copy (services/itemTypes.ts addBuiltInType), which is what they edit; the
// default itself never changes. Shown where Types are chosen on purpose (Manage → Types, an
// Endeavour's Type), never in every task form (2026-10-29: a non-student never sees "Exam").
// A new default is one entry here; field ids are stable keys within it.

export interface BuiltInType extends StarterType { usedFor: TypeUse[] }

export const ENDEAVOUR_DEFAULTS: BuiltInType[] = [
  {
    key: 'semester', name: 'Semester', icon: '🗓', usedFor: ['endeavour'],
    fields: [{ id: 'period', name: 'Teaching period', type: 'period', inherit: true }],
    defaults: {}, parts: [],
  },
  {
    key: 'subject', name: 'Subject', icon: '🎓', usedFor: ['endeavour'],
    // The mark aimed for is a goal, not a detail (the user, 2026-11-03).
    fields: [{ id: 'code', name: 'Code', type: 'text' }],
    defaults: {}, parts: [],
  },
];

// Events (2026-11-03, agreed with the user): what was the event's own type. A Type only preselects
// (its icon, Show quieter, a birthday's yearly repeat and no times); the person can change any of
// it on the event. A journey's kinds each have their own icon. Offered in an event's Type picker.
const journeyKind = (key: string, name: string, icon: string): BuiltInType =>
  ({ key, name, icon, extends: 'journey', usedFor: ['item'], fields: [], defaults: {}, parts: [] });
export const EVENT_DEFAULTS: BuiltInType[] = [
  { key: 'birthday', name: 'Birthday', icon: '🎉', usedFor: ['item'], fields: [], parts: [],
    defaults: { makeAs: 'event', allDay: true, repeat: BIRTHDAY_REPEAT } },
  { key: 'journey', name: 'Journey', icon: '🧳', usedFor: ['item'], fields: [], parts: [],
    defaults: { makeAs: 'event', quiet: true } },
  journeyKind('flight', 'Flight', '✈️'),
  journeyKind('train', 'Train', '🚆'),
  journeyKind('bus', 'Bus', '🚌'),
  journeyKind('car', 'Car journey', '🚗'),
  journeyKind('ferry', 'Ferry', '⛴️'),
];

export const BUILT_IN_TYPES: BuiltInType[] = [
  ...ENDEAVOUR_DEFAULTS,
  ...EVENT_DEFAULTS,
  ...STARTER_SETS.university.map((s): BuiltInType => ({ ...s, usedFor: ['item'] })),
];

export const BUILT_IN_BY_KEY: Record<string, BuiltInType> = Object.fromEntries(BUILT_IN_TYPES.map((t) => [t.key, t]));
