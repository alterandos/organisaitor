// Cross-app links (see types/index.ts's CrossAppRef, NoteEditor's ArtifactLinkMark) between tasks,
// calendar items, lists and notes. Deliberately lives outside both taskStore and noteStore — those
// two files must never import each other directly (that would be a circular module dependency,
// since both need to reach the other here) — so this is the one place allowed to import both.
//
// Deleting an item leaves every link to it in place (agreed with the user 2026-11-10): references
// on other items, task links, and linked text in notes. While it's gone they're hidden (the text
// shows "Deleted — restore it from the Recycling Bin…"), and restoring it brings them all back.
// Only "Delete forever" (or emptying the Recycling Bin) takes them away: forgetLinksTo, called by
// services/trash.ts. Unlinking on purpose (a Linked items row's unlink, "Remove link" in a note)
// still removes both sides at once.
import { useTaskStore } from '@/store/taskStore';
import { useNoteStore } from '@/store/noteStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useListStore } from '@/store/listStore';
import type { Transaction } from '@tiptap/pm/state';
import { stripArtifactLinksFromContent } from '@/utils/noteContent';
import { editNoteContent } from '@/services/noteContentEdit';
import { noteView, isNoteLocked } from '@/services/noteSecrets';
import type { TaskId, NoteId, CalendarEventId, CalendarReminderId, CalendarDeadlineId, CrossAppRef, CrossAppRefType } from '@/types';
import type { ListId } from '@/types/lists';

function stripArtifactLinksFromNote(noteId: NoteId, targetType: string, targetId: string) {
  const raw = useNoteStore.getState().notes[noteId];
  if (!raw) return;
  // An encrypted note's content is ciphertext-only until the vault is unlocked, so a LOCKED
  // note can't be rewritten — its now-dead mark stays. That's harmless: clicking it already
  // checks the target still exists before navigating. Unlocked, the view has plaintext and
  // the store's update actions re-encrypt the result. An open note's text is changed in its
  // editor (services/noteContentEdit.ts), so the editor's next save doesn't put the mark back.
  if (isNoteLocked(raw)) return;
  const edit = {
    inEditor: (tr: Transaction) => {
      tr.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        for (const m of node.marks) {
          if (m.type.name === 'artifactLink' && m.attrs.targetType === targetType && m.attrs.targetId === targetId) tr.removeMark(pos, pos + node.nodeSize, m);
        }
        return false;
      });
      return true;
    },
    inJson: (json: string) => {
      const res = stripArtifactLinksFromContent(json, targetType, targetId);
      return res.changed ? res.content : null;
    },
  };
  editNoteContent(noteId, null, edit);
  for (const tab of noteView(raw).tabs) editNoteContent(noteId, tab.id, edit);
}

// Deletes a task with what goes with it: its sub-tasks and its own calendar entries. Links to it
// stay (see the top of this file).
export function deleteTaskWithCleanup(taskId: TaskId) {
  const task = useTaskStore.getState().tasks[taskId];
  if (!task) return;

  // Sub-tasks go with their parent — deleteTask alone would leave them with a dangling
  // parentId, which the task list never renders (it only shows tasks without a parent).
  for (const subId of [...(task.subtaskIds ?? [])]) deleteTaskWithCleanup(subId);

  if (task.calendarEventId) useCalendarStore.getState().deleteEvent(task.calendarEventId);
  // calendarReminderId is legacy (pre-2026-09-27 task-deadline shadows) — kept as a cleanup
  // fallback for any task whose shadow hasn't been migrated to calendarDeadlineId yet (see
  // services/taskDeadlineMigration.ts); every task going forward only ever has the latter.
  if (task.calendarReminderId) useCalendarStore.getState().deleteReminder(task.calendarReminderId);
  if (task.calendarDeadlineId) useCalendarStore.getState().deleteDeadline(task.calendarDeadlineId);

  useTaskStore.getState().deleteTask(taskId);
}

