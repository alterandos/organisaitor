import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { ITEM_LINK_KINDS } from '@/config/itemLinkKinds';
import { LABELS } from '@/config/labels';
import { TaskPickerModal } from '@/components/TaskPickerModal/TaskPickerModal';
import { linkTaskToEvent, unlinkTaskFromEvent } from '@/services/eventTaskLinks';
import { EVENT_LINK_KINDS, tasksLinkedTo, type EventLinkKind, type EventTargetType } from '@/utils/eventTaskLinks';
import { isResolved } from '@/utils/taskLinks';
import { UnlinkIcon } from '@/components/Icons';
import type { TaskId } from '@/types';
import styles from './TaskLinks.module.css';

const L = LABELS.taskLinks.event;

// The tasks linked to an event or a Deadline (utils/eventTaskLinks.ts): each with how it relates
// (changeable), open and unlink. Adds: a new preparation or follow-up task (AddTaskModal, with
// the dates set from the event), or an existing task, linked as related until changed.
export function EventTasksField({ type, id, title }: { type: EventTargetType; id: string; title: string }) {
  const tasks        = useTaskStore((s) => s.tasks);
  const openTaskPane = useUIStore((s) => s.openTaskPane);
  const showAddTaskForEvent = useUIStore((s) => s.showAddTaskForEvent);
  const [picking, setPicking] = useState(false);
  const linked = tasksLinkedTo(type, id, tasks)
    .sort((a, b) => EVENT_LINK_KINDS.indexOf(a.kind) - EVENT_LINK_KINDS.indexOf(b.kind));

  return (
    <div className={styles.field}>
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
                onChange={(e) => linkTaskToEvent(task.id, e.target.value as EventLinkKind, type, id)}
              >
                {EVENT_LINK_KINDS.map((k) => <option key={k} value={k}>{L.kinds[k]}</option>)}
              </select>
              <button type="button" className={styles.remove} onClick={() => unlinkTaskFromEvent(task.id, type, id)} aria-label={LABELS.taskLinks.removeLink} title={LABELS.taskLinks.removeLink}>
                <UnlinkIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.adds}>
        <button type="button" className={styles.addBtn} onClick={() => showAddTaskForEvent({ kind: 'prepFor', targetType: type, targetId: id })}>{L.addPrep}</button>
        <button type="button" className={styles.addBtn} onClick={() => showAddTaskForEvent({ kind: 'followUpOf', targetType: type, targetId: id })}>{L.addFollowUp}</button>
        <button type="button" className={styles.addBtn} onClick={() => setPicking(true)}>{L.linkExisting}</button>
      </div>
      {picking && (
        <TaskPickerModal
          suggestFrom={title}
          excludeIds={new Set(linked.map((l) => l.task.id))}
          onPick={(taskId) => linkTaskToEvent(taskId as TaskId, 'related', type, id)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
