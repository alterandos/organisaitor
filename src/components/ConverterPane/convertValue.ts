import { UNIT_CATEGORIES, unitCategory, type Unit, type UnitCategory } from '@/config/units';
import { LABELS } from '@/config/labels';
import { convertUnit, readAmount, runConverter, showAmount } from '@/utils/convert';
import type { ConverterId, CustomConverter } from '@/types/converters';

// What a conversion in a note stores (ConvertWidget, the `\convert` block), and its plain-text form
// for copying: pure, so the clipboard and tests read it without React.

export interface ConvertValue {
  converter: string;               // a unit category's id (config/units.ts) or a custom converter's id
  from:      string | null;        // units: the unit converted from (null: the category's default)
  to:        string | null;
  values:    Record<string, string>;   // what was typed: 'amount' for units, each input's key for a custom one
  reverse:   boolean;              // a custom converter that works both ways, run back (from its output)
  // Currency: the rates it was kept at ("Keep this rate": units per euro, EUR 1, and their date);
  // absent or null, today's.
  fixed?:    { date: string; rates: Record<string, number> } | null;
}
export type ConvertDesign = 'card' | 'compact';

// Lists a person picks from are A to Z by what they show (asked for by the user 2026-10-30): units
// by their symbol (what a dropdown shows), converters by name. Every unit and converter list uses these.
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
export const unitsInOrder = (units: Unit[]): Unit[] => [...units].sort((a, b) => byText(a.symbol, b.symbol) || byText(a.name, b.name));
export const categoriesInOrder = (): UnitCategory[] =>
  [...UNIT_CATEGORIES].sort((a, b) => byText(LABELS.converters.categories[a.id], LABELS.converters.categories[b.id]));

export const defaultUnits = (catId: string): { from: string | null; to: string | null } => {
  const pair = unitCategory(catId)?.pair;
  return { from: pair?.[0] ?? null, to: pair?.[1] ?? null };
};

// `liveRates`: today's exchange rates, for a currency conversion not kept at its own.
export function convertText(v: ConvertValue, customs: Record<ConverterId, CustomConverter>, liveRates?: Record<string, number> | null): string {
  const cat = unitCategory(v.converter);
  if (cat) {
    const d = defaultUnits(cat.id);
    const from = cat.units.find((u) => u.id === (v.from ?? d.from));
    const to = cat.units.find((u) => u.id === (v.to ?? d.to));
    const n = readAmount(v.values.amount ?? '');
    if (!from || !to) return '';
    return `${v.values.amount ?? ''} ${from.symbol} = ${showAmount(Number.isFinite(n) ? convertUnit(n, from, to, v.fixed?.rates ?? liveRates) : NaN)} ${to.symbol}`;
  }
  const c = customs[v.converter as ConverterId];
  if (!c) return '';
  const nums = Object.fromEntries(c.inputs.map((i) => [i.key, readAmount(v.values[i.key] ?? '')]));
  const left = c.inputs.map((i) => `${v.values[i.key] ?? ''} ${i.unit}`.trim()).join(', ');
  return `${left} = ${showAmount(runConverter(c, nums))} ${c.output.unit}`.trim();
}