// Deleting a calendar event, Reminder or Deadline. Links to it stay (see the top of this file).
export function deleteEventWithCleanup(eventId: CalendarEventId) {
  const event = useCalendarStore.getState().events[eventId];
  if (!event) return;
  useCalendarStore.getState().deleteEvent(eventId);

  // Deleting a task's scheduled event un-schedules the task (it stays, minus the date) rather than
  // leaving it pointing at an event that's gone.
  const linkedTask = Object.values(useTaskStore.getState().tasks).find((t) => t.calendarEventId === eventId);
  if (linkedTask) useTaskStore.getState().updateTask(linkedTask.id, { scheduledAt: null, scheduledTime: null, calendarEventId: null });
}

export function deleteReminderWithCleanup(reminderId: CalendarReminderId) {
  const reminder = useCalendarStore.getState().reminders[reminderId];
  if (!reminder) return;
  useCalendarStore.getState().deleteReminder(reminderId);
}

export function deleteDeadlineWithCleanup(deadlineId: CalendarDeadlineId) {
  const deadline = useCalendarStore.getState().deadlines[deadlineId];
  if (!deadline) return;
  useCalendarStore.getState().deleteDeadline(deadlineId);
}

// Deletes a note. Links to it stay (see the top of this file). The Glossary records made in it stay
// too (a record lives in the Glossary, 2026-11-03), remembering the note as where they came from,
// except `deleteEntries`: the ones the person chose to delete with it (services/noteDelete.ts asks
// about the records this note was the only one to hold).
export function deleteNoteWithCleanup(noteId: NoteId, { deleteEntries = [] }: { deleteEntries?: string[] } = {}) {
  const { structuredTagEntries, deleteStructuredTagEntry } = useNoteStore.getState();
  for (const id of deleteEntries) if (structuredTagEntries[id as never]) deleteStructuredTagEntry(id as never);
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
  } else if (targetType === 'deadline') {
    const deadline = useCalendarStore.getState().deadlines[targetId as CalendarDeadlineId];
    if (deadline) useCalendarStore.getState().updateDeadline(deadline.id, { crossAppRefs: keep(deadline.crossAppRefs) });
  } else if (targetType === 'list') {
    const list = useListStore.getState().lists[targetId as ListId];
    if (list) useListStore.getState().updateListLinks(list.id, { crossAppRefs: keep(list.crossAppRefs) });
  }
}

// Called from the *target's* own edit UI (a note's "Linked from" bar unlinking) when
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

// Deletes a list (its items go with it, to the Recycling Bin through deleteList). Links to it stay
// (see the top of this file).
export function deleteListWithCleanup(listId: ListId) {
  if (!useListStore.getState().lists[listId]) return;
  useListStore.getState().deleteList(listId);
}

type Owner = 'task' | 'event' | 'reminder' | 'deadline' | 'list';
const sameRef = (a: CrossAppRef, b: CrossAppRef) => a.type === b.type && a.id === b.id && (a.tabId ?? null) === (b.tabId ?? null);

function ownerOf(owner: Owner, id: string): { crossAppRefs?: CrossAppRef[] } | undefined {
  if (owner === 'task') return useTaskStore.getState().tasks[id as TaskId];
  if (owner === 'list') return useListStore.getState().lists[id as ListId];
  const cal = useCalendarStore.getState();
  return owner === 'event' ? cal.events[id as CalendarEventId] : owner === 'reminder' ? cal.reminders[id as CalendarReminderId] : cal.deadlines[id as CalendarDeadlineId];
}

function setRefs(owner: Owner, id: string, crossAppRefs: CrossAppRef[]) {
  if (owner === 'task') useTaskStore.getState().updateTask(id as TaskId, { crossAppRefs });
  else if (owner === 'list') useListStore.getState().updateListLinks(id as ListId, { crossAppRefs });
  else if (owner === 'event') useCalendarStore.getState().updateEvent(id as CalendarEventId, { crossAppRefs });
  else if (owner === 'reminder') useCalendarStore.getState().updateReminder(id as CalendarReminderId, { crossAppRefs });
  else useCalendarStore.getState().updateDeadline(id as CalendarDeadlineId, { crossAppRefs });
}

