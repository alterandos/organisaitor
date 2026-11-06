import { useState } from 'react';
import { nanoid } from 'nanoid';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useCalendarStore } from '@/store/calendarStore';
import { ITEM_LINK_KINDS } from '@/config/itemLinkKinds';
import { LABELS } from '@/config/labels';
import { TaskPickerModal } from '@/components/TaskPickerModal/TaskPickerModal';
import { TaskRulesEditor } from '@/components/EventTaskRulesField/EventTaskRulesField';
import { linkTaskToEvent, unlinkTaskFromEvent } from '@/services/eventTaskLinks';
import { setEventTaskRules } from '@/services/eventTaskRules';
import { EVENT_LINK_KINDS, eventLinksOf, tasksLinkedTo, type EventLinkKind, type EventTargetType } from '@/utils/eventTaskLinks';
import { isResolved } from '@/utils/taskLinks';
import { UnlinkIcon } from '@/components/Icons';
import type { CalendarEventId, EventTaskRule, TaskId } from '@/types';
import styles from './TaskLinks.module.css';

const L = LABELS.taskLinks.event;
const R = LABELS.eventTaskRules;

// The tasks of an event or a Deadline (utils/eventTaskLinks.ts): each with how it relates
// (changeable), open and unlink. Adds: a new preparation or follow-up task (AddTaskModal, with the
// dates set from the event), or an existing task, linked as related until changed.
//
// One section for a repeating event too (2026-11-05, the user: "Tasks for each one" and "Tasks" were
// two places): pills choose All dates or Just this one, as the pane's Editing line does. All
// dates: Prepare / Follow up make a task for every date (the event's task rules,
// services/eventTaskRules.ts), listed as lines to change; Only this date: a task for that date
// alone (a link that names the date, so it follows that date, not the series).
// Not made yet (the create form, `id` null): Prepare / Follow up are held in the form as `pending`
// (a repeating event's become its task rules, as All dates), and so is a task to link; the form
// makes them when it creates the item (CalendarItemForm/makePendingTasks).
export interface PendingTask { key: string; kind: EventLinkKind; taskId?: TaskId }
export interface TasksDraft {
  rules: EventTaskRule[]; onRules: (next: EventTaskRule[]) => void;
  pending: PendingTask[]; onPending: (next: PendingTask[]) => void;
}

