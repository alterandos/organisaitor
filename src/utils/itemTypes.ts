import type { FieldSchema, ItemType, ItemTypeDefaults, ItemTypeId, TypePart } from '@/types';
import { addDaysToIso } from '@/utils/date';

// The rules for Types (docs/features/endeavours.md phase 3), pure. A Type can extend another; what
// it adds sits after what it inherits, and its own defaults win. A Type extending a missing or
// archived one still works: the chain just stops there.

// The chain from the Type furthest up to this one. Stops at a missing Type or a loop (which
// canExtend refuses, but stored data from elsewhere could hold one).
export function typeChain(types: Record<string, ItemType>, id: ItemTypeId | null | undefined): ItemType[] {
  const chain: ItemType[] = [];
  const seen = new Set<string>();
  let cur = id ? types[id] : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.extendsId ? types[cur.extendsId] : undefined;
  }
  return chain;
}

export interface ResolvedType {
  type:     ItemType;
  chain:    ItemType[];
  fields:   FieldSchema[];
  parts:    TypePart[];
  defaults: ItemTypeDefaults;
}

export function resolveItemType(types: Record<string, ItemType>, id: ItemTypeId | null | undefined): ResolvedType | null {
  const chain = typeChain(types, id);
  if (chain.length === 0) return null;
  const fields: FieldSchema[] = [];
  const parts:  TypePart[] = [];
  let defaults: ItemTypeDefaults = {};
  for (const t of chain) {
    for (const f of t.fields) if (!fields.some((x) => x.id === f.id)) fields.push(f);
    for (const p of t.parts) if (!parts.some((x) => x.id === p.id)) parts.push(p);
    defaults = { ...defaults, ...stripUndefined(t.defaults) };
  }
  return { type: chain[chain.length - 1], chain, fields, parts, defaults };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// Whether `id` may extend `parentId`: not itself, and not something that already extends it.
export function canExtend(types: Record<string, ItemType>, id: ItemTypeId | null, parentId: ItemTypeId): 'self' | 'loop' | null {
  if (id === parentId) return 'self';
  if (id && typeChain(types, parentId).some((t) => t.id === id)) return 'loop';
  return null;
}

// The Types that extend this one, all the way down (so deleting or archiving it can say so).
export function typeDescendants(types: Record<string, ItemType>, id: ItemTypeId): ItemType[] {
  const out: ItemType[] = [];
  const walk = (parent: ItemTypeId) => {
    for (const t of Object.values(types)) {
      if (t.extendsId === parent && !out.includes(t) && t.id !== id) { out.push(t); walk(t.id); }
    }
  };
  walk(id);
  return out;
}

// When a part is due: a task the given days before the item's date, a follow-up after it.
export function partDue(part: TypePart, itemDate: string): string {
  return addDaysToIso(itemDate, part.kind === 'task' ? -part.offsetDays : part.offsetDays);
}

// Types offered in a picker: not archived (except the one already chosen), by name.
export function pickableTypes(types: Record<string, ItemType>, keep?: ItemTypeId | null): ItemType[] {
  return Object.values(types)
    .filter((t) => !t.archivedAt || t.id === keep)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// A field value worth showing (empty strings, nulls and 0 ratings are "not filled in").
export function hasFieldValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '' && v !== false && !(typeof v === 'number' && Number.isNaN(v));
}

// The field values as one line of text ("Weight: 40% · Mark: 72"), for a row, a tooltip, or the way
// back (docs/features/endeavours.md "Reversibility": values copied into the item's notes).
export function fieldValuesText(fields: FieldSchema[], values: Record<string, unknown> | undefined): string {
  if (!values) return '';
  return fields
    .filter((f) => hasFieldValue(values[f.id]))
    .map((f) => `${f.name}: ${formatFieldValue(f, values[f.id])}`)
    .join(' · ');
}

export function formatFieldValue(f: FieldSchema, v: unknown): string {
  if (f.type === 'boolean') return v ? '✓' : '';
  if (f.type === 'rating') return `${Number(v)}/${f.max ?? 5}`;
  if (f.type === 'duration') {
    const s = Number(v) || 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  if (f.type === 'number' && f.unit) return `${v}${f.unit === '%' ? '' : ' '}${f.unit}`;
  return String(v);
}
