import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { attributeFields, attributesOf, hasPeriodField } from '@/utils/endeavourAttributes';
import { endeavourSubtree } from '@/utils/endeavourGraph';
import { nanoid } from 'nanoid';
import type { CollectionId, EndeavourAttributes, FieldSchema, ItemTypeId } from '@/types';

// Changing an Endeavour's attributes (docs/features/endeavours.md "Attributes and Types for
// Endeavours"): its Type, its own fields and their values, and saving its fields as a Type. Rules
// are utils/endeavourAttributes.ts. A period field's value is the Endeavour's period: removing the
// last period field clears it (the pane asks first, with periodImpact).

const tasks = () => useTaskStore.getState();
const patch = (id: CollectionId, p: Partial<EndeavourAttributes>) => {
  const c = tasks().collections[id];
  if (c) tasks().updateCollection(id, { attributes: { ...attributesOf(c), ...p } });
};

// What losing the period changes, for the question asked first: repeating classes and work in it
// (and its parts) that skip break days or end with it.
export function periodImpact(id: CollectionId): number {
  const scope = endeavourSubtree(id, tasks().collections);
  const { events, deadlines } = useCalendarStore.getState();
  return [...Object.values(events), ...Object.values(deadlines)]
    .filter((x) => x.collectionId && scope.has(x.collectionId) && !x.archivedAt && x.repeat && (x.repeat.breakSkips?.length || x.repeat.endKind === 'until')).length;
}

// A Type whose fields have no period leaves a period it had as a field of its own (never lost
// without asking: utils/endeavourAttributes.ts LOOSE_PERIOD_FIELD).
export function setEndeavourType(id: CollectionId, typeId: ItemTypeId | null): void { patch(id, { typeId }); }

export function setAttributeValue(id: CollectionId, fieldId: string, value: unknown): void {
  const c = tasks().collections[id];
  if (c) patch(id, { values: { ...attributesOf(c).values, [fieldId]: value } });
}

// A field of its own (any kind; at most one period field in all). `keepId`: the id of a field taken
// from above, so its own replaces it there ("Set its own").
export function addOwnField(id: CollectionId, field: Omit<FieldSchema, 'id'>, keepId?: string): string | null {
  const c = tasks().collections[id];
  if (!c) return null;
  if (field.type === 'period' && hasPeriodField(attributeFields(c, useItemTypeStore.getState().types))) return null;
  const f: FieldSchema = { ...field, id: keepId ?? nanoid(8), ...(field.type === 'period' ? { inherit: true } : {}) };
  patch(id, { fields: [...attributesOf(c).fields, f] });
  return f.id;
}

export function updateOwnField(id: CollectionId, fieldId: string, changes: Partial<Omit<FieldSchema, 'id' | 'type'>>): void {
  const c = tasks().collections[id];
  if (c) patch(id, { fields: attributesOf(c).fields.map((f) => (f.id === fieldId ? { ...f, ...changes } : f)) });
}

// Removing its period field clears its period (the pane asks first, with periodImpact).
export function removeOwnField(id: CollectionId, fieldId: string): void {
  const c = tasks().collections[id];
  if (!c) return;
  const field = attributeFields(c, useItemTypeStore.getState().types).find((f) => f.field.id === fieldId && !f.fromType)?.field;
  if (!field) return;
  const a = attributesOf(c);
  const values = { ...a.values };
  delete values[fieldId];
  patch(id, { fields: a.fields.filter((f) => f.id !== fieldId), values });
  if (field.type === 'period') tasks().updateCollection(id, { period: null });
}

// "Save these fields as a Type": its Type's fields and its own, as a new Type used for Endeavours;
// it then has that Type and no fields of its own (their values stay).
export function saveFieldsAsType(id: CollectionId, name: string): ItemTypeId | null {
  const c = tasks().collections[id];
  if (!c || !name.trim()) return null;
  const fields = attributeFields(c, useItemTypeStore.getState().types).map((f) => ({ ...f.field }));
  const typeId = useItemTypeStore.getState().addItemType({ name: name.trim(), icon: null, extendsId: null, fields, defaults: {}, parts: [], usedFor: ['endeavour'] });
  patch(id, { typeId, fields: [] });
  return typeId;
}
