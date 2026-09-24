import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import {
  deleteTaskWithCleanup, deleteEventWithCleanup, deleteReminderWithCleanup,
  deleteNoteWithCleanup, removeCrossAppRefFromTarget, unlinkCrossAppRef,
} from '@/services/crossAppLinkCleanup';
import type { NoteId } from '@/types/notes';

function docWithLink(targetType: string, targetId: string) {
  return JSON.stringify({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'linked text', marks: [{ type: 'artifactLink', attrs: { targetType, targetId } }] }],
    }],
  });
}

function hasMark(contentJson: string): boolean {
  return JSON.parse(contentJson).content[0].content[0].marks?.length > 0;
}

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useNoteStore.setState(useNoteStore.getInitialState(), true);
});

describe('deleteTaskWithCleanup', () => {
  it('deletes sub-tasks, the shadow calendar event and reminder, and strips the note\'s ArtifactLinkMark', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: noteId }] });
    const childId = useTaskStore.getState().addTask({ title: 'Child', parentId: taskId });
    const eventId = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    const reminderId = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01' });
    useTaskStore.getState().updateTask(taskId, { calendarEventId: eventId, calendarReminderId: reminderId });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('task', taskId) });

    deleteTaskWithCleanup(taskId);

    expect(useTaskStore.getState().tasks[taskId]).toBeUndefined();
    expect(useTaskStore.getState().tasks[childId]).toBeUndefined();
    expect(useCalendarStore.getState().events[eventId]).toBeUndefined();
    expect(useCalendarStore.getState().reminders[reminderId]).toBeUndefined();
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });

  it('leaves a locked (encrypted, not-yet-decrypted) note\'s dead mark alone rather than crashing on ciphertext', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: noteId }] });
    useNoteStore.setState((s) => ({
      notes: { ...s.notes, [noteId]: { ...s.notes[noteId], isEncrypted: true, encryptedPayload: 'ciphertext', content: '' } },
    }));

    expect(() => deleteTaskWithCleanup(taskId)).not.toThrow();
    expect(useTaskStore.getState().tasks[taskId]).toBeUndefined();
  });
});

describe('deleteEventWithCleanup', () => {
  it('un-schedules (rather than orphans) a task whose scheduled shadow event is deleted', () => {
    const eventId = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', scheduledAt: '2030-01-01', calendarEventId: eventId });

    deleteEventWithCleanup(eventId);

    expect(useCalendarStore.getState().events[eventId]).toBeUndefined();
    const task = useTaskStore.getState().tasks[taskId];
    expect(task.calendarEventId).toBeNull();
    expect(task.scheduledAt).toBeNull();
  });

  it('strips the ArtifactLinkMark from a note that links to the deleted event', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const eventId = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', crossAppRefs: [{ type: 'note', id: noteId }] });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('event', eventId) });

    deleteEventWithCleanup(eventId);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });
});

describe('deleteReminderWithCleanup', () => {
  it('strips the ArtifactLinkMark from a note that links to the deleted reminder', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const reminderId = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01', crossAppRefs: [{ type: 'note', id: noteId }] });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('reminder', reminderId) });

    deleteReminderWithCleanup(reminderId);
    expect(useCalendarStore.getState().reminders[reminderId]).toBeUndefined();
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });
});

describe('deleteNoteWithCleanup', () => {
  it('strips the dangling reverse reference from every task/event/reminder that pointed at the note, and deletes its structured tag entries', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: noteId }] });
    const eventId = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', crossAppRefs: [{ type: 'note', id: noteId }] });
    const reminderId = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01', crossAppRefs: [{ type: 'note', id: noteId }] });
    const entryId = useNoteStore.getState().addStructuredTagEntry({
      typeKey: 'acronym', tagId: 'tag-1', term: 'ASX', fields: {}, noteId, collectionId: null,
    });

    deleteNoteWithCleanup(noteId);

    expect(useNoteStore.getState().notes[noteId as NoteId]).toBeUndefined();
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([]);
    expect(useCalendarStore.getState().events[eventId].crossAppRefs).toEqual([]);
    expect(useCalendarStore.getState().reminders[reminderId].crossAppRefs).toEqual([]);
    expect(useNoteStore.getState().structuredTagEntries[entryId]).toBeUndefined();
  });

  it('leaves an unrelated task\'s crossAppRefs alone', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const otherNoteId = useNoteStore.getState().addNote({ title: 'Other' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: otherNoteId }] });

    deleteNoteWithCleanup(noteId);
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([{ type: 'note', id: otherNoteId }]);
  });
});

describe('removeCrossAppRefFromTarget / unlinkCrossAppRef', () => {
  it('removeCrossAppRefFromTarget strips only the matching ref, leaving others', () => {
    const taskId = useTaskStore.getState().addTask({
      title: 'Task',
      crossAppRefs: [{ type: 'note', id: 'n1' as NoteId }, { type: 'note', id: 'n2' as NoteId }],
    });
    removeCrossAppRefFromTarget('task', taskId, { type: 'note', id: 'n1' });
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([{ type: 'note', id: 'n2' }]);
  });

  it('unlinkCrossAppRef removes the ref from the target AND strips the mark from the note\'s side', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: noteId }] });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('task', taskId) });

    unlinkCrossAppRef('task', taskId, { type: 'note', id: noteId });

    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([]);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });
});
