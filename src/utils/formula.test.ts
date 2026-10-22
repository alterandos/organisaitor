import { describe, expect, it } from 'vitest';
import { compileFormula, formulaError } from './formula';

// Formulas a person writes (utils/formula.ts): mathjs's syntax, worked out without eval.

const calc = (text: string, vars: Record<string, number> = {}) => compileFormula(text).evaluate(vars);

describe('working out a formula', () => {
  it('the usual order: brackets, powers (right to left), × ÷, + −, and unary minus', () => {
    expect(calc('1 + 2 * 3')).toBe(7);
    expect(calc('(1 + 2) * 3')).toBe(9);
    expect(calc('2 ^ 3 ^ 2')).toBe(512);
    expect(calc('-2 ^ 2')).toBe(-4);
    expect(calc('10 ÷ 4 × 2 − 1')).toBe(4);
    expect(calc('1.5e3 + .5')).toBe(1500.5);
  });

  it('inputs, constants and functions', () => {
    expect(calc('x * 12/44', { x: 44 })).toBe(12);
    expect(calc('kg / height^2', { kg: 81, height: 1.8 })).toBeCloseTo(25);
    expect(calc('log(e)')).toBe(1);
    expect(calc('log(8, 2)')).toBeCloseTo(3);
    expect(calc('log10(1000) + ln(1) + sqrt(16) + cbrt(27)')).toBeCloseTo(10);
    expect(calc('round(pi, 2)')).toBe(3.14);
    expect(calc('max(1, 7, 3) + abs(-2)')).toBe(9);
    expect(compileFormula('(f - 32) * 5/9').variables).toEqual(['f']);
  });

  it('an answer that isn’t a real number is NaN', () => {
    expect(calc('sqrt(-1)')).toBeNaN();
    expect(calc('1 / 0')).toBeNaN();
  });
});

describe('saying what’s wrong', () => {
  it.each([
    ['', 'Write a formula'],
    ['1 +', 'ends too soon'],
    ['(1 + 2', 'isn’t closed'],
    ['foo(1)', 'no function called “foo”'],
    ['x * y', '“y” isn’t one of the inputs'],
    ['sqrt(1, 2)', 'wrong number of values'],
    ['2 $ 3', '“$” doesn’t belong here'],
  ])('%j', (text, message) => expect(formulaError(text, ['x'])).toContain(message));

  it('a good formula has nothing wrong', () => expect(formulaError('x * 2', ['x'])).toBeNull());
});
