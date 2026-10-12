import { describe, expect, it } from 'vitest';
import { calendarWhen } from './sources';
import type { RepeatConfig } from '@/types';

const weekly: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };

describe('calendarWhen (a calendar item\'s date and status in an Overview)', () => {
  it('a reminder or deadline marked done on its date is done, whether past or ahead', () => {
    expect(calendarWhen('2026-10-20', null, null, '2026-10-13', ['2026-10-20'])).toEqual({ when: '2026-10-20', status: 'done' });
    expect(calendarWhen('2026-10-01', null, null, '2026-10-13', ['2026-10-01'])).toEqual({ when: '2026-10-01', status: 'done' });
  });

  it('not marked done: open while ahead, past once gone by', () => {
    expect(calendarWhen('2026-10-20', null, null, '2026-10-13')).toEqual({ when: '2026-10-20', status: 'open' });
    expect(calendarWhen('2026-10-01', null, null, '2026-10-13')).toEqual({ when: '2026-10-01', status: 'past' });
  });

  it('a repeating one shows its next date not yet marked done', () => {
    expect(calendarWhen('2026-10-06', null, weekly, '2026-10-13', ['2026-10-13'])).toEqual({ when: '2026-10-20', status: 'open' });
    expect(calendarWhen('2026-10-06', null, weekly, '2026-10-13')).toEqual({ when: '2026-10-13', status: 'open' });
  });
});
