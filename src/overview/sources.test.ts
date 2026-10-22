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

describe('a repeating reminder or deadline in an Overview', () => {
  it('keeps each date marked done as a done row, beside the row for its next date', async () => {
    const { SOURCE_BY_KEY } = await import('./sources');
    const reminder = { id: 'r1', title: 'Hash run', date: '2026-10-06', time: null, repeat: weekly, doneDates: ['2026-10-13'], reminderType: 'default', archivedAt: null, collectionId: null };
    const snap = { reminders: { r1: reminder } } as never;
    const rows = SOURCE_BY_KEY.reminder.rows(snap, '2026-10-13').rows;
    expect(rows.map((r) => [r.key, r.when, r.status])).toEqual([
      ['reminder:r1', '2026-10-20', 'open'],
      ['reminder:r1@2026-10-13', '2026-10-13', 'done'],
    ]);
  });

  it('a one-off item has no extra row: its own row is the done one', async () => {
    const { SOURCE_BY_KEY } = await import('./sources');
    const deadline = { id: 'd1', title: 'Essay', date: '2026-10-13', time: null, repeat: null, doneDates: ['2026-10-13'], deadlineType: 'default', archivedAt: null, collectionId: null };
    const rows = SOURCE_BY_KEY.deadline.rows({ deadlines: { d1: deadline } } as never, '2026-10-13').rows;
    expect(rows.map((r) => [r.key, r.status])).toEqual([['deadline:d1', 'done']]);
  });
});
