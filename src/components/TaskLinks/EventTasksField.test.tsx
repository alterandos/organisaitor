// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { linkTaskToEvent } from '@/services/eventTaskLinks';
import { EventTasksField } from './EventTasksField';
import { LABELS } from '@/config/labels';
import type { CalendarEventId, RepeatConfig, TaskId } from '@/types';

// One Tasks section for a repeating event (2026-11-05): All dates makes a task for each date (a task
// rule), Only this date a task for that date alone.

const WEEKLY: RepeatConfig = { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null };
const L = LABELS.taskLinks.event;
beforeEach(() => {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => cleanup());

describe('a repeating event’s tasks', () => {
  it('All dates: Prepare adds a task for each date; Only this date: Prepare opens a task for that date', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2026-11-02', startTime: '10:00', repeat: WEEKLY });
    render(<EventTasksField type="event" id={id} title="Lecture" repeats occurrence="2026-11-16" />);
    fireEvent.click(screen.getByRole('button', { name: L.addPrep }));
    expect(useCalendarStore.getState().events[id as CalendarEventId].taskRules).toEqual([expect.objectContaining({ side: 'before' })]);
    fireEvent.click(screen.getByRole('radio', { name: 'Just this one' }));
    fireEvent.click(screen.getByRole('button', { name: L.addPrep }));
    expect(useUIStore.getState().pendingEventLink).toEqual({ kind: 'prepFor', targetType: 'event', targetId: id, occurrence: '2026-11-16' });
  });

  it('a task linked to one date shows under that date, and under All dates marked with it (2026-11-07); it is due on it', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2026-11-02', startTime: '10:00', repeat: WEEKLY });
    const taskId = useTaskStore.getState().addTask({ title: 'Read chapter 3' }) as TaskId;
    linkTaskToEvent(taskId, 'prepFor', 'event', id, '2026-11-16');
    expect(useTaskStore.getState().tasks[taskId]).toMatchObject({ deadline: '2026-11-16', deadlineTime: '10:00' });
    render(<EventTasksField type="event" id={id} title="Lecture" repeats occurrence="2026-11-23" />);
    expect(screen.getByRole('button', { name: /Read chapter 3/ })).toHaveTextContent('16');
    fireEvent.click(screen.getByRole('radio', { name: 'Just this one' }));
    expect(screen.queryByText(/Read chapter 3/)).toBeNull();
  });

  it('under All dates, the tasks a rule makes for each date are not listed (the rule stands for them)', () => {
    const id = useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2026-11-02', startTime: '10:00', repeat: WEEKLY });
    const taskId = useTaskStore.getState().addTask({ title: 'Prepare for Lecture' }) as TaskId;
    useTaskStore.getState().updateTask(taskId, { itemLinks: [{ kind: 'prepFor', targetType: 'event', targetId: id, reason: null, createdAt: '2026-11-01T00:00:00Z', occurrence: '2026-11-09', ruleId: 'r1' }] as never });
    render(<EventTasksField type="event" id={id} title="Lecture" repeats occurrence="2026-11-09" />);
    expect(screen.queryByText(/Prepare for Lecture/)).toBeNull();
  });

  it('a Reminder takes linked tasks too, due when it is', () => {
    const rid = useCalendarStore.getState().addReminder({ title: 'Call the bank', date: '2026-11-20', time: '09:30' });
    const taskId = useTaskStore.getState().addTask({ title: 'Find the account number' }) as TaskId;
    linkTaskToEvent(taskId, 'prepFor', 'reminder', rid);
    expect(useTaskStore.getState().tasks[taskId]).toMatchObject({ deadline: '2026-11-20', deadlineTime: '09:30' });
    render(<EventTasksField type="reminder" id={rid} title="Call the bank" />);
    expect(screen.getByText('Find the account number')).toBeInTheDocument();
  });
});
