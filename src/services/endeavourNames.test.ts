// Things made from an Endeavour's home start with its name, numbered when taken
// (services/endeavourNames.ts); a range that ends before it starts is refused (planErrors).
import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { nameFromEndeavour, uniqueName } from './endeavourNames';
import { planErrors } from '@/components/EndeavourCreator/planErrors';
import { LABELS } from '@/config/labels';

beforeEach(() => {
  for (const s of [useTaskStore, useNoteStore, useListStore, useScheduleStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
});

describe('names from an Endeavour', () => {
  it('a notebook, list or schedule starts with its name, numbered when that’s taken by one of its kind', () => {
    const bio = useTaskStore.getState().addCollection({ kind: 'project', name: 'Biology' });
    expect(nameFromEndeavour('notebook', bio)).toBe('Biology');
    useNoteStore.getState().addNoteTag({ name: 'biology', kind: 'area', parentTagId: null });
    expect(nameFromEndeavour('notebook', bio)).toBe('Biology 2');
    useNoteStore.getState().addNoteTag({ name: 'Biology 2', kind: 'area', parentTagId: null });
    expect(uniqueName('notebook', 'Biology')).toBe('Biology 3');
    // An annotation of that name doesn't count, and other kinds keep their own counts.
    expect(nameFromEndeavour('list', bio)).toBe('Biology');
    expect(nameFromEndeavour('schedule', bio)).toBe('Biology');
  });
});

describe('planErrors', () => {
  it('dates or time off that end before they start get a note', () => {
    const e = planErrors('X', [], { start: '2026-08-10', end: '2026-08-01', breaks: [{ id: 'b', label: 'Off', from: '2026-08-05', to: '2026-08-02' }], exams: null });
    expect(e).toEqual({ dates: LABELS.period.endBeforeStart, 'break-0': LABELS.period.endBeforeStart });
  });
});
