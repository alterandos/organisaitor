import { REFERENCE_SIZES, type ReferenceSize } from '@/config/referenceSizes';
import { LABELS } from '@/config/labels';
import type { Unit } from '@/config/units';

// An amount pictured by something of a known size (config/referenceSizes.ts): "about half the
// weight of an adult male African elephant". Pure, so the converters and tests share it.
//
// A size is compared by ratio with the reference nearest it in scale (a whole one or more is
// favoured a little over a part of one, and a ratio that's easy to say more); a temperature is placed
// between the two references either side of it. Nothing is said beyond a thousand times the
// nearest reference, where a comparison stops helping.

export type SizeComparison =
  | { kind: 'ratio'; ref: ReferenceSize; ratio: number; phrase: string }
  | { kind: 'between'; refs: ReferenceSize[]; phrase: string };

const L = LABELS.converters.like;
const MAX_RATIO = 1000;

// An amount of a unit in its category's base unit.
export const toBaseValue = (unit: Unit, n: number): number => (unit.toBase ? unit.toBase(n) : n * (unit.factor ?? 1));

export function compareSize(categoryId: string, base: number): SizeComparison | null {
  const refs = REFERENCE_SIZES[categoryId];
  if (!refs?.length || !Number.isFinite(base)) return null;
  return categoryId === 'temperature' ? placeTemperature(refs, base) : byRatio(categoryId, refs, base);
}

// A ratio people say easily (half, a third, twice, ten times) is worth a reference a little further
// off: "half an elephant" beats "1.7 cars".
const NICE = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 2, 3, 4, 5, 10];
const isNice = (ratio: number) => NICE.some((n) => Math.abs(ratio / n - 1) < 0.12);

function byRatio(categoryId: string, refs: ReferenceSize[], base: number): SizeComparison | null {
  if (base <= 0) return null;
  let best: { ref: ReferenceSize; ratio: number; score: number } | null = null;
  for (const ref of refs) {
    const ratio = base / ref.value;
    const score = Math.abs(Math.log(ratio)) * (ratio < 1 ? 1.1 : 1) * (isNice(ratio) ? 0.5 : 1);
    if (!best || score < best.score) best = { ref, ratio, score };
  }
  if (!best || best.ratio > MAX_RATIO || best.ratio < 1 / MAX_RATIO) return null;
  const measure = best.ref.measure ?? L.measure[categoryId] ?? '';
  return { kind: 'ratio', ref: best.ref, ratio: best.ratio, phrase: L.ratio(ratioWords(best.ratio), measure, best.ref.name) };
}

// "the same as", "3×", "half", "a third of", "1/40 of": how many times the reference it is.
export function ratioWords(ratio: number): string {
  if (ratio >= 0.87 && ratio < 1.25) return L.same;
  if (ratio > 1) {
    const n = ratio < 3 ? Math.round(ratio * 2) / 2 : ratio < 10 ? Math.round(ratio) : Number(ratio.toPrecision(2));
    return L.times(n.toLocaleString());
  }
  let near: { value: number; words: string } = L.fractions[0];
  for (const f of L.fractions) if (Math.abs(Math.log(ratio / f.value)) < Math.abs(Math.log(ratio / near.value))) near = f;
  if (ratio >= 0.18) return near.words;
  const n = 1 / ratio;
  return L.oneIn((n < 20 ? Math.round(n) : Number(n.toPrecision(2))).toLocaleString());
}

function placeTemperature(refs: ReferenceSize[], t: number): SizeComparison {
  const sorted = [...refs].sort((a, b) => a.value - b.value);
  const near = sorted.find((r) => Math.abs(r.value - t) <= 2);
  if (near) return { kind: 'between', refs: [near], phrase: L.aboutTemperature(near.name) };
  const above = sorted.find((r) => r.value > t);
  const below = [...sorted].reverse().find((r) => r.value < t);
  if (!below) return { kind: 'between', refs: [above!], phrase: L.colderThan(above!.name) };
  if (!above) return { kind: 'between', refs: [below], phrase: L.hotterThan(below.name) };
  return { kind: 'between', refs: [below, above], phrase: L.between(below.name, above.name) };
}

// How much of each picture to fill: one picture per whole reference (up to ten), the last a part.
export function pictureFills(ratio: number): number[] | null {
  if (ratio > 10) return null;
  if (ratio <= 1) return [ratio];
  const whole = Math.floor(ratio);
  const part = ratio - whole;
  return [...Array(whole).fill(1), ...(part > 0.05 ? [part] : [])];
}
