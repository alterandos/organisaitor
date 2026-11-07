import { commitTags } from '@/services/tags';
import { useState } from 'react';
import { ItemTypePaneField } from '@/components/ItemTypeField/ItemTypeField';
import { linkedListIds } from '@/services/taskListLinks';
import { toggleTaskCompletion, taskCompletionOptions } from '@/services/taskCompletion';
import { LinkedChecklists } from '@/components/LinkedChecklists/LinkedChecklists';
import { TaskLinksField } from '@/components/TaskLinks/TaskLinksField';
import { TaskCalendarLinks } from '@/components/TaskLinks/TaskCalendarLinks';
import type { TaskId } from '@/types';
import { TaskFields, type TaskValues } from '@/components/TaskFields/TaskFields';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { deleteTaskWithCleanup, unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import { addTaskWithCalendar, updateTaskLinked } from '@/services/taskCalendarLinks';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import { todayIso } from '@/utils/date';
import { ItemActionDialog } from '@/components/ItemActions/ItemActionDialog';
import { ItemActionFooter } from '@/components/ItemActions/ItemActionFooter';
import { ArchivedBanner } from '@/components/ItemActions/ArchivedBanner';
import { DoneBanner } from '@/components/ItemActions/DoneBanner';
import itemStyles from '@/components/ItemActions/ItemActions.module.css';
import { useItemActions } from '@/components/ItemActions/useItemActions';
import type { CrossAppRef } from '@/types';
import styles from './TaskPane.module.css';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';
import { CloseIcon, OpenIcon } from '@/components/Icons';

export function TaskPane() {
  const paneResize = usePaneWidth('item-pane', { edge: 'left', min: 340, max: 820 });
  const editingTaskId  = useUIStore((s) => s.editingTaskId);
  const closeTaskPane  = useUIStore((s) => s.closeTaskPane);
  const openTaskPane   = useUIStore((s) => s.openTaskPane);
  const showAddSubtask = useUIStore((s) => s.showAddSubtask);

  const tasksRecord       = useTaskStore((s) => s.tasks);
  const updateTask        = useTaskStore((s) => s.updateTask);
  const archiveTask       = useTaskStore((s) => s.archiveTask);
  const restoreTask       = useTaskStore((s) => s.restoreTask);

  const task = editingTaskId ? tasksRecord[editingTaskId as TaskId] : null;

  // App.tsx remounts this pane per task (key), so these initialise from the task being edited.
  const [subtaskInput,   setSubtaskInput]   = useState('');
  const [pickingCalendar, setPickingCalendar] = useState(false);

  const { dialog, setDialog, closeDialog } = useItemActions({
    itemKey:   editingTaskId,
    archived:  task?.archived ?? false,
    onClose:   closeTaskPane,
    onRestore: () => { if (editingTaskId) restoreTask(editingTaskId as TaskId); },
  });

  if (!task) return null;

  const taskId = task.id;

  // Each change saves at once; the shadow calendar entries follow the title, dates and repeat
  // (services/taskCalendarLinks.ts). A repeating task with no date starts from today.
  const LINKED: (keyof TaskValues)[] = ['title', 'deadline', 'deadlineTime', 'scheduledAt', 'scheduledTime', 'repeat'];
  const update = (patch: Partial<TaskValues>) => {
    const changes = { ...patch } as Partial<TaskValues>;
    if (changes.tagIds) changes.tagIds = commitTags(changes.tagIds);
    if (changes.repeat && !task.deadline && !task.scheduledAt) changes.deadline = todayIso();
    const typed = changes as Parameters<typeof updateTask>[1];
    if ((Object.keys(changes) as (keyof TaskValues)[]).some((k) => LINKED.includes(k))) updateTaskLinked(taskId, typed);
    else updateTask(taskId, typed);
  };

  const handleAddSubtask = () => {
    const trimmed = subtaskInput.trim();
    if (!trimmed) return;
    addTaskWithCalendar({ title: trimmed, parentId: taskId });
    setSubtaskInput('');
  };

  const handleDelete = () => {
    closeDialog();
    deleteTaskWithCleanup(taskId);
    closeTaskPane();
  };

  const handleArchive = (reason: string) => {
    closeDialog();
    archiveTask(taskId, reason);
    closeTaskPane();
  };

  const handleRestore = () => restoreTask(taskId);

  const navigateToCrossAppRef = (ref: CrossAppRef) => {
    if (ref.type === 'list') { openArtifactTarget('list', ref.id); return; }
    if (ref.type !== 'note') return;
    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().openNote(ref.id, ref.tabId);
  };

  const handleCrossAppRefsChange = (next: CrossAppRef[]) => {
    const removed = (task.crossAppRefs ?? []).filter(
      (r) => !next.some((n) => n.type === r.type && n.id === r.id)
    );
    removed.forEach((ref) => unlinkCrossAppRef('task', taskId, ref));
    updateTask(taskId, { crossAppRefs: next });
  };

  const subtasks = (task.subtaskIds ?? [])
    .map((id) => tasksRecord[id])
    .filter(Boolean);

  return (
    <>
      <div className={styles.overlay} onClick={closeTaskPane} />
      <aside style={paneResize.style} className={`${styles.pane} ${task.completed ? itemStyles.donePane : ''}`}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <header className={styles.header}>
          <span className={styles.heading}>Task</span>
          <button className={styles.closeBtn} onClick={closeTaskPane} aria-label="Close"><CloseIcon /></button>
        </header>

        <div className={styles.body}>
          {task.archived && <ArchivedBanner archivedAt={task.archivedAt} reason={task.archiveReason} />}
          {task.completed && <DoneBanner doneAt={task.completedAt} reopenLabel={LABELS.itemActions.reopenTask} onReopen={() => void toggleTaskCompletion(taskId)} />}

          <TaskFields idPrefix="task-pane" liveText={false} update={update}
            scheduledHint={task.calendarEventId ? LABELS.taskFields.syncedToCalendar : LABELS.taskFields.addedToCalendar}
            item={{
              title: task.title, notes: task.notes, deadline: task.deadline, deadlineTime: task.deadlineTime, scheduledAt: task.scheduledAt,
              scheduledTime: task.scheduledTime, priority: task.priority, timeIntensity: task.timeIntensity ?? null, kind: task.kind,
              collectionId: task.collectionId, purposeIds: task.purposeIds ?? [], tagIds: task.tagIds ?? [], links: task.links ?? [],
              repeat: task.repeat ?? null, parentId: task.parentId,
            }}
            typeField={<ItemTypePaneField target={{ kind: 'task', id: taskId }} />}
            linkedItems={<>
              {/* Notes and lists (filled in by Notes' "Create ▸ Task" too), calendar items, and a linked
                  checklist's items as tickable steps (services/taskListLinks.ts). */}
              <CrossAppRefPicker value={task.crossAppRefs ?? []} suggestFrom={task.title} onChange={handleCrossAppRefsChange} onNavigate={navigateToCrossAppRef}
                extraAdds={[{ label: LABELS.taskLinks.linkCalendar, onClick: () => setPickingCalendar(true) }]} />
              <TaskCalendarLinks task={task} suggestFrom={task.title} picking={pickingCalendar} onPicking={setPickingCalendar} />
              <LinkedChecklists listIds={linkedListIds(task.crossAppRefs)} />
            </>}
            more={<>
          {/* ── Task links: waiting on / follow-ups / related (services/taskCompletion.ts,
               utils/taskLinks.ts) ── */}
          <div className={styles.field}>
            <span className={styles.label}>{LABELS.taskLinks.heading}</span>
            <TaskLinksField task={task} />
          </div>

          {/* ── Sub-tasks ── */}
          <div className={styles.field}>
            <span className={styles.label}>Sub-tasks</span>
            {subtasks.length > 0 && (
              <ul className={styles.subtaskList}>
                {subtasks.map((sub) => sub && (
                  <li key={sub.id} className={`${styles.subtaskItem} ${sub.completed ? styles.subtaskDone : ''}`}>
                    <button
                      className={`${styles.subtaskCheck} ${sub.completed ? styles.subtaskCheckDone : ''}`}
                      onClick={() => void toggleTaskCompletion(sub.id)}
                      aria-label={sub.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {sub.completed && '✓'}
                    </button>
                    <span className={styles.subtaskTitle}>{sub.title}</span>
                    <button
                      className={styles.subtaskOpenBtn}
                      onClick={() => openTaskPane(sub.id)}
                      aria-label="Open subtask"
                      title="Open full pane"
                    ><OpenIcon /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.subtaskAdd}>
              <input
                className={styles.subtaskInput}
                placeholder="Add sub-task…"
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
              />
              <button
                type="button"
                className={styles.subtaskAddBtn}
                onClick={handleAddSubtask}
                disabled={!subtaskInput.trim()}
                title="Quick add"
              >+</button>
              <button
                type="button"
                className={styles.subtaskFullBtn}
                onClick={() => showAddSubtask(taskId)}
                title="Open full task form"
              >⊞</button>
            </div>
          </div>
            </>} />
        </div>

        <ItemActionFooter
          archived={task.archived}
          completed={task.completed}
          onToggleComplete={() => void toggleTaskCompletion(taskId)}
          completeOptions={taskCompletionOptions(taskId)}
          deleteLabel="Delete task"
          onArchive={() => setDialog('archive')}
          onRestore={handleRestore}
          onDelete={() => setDialog('delete')}
        />
      </aside>

      {dialog && (
        <ItemActionDialog
          mode={dialog}
          noun="task"
          itemTitle={task.title}
          archiveNote={subtasks.length > 0 ? `Its ${subtasks.length} sub-task${subtasks.length === 1 ? '' : 's'} will be archived with it.` : undefined}
          alsoRemoves={subtasks.length > 0 ? `and its ${subtasks.length} sub-task${subtasks.length === 1 ? '' : 's'}` : undefined}
          deleteNote=", along with its calendar entries"
          onArchive={handleArchive}
          onDelete={handleDelete}
          onArchiveInstead={() => setDialog('archive')}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}
