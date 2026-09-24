import { describe, expect, it } from 'vitest';
import {
  blocksMayConflict,
  computeNextOccurrenceDates,
  countTemplateConflicts,
  expandScheduleBlock,
} from '@/utils/scheduleOccurrences';
import type { ScheduleBlock, ScheduleTemplate } from '@/types';

function block(overrides: Partial<ScheduleBlock>): ScheduleBlock {
  return {
    id: 'b1',
    title: 'Class',
    daysOfWeek: [1, 3, 5], // Mon/Wed/Fri
    startTime: '09:00',
    endTime: '10:00',
    location: null,
    interval: 1,
    intervalAnchor: '2026-01-05', // a Monday
    exceptions: [],
    notes: null,
    requiresCommitment: false,
    committedDates: [],
    ...overrides,
  };
}

function template(overrides: Partial<ScheduleTemplate> = {}): Pick<ScheduleTemplate, 'startDate' | 'endDate'> {
  return { startDate: null, endDate: null, ...overrides };
}

describe('expandScheduleBlock', () => {
  it('expands a weekly block over a range', () => {
    const dates = expandScheduleBlock(block({}), template(), '2026-01-05', '2026-01-18');
    expect(dates).toEqual(['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-12', '2026-01-14', '2026-01-16']);
  });

  it('biweekly with an anchor: only lands on every-other week from the anchor', () => {
    const b = block({ daysOfWeek: [1], interval: 2, intervalAnchor: '2026-01-05' });
    const dates = expandScheduleBlock(b, template(), '2026-01-05', '2026-02-02');
    expect(dates).toEqual(['2026-01-05', '2026-01-19', '2026-02-02']);
  });

  it('an anchor in the future excludes earlier weeks even for interval 1', () => {
    const b = block({ daysOfWeek: [1], interval: 1, intervalAnchor: '2026-01-19' });
    const dates = expandScheduleBlock(b, template(), '2026-01-05', '2026-01-26');
    expect(dates).toEqual(['2026-01-19', '2026-01-26']);
  });

  it('skips exceptions', () => {
    const b = block({ daysOfWeek: [1], exceptions: ['2026-01-12'] });
    const dates = expandScheduleBlock(b, template(), '2026-01-05', '2026-01-19');
    expect(dates).toEqual(['2026-01-05', '2026-01-19']);
  });

  it('clips to the template startDate/endDate', () => {
    const dates = expandScheduleBlock(
      block({ daysOfWeek: [1] }),
      template({ startDate: '2026-01-10', endDate: '2026-01-20' }),
      '2026-01-01',
      '2026-01-31'
    );
    expect(dates).toEqual(['2026-01-12', '2026-01-19']);
  });

  it('returns nothing when daysOfWeek is empty', () => {
    expect(expandScheduleBlock(block({ daysOfWeek: [] }), template(), '2026-01-01', '2026-01-31')).toEqual([]);
  });

  it('returns nothing when the range is inverted after clipping', () => {
    const dates = expandScheduleBlock(block({}), template({ endDate: '2026-01-01' }), '2026-01-05', '2026-01-10');
    expect(dates).toEqual([]);
  });
});

describe('computeNextOccurrenceDates', () => {
  it('returns N real upcoming occurrences, skipping off-weeks for a biweekly block', () => {
    const b = block({ daysOfWeek: [1], interval: 2, intervalAnchor: '2026-01-05' });
    const dates = computeNextOccurrenceDates(b, template(), '2026-01-05', 3);
    expect(dates).toEqual(['2026-01-19', '2026-02-02', '2026-02-16']);
  });

  it('stops at the template endDate', () => {
    const b = block({ daysOfWeek: [1] });
    const dates = computeNextOccurrenceDates(b, template({ endDate: '2026-01-20' }), '2026-01-05', 10);
    expect(dates).toEqual(['2026-01-12', '2026-01-19']);
  });
});

describe('blocksMayConflict', () => {
  it('flags overlapping time ranges on a shared day', () => {
    const a = block({ daysOfWeek: [1], startTime: '09:00', endTime: '10:30' });
    const b = block({ id: 'b2', daysOfWeek: [1], startTime: '10:00', endTime: '11:00' });
    expect(blocksMayConflict(a, b)).toBe(true);
  });

  it('does not flag non-overlapping time ranges', () => {
    const a = block({ daysOfWeek: [1], startTime: '09:00', endTime: '10:00' });
    const b = block({ id: 'b2', daysOfWeek: [1], startTime: '10:00', endTime: '11:00' });
    expect(blocksMayConflict(a, b)).toBe(false);
  });

  it('does not flag blocks that share no day', () => {
    const a = block({ daysOfWeek: [1], startTime: '09:00', endTime: '10:00' });
    const b = block({ id: 'b2', daysOfWeek: [2], startTime: '09:00', endTime: '10:00' });
    expect(blocksMayConflict(a, b)).toBe(false);
  });

  it('flags a biweekly and a weekly block on the same slot regardless of interval alignment', () => {
    const a = block({ daysOfWeek: [1], interval: 2, startTime: '09:00', endTime: '10:00' });
    const b = block({ id: 'b2', daysOfWeek: [1], interval: 1, startTime: '09:30', endTime: '10:30' });
    expect(blocksMayConflict(a, b)).toBe(true);
  });
});

describe('countTemplateConflicts', () => {
  it('counts conflicts against other templates only, not itself', () => {
    const target: ScheduleTemplate = {
      id: 't1', name: 'Uni', color: '#000', startDate: null, endDate: null,
      blocks: [block({ id: 'a', daysOfWeek: [1], startTime: '09:00', endTime: '10:00' })],
    } as ScheduleTemplate;
    const selfClashing: ScheduleTemplate = {
      id: 't1', name: 'Uni', color: '#000', startDate: null, endDate: null,
      blocks: [block({ id: 'a2', daysOfWeek: [1], startTime: '09:00', endTime: '10:00' })],
    } as ScheduleTemplate;
    const other: ScheduleTemplate = {
      id: 't2', name: 'Gym', color: '#111', startDate: null, endDate: null,
      blocks: [block({ id: 'b', daysOfWeek: [1], startTime: '09:30', endTime: '10:30' })],
    } as ScheduleTemplate;

    expect(countTemplateConflicts(target, [selfClashing])).toBe(0);
    expect(countTemplateConflicts(target, [other])).toBe(1);
  });
});
