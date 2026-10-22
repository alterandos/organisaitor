import { compileFormula } from '@/utils/formula';
import { formatNumber, parseNumber } from '@/utils/numberNotation';
import type { Unit } from '@/config/units';
import type { CustomConverter } from '@/types/converters';

// Working out a conversion, pure: a built-in unit to another (config/units.ts), or a custom
// converter's formula (types/converters.ts) either way. The pane (components/ConverterPane) only
// shows what these return.

export function convertUnit(value: number, from: Unit, to: Unit): number {
  const base = from.toBase ? from.toBase(value) : value * (from.factor ?? 1);
  return to.fromBase ? to.fromBase(base) : base / (to.factor ?? 1);
}

// The output from the inputs (by key); NaN when an input is missing or the formula can't answer.
export function runConverter(c: CustomConverter, values: Record<string, number>): number {
  if (c.inputs.some((i) => !Number.isFinite(values[i.key]))) return NaN;
  try { return compileFormula(c.formula, c.inputs.map((i) => i.key)).evaluate(values); } catch { return NaN; }
}

// The input from the output, for a one-input converter with a formula back; NaN otherwise.
export function runConverterBack(c: CustomConverter, output: number): number {
  if (!c.inverse || c.inputs.length !== 1 || !Number.isFinite(output)) return NaN;
  try { return compileFormula(c.inverse, [c.output.key]).evaluate({ [c.output.key]: output }); } catch { return NaN; }
}

export const worksBothWays = (c: CustomConverter): boolean => c.inputs.length === 1 && !!c.inverse;

// A typed number: "1,234.5", "6.9E10", "6.9×10¹⁰", "-3" (utils/numberNotation.ts's reading).
export function readAmount(text: string): number {
  const n = parseNumber(text);
  return n ? Number(formatNumber(n, 'e')) : NaN;
}

// An answer to show: up to 10 significant figures, grouped; very large or small in E notation.
export function showAmount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-6) {
    const parsed = parseNumber(n.toPrecision(10));
    return parsed ? formatNumber(parsed, 'scientific') : String(n);
  }
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 10 }).format(n);
}
