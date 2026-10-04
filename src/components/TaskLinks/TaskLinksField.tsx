import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { ITEM_LINK_KINDS } from '@/config/itemLinkKinds';
import { LABELS } from '@/config/labels';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { TaskPickerModal } from '@/components/TaskPickerModal/TaskPickerModal';
import { taskRelations, isResolved, hierarchyIds, type TaskRelation } from '@/utils/taskLinks';
import type { ItemLinkKind, Task, TaskId } from '@/types';
import styles from './TaskLinks.module.css';

const L = LABELS.taskLinks;
const relKey = (r: TaskRelation) => `${r.kind}:${r.ownerId}:${r.targetId}`;

// A task's links to other tasks (Task.itemLinks, both directions — see utils/taskLinks.ts),
// grouped by how they read from this task ("Waiting on", "Unlocks", "Follow-up of", "Led to",
// "Related"), each with an editable reason. Adds: "Waiting on…" / "Related…" pick an existing task;
// "+ Follow-up" creates a new one (AddTaskModal, via uiStore.showAddFollowUp).
export function TaskLinksField({ task }: { task: Task }) {
  const tasks          = useTaskStore((s) => s.tasks);
  const addItemLink    = useTaskStore((s) => s.addItemLink);
  const removeItemLink = useTaskStore((s) => s.removeItemLink);
  const updateReason   = useTaskStore((s) => s.updateItemLinkReason);
  const openTaskPane   = useUIStore((s) => s.openTaskPane);
  const showAddFollowUp = useUIStore((s) => s.showAddFollowUp);
  const [picking, setPicking] = useState<ItemLinkKind | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const relations = taskRelations(task, tasks);
  const groups = new Map<string, { label: string; icon: string; rows: TaskRelation[] }>();
  for (const r of relations) {
    const def = ITEM_LINK_KINDS[r.kind];
    const k = `${r.kind}:${def.symmetric ? 'both' : r.direction}`;
    if (!groups.has(k)) groups.set(k, { label: r.direction === 'out' ? def.out : def.in, icon: def.icon, rows: [] });
    groups.get(k)!.rows.push(r);
  }

  const excludeFor = (kind: ItemLinkKind) => new Set<string>([
    task.id,
    ...hierarchyIds(task, tasks),
    ...relations.filter((r) => r.kind === kind).map((r) => r.other.id),
  ]);

  async function handlePick(kind: ItemLinkKind, targetId: string) {
    const result = addItemLink(task.id, kind, targetId as TaskId);
    if (result !== 'ok') { await alertDialog(L.rejected[result]); return; }
    setFocusKey(`${kind}:${task.id}:${targetId}`);
  }

  return (
    <div className={styles.field}>
      {[...groups.entries()].map(([k, g]) => (
        <div key={k} className={styles.group}>
          <span className={styles.groupLabel}>{g.icon} {g.label}</span>
          <ul className={styles.rows}>
            {g.rows.map((r) => (
              <li key={relKey(r)} className={styles.row}>
                <button
                  type="button"
                  className={`${styles.other} ${isResolved(r.other) ? styles.otherDone : ''}`}
                  onClick={() => openTaskPane(r.other.id)}
                  title="Open this task"
                >
                  {r.other.completed && <span className={styles.check}>✓</span>}
                  {r.other.title}
                </button>
                <input
                  key={r.reason ?? ''}
                  className={styles.reason}
                  defaultValue={r.reason ?? ''}
                  placeholder={L.reasonPlaceholder}
                  autoFocus={focusKey === relKey(r)}
                  onBlur={(e) => { setFocusKey(null); if ((e.target.value.trim() || null) !== r.reason) updateReason(r.ownerId, r.kind, r.targetId, e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  aria-label={L.reasonPlaceholder}
                />
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => removeItemLink(r.ownerId, r.kind, r.targetId)}
                  aria-label={L.removeLink}
                  title={L.removeLink}
                >×</button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className={styles.adds}>
        <button type="button" className={styles.addBtn} onClick={() => setPicking('dependsOn')}>{L.addDependsOn}</button>
        <button type="button" className={styles.addBtn} onClick={() => showAddFollowUp(task.id)}>{L.addFollowUp}</button>
        <button type="button" className={styles.addBtn} onClick={() => setPicking('related')}>{L.addRelated}</button>
      </div>

      {picking && (
        <TaskPickerModal
          title={`${ITEM_LINK_KINDS[picking].icon} ${ITEM_LINK_KINDS[picking].out}`}
          suggestFrom={task.title}
          excludeIds={excludeFor(picking)}
          onPick={(id) => void handlePick(picking, id)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
