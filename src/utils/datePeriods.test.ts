// Named periods (utils/datePeriods.ts, services/periodConversion.ts): what an Endeavour or a Schedule
// runs and pauses during resolves to dates and breaks, live; an old single period converts losing
// nothing.
import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { periodFromUse, periodToNamed, periodsFor, dateUseOf, type NamedPeriod } from './datePeriods';
import { effectivePeriod, breakDates } from './endeavourPeriod';
import { scheduleBounds } from './scheduleItems';
import { convertPeriods } from '@/services/periodConversion';
import type { CollectionId, ScheduleTemplate } from '@/types';

beforeEach(() => useTaskStore.setState(useTaskStore.getInitialState(), true));

const P = (id: string, from: string, to: string): NamedPeriod => ({ id, name: id, from, to, endeavourId: 'x' });

describe('periodFromUse', () => {
  it('runs from the first day to the last of what it runs during, skipping gaps and what it pauses during', () => {
    const p = periodFromUse({ runs: ['exams', 'teach'], pauses: ['brk'] }, [P('teach', '2026-07-27', '2026-10-30'), P('exams', '2026-11-09', '2026-11-20'), P('brk', '2026-09-28', '2026-10-02')]);
    expect(p).toMatchObject({ start: '2026-07-27', end: '2026-11-20' });
    expect(p!.breaks.map((b) => [b.label, b.from, b.to])).toEqual([['brk', '2026-09-28', '2026-10-02'], ['', '2026-10-31', '2026-11-08']]);
    expect(periodFromUse({ runs: ['nope'], pauses: [] }, [])).toBeNull();
  });
});

describe('an Endeavour’s periods, live', () => {
  const semester = () => {
    const sem = useTaskStore.getState().addCollection({ kind: 'project', name: 'Sem 2' });
    useTaskStore.getState().updateCollection(sem, {
      attributes: { typeId: null, fields: [{ id: 'teach', name: 'Teaching', type: 'dateRange' }, { id: 'brk', name: 'Break', type: 'dateRange' }], values: { teach: { from: '2026-07-27', to: '2026-10-30' }, brk: { from: '2026-09-28', to: '2026-09-29' } } },
      dateUse: { runs: ['teach'], pauses: ['brk'] },
    });
    const bio = useTaskStore.getState().addCollection({ kind: 'project', name: 'Bio' });
    useTaskStore.getState().addEndeavourLink(bio, 'partOf', sem);
    return { sem, bio };
  };

  it('a part takes its parent’s periods and use; moving the parent’s dates moves its Schedule', () => {
    const { sem, bio } = semester();
    const all = () => useTaskStore.getState().collections;
    expect(periodsFor(bio, all()).map((p) => p.name)).toEqual(['Teaching', 'Break']);
    expect(dateUseOf(bio, all())?.from).toBe(sem);
    expect(effectivePeriod(bio, all())).toMatchObject({ period: { start: '2026-07-27', end: '2026-10-30' }, from: sem, inherited: true });
    const schedule = { id: 's', name: 'Bio classes', collectionId: bio, startDate: null, endDate: null, periodUse: { runs: ['teach'], pauses: [] } } as unknown as ScheduleTemplate;
    expect(scheduleBounds(schedule, all())).toEqual({ start: '2026-07-27', end: '2026-10-30', breaks: [] });
    const s = all()[sem as CollectionId];
    useTaskStore.getState().updateCollection(sem, { attributes: { ...s.attributes!, values: { ...s.attributes!.values, teach: { from: '2026-08-03', to: '2026-11-06' } } } });
    expect(scheduleBounds(schedule, all())).toMatchObject({ start: '2026-08-03', end: '2026-11-06' });
    // As its Endeavour (no use of its own): the Endeavour's break too.
    expect(scheduleBounds({ ...schedule, periodUse: undefined }, all()).breaks).toEqual(['2026-09-28', '2026-09-29']);
  });
});

describe('converting an old single period', () => {
  it('its dates run, its breaks pause, its exam period is kept unused; the dates read the same', () => {
    const named = periodToNamed({ start: '2026-07-27', end: '2026-11-06', breaks: [{ id: 'b', label: 'Mid-sem', from: '2026-09-28', to: '2026-10-02' }], exams: { from: '2026-11-09', to: '2026-11-20' } },
      { dates: 'Teaching', exams: 'Exams', timeOff: 'Time off' }, (() => { let n = 0; return () => `p${n++}`; })());
    expect(named.fields.map((f) => [f.name, f.type])).toEqual([['Teaching', 'dateRange'], ['Exams', 'dateRange'], ['Mid-sem', 'dateRange']]);
    expect(named.use).toEqual({ runs: ['p0'], pauses: ['b'] });
  });

  it('convertPeriods turns every stored period into named periods, and the effective dates don’t change', () => {
    const sem = useTaskStore.getState().addCollection({ kind: 'project', name: 'Sem' });
    const period = { start: '2026-07-27', end: '2026-11-06', breaks: [{ id: 'b', label: 'Mid-sem', from: '2026-09-28', to: '2026-10-02' }], exams: null };
    useTaskStore.getState().updateCollection(sem, { period });
    const before = effectivePeriod(sem, useTaskStore.getState().collections)!.period;
    expect(convertPeriods()).toBe(1);
    const c = useTaskStore.getState().collections[sem];
    expect(c.period).toBeNull();
    expect(c.dateUse?.runs).toHaveLength(1);
    const after = effectivePeriod(sem, useTaskStore.getState().collections)!.period;
    expect([after.start, after.end, breakDates(after)]).toEqual([before.start, before.end, breakDates(before)]);
  });
});
