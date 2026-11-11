// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';
import { linkTaskToEvent } from '@/services/eventTaskLinks';
import { LABELS } from '@/config/labels';
import { LinkedItemsField } from './LinkedItemsField';
import type { CrossAppRef, TaskId } from '@/types';

// The one Linked items field (2026-11-10): a row per link for every host, a click that lands on the
// item (leaving the task pane), an unlink that removes it (with Undo for a task's calendar link), and
// a create form's picks held until Save.
const L = LABELS.linkedItems;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
  useListStore.setState(useListStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const taskWith = (refs: CrossAppRef[] = []) => useTaskStore.getState().addTask({ title: 'Revise', crossAppRefs: refs }) as TaskId;
const task = (id: TaskId) => useTaskStore.getState().tasks[id];

describe('LinkedItemsField on a task', () => {
  it('shows its notes, lists and calendar items (one date of a series too) as rows; one that’s gone is hidden', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Lecture notes' });
    const listId = useListStore.getState().addList({ name: 'Packing' });
    const e = useCalendarStore.getState().addEvent({ title: 'Exam', date: '2026-11-20', startTime: '09:00' });
    const lecture = useCalendarStore.getState().addEvent({ title: 'Lecture', date: '2026-11-02', startTime: '10:00', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null } });
    const id = taskWith([{ type: 'note', id: noteId }, { type: 'list', id: listId }, { type: 'note', id: 'gone' }]);
    linkTaskToEvent(id, 'prepFor', 'event', e);
    linkTaskToEvent(id, 'related', 'event', lecture, '2026-11-16');
    render(<LinkedItemsField owner={{ type: 'task', id }} refs={task(id).crossAppRefs} suggestFrom="Revise" offers={['note', 'list', 'calendar']} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.textContent).join('|')).toMatch(/Lecture notes.*Packing.*Exam.*Prepares for.*Lecture.*16/);
    expect(screen.getByRole('button', { name: LABELS.taskLinks.linkCalendar })).toBeInTheDocument();
  });

  it('a click leaves the task pane for the item: a calendar item in the calendar at its date, a note in Notes', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Lecture notes' });
    const e = useCalendarStore.getState().addEvent({ title: 'Exam', date: '2026-11-20', startTime: '09:00' });
    const id = taskWith([{ type: 'note', id: noteId }]);
    linkTaskToEvent(id, 'prepFor', 'event', e);
    useUIStore.getState().setActiveView('tasks');
    useUIStore.getState().openTaskPane(id);
    render(<LinkedItemsField owner={{ type: 'task', id }} refs={task(id).crossAppRefs} suggestFrom="Revise" offers={['note']} />);
    fireEvent.click(screen.getByRole('button', { name: /^Exam/ }));
    let ui = useUIStore.getState();
    expect(ui.editingTaskId).toBeNull();
    expect(ui.activeView).toBe('calendar');
    expect(ui.editingCalendarEventId).toBe(e);
    fireEvent.click(screen.getByRole('button', { name: /^Lecture notes/ }));
    ui = useUIStore.getState();
    expect(ui.activeView).toBe('notes');
    expect(ui.editingNoteId).toBe(noteId);
    expect(ui.editingCalendarEventId).toBeNull();
  });

  it('unlinking a calendar item removes the task link and offers Undo; unlinking a note removes the reference', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Lecture notes' });
    const e = useCalendarStore.getState().addEvent({ title: 'Exam', date: '2026-11-20', startTime: '09:00' });
    const id = taskWith([{ type: 'note', id: noteId }]);
    linkTaskToEvent(id, 'prepFor', 'event', e);
    const { rerender } = render(<LinkedItemsField owner={{ type: 'task', id }} refs={task(id).crossAppRefs} suggestFrom="" offers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: `${L.unlink}: Exam` }));
    expect(task(id).itemLinks).toEqual([]);
    const toast = useToastStore.getState().current;
    expect(toast?.message).toBe(L.unlinked('Exam'));
    act(() => toast!.actions[0].onClick());
    expect(task(id).itemLinks).toEqual([expect.objectContaining({ kind: 'prepFor', targetType: 'event', targetId: e })]);
    fireEvent.click(screen.getByRole('button', { name: `${L.unlink}: Lecture notes` }));
    expect(task(id).crossAppRefs).toEqual([]);
    rerender(<LinkedItemsField owner={{ type: 'task', id }} refs={task(id).crossAppRefs} suggestFrom="" offers={[]} />);
    expect(screen.queryByText('Lecture notes')).not.toBeInTheDocument();
  });

  it('links a list picked from "+ List" at once', () => {
    const listId = useListStore.getState().addList({ name: 'Packing' });
    const id = taskWith();
    render(<LinkedItemsField owner={{ type: 'task', id }} refs={[]} suggestFrom="" offers={['list']} />);
    fireEvent.click(screen.getByRole('button', { name: LABELS.listLinks.linkList }));
    fireEvent.click(screen.getByRole('option', { name: /Packing/ }).querySelector('button')!);
    expect(task(id).crossAppRefs).toEqual([{ type: 'list', id: listId }]);
  });
});

