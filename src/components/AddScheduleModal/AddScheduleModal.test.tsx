// @vitest-environment jsdom
//
// A new Schedule under an Endeavour takes its dates and time off until they're changed (the user,
// 2026-11-07: the time off came across but not the dates).
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AddScheduleModal } from './AddScheduleModal';
import { useTaskStore } from '@/store/taskStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';

beforeEach(() => {
  for (const s of [useTaskStore, useScheduleStore, useCalendarStore]) {
    (s as { setState: (x: unknown, r: boolean) => void; getInitialState: () => unknown }).setState(s.getInitialState(), true);
  }
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(cleanup);

describe('AddScheduleModal', () => {
  it('a new one under an Endeavour takes its dates and time off', () => {
    const sem = useTaskStore.getState().addCollection({ kind: 'project', name: 'Sem 2' });
    useTaskStore.getState().updateCollection(sem, { period: { start: '2026-07-27', end: '2026-11-06', breaks: [{ id: 'b', label: 'Break', from: '2026-09-28', to: '2026-10-02' }], exams: null } });
    useUIStore.setState({ activeView: 'endeavours', endeavourHomeId: sem });
    useUIStore.getState().showAddSchedule();
    useUIStore.getState().setCreateDraft('Sem 2');
    render(<AddScheduleModal />);
    expect(screen.getByText(LABELS.period.scheduleInherited('Sem 2'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    const [s] = Object.values(useScheduleStore.getState().schedules);
    expect(s).toMatchObject({ name: 'Sem 2', startDate: '2026-07-27', endDate: '2026-11-06' });
  });

  it('under an Endeavour with named periods it follows them live, or chooses its own', () => {
    const sem = useTaskStore.getState().addCollection({ kind: 'project', name: 'Sem 2' });
    useTaskStore.getState().updateCollection(sem, {
      attributes: { typeId: null, fields: [{ id: 'teach', name: 'Teaching', type: 'dateRange' }, { id: 'exams', name: 'Exams', type: 'dateRange' }], values: { teach: { from: '2026-07-27', to: '2026-10-30' }, exams: { from: '2026-11-09', to: '2026-11-20' } } },
      dateUse: { runs: ['teach'], pauses: [] },
    });
    useUIStore.setState({ activeView: 'endeavours', endeavourHomeId: sem });
    useUIStore.getState().showAddSchedule();
    useUIStore.getState().setCreateDraft('Exam timetable');
    render(<AddScheduleModal />);
    expect(screen.getByLabelText(`${LABELS.periods.role}: Teaching`)).toHaveValue('runs');
    fireEvent.change(screen.getByLabelText(`${LABELS.periods.role}: Teaching`), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(`${LABELS.periods.role}: Exams`), { target: { value: 'runs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    const [s] = Object.values(useScheduleStore.getState().schedules);
    expect(s).toMatchObject({ name: 'Exam timetable', startDate: null, endDate: null, periodUse: { runs: ['exams'], pauses: [] } });
  });

  it('a block being added has the same fields as one being edited: dates can be left out, and a clash is asked (2026-11-07)', () => {
    // A lecture of no Endeavour, Fridays 09:15–10:00, confirmed (a new block starts at 09:00).
    const lec = useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2026-09-04', startTime: '09:15', endTime: '10:00',
      repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [5] } });
    useUIStore.getState().showAddSchedule();
    useUIStore.getState().setCreateDraft('Tutorials');
    render(<AddScheduleModal />);
    fireEvent.click(screen.getByRole('button', { name: LABELS.scheduleEditor.addBlockLink }));
    fireEvent.change(screen.getByPlaceholderText(LABELS.scheduleEditor.titlePlaceholder), { target: { value: 'Tutorial' } });
    fireEvent.click(screen.getAllByRole('button', { name: LABELS.recurring.dayName[5] }).at(-1)!);
    expect(screen.getByText(new RegExp(`during Lecture`))).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox').filter((b) => b.closest('ul'));
    expect(boxes.length).toBeGreaterThan(1);
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${LABELS.classClash.modes.during}`) }));
    fireEvent.click(screen.getByRole('button', { name: LABELS.scheduleEditor.addBlock }));
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    const item = Object.values(useCalendarStore.getState().events).find((e) => e.title === 'Tutorial')!;
    expect(item.repeat?.exceptions?.length).toBeGreaterThan(0);
    expect(item.onClass).toEqual({ eventId: lec, mode: 'during' });
  });
});
