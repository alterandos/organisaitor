import { useUIStore } from '@/store/uiStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';
import { trashedBy, deleteForever } from '@/services/trash';
import { inferTaskFromSelection } from '@/utils/textToTask';
import { LABELS } from '@/config/labels';
import { ITEM_TYPE_ICON } from '@/config/itemIcons';
import type { Priority, TaskId } from '@/types';
import type { NoteObjectKind } from './types';
import { formatObjectDay, formatObjectTime, formatObjectWhen } from './format';
import { expandShortWeekdays, readWhenInput, tidyObjectTitle } from './whenInput';

// `\task finish the essay by fri 5pm` (asked for by the user 2026-10-26, so a task is made from a
// note the way `\event` makes an event). The text is read as Ctrl+Q's "Create ▸ Task" reads a
// selection (inferTaskFromSelection: a deadline and its time, priority words, links). Unlike a
// calendar item, saying nothing about when leaves the task without a deadline. Made through
// addTaskWithCalendar, as the task modal and the agent make one, so its calendar entries follow.
export interface TaskDraft {
  title:    string;
  deadline: string | null;
  time:     string | null;
  priority: Priority;
  links:    string[];
}

export const taskKind: NoteObjectKind<TaskDraft> = {
  id:         'task',
  targetType: 'task',
  label:      LABELS.noteObjects.task.label,
  icon:       ITEM_TYPE_ICON.task,
  aliases:    ['todo', 'tk'],
  hint:       LABELS.noteObjects.task.hint,

  parse(body, ctx) {
    const t = inferTaskFromSelection(expandShortWeekdays(body), ctx.now);
    return { title: tidyObjectTitle(t.title), deadline: t.deadline, time: t.deadlineTime, priority: t.priority ?? 'none', links: t.links };
  },

  fields(draft) {
    const L = LABELS.noteObjects.task;
    return [
      { key: 'title', label: L.fieldTitle, value: draft.title, placeholder: L.titlePlaceholder },
      { key: 'date', label: L.fieldDate, value: draft.deadline ? formatObjectDay(draft.deadline) : '', placeholder: L.datePlaceholder },
      { key: 'time', label: L.fieldTime, value: draft.time ? formatObjectTime(draft.time) : '', placeholder: L.timePlaceholder },
    ];
  },

  applyField(draft, key, raw, ctx) {
    const text = raw.trim();
    if (key === 'title') return { ...draft, title: text };
    if (key === 'date') {
      if (!text) return { ...draft, deadline: null, time: null };
      const { date } = readWhenInput(text, ctx.now);
      return date ? { ...draft, deadline: date } : null;
    }
    if (key === 'time') {
      if (!text) return { ...draft, time: null };
      const { time } = readWhenInput(text, ctx.now);
      return time ? { ...draft, time } : null;
    }
    return draft;
  },

  validate: (draft) => (draft.title.trim() ? null : LABELS.noteObjects.task.needsTitle),

  create(draft, ctx, backLinks) {
    return addTaskWithCalendar({
      title:        draft.title.trim(),
      deadline:     draft.deadline,
      deadlineTime: draft.deadline ? draft.time : null,
      priority:     draft.priority,
      links:        draft.links,
      collectionId: ctx.collectionId,
      crossAppRefs: backLinks,
    });
  },

  discard(id) {
    for (const entry of trashedBy(() => deleteTaskWithCleanup(id as TaskId))) deleteForever(entry);
  },

  openFull(draft, ctx) {
    useUIStore.getState().showAddTaskWithPrefill({
      title:        draft.title,
      priority:     draft.priority,
      collectionId: ctx.collectionId,
      deadline:     draft.deadline,
      deadlineTime: draft.time,
      links:        draft.links,
    });
  },

  describe: (draft) => (draft.deadline ? `${draft.title.trim()} · ${formatObjectWhen(draft.deadline, draft.time)}` : draft.title.trim()),
  linkText: (draft) => draft.title.trim(),
};