describe('LinkedItemsField in a create form (held until Save)', () => {
  it('holds notes and calendar picks, takes them off again, and doesn’t open anything', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Lecture notes' });
    const e = useCalendarStore.getState().addEvent({ title: 'Exam', date: '2026-11-20', startTime: '09:00' });
    const trip = useCalendarStore.getState().addEvent({ title: 'Field trip', date: '2026-11-25', startTime: '08:00' });
    const onRefs = vi.fn();
    const onPending = vi.fn();
    render(<LinkedItemsField owner={null} refs={[{ type: 'note', id: noteId }]} onRefsChange={onRefs} suggestFrom="" offers={['calendar']}
      calendar={{ pending: [{ type: 'event', id: e, kind: 'prepFor', occurrence: null }], onPending }} />);
    expect(screen.queryByRole('button', { name: /^Exam/ })).not.toBeInTheDocument();   // not openable, not a series
    fireEvent.click(screen.getByRole('button', { name: `${L.unlink}: Exam` }));
    expect(onPending).toHaveBeenCalledWith([]);
    fireEvent.click(screen.getByRole('button', { name: `${L.unlink}: Lecture notes` }));
    expect(onRefs).toHaveBeenCalledWith([]);
    // Picking a calendar item holds it, with how it relates (Exam, already held, isn’t offered again).
    fireEvent.click(screen.getByRole('button', { name: LABELS.taskLinks.linkCalendar }));
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Field trip') && b.closest('[role="option"]'))!);
    expect(onPending).toHaveBeenLastCalledWith(
      [{ type: 'event', id: e, kind: 'prepFor', occurrence: null }, { type: 'event', id: trip, kind: 'prepFor', occurrence: null }],
      [{ type: 'event', id: trip, kind: 'prepFor', occurrence: null }],
    );
  });
});

describe('LinkedItemsField on a calendar item and a list', () => {
  it('a calendar item links notes and lists as references', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Trip notes' });
    const e = useCalendarStore.getState().addEvent({ title: 'Flight', date: '2026-11-20', startTime: '09:00', crossAppRefs: [{ type: 'note', id: noteId }] });
    const listId = useListStore.getState().addList({ name: 'Packing' });
    render(<LinkedItemsField owner={{ type: 'event', id: e }} refs={useCalendarStore.getState().events[e].crossAppRefs} suggestFrom="Flight" offers={['note', 'newNote', 'list']} />);
    expect(screen.getByText('Trip notes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: LABELS.listLinks.linkList }));
    fireEvent.click(screen.getByRole('option', { name: /Packing/ }).querySelector('button')!);
    expect(useCalendarStore.getState().events[e].crossAppRefs).toEqual([{ type: 'note', id: noteId }, { type: 'list', id: listId }]);
  });

  it('a list links notes, and a locked note shows as locked, never its title', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Secret' });
    useNoteStore.setState((s) => ({ notes: { ...s.notes, [noteId]: { ...s.notes[noteId], isEncrypted: true, encryptedPayload: 'cipher', title: '' } } }));
    const listId = useListStore.getState().addList({ name: 'Packing' });
    useListStore.getState().updateListLinks(listId, { crossAppRefs: [{ type: 'note', id: noteId }] });
    render(<LinkedItemsField owner={{ type: 'list', id: listId }} refs={useListStore.getState().lists[listId].crossAppRefs} suggestFrom="Packing" offers={['note']} />);
    expect(screen.getByText(new RegExp(L.lockedNote))).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining([LABELS.listLinks.linkNote]));
  });
});
