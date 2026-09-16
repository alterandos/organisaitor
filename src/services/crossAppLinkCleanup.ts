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
import type { TaskId, NoteId, CrossAppRefType } from '@/types';

function stripArtifactLinksFromNote(noteId: NoteId, targetType: string, targetId: string) {
  const note = useNoteStore.getState().notes[noteId];
  if (!note) return;

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

  if (task.calendarEventId) useCalendarStore.getState().deleteEvent(task.calendarEventId);
  if (task.calendarReminderId) useCalendarStore.getState().deleteReminder(task.calendarReminderId);

  for (const ref of task.crossAppRefs ?? []) {
    if (ref.type === 'note') stripArtifactLinksFromNote(ref.id as NoteId, 'task', taskId);
  }

  useTaskStore.getState().deleteTask(taskId);
}

// Deletes a note and strips any dangling reverse reference to it (e.g. a Task's
// crossAppRefs entry pointing at this note). The note's own outgoing ArtifactLinkMarks
// disappear along with its content — nothing to clean up on that side.
export function deleteNoteWithCleanup(noteId: NoteId) {
  const tasks = useTaskStore.getState().tasks;
  for (const task of Object.values(tasks)) {
    if (task.crossAppRefs?.some((r) => r.type === 'note' && r.id === noteId)) {
      useTaskStore.getState().updateTask(task.id, {
        crossAppRefs: task.crossAppRefs.filter((r) => !(r.type === 'note' && r.id === noteId)),
      });
    }
  }
  useNoteStore.getState().deleteNote(noteId);
}

// Called when a user removes a single ArtifactLinkMark via the editor's "Remove link"
// button (the mark itself is already unset on the live editor by the caller) — strips the
// matching reverse entry from the target's crossAppRefs so it doesn't outlive the mark.
export function removeCrossAppRefFromTarget(targetType: CrossAppRefType, targetId: string, ref: { type: CrossAppRefType; id: string }) {
  if (targetType !== 'task') return; // only 'task' targets exist today
  const task = useTaskStore.getState().tasks[targetId as TaskId];
  if (!task) return;
  useTaskStore.getState().updateTask(task.id, {
    crossAppRefs: (task.crossAppRefs ?? []).filter((r) => !(r.type === ref.type && r.id === ref.id)),
  });
}
