import { describe, expect, it } from 'vitest';
import type { Collection, CollectionId, EndeavourPeriod } from '@/types';
import { breakDates, effectivePeriod, teachingWeek } from './endeavourPeriod';

const autumn: EndeavourPeriod = { start: '2026-09-14', end: '2026-12-18', breaks: [{ id: 'b', label: 'Mid-semester break', from: '2026-10-26', to: '2026-10-30' }] };
const summer: EndeavourPeriod = { start: '2027-01-04', end: '2027-02-12', breaks: [] };
const c = (id: string, extra: Partial<Collection> = {}): Collection => ({ id, kind: 'project', name: id, ...extra }) as Collection;
const partOf = (targetId: string) => [{ kind: 'partOf' as const, targetId: targetId as CollectionId, createdAt: '' }];

describe("an Endeavour's period and breaks", () => {
  it('its own, or the nearest above it, live; its own replaces it whole', () => {
    const all = {
      sem: c('sem', { period: autumn }),
      geos: c('geos', { links: partOf('sem') }),
      essay: c('essay', { links: partOf('geos') }),
      sum: c('sum', { links: partOf('sem'), period: summer }),
      loose: c('loose'),
    };
    expect(effectivePeriod('essay', all)).toEqual({ period: autumn, from: 'sem', inherited: true });
    expect(effectivePeriod('sem', all)).toEqual({ period: autumn, from: 'sem', inherited: false });
    expect(effectivePeriod('sum', all)?.period).toBe(summer);
    expect(effectivePeriod('loose', all)).toBeNull();
  });

  it('its break days, and teaching weeks counted from the start (a break still has its number)', () => {
    expect(breakDates(autumn)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    expect(teachingWeek('2026-09-14', autumn)).toBe(1);
    expect(teachingWeek('2026-09-20', autumn)).toBe(1);
    expect(teachingWeek('2026-10-28', autumn)).toBe(7);
    expect(teachingWeek('2026-09-01', autumn)).toBeNull();
  });
});
