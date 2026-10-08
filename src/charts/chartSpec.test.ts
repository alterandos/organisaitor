import { describe, expect, it } from 'vitest';
import { chartToTable, normalizeChart, parseDelimited, parseNumber, tableToChart, toPercentages, waterfallSteps } from './chartSpec';

describe('reading numbers', () => {
  it.each([
    ['12', 12], ['1,234.5', 1234.5], ['1 200', 1200], ['$12', 12], ['45%', 45], ['(30)', -30],
    ['−7', -7], ['12,5', 12.5], ['€ 3.20', 3.2], ['1e3', 1000], ['.5', 0.5],
  ])('%s → %s', (raw, n) => expect(parseNumber(raw)).toBe(n));
  it.each(['', 'abc', '12 apples', 'Q1'])('%s is not a number', (raw) => expect(parseNumber(raw)).toBeNull());
});

describe('reading a pasted table', () => {
  it('a spreadsheet copy (tabs), with headings', () => {
    const chart = tableToChart(parseDelimited('Quarter\tRevenue\tCosts\nQ1\t1,200\t800\nQ2\t1,500\t900\n'))!;
    expect(chart).toMatchObject({
      xTitle: 'Quarter',
      labels: ['Q1', 'Q2'],
      series: [{ name: 'Revenue', values: [1200, 1500] }, { name: 'Costs', values: [800, 900] }],
    });
  });

  it('CSV with quoted cells, and semicolons', () => {
    expect(parseDelimited('"Paris, France",3\n"He said ""hi""",4')).toEqual([['Paris, France', '3'], ['He said "hi"', '4']]);
    expect(parseDelimited('a;1,5\nb;2,5')).toEqual([['a', '1,5'], ['b', '2,5']]);
    expect(tableToChart(parseDelimited('a;1,5\nb;2,5'))!.series[0].values).toEqual([1.5, 2.5]);
  });

  it('no headings: the series are numbered; one column alone is the values', () => {
    expect(tableToChart(parseDelimited('Mon,3\nTue,5'))!).toMatchObject({ labels: ['Mon', 'Tue'], series: [{ name: 'Series 1', values: [3, 5] }] });
    expect(tableToChart(parseDelimited('Steps\n4000\n6500'))!).toMatchObject({ labels: ['1', '2'], series: [{ name: 'Steps', values: [4000, 6500] }] });
    expect(tableToChart(parseDelimited(''))).toBeNull();
  });

  it('a blank or non-number cell is an empty value; round-trips through a table', () => {
    const chart = tableToChart(parseDelimited('x\ty\na\t\nb\tn/a\nc\t3'))!;
    expect(chart.series[0].values).toEqual([null, null, 3]);
    expect(tableToChart(parseDelimited(chartToTable(chart)))).toMatchObject({ labels: chart.labels, series: chart.series });
  });
});

describe('what a chart draws', () => {
  it('100% stacking turns each label into shares of its total', () => {
    const p = toPercentages([{ name: 'a', values: [1, 0, null] }, { name: 'b', values: [3, 0, 2] }]);
    expect(p.map((s) => s.values)).toEqual([[25, null, null], [75, null, 100]]);
  });

  it('a waterfall floats each change from the running total, then the total', () => {
    expect(waterfallSteps(['Start', 'Sales', 'Costs'], [100, 50, -30], true, 'Total')).toEqual([
      { label: 'Start', from: 0, to: 100, kind: 'up' },
      { label: 'Sales', from: 100, to: 150, kind: 'up' },
      { label: 'Costs', from: 150, to: 120, kind: 'down' },
      { label: 'Total', from: 0, to: 120, kind: 'total' },
    ]);
  });

  it('a stored chart is read whole, whatever it holds', () => {
    const c = normalizeChart({ labels: ['a', 'b'], series: [{ values: [1, 'x', 3] }], stacking: 'odd' });
    expect(c).toMatchObject({ labels: ['a', 'b'], series: [{ name: 'Series 1', values: [1, null] }], stacking: 'none', waterfallTotal: true });
  });
});
