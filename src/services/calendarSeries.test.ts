import { beforeEach, describe, expect, it } from 'vitest';
import { useCalendarStore } from '@/store/calendarStore';
import { useDialogStore } from '@/store/dialogStore';
import { useTrashStore } from '@/store/trashStore';
import type { CalendarReminderId } from '@/types';
import { afterSeriesDeleted, changedDatesOf, unlinkFromSeries } from './calendarSeries';

const weekly = { freq: 'weekly' as const, interval: 1, endKind: 'forever' as const, count: null, until: null };
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useDialogStore.setState({ queue: [] });
  useTrashStore.setState(useTrashStore.getInitialState(), true);
});

function seriesWithTwoChanged() {
  const cal = useCalendarStore.getState();
  const id = cal.addReminder({ title: 'Bins', date: '2030-01-01', repeat: weekly });
  const a = cal.detachReminderOccurrence(id, '2030-01-15')!;
  const b = cal.detachReminderOccurrence(id, '2030-01-08')!;
  return { id, a, b };
}

describe('calendarSeries', () => {
  it('finds the dates taken out of a series, in series order', () => {
    const { id, a, b } = seriesWithTwoChanged();
    expect(changedDatesOf('reminder', id).map((r) => r.id)).toEqual([b, a]);
  });

  it('unlinking leaves the item as it is, out of the series', () => {
    const { id, a } = seriesWithTwoChanged();
    unlinkFromSeries('reminder', a);
    expect(useCalendarStore.getState().reminders[a as CalendarReminderId]).toMatchObject({ seriesId: null, seriesDate: null, title: 'Bins', date: '2030-01-15' });
    expect(changedDatesOf('reminder', id)).toHaveLength(1);
  });

  it('after a series is deleted, asks; "delete them too" removes its changed dates', async () => {
    const { id, a, b } = seriesWithTwoChanged();
    useCalendarStore.getState().deleteReminder(id as CalendarReminderId);
    const done = afterSeriesDeleted('reminder', id);
    await tick();
    const asked = useDialogStore.getState().queue[0];
    expect(asked.title).toContain('2 dates');
    asked.resolve('confirm');
    await done;
    expect(useCalendarStore.getState().reminders[a as CalendarReminderId]).toBeUndefined();
    expect(useCalendarStore.getState().reminders[b as CalendarReminderId]).toBeUndefined();
  });

  it('"keep them" keeps them, unlinked (nothing points at a deleted series)', async () => {
    const { id, a } = seriesWithTwoChanged();
    useCalendarStore.getState().deleteReminder(id as CalendarReminderId);
    const done = afterSeriesDeleted('reminder', id);
    await tick();
    useDialogStore.getState().queue[0].resolve('cancel');
    await done;
    expect(useCalendarStore.getState().reminders[a as CalendarReminderId]).toMatchObject({ seriesId: null });
  });

  it('asks nothing when no date was taken out', async () => {
    const id = useCalendarStore.getState().addReminder({ title: 'Bins', date: '2030-01-01', repeat: weekly });
    await afterSeriesDeleted('reminder', id);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });
});
