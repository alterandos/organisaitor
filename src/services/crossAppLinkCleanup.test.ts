import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useTrashStore } from '@/store/trashStore';
import { deleteForever, emptyTrash, restoreFromTrash } from '@/services/trash';
import { linkTaskToEvent } from '@/services/eventTaskLinks';
import {
  deleteTaskWithCleanup, deleteEventWithCleanup, deleteReminderWithCleanup,
  deleteNoteWithCleanup, deleteListWithCleanup, removeCrossAppRefFromTarget, unlinkCrossAppRef,
  addCrossAppRef, unlinkOneCrossAppRef,
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
  useListStore.setState(useListStore.getInitialState(), true);
  useTrashStore.setState(useTrashStore.getInitialState(), true);
});

// The Recycling Bin entry a delete just made for this item.
const trashed = (id: string) => Object.values(useTrashStore.getState().entries).find((e) => (e.snapshot as { id: string }).id === id)!.id;

// Deleting leaves every link to the item in place, hidden, so a restore brings them back; only
// "Delete forever" (or emptying the bin) takes them away (agreed with the user 2026-11-10).
describe('deleteTaskWithCleanup', () => {
  it('deletes sub-tasks and the shadow calendar event and reminder, and leaves the note\'s linked text', () => {
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
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(true);
  });

  it('deleted forever, a locked (encrypted, not-yet-decrypted) note\'s dead mark is left alone rather than crashing on ciphertext', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: noteId }] });
    useNoteStore.setState((s) => ({
      notes: { ...s.notes, [noteId]: { ...s.notes[noteId], isEncrypted: true, encryptedPayload: 'ciphertext', content: '' } },
    }));

    deleteTaskWithCleanup(taskId);
    expect(() => deleteForever(trashed(taskId))).not.toThrow();
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

  it('leaves the linked text in a note that links to the deleted event; deleting it forever takes it out', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const eventId = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', crossAppRefs: [{ type: 'note', id: noteId }] });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('event', eventId) });

    deleteEventWithCleanup(eventId);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(true);
    deleteForever(trashed(eventId));
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });
});

describe('deleteReminderWithCleanup', () => {
  it('leaves the linked text in a note that links to the deleted reminder', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const reminderId = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01', crossAppRefs: [{ type: 'note', id: noteId }] });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('reminder', reminderId) });

    deleteReminderWithCleanup(reminderId);
    expect(useCalendarStore.getState().reminders[reminderId]).toBeUndefined();
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(true);
  });
});

describe('deleteNoteWithCleanup', () => {
  it('leaves every reference to the note (hidden while it\'s gone), and keeps its Glossary records unless told to delete them (2026-11-03)', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: noteId }] });
    const eventId = useCalendarStore.getState().addEvent({ title: 'E', date: '2030-01-01', crossAppRefs: [{ type: 'note', id: noteId }] });
    const reminderId = useCalendarStore.getState().addReminder({ title: 'R', date: '2030-01-01', crossAppRefs: [{ type: 'note', id: noteId }] });
    const entryId = useNoteStore.getState().addStructuredTagEntry({
      typeKey: 'acronym', tagId: 'tag-1', term: 'ASX', fields: {}, noteId, collectionId: null,
    });
    const goes = useNoteStore.getState().addStructuredTagEntry({
      typeKey: 'acronym', tagId: 'tag-1', term: 'RBA', fields: {}, noteId, collectionId: null,
    });

    deleteNoteWithCleanup(noteId, { deleteEntries: [goes] });

    expect(useNoteStore.getState().notes[noteId as NoteId]).toBeUndefined();
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([{ type: 'note', id: noteId }]);
    expect(useCalendarStore.getState().events[eventId].crossAppRefs).toEqual([{ type: 'note', id: noteId }]);
    expect(useCalendarStore.getState().reminders[reminderId].crossAppRefs).toEqual([{ type: 'note', id: noteId }]);
    expect(useNoteStore.getState().structuredTagEntries[entryId]).toMatchObject({ noteId });
    expect(useNoteStore.getState().structuredTagEntries[goes]).toBeUndefined();

    deleteForever(trashed(noteId));
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([]);
    expect(useCalendarStore.getState().events[eventId].crossAppRefs).toEqual([]);
    expect(useCalendarStore.getState().reminders[reminderId].crossAppRefs).toEqual([]);
  });

  it('deleted forever, an unrelated task\'s crossAppRefs are left alone', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const otherNoteId = useNoteStore.getState().addNote({ title: 'Other' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: otherNoteId }] });

    deleteNoteWithCleanup(noteId);
    deleteForever(trashed(noteId));
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