export function EventTasksField({ type, id, title, repeats = false, occurrence = null, draft }: {
  type: EventTargetType; id: string | null; title: string; repeats?: boolean; occurrence?: string | null; draft?: TasksDraft;
}) {
  const tasks        = useTaskStore((s) => s.tasks);
  const event        = useCalendarStore((s) => (type === 'event' && id ? s.events[id as CalendarEventId] : undefined));
  const openTaskPane = useUIStore((s) => s.openTaskPane);
  const showAddTaskForEvent = useUIStore((s) => s.showAddTaskForEvent);
  const [picking, setPicking] = useState(false);
  const series = repeats && type === 'event';
  const [scope, setScope] = useState<'all' | 'this'>('all');
  const onlyThis = series && scope === 'this' && !!occurrence;
  const occurrenceOf = (taskId: TaskId) => eventLinksOf(tasks[taskId]).find((l) => l.targetType === type && l.targetId === id)?.occurrence ?? null;
  const linked = (id ? tasksLinkedTo(type, id, tasks) : [])
    .filter(({ task }) => (!series ? true : onlyThis ? occurrenceOf(task.id) === occurrence : !occurrenceOf(task.id)))
    .sort((a, b) => EVENT_LINK_KINDS.indexOf(a.kind) - EVENT_LINK_KINDS.indexOf(b.kind));
  const rules = draft ? draft.rules : event?.taskRules ?? [];
  const setRules = (next: EventTaskRule[]) => (draft ? draft.onRules(next) : event && setEventTaskRules(event.id, next));
  const add = (kind: 'prepFor' | 'followUpOf') => {
    if (series && !onlyThis && (event || draft)) {
      const preset = R.presets[kind === 'prepFor' ? 0 : 1];
      setRules([...rules, { id: nanoid(8), title: preset.title, side: preset.side, days: preset.days }]);
      return;
    }
    if (draft) { draft.onPending([...draft.pending, { key: nanoid(6), kind }]); return; }
    if (id) showAddTaskForEvent({ kind, targetType: type, targetId: id, ...(onlyThis ? { occurrence: occurrence! } : {}) });
  };
  const pendingTitle = (p: PendingTask) => (p.taskId ? tasks[p.taskId]?.title ?? '' : (p.kind === 'prepFor' ? L.prepTitle : L.followTitle)(title || L.thisItem));

  return (
    <div className={styles.field}>
      {series && occurrence && id && (
        <div className={styles.scopePills} role="radiogroup" aria-label={L.scopeLabel}>
          {([['all', LABELS.calendarSeries.scopeAll], ['this', LABELS.calendarSeries.scopeThis]] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={scope === v}
              className={`${styles.scopePill} ${scope === v ? styles.scopePillOn : ''}`} onClick={() => setScope(v)}>{label}</button>
          ))}
        </div>
      )}
      {series && !onlyThis && rules.length > 0 && (
        <div className={styles.rules}>
          <p className={styles.rulesHint}>{R.hint}</p>
          <TaskRulesEditor rules={rules} onChange={setRules} presets={false} />
        </div>
      )}
      {draft && draft.pending.length > 0 && (
        <ul className={styles.rows}>
          {draft.pending.map((p) => (
            <li key={p.key} className={styles.row}>
              <span aria-hidden="true">{ITEM_LINK_KINDS[p.kind].icon}</span>
              <span className={styles.other}>{pendingTitle(p)}</span>
              <button type="button" className={styles.remove} onClick={() => draft.onPending(draft.pending.filter((x) => x.key !== p.key))} aria-label={LABELS.taskLinks.removeLink} title={LABELS.taskLinks.removeLink}>
                <UnlinkIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {linked.length > 0 && (
        <ul className={styles.rows}>
          {linked.map(({ task, kind }) => (
            <li key={task.id} className={styles.row}>
              <span aria-hidden="true">{ITEM_LINK_KINDS[kind].icon}</span>
              <button type="button" className={`${styles.other} ${isResolved(task) ? styles.otherDone : ''}`} onClick={() => openTaskPane(task.id)}>
                {task.completed && <span className={styles.check}>✓</span>}
                {task.title}
              </button>
              <select
                className={styles.kindSelect}
                value={kind}
                aria-label={L.kindLabel}
                onChange={(e) => id && linkTaskToEvent(task.id, e.target.value as EventLinkKind, type, id)}
              >
                {EVENT_LINK_KINDS.map((k) => <option key={k} value={k}>{L.kinds[k]}</option>)}
              </select>
              <button type="button" className={styles.remove} onClick={() => id && unlinkTaskFromEvent(task.id, type, id)} aria-label={LABELS.taskLinks.removeLink} title={LABELS.taskLinks.removeLink}>
                <UnlinkIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.adds}>
        <button type="button" className={styles.addBtn} onClick={() => add('prepFor')}>{L.addPrep}</button>
        <button type="button" className={styles.addBtn} onClick={() => add('followUpOf')}>{L.addFollowUp}</button>
        <button type="button" className={styles.addBtn} onClick={() => setPicking(true)}>{L.linkExisting}</button>
      </div>
      {picking && (
        <TaskPickerModal
          suggestFrom={title}
          excludeIds={new Set([...linked.map((l) => l.task.id), ...(draft?.pending.flatMap((p) => (p.taskId ? [p.taskId] : [])) ?? [])])}
          onPick={(taskId) => (draft ? draft.onPending([...draft.pending, { key: nanoid(6), kind: 'related', taskId: taskId as TaskId }])
            : id && linkTaskToEvent(taskId as TaskId, 'related', type, id, onlyThis ? occurrence : null))}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
