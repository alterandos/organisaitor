import { beforeEach, describe, expect, it } from 'vitest';
import { useScheduleStore } from '@/store/scheduleStore';
import { createScheduleBlock } from '@/utils/scheduleBlocks';

beforeEach(() => {
  useScheduleStore.setState(useScheduleStore.getInitialState(), true);
});

function seedSchedule(requiresCommitment = true) {
  const block = createScheduleBlock({
    title: 'Gym', daysOfWeek: [1, 3, 5], startTime: '07:00', endTime: '08:00',
    intervalAnchor: '2030-01-01', requiresCommitment,
  });
  const id = useScheduleStore.getState().addSchedule({ name: 'Weekly', blocks: [block] });
  return { id, blockId: block.id };
}

describe('addException / removeException', () => {
  it('adds a date once and does not duplicate it on a second add', () => {
    const { id, blockId } = seedSchedule();
    useScheduleStore.getState().addException(id, blockId, '2030-01-06');
    useScheduleStore.getState().addException(id, blockId, '2030-01-06');
    expect(useScheduleStore.getState().schedules[id].blocks[0].exceptions).toEqual(['2030-01-06']);
  });

  it('removeException only removes the given date, leaving others', () => {
    const { id, blockId } = seedSchedule();
    useScheduleStore.getState().addException(id, blockId, '2030-01-06');
    useScheduleStore.getState().addException(id, blockId, '2030-01-08');
    useScheduleStore.getState().removeException(id, blockId, '2030-01-06');
    expect(useScheduleStore.getState().schedules[id].blocks[0].exceptions).toEqual(['2030-01-08']);
  });

  it('touches only the named block, leaving sibling blocks untouched', () => {
    const other = createScheduleBlock({ title: 'Yoga', daysOfWeek: [2], startTime: '18:00', endTime: '19:00', intervalAnchor: '2030-01-01' });
    const block = createScheduleBlock({ title: 'Gym', daysOfWeek: [1], startTime: '07:00', endTime: '08:00', intervalAnchor: '2030-01-01' });
    const id = useScheduleStore.getState().addSchedule({ name: 'Weekly', blocks: [block, other] });
    useScheduleStore.getState().addException(id, block.id, '2030-01-06');
    expect(useScheduleStore.getState().schedules[id].blocks.find((b) => b.id === other.id)!.exceptions).toEqual([]);
  });
});

describe('commitOccurrences / uncommitOccurrence', () => {
  it('commits several dates at once, merging with (and de-duplicating against) whatever was already committed', () => {
    const { id, blockId } = seedSchedule();
    useScheduleStore.getState().commitOccurrences(id, blockId, ['2030-01-06']);
    useScheduleStore.getState().commitOccurrences(id, blockId, ['2030-01-06', '2030-01-08', '2030-01-13']);
    expect(useScheduleStore.getState().schedules[id].blocks[0].committedDates.sort()).toEqual(
      ['2030-01-06', '2030-01-08', '2030-01-13']
    );
  });

  it('uncommitOccurrence removes only that date', () => {
    const { id, blockId } = seedSchedule();
    useScheduleStore.getState().commitOccurrences(id, blockId, ['2030-01-06', '2030-01-08']);
    useScheduleStore.getState().uncommitOccurrence(id, blockId, '2030-01-06');
    expect(useScheduleStore.getState().schedules[id].blocks[0].committedDates).toEqual(['2030-01-08']);
  });

  it('touching an unknown schedule or block id is a harmless no-op', () => {
    const { id, blockId } = seedSchedule();
    expect(() => useScheduleStore.getState().commitOccurrences('nope' as never, blockId, ['2030-01-06'])).not.toThrow();
    expect(() => useScheduleStore.getState().commitOccurrences(id, 'nope', ['2030-01-06'])).not.toThrow();
    expect(useScheduleStore.getState().schedules[id].blocks[0].committedDates).toEqual([]);
  });
});

describe('toggleScheduleActive / deleteSchedule', () => {
  it('toggles active back and forth', () => {
    const { id } = seedSchedule();
    expect(useScheduleStore.getState().schedules[id].active).toBe(true);
    useScheduleStore.getState().toggleScheduleActive(id);
    expect(useScheduleStore.getState().schedules[id].active).toBe(false);
    useScheduleStore.getState().toggleScheduleActive(id);
    expect(useScheduleStore.getState().schedules[id].active).toBe(true);
  });

  it('deleteSchedule removes it entirely', () => {
    const { id } = seedSchedule();
    useScheduleStore.getState().deleteSchedule(id);
    expect(useScheduleStore.getState().schedules[id]).toBeUndefined();
  });
});
