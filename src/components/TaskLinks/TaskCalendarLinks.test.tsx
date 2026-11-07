// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { linkTaskToEvent } from '@/services/eventTaskLinks';
import { LABELS } from '@/config/labels';
import { TaskCalendarLinks } from './TaskCalendarLinks';
import type { TaskId } from '@/types';

// A task's links to calendar items, in its Linked items (2026-11-07).
beforeEach(() => {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TaskCalendarLinks', () => {
  it('lists the task’s links to an event, a Reminder and a Deadline; a click leaves the task for the item in the calendar', () => {
    const cal = useCalendarStore.getState();
    const e = cal.addEvent({ title: 'Exam', date: '2026-11-20', startTime: '09:00' });
    const r = cal.addReminder({ title: 'Call the bank', date: '2026-11-12', time: null });
    const d = cal.addDeadline({ title: 'Essay due', date: '2026-11-15', time: null });
    const taskId = useTaskStore.getState().addTask({ title: 'Revise' }) as TaskId;
    linkTaskToEvent(taskId, 'prepFor', 'event', e);
    linkTaskToEvent(taskId, 'related', 'reminder', r);
    linkTaskToEvent(taskId, 'related', 'deadline', d);
    useUIStore.getState().openTaskPane(taskId);
    render(<TaskCalendarLinks task={useTaskStore.getState().tasks[taskId]} suggestFrom="Revise" picking={false} onPicking={() => {}} />);
    for (const t of ['Exam', 'Call the bank', 'Essay due']) expect(screen.getByRole('button', { name: new RegExp(t) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exam/ }));
    const ui = useUIStore.getState();
    expect(ui.editingTaskId).toBeNull();
    expect(ui.activeView).toBe('calendar');
    expect(ui.editingCalendarEventId).toBe(e);
  });

  it('in the add-task form, picks are held and taken off again', () => {
    const onPending = vi.fn();
    const e = useCalendarStore.getState().addEvent({ title: 'Exam', date: '2026-11-20', startTime: '09:00' });
    render(<TaskCalendarLinks pending={[{ type: 'event', id: e, kind: 'prepFor', occurrence: null }]} onPending={onPending} suggestFrom="" picking={false} onPicking={() => {}} />);
    expect(screen.getByText(/Exam/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: LABELS.taskLinks.removeLink }));
    expect(onPending).toHaveBeenCalledWith([]);
  });
});
