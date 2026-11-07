// A rule's tasks for each date folded into one row where rows are listed (overview/series.ts, 2026-11-07).
import { describe, expect, it } from 'vitest';
import { foldSeries } from './series';
import type { OverviewRow } from '@/types/overview';

const row = (key: string, when: string, series?: string, status: OverviewRow['status'] = 'open'): OverviewRow =>
  ({ key, source: 'task', id: key, title: key, when, time: null, status, endeavourId: null, context: null, ...(series ? { series: { key: series, label: '' } } : {}) });

describe('foldSeries', () => {
  it('the next open one stands for its set; the rest are under it; done ones and others stay', () => {
    const rows = [row('b', '2026-09-16', 's'), row('a', '2026-09-09', 's'), row('done', '2026-09-02', 's', 'done'), row('x', '2026-09-10')];
    const { shown, folded } = foldSeries(rows);
    expect(shown.map((r) => r.key)).toEqual(['a', 'done', 'x']);
    expect(folded.get('a')?.map((r) => r.key)).toEqual(['b']);
  });
});
