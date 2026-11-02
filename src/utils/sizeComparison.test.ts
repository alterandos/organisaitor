import { describe, expect, it } from 'vitest';
import { compareSize, pictureFills, ratioWords } from './sizeComparison';
import { REFERENCE_SIZES } from '@/config/referenceSizes';
import { UNIT_CATEGORIES } from '@/config/units';

// The converters' "≈ like…" (2026-11-02).
describe('picturing an amount by something of a known size', () => {
  it('2,500 kg is about half an adult male African elephant', () => {
    const c = compareSize('mass', 2500);
    expect(c?.kind === 'ratio' && c.ref.emoji).toBe('🐘');
    expect(c?.phrase).toBe('about half the weight of an adult male African elephant');
  });

  it('1 million km² is about the size of Egypt; 100 µm about a human hair', () => {
    expect(compareSize('area', 1e12)?.phrase).toBe('about the size of Egypt');
    expect(compareSize('length', 1e-4)?.phrase).toMatch(/the width of a human hair$/);
  });

  it('says how many times, rounded the way people say it', () => {
    expect(ratioWords(1)).toBe('');
    expect(ratioWords(2.4)).toBe('2.5×');
    expect(ratioWords(7.3)).toBe('7×');
    expect(ratioWords(1 / 3)).toBe('a third of');
    expect(ratioWords(0.15)).toBe('1/7 of');
  });

  it('places a temperature between the references either side of it', () => {
    expect(compareSize('temperature', 37)?.phrase).toBe('about the temperature of the human body');
    expect(compareSize('temperature', 29)?.phrase).toBe('between a warm room and the human body');
  });

  it('says nothing when no reference is within a thousand times, or for currency', () => {
    expect(compareSize('length', 1e-15)).toBeNull();
    expect(compareSize('currency', 100)).toBeNull();
    expect(compareSize('mass', 0)).toBeNull();
  });

  it('fills a picture per whole reference, the last as far as the part', () => {
    expect(pictureFills(0.5)).toEqual([0.5]);
    expect(pictureFills(2.5)).toEqual([1, 1, 0.5]);
    expect(pictureFills(40)).toBeNull();
  });

  it('every built-in category but currency has references, in size order', () => {
    for (const cat of UNIT_CATEGORIES.filter((c) => c.id !== 'currency')) {
      const refs = REFERENCE_SIZES[cat.id];
      expect(refs?.length, cat.id).toBeGreaterThanOrEqual(8);
      expect(refs.map((r) => r.value), cat.id).toEqual([...refs.map((r) => r.value)].sort((a, b) => a - b));
    }
  });
});
