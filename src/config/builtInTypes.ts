import type { TypeUse } from '@/types';
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
    fields: [
      { id: 'code',   name: 'Code', type: 'text' },
      { id: 'target', name: 'Mark aimed for', type: 'number', unit: '%' },
    ],
    defaults: {}, parts: [],
  },
];

export const BUILT_IN_TYPES: BuiltInType[] = [
  ...ENDEAVOUR_DEFAULTS,
  ...STARTER_SETS.university.map((s): BuiltInType => ({ ...s, usedFor: ['item'] })),
];

export const BUILT_IN_BY_KEY: Record<string, BuiltInType> = Object.fromEntries(BUILT_IN_TYPES.map((t) => [t.key, t]));
