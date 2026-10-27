import { describe, expect, it } from 'vitest';
import { cycleNotation, formatNumber, notationReady, numberAt, numberForms, parseNumber, readyNumbersIn } from './numberNotation';

// One number, four ways of writing it (utils/numberNotation.ts).

describe('reading and writing a number exactly', () => {
  it('69000000000 in every notation', () => {
    expect(numberForms('69000000000').map((f) => f.text)).toEqual(['69000000000', '69,000,000,000', '6.9×10¹⁰', '6.9E10']);
  });

  it.each(['69,000,000,000', '6.9×10¹⁰', '6.9E10', '6.9e+10', '6.9 x 10^10', '6.9*10^10'])('%s reads as 69000000000', (t) => {
    expect(formatNumber(parseNumber(t)!, 'plain')).toBe('69000000000');
  });

  it('small, negative and long numbers stay exact', () => {
    expect(numberForms('0.00042').map((f) => f.text)).toEqual(['0.00042', '4.2×10⁻⁴', '4.2E-4']);
    expect(formatNumber(parseNumber('-1234.5')!, 'grouped')).toBe('-1,234.5');
    expect(formatNumber(parseNumber('12345678901234567890')!, 'e')).toBe('1.234567890123456789E19');
    expect(formatNumber(parseNumber('0.1')!, 'plain')).toBe('0.1');
  });

  it('not a number: nothing', () => {
    expect(parseNumber('12,34')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('cycling and finding', () => {
  it('steps through the forms, wrapping round, and skips ones that read the same', () => {
    expect(cycleNotation('69000000000', 1)).toBe('69,000,000,000');
    expect(cycleNotation('6.9E10', 1)).toBe('69000000000');
    expect(cycleNotation('69000000000', -1)).toBe('6.9E10');
    expect(cycleNotation('42', 1)).toBe('4.2×10¹');
    expect(cycleNotation('7', 1)).toBeNull();
  });

  it('finds the number the cursor touches, not one inside a word', () => {
    const line = 'Emissions were 6.9E10 t of CO2 in 2026.';
    expect(numberAt(line, 18)).toEqual({ from: 15, to: 21 });
    expect(numberAt(line, 28)).toBeNull();
    expect(numberAt(line, 38)).toEqual({ from: 34, to: 38 });
  });
});

describe('numbers ready for other notations', () => {
  it('seven or more digits as written, or a power of ten already', () => {
    expect(notationReady('1000000')).toBe(true);
    expect(notationReady('1,000,000')).toBe(true);
    expect(notationReady('0.0000012')).toBe(true);
    expect(notationReady('6.9×10¹⁰')).toBe(true);
    expect(notationReady('6.9E10')).toBe(true);
    expect(notationReady('999999')).toBe(false);
    expect(notationReady('2026')).toBe(false);
    expect(notationReady('CO2')).toBe(false);
  });
  it('finds them in a line, leaving short numbers and words alone', () => {
    const line = 'In 2024 about 69000000000 cells, or 6.9E10, not v2.';
    expect(readyNumbersIn(line).map((r) => line.slice(r.from, r.to))).toEqual(['69000000000', '6.9E10']);
  });
});
