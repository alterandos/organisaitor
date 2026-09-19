// Keeps cross-app links (see types/index.ts's CrossAppRef, NoteEditor's ArtifactLinkMark)
// from going dead when either side of a link is deleted. Deliberately lives outside both
// taskStore and noteStore — those two files must never import each other directly (that
// would be a circular module dependency, since both need to reach the other here) — so
// this is the one place allowed to import both. UI call sites should call the wrappers
// below INSTEAD OF calling taskStore.deleteTask / noteStore.deleteNote directly, the same
// way TaskPane/TaskItem already route task deletion through their own local cleanup of
// calendarEventId/calendarReminderId (consolidated here alongside the new note-link cleanup
// rather than duplicated a third time).
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useCalendarStore } from '@/store/calendarStore';
import { stripArtifactLinksFromContent } from '@/utils/noteContent';
import { noteView, isNoteLocked } from '@/services/noteSecrets';
import type { TaskId, NoteId, CalendarEventId, CalendarReminderId, CrossAppRef, CrossAppRefType } from '@/types';

function stripArtifactLinksFromNote(noteId: NoteId, targetType: string, targetId: string) {
  const raw = useNoteStore.getState().notes[noteId];
  if (!raw) return;
  // An encrypted note's content is ciphertext-only until the vault is unlocked, so a LOCKED
  // note can't be rewritten — its now-dead mark stays. That's harmless: clicking it already
  // checks the target still exists before navigating. Unlocked, the view has plaintext and
  // the store's update actions re-encrypt the result.
  if (isNoteLocked(raw)) return;
  const note = noteView(raw);

  const main = stripArtifactLinksFromContent(note.content, targetType, targetId);
  if (main.changed) useNoteStore.getState().updateNote(noteId, { content: main.content });

  for (const tab of note.tabs) {
    const res = stripArtifactLinksFromContent(tab.content, targetType, targetId);
    if (res.changed) useNoteStore.getState().updateNoteTabContent(noteId, tab.id, res.content);
  }
}

// Deletes a task and cleans up everything that would otherwise dangle: its shadow calendar
// event/reminder (pre-existing behaviour, consolidated here from TaskPane/TaskItem) and any
// ArtifactLinkMark in a note that pointed at it.
export function deleteTaskWithCleanup(taskId: TaskId) {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;

  // Sub-tasks go with their parent — deleteTask alone would leave them with a dangling
  // parentId, which the task list never renders (it only shows tasks without a parent).
  for (const subId of [...(task.subtaskIds ?? [])]) deleteTaskWithCleanup(subId);

  if (task.calendarEventId) useCalendarStore.getState().deleteEvent(task.calendarEventId);
  if (task.calendarReminderId) useCalendarStore.getState().deleteReminder(task.calendarReminderId);

  for (const ref of task.crossAppRefs ?? []) {
    if (ref.type === 'note') stripArtifactLinksFromNote(ref.id as NoteId, 'task', taskId);
  }

  useTaskStore.getState().deleteTask(taskId);
}

// Deleting a calendar event/reminder that was created from (or manually linked to) a note: strip
// the note's ArtifactLinkMark pointing at it, same as deleteTaskWithCleanup does for tasks.
export function deleteEventWithCleanup(eventId: CalendarEventId) {
  const event = useCalendarStore.getState().events[eventId];
  if (!event) return;
  for (const ref of event.crossAppRefs ?? []) {
    if (ref.type === 'note') stripArtifactLinksFromNote(ref.id as NoteId, 'event', eventId);
  }
  useCalendarStore.getState().deleteEvent(eventId);
}

export function deleteReminderWithCleanup(reminderId: CalendarReminderId) {
  const reminder = useCalendarStore.getState().reminders[reminderId];
  if (!reminder) return;
  for (const ref of reminder.crossAppRefs ?? []) {
    if (ref.type === 'note') stripArtifactLinksFromNote(ref.id as NoteId, 'reminder', reminderId);
  }
  useCalendarStore.getState().deleteReminder(reminderId);
}

