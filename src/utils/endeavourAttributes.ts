import type { Collection, EndeavourAttributes, FieldSchema, ItemType } from '@/types';
import { resolveItemType } from '@/utils/itemTypes';
import { endeavourAncestors } from '@/utils/endeavourGraph';

// An Endeavour's attributes (docs/features/endeavours.md "Attributes and Types for Endeavours"),
// pure: its Type's fields, then its own, each with its value. A period field's value is the
// Endeavour's period (Collection.period, read by utils/endeavourPeriod.ts); every other value is in
// `attributes.values`. A field marked "parts take this" is shown on the Endeavours part of it that
// don't have it themselves, live. Changing them is services/endeavourAttributes.ts.

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

// The fields it takes from above: an Endeavour it's part of (nearest first) marks a field "parts
// take this", and it doesn't have that field itself. The period isn't listed here: it's read the
// same way by utils/endeavourPeriod.ts.
export function inheritedAttributes(id: string, collections: Record<string, Collection>, types: Record<string, ItemType>): { field: FieldSchema; value: unknown; fromId: string }[] {
  const own = new Set(attributeFields(collections[id], types).map((f) => f.field.id));
  const out: { field: FieldSchema; value: unknown; fromId: string }[] = [];
  for (const up of endeavourAncestors(id, collections)) {
    const c = collections[up];
    if (!c) continue;
    for (const { field } of attributeFields(c, types)) {
      if (!field.inherit || field.type === 'period' || own.has(field.id) || out.some((o) => o.field.id === field.id)) continue;
      const value = attributeValue(c, field);
      if (filled(value)) out.push({ field, value, fromId: up });
    }
  }
  return out;
}
