import { unitCategory } from '@/config/units';
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
}
export type ConvertDesign = 'card' | 'compact';

export const defaultUnits = (catId: string): { from: string | null; to: string | null } => {
  const pair = unitCategory(catId)?.pair;
  return { from: pair?.[0] ?? null, to: pair?.[1] ?? null };
};

export function convertText(v: ConvertValue, customs: Record<ConverterId, CustomConverter>): string {
  const cat = unitCategory(v.converter);
  if (cat) {
    const d = defaultUnits(cat.id);
    const from = cat.units.find((u) => u.id === (v.from ?? d.from));
    const to = cat.units.find((u) => u.id === (v.to ?? d.to));
    const n = readAmount(v.values.amount ?? '');
    if (!from || !to) return '';
    return `${v.values.amount ?? ''} ${from.symbol} = ${showAmount(Number.isFinite(n) ? convertUnit(n, from, to) : NaN)} ${to.symbol}`;
  }
  const c = customs[v.converter as ConverterId];
  if (!c) return '';
  const nums = Object.fromEntries(c.inputs.map((i) => [i.key, readAmount(v.values[i.key] ?? '')]));
  const left = c.inputs.map((i) => `${v.values[i.key] ?? ''} ${i.unit}`.trim()).join(', ');
  return `${left} = ${showAmount(runConverter(c, nums))} ${c.output.unit}`.trim();
}

