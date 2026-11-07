import { describe, expect, it } from 'vitest';
import { isOpenCalendarItem, type OpenPanes } from './openCalendarItem';

const none = { id: null, occurrence: null };
const panes = (p: Partial<OpenPanes>): OpenPanes => ({ event: none, reminder: none, deadline: none, taskId: null, ...p });

describe('isOpenCalendarItem', () => {
  it('the item whose pane is open, of the same kind', () => {
    expect(isOpenCalendarItem({ kind: 'event', id: 'e1', occurrenceDate: '2026-11-10' }, panes({ event: { id: 'e1', occurrence: null } }))).toBe(true);
    expect(isOpenCalendarItem({ kind: 'reminder', id: 'e1' }, panes({ event: { id: 'e1', occurrence: null } }))).toBe(false);
    expect(isOpenCalendarItem({ kind: 'task', id: 't1' }, panes({ taskId: 't1' }))).toBe(true);
  });
  it('one date of a series opened on its own: only that date', () => {
    const open = panes({ deadline: { id: 'd1', occurrence: '2026-11-10' } });
    expect(isOpenCalendarItem({ kind: 'deadline', id: 'd1', occurrenceDate: '2026-11-10' }, open)).toBe(true);
    expect(isOpenCalendarItem({ kind: 'deadline', id: 'd1', occurrenceDate: '2026-11-17' }, open)).toBe(false);
  });
  it('nothing open: nothing outlined', () => {
    expect(isOpenCalendarItem({ kind: 'event', id: 'e1' }, panes({}))).toBe(false);
  });
});
