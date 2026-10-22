import { describe, expect, it } from 'vitest';
import { UNIT_CATEGORIES, unitCategory } from '@/config/units';
import { convertUnit, readAmount, runConverter, runConverterBack, showAmount, worksBothWays } from './convert';
import type { ConverterId, CustomConverter } from '@/types/converters';

// Conversions (utils/convert.ts): built-in units and custom converters.

const unit = (cat: string, id: string) => unitCategory(cat)!.units.find((u) => u.id === id)!;

describe('built-in units', () => {
  it('factors and temperature', () => {
    expect(convertUnit(1, unit('length', 'mi'), unit('length', 'km'))).toBeCloseTo(1.609344);
    expect(convertUnit(100, unit('temperature', 'c'), unit('temperature', 'f'))).toBeCloseTo(212);
    expect(convertUnit(0, unit('temperature', 'k'), unit('temperature', 'c'))).toBeCloseTo(-273.15);
    expect(convertUnit(1, unit('data', 'GiB'), unit('data', 'MB'))).toBeCloseTo(1073.741824);
  });

  it('every unit has a factor or a way there and back, ids are unique in a category, and its starting pair exists', () => {
    for (const c of UNIT_CATEGORIES) {
      expect(new Set(c.units.map((u) => u.id)).size).toBe(c.units.length);
      for (const u of c.units) expect(!!u.factor || (!!u.toBase && !!u.fromBase)).toBe(true);
      for (const id of c.pair) expect(c.units.some((u) => u.id === id)).toBe(true);
    }
  });
});

describe('custom converters', () => {
  const co2: CustomConverter = {
    id: 'c1' as ConverterId, name: 'CO₂ to carbon', icon: null,
    inputs: [{ key: 'co2', label: 'CO₂', unit: 'kg' }], output: { key: 'c', label: 'Carbon', unit: 'kg' },
    formula: 'co2 * 12/44', inverse: 'c * 44/12', createdAt: '', updatedAt: '',
  };
  const bmi: CustomConverter = { ...co2, inputs: [{ key: 'kg', label: 'Weight', unit: 'kg' }, { key: 'm', label: 'Height', unit: 'm' }], output: { key: 'bmi', label: 'BMI', unit: '' }, formula: 'kg / m^2', inverse: null };

  it('works out the output, and back for one input with a formula back', () => {
    expect(runConverter(co2, { co2: 44 })).toBeCloseTo(12);
    expect(runConverterBack(co2, 12)).toBeCloseTo(44);
    expect(worksBothWays(co2)).toBe(true);
    expect(runConverter(bmi, { kg: 81, m: 1.8 })).toBeCloseTo(25);
    expect(worksBothWays(bmi)).toBe(false);
  });

  it('a missing input or a broken formula gives no answer', () => {
    expect(runConverter(bmi, { kg: 81 })).toBeNaN();
    expect(runConverter({ ...co2, formula: 'co2 *' }, { co2: 1 })).toBeNaN();
  });
});

describe('reading and showing amounts', () => {
  it('reads the number notations, shows up to 10 figures, very large in scientific notation', () => {
    expect(readAmount('1,234.5')).toBe(1234.5);
    expect(readAmount('6.9×10¹⁰')).toBe(69000000000);
    expect(readAmount('abc')).toBeNaN();
    expect(showAmount(2.5e20)).toBe('2.5×10²⁰');
    expect(showAmount(NaN)).toBe('—');
  });
});