describe('lists in cross-app links', () => {
  it('deleteListWithCleanup leaves every link to the list; deleting it forever drops them and the note text, keeping other links', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Trip' });
    const listId = useListStore.getState().addList({ name: 'Packing', typeId: 'lt-shopping' as never });
    const otherList = useListStore.getState().addList({ name: 'Other', typeId: 'lt-shopping' as never });
    useListStore.getState().updateListLinks(listId, { crossAppRefs: [{ type: 'note', id: noteId }] });
    const taskId = useTaskStore.getState().addTask({ title: 'Pack', crossAppRefs: [{ type: 'list', id: listId }, { type: 'list', id: otherList }] });
    const eventId = useCalendarStore.getState().addEvent({ title: 'Flight', date: '2030-01-01' });
    useCalendarStore.getState().updateEvent(eventId, { crossAppRefs: [{ type: 'list', id: listId }] });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('list', listId) });

    deleteListWithCleanup(listId);

    expect(useListStore.getState().lists[listId]).toBeUndefined();
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toHaveLength(2);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(true);

    deleteForever(trashed(listId));
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([{ type: 'list', id: otherList }]);
    expect(useCalendarStore.getState().events[eventId].crossAppRefs).toEqual([]);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });

  it("deleteNoteWithCleanup leaves a list's link to the note; emptying the bin drops it", () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Trip' });
    const listId = useListStore.getState().addList({ name: 'Packing' });
    useListStore.getState().updateListLinks(listId, { crossAppRefs: [{ type: 'note', id: noteId }] });
    deleteNoteWithCleanup(noteId);
    expect(useListStore.getState().lists[listId].crossAppRefs).toEqual([{ type: 'note', id: noteId }]);
    emptyTrash();
    expect(useListStore.getState().lists[listId].crossAppRefs).toEqual([]);
  });

  it("unlinking a note from a list removes the list's ref and the note's linked text", () => {
    const noteId = useNoteStore.getState().addNote({ title: 'Trip' });
    const listId = useListStore.getState().addList({ name: 'Packing' });
    useListStore.getState().updateListLinks(listId, { crossAppRefs: [{ type: 'note', id: noteId }] });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('list', listId) });
    unlinkCrossAppRef('list', listId, { type: 'note', id: noteId });
    expect(useListStore.getState().lists[listId].crossAppRefs).toEqual([]);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });

  it('updateListLinks works on a locked encrypted list (links are plaintext)', () => {
    const listId = useListStore.getState().addList({ name: 'Secret' });
    useListStore.setState((s) => ({ lists: { ...s.lists, [listId]: { ...s.lists[listId], isEncrypted: true, encryptedPayload: 'cipher', name: '' } } }));
    useListStore.getState().updateListLinks(listId, { crossAppRefs: [{ type: 'note', id: 'n1' }] });
    expect(useListStore.getState().lists[listId].crossAppRefs).toEqual([{ type: 'note', id: 'n1' }]);
  });
});

describe('links stay while an item is in the Recycling Bin (2026-11-10)', () => {
  it('a deleted task comes back with the note text and task links pointing at it; deleted forever, they go', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task', crossAppRefs: [{ type: 'note', id: noteId }] });
    const other = useTaskStore.getState().addTask({ title: 'Other' });
    useTaskStore.getState().addItemLink(other, 'dependsOn', taskId);
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('task', taskId) });

    deleteTaskWithCleanup(taskId);
    expect(useTaskStore.getState().tasks[other].itemLinks).toHaveLength(1);
    restoreFromTrash(trashed(taskId));
    expect(useTaskStore.getState().tasks[taskId]).toBeDefined();
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(true);

    deleteTaskWithCleanup(taskId);
    deleteForever(trashed(taskId));
    expect(useTaskStore.getState().tasks[other].itemLinks).toEqual([]);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });

  it('a calendar item deleted forever: the task links to it go', () => {
    const eventId = useCalendarStore.getState().addEvent({ title: 'Exam', date: '2030-01-01' });
    const taskId = useTaskStore.getState().addTask({ title: 'Revise' });
    linkTaskToEvent(taskId, 'prepFor', 'event', eventId);
    deleteEventWithCleanup(eventId);
    expect(useTaskStore.getState().tasks[taskId].itemLinks).toHaveLength(1);
    deleteForever(trashed(eventId));
    expect(useTaskStore.getState().tasks[taskId].itemLinks).toEqual([]);
  });
});

describe('addCrossAppRef / unlinkOneCrossAppRef (the Linked items field)', () => {
  it('adds once, and unlinking one tab of a note keeps the other and the note text', () => {
    const noteId = useNoteStore.getState().addNote({ title: 'N' });
    const taskId = useTaskStore.getState().addTask({ title: 'Task' });
    useNoteStore.getState().updateNote(noteId, { content: docWithLink('task', taskId) });
    addCrossAppRef('task', taskId, { type: 'note', id: noteId, tabId: 't1' });
    addCrossAppRef('task', taskId, { type: 'note', id: noteId, tabId: 't1' });
    addCrossAppRef('task', taskId, { type: 'note', id: noteId });
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toHaveLength(2);
    unlinkOneCrossAppRef('task', taskId, { type: 'note', id: noteId, tabId: 't1' });
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([{ type: 'note', id: noteId }]);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(true);
    unlinkOneCrossAppRef('task', taskId, { type: 'note', id: noteId });
    expect(useTaskStore.getState().tasks[taskId].crossAppRefs).toEqual([]);
    expect(hasMark(useNoteStore.getState().notes[noteId].content)).toBe(false);
  });
});