// Deletes a note and strips any dangling reverse reference to it (e.g. a Task's
// crossAppRefs entry pointing at this note). The note's own outgoing ArtifactLinkMarks
// disappear along with its content — nothing to clean up on that side. Any StructuredTagEntry
// (Acronym, etc. — see structuredTagTypes.ts) created from this note is deleted too, since
// its anchoring mark is about to disappear along with the note's content.
export function deleteNoteWithCleanup(noteId: NoteId) {
  const tasks = useTaskStore.getState().tasks;
  for (const task of Object.values(tasks)) {
    if (task.crossAppRefs?.some((r) => r.type === 'note' && r.id === noteId)) {
      useTaskStore.getState().updateTask(task.id, {
        crossAppRefs: task.crossAppRefs.filter((r) => !(r.type === 'note' && r.id === noteId)),
      });
    }
  }
  const calendar = useCalendarStore.getState();
  const isThisNote = (r: CrossAppRef) => r.type === 'note' && r.id === noteId;
  for (const event of Object.values(calendar.events)) {
    if (event.crossAppRefs?.some(isThisNote)) calendar.updateEvent(event.id, { crossAppRefs: event.crossAppRefs.filter((r) => !isThisNote(r)) });
  }
  for (const reminder of Object.values(calendar.reminders)) {
    if (reminder.crossAppRefs?.some(isThisNote)) calendar.updateReminder(reminder.id, { crossAppRefs: reminder.crossAppRefs.filter((r) => !isThisNote(r)) });
  }
  const { structuredTagEntries, deleteStructuredTagEntry } = useNoteStore.getState();
  for (const entry of Object.values(structuredTagEntries)) {
    if (entry.noteId === noteId) deleteStructuredTagEntry(entry.id);
  }
  useNoteStore.getState().deleteNote(noteId);
}

// Called when a user removes a single ArtifactLinkMark via the editor's "Remove link"
// button (the mark itself is already unset on the live editor by the caller) — strips the
// matching reverse entry from the target's crossAppRefs so it doesn't outlive the mark.
export function removeCrossAppRefFromTarget(targetType: CrossAppRefType, targetId: string, ref: { type: CrossAppRefType; id: string }) {
  const keep = (refs: CrossAppRef[] | undefined) => (refs ?? []).filter((r) => !(r.type === ref.type && r.id === ref.id));
  if (targetType === 'task') {
    const task = useTaskStore.getState().tasks[targetId as TaskId];
    if (task) useTaskStore.getState().updateTask(task.id, { crossAppRefs: keep(task.crossAppRefs) });
  } else if (targetType === 'event') {
    const event = useCalendarStore.getState().events[targetId as CalendarEventId];
    if (event) useCalendarStore.getState().updateEvent(event.id, { crossAppRefs: keep(event.crossAppRefs) });
  } else if (targetType === 'reminder') {
    const reminder = useCalendarStore.getState().reminders[targetId as CalendarReminderId];
    if (reminder) useCalendarStore.getState().updateReminder(reminder.id, { crossAppRefs: keep(reminder.crossAppRefs) });
  }
}

// Called from the *target's* own edit UI (e.g. TaskPane's CrossAppRefPicker "×" button) when
// the user removes a link they can see but doesn't have the source note open to unlink from
// directly. Strips `ref` from `targetType`/`targetId`'s own crossAppRefs (same as above) and,
// when `ref` points at a note, also strips the matching ArtifactLinkMark from that note's
// content — so a link severed from either side (here, or the note's own "Remove link" button)
// never leaves the other side dangling. Note-independent of whether that note happens to be
// open right now, same as deleteTaskWithCleanup.
export function unlinkCrossAppRef(targetType: CrossAppRefType, targetId: string, ref: CrossAppRef) {
  removeCrossAppRefFromTarget(targetType, targetId, ref);
  if (ref.type === 'note') stripArtifactLinksFromNote(ref.id as NoteId, targetType, targetId);
}