// Adds a reference to an existing item (a Linked items field's "+ Note", "+ List").
export function addCrossAppRef(owner: Owner, id: string, ref: CrossAppRef): void {
  const item = ownerOf(owner, id);
  if (!item || (item.crossAppRefs ?? []).some((r) => sameRef(r, ref))) return;
  setRefs(owner, id, [...(item.crossAppRefs ?? []), ref]);
}

// Removes one reference (a note can be linked as a whole and by a tab: only the one unlinked), and,
// once nothing on the item links to that note any more, the linked text in it.
export function unlinkOneCrossAppRef(owner: Owner, id: string, ref: CrossAppRef): void {
  const refs = ownerOf(owner, id)?.crossAppRefs ?? [];
  const next = refs.filter((r) => !sameRef(r, ref));
  if (next.length !== refs.length) setRefs(owner, id, next);
  if (ref.type === 'note' && !next.some((r) => r.type === 'note' && r.id === ref.id)) stripArtifactLinksFromNote(ref.id as NoteId, owner, id);
}

// What a Recycling Bin kind is called in a link.
const LINK_TYPE: Partial<Record<string, CrossAppRefType>> = {
  task: 'task', calendarEvent: 'event', calendarReminder: 'reminder', calendarDeadline: 'deadline', list: 'list', note: 'note',
};

// An item deleted forever (services/trash.ts deleteForever, emptying the bin): every link to it
// goes now, since nothing can bring it back. `snapshot` is its copy from the bin (the item itself
// is already gone from its store). The linked text in a locked note can't be rewritten; it stays,
// drawn as deleted (harmless: following it says so).
export function forgetLinksTo(kind: string, snapshot: unknown): void {
  const type = LINK_TYPE[kind];
  const item = snapshot as { id?: string; crossAppRefs?: CrossAppRef[] } | null;
  if (!type || !item?.id) return;
  const id = item.id;
  if (type !== 'note') {
    for (const ref of item.crossAppRefs ?? []) if (ref.type === 'note') stripArtifactLinksFromNote(ref.id as NoteId, type, id);
  }
  const points = (r: CrossAppRef) => r.type === type && r.id === id;
  const tasks = useTaskStore.getState();
  for (const t of Object.values(tasks.tasks)) {
    const refs = t.crossAppRefs ?? [];
    const links = t.itemLinks ?? [];
    const keptLinks = links.filter((l) => !((l.targetType ?? 'task') === type && l.targetId === id));
    if (refs.some(points) || keptLinks.length !== links.length) {
      tasks.updateTask(t.id, { crossAppRefs: refs.filter((r) => !points(r)), itemLinks: keptLinks });
    }
  }
  const cal = useCalendarStore.getState();
  for (const e of Object.values(cal.events)) if (e.crossAppRefs?.some(points)) cal.updateEvent(e.id, { crossAppRefs: e.crossAppRefs.filter((r) => !points(r)) });
  for (const r of Object.values(cal.reminders)) if (r.crossAppRefs?.some(points)) cal.updateReminder(r.id, { crossAppRefs: r.crossAppRefs.filter((x) => !points(x)) });
  for (const d of Object.values(cal.deadlines)) if (d.crossAppRefs?.some(points)) cal.updateDeadline(d.id, { crossAppRefs: d.crossAppRefs.filter((r) => !points(r)) });
  const lists = useListStore.getState();
  for (const l of Object.values(lists.lists)) if (l.crossAppRefs?.some(points)) lists.updateListLinks(l.id, { crossAppRefs: l.crossAppRefs.filter((r) => !points(r)) });
}
