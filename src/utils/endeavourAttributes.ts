import type { Collection, EndeavourAttributes, FieldSchema, ItemType } from '@/types';
import { resolveItemType } from '@/utils/itemTypes';
import { endeavourAncestors } from '@/utils/endeavourGraph';

// An Endeavour's attributes (docs/features/endeavours.md "Attributes and Types for Endeavours"),
// pure: its Type's fields, then its own, each with its value. A period field's value is the
// Endeavour's period (Collection.period, read by utils/endeavourPeriod.ts); every other value is in
// `attributes.values`. Every field passes down (the user, 2026-11-06; a "don't pass down" switch may
// come later): an Endeavour part of it shows it, marked where it's from, until it has its own.
// Changing them is services/endeavourAttributes.ts.

export const EMPTY_ATTRIBUTES: EndeavourAttributes = { typeId: null, fields: [], values: {} };
export const attributesOf = (c: Collection | undefined): EndeavourAttributes => c?.attributes ?? EMPTY_ATTRIBUTES;

export interface AttributeField { field: FieldSchema; fromType: boolean }

// A period with no period field to show it (an Endeavour given one before attributes, or whose
// Type changed to one without): shown as a field of its own, so it's never lost without asking.
export const LOOSE_PERIOD_FIELD: FieldSchema = { id: 'period', name: 'Dates', type: 'period', inherit: true };

// Its fields: its Type's (with what that Type extends), then its own; one per id.
export function attributeFields(c: Collection | undefined, types: Record<string, ItemType>): AttributeField[] {
  const a = attributesOf(c);
  const fromType = (resolveItemType(types, a.typeId)?.fields ?? []).map((field) => ({ field, fromType: true }));
  const seen = new Set(fromType.map((f) => f.field.id));
  const out = [...fromType, ...a.fields.filter((f) => !seen.has(f.id)).map((field) => ({ field, fromType: false }))];
  if (c?.period && !hasPeriodField(out)) out.push({ field: LOOSE_PERIOD_FIELD, fromType: false });
  return out;
}

export const hasPeriodField = (fields: AttributeField[]) => fields.some((f) => f.field.type === 'period');

export function attributeValue(c: Collection, field: FieldSchema): unknown {
  return field.type === 'period' ? c.period ?? null : attributesOf(c).values[field.id];
}

const filled = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

// The fields it takes from above: those of the Endeavours it's part of (nearest first), filled in
// there, that it doesn't have itself (by id, or by name). The period isn't listed here: it's read the
// same way by utils/endeavourPeriod.ts.
export function inheritedAttributes(id: string, collections: Record<string, Collection>, types: Record<string, ItemType>): { field: FieldSchema; value: unknown; fromId: string }[] {
  return detailsFrom([...endeavourAncestors(id, collections)], attributeFields(collections[id], types).map((f) => f.field), collections, types);
}

export interface InheritedDetail { field: FieldSchema; value: unknown; fromId: string }

// The details a new Endeavour part of `parents` takes, less those of its own (`own`): the creator,
// before it exists.
export function detailsFromParents(parents: readonly string[], own: readonly FieldSchema[], collections: Record<string, Collection>, types: Record<string, ItemType>): InheritedDetail[] {
  const ups: string[] = [];
  for (const p of parents) for (const u of [p, ...endeavourAncestors(p, collections)]) if (!ups.includes(u)) ups.push(u);
  return detailsFrom(ups, own, collections, types);
}

function detailsFrom(ups: readonly string[], own: readonly FieldSchema[], collections: Record<string, Collection>, types: Record<string, ItemType>): InheritedDetail[] {
  const key = (f: FieldSchema) => f.name.trim().toLowerCase();
  const ownIds = new Set(own.map((f) => f.id));
  const ownNames = new Set(own.map(key));
  const out: InheritedDetail[] = [];
  for (const up of ups) {
    const c = collections[up];
    if (!c) continue;
    for (const { field } of attributeFields(c, types)) {
      if (field.type === 'period' || ownIds.has(field.id) || ownNames.has(key(field)) || out.some((o) => o.field.id === field.id || key(o.field) === key(field))) continue;
      const value = attributeValue(c, field);
      if (filled(value)) out.push({ field, value, fromId: up });
    }
  }
  return out;
}
