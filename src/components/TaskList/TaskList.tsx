import { useState, useEffect } from 'react';
import type { PurposeId, TagId, Task, Collection } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import type { SortField, SortDir } from '@/store/uiStore';
import { TaskItem } from '@/components/TaskItem/TaskItem';
import { RoutineChecklist } from '@/components/RoutineChecklist/RoutineChecklist';
import { todayIso } from '@/utils/date';
import styles from './TaskList.module.css';

function isRoutineDueToday(routine: Collection): boolean {
  const cfg = routine.repeatConfig;
  if (!cfg) return true; // no config = every day
  const { daysOfWeek } = cfg;
  if (daysOfWeek && daysOfWeek.length > 0) {
    const day = new Date(todayIso() + 'T12:00:00').getDay();
    return daysOfWeek.includes(day);
  }
  return true;
}

function deadlineMs(t: Task): number {
  return t.deadline ? new Date(t.deadline).getTime() : Infinity;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };

function buildSorter(
  field: SortField,
  dir: SortDir,
  collectionsRecord: Record<string, Collection>,
) {
  const sign = dir === 'desc' ? -1 : 1;
  return (a: Task, b: Task): number => {
    if (field === 'createdAt') {
      return sign * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    if (field === 'deadline') {
      const diff = deadlineMs(a) - deadlineMs(b);
      if (diff !== 0) return sign * diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (field === 'priority') {
      const diff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (diff !== 0) return sign * diff;
      return deadlineMs(a) - deadlineMs(b);
    }
    const nameA = (a.collectionId ? collectionsRecord[a.collectionId]?.name : null) ?? '￿';
    const nameB = (b.collectionId ? collectionsRecord[b.collectionId]?.name : null) ?? '￿';
    const nameDiff = sign * nameA.localeCompare(nameB);
    if (nameDiff !== 0) return nameDiff;
    return deadlineMs(a) - deadlineMs(b);
  };
}

export function TaskList() {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [toggledIds, setToggledIds]       = useState(new Set<string>());

  const tasksRecord         = useTaskStore((s) => s.tasks);
  const collectionsRecord   = useTaskStore((s) => s.collections);
  const routinesSectionOpen = useUIStore((s) => s.routinesSectionOpen);
  const toggleRoutinesSection = useUIStore((s) => s.toggleRoutinesSection);

  const todayRoutines = Object.values(collectionsRecord).filter(
    (c) => c.kind === 'routine' && isRoutineDueToday(c)
  );

  const activeCollectionId = useUIStore((s) => s.activeCollectionId);
  const activePurposeIds   = useUIStore((s) => s.activePurposeIds);
  const activeTagIds       = useUIStore((s) => s.activeTagIds);
  const sortField          = useUIStore((s) => s.sortField);
  const sortDir            = useUIStore((s) => s.sortDir);
  const taskViewMode       = useUIStore((s) => s.taskViewMode);

  useEffect(() => { setToggledIds(new Set()); }, [taskViewMode]);

  const isExpanded = (taskId: string): boolean =>
    taskViewMode === 'focused' ? !toggledIds.has(taskId) : toggledIds.has(taskId);

  const handleToggleExpand = (taskId: string) => {
    setToggledIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const allTasks = Object.values(tasksRecord);
  const topLevel = allTasks.filter((t) => !t.parentId);

  const byCollection = activeCollectionId
    ? topLevel.filter((t) => t.collectionId === activeCollectionId)
    : topLevel;

  const byPurpose = activePurposeIds.length > 0
    ? byCollection.filter((t) => {
        const taskPurposes       = t.purposeIds ?? [];
        const collectionPurposes = t.collectionId
          ? collectionsRecord[t.collectionId]?.purposeIds ?? []
          : [];
        return activePurposeIds.some(
          (pid) =>
            taskPurposes.includes(pid as PurposeId) ||
            collectionPurposes.includes(pid as PurposeId),
        );
      })
    : byCollection;

  const tasks = activeTagIds.length > 0
    ? byPurpose.filter((t) =>
        activeTagIds.some((tid) => (t.tagIds ?? []).includes(tid as TagId))
      )
    : byPurpose;

  const sorter    = buildSorter(sortField, sortDir, collectionsRecord);
  const active    = tasks.filter((t) => !t.completed).sort(sorter);
  const completed = tasks.filter((t) =>  t.completed).sort(sorter);

  function getCollectionColor(task: Task): string | null {
    if (!task.collectionId) return null;
    return collectionsRecord[task.collectionId]?.color ?? null;
  }

  function renderTaskGroup(task: Task) {
    const color    = getCollectionColor(task);
    const subtasks = (task.subtaskIds ?? []).map((id) => tasksRecord[id]).filter(Boolean) as Task[];
    const expanded = isExpanded(task.id);

    return (
      <div key={task.id} className={styles.taskGroup}>
        <TaskItem
          task={task}
          collectionColor={color}
          expanded={expanded}
          onToggleExpand={() => handleToggleExpand(task.id)}
          forceDueDate={taskViewMode === 'focused'}
        />
        {subtasks.length > 0 && (
          <div className={`${styles.subtaskReveal} ${expanded ? styles.subtaskRevealOpen : ''}`}>
            <div className={styles.subtaskRevealInner}>
              {subtasks.map((sub) => (
                <TaskItem
                  key={sub.id}
                  task={sub}
                  collectionColor={getCollectionColor(sub)}
                  isSubtask
                  expanded={isExpanded(sub.id)}
                  onToggleExpand={() => handleToggleExpand(sub.id)}
                  forceDueDate={taskViewMode === 'focused'}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (allTasks.length === 0) {
    return <p className={styles.empty}>No tasks yet — use the input above or tap + to add one.</p>;
  }
  if (tasks.length === 0) {
    return <p className={styles.empty}>No tasks match the current filter.</p>;
  }

  return (
    <div className={styles.list}>
      {todayRoutines.length > 0 && (
        <>
          <button className={styles.sectionToggle} onClick={toggleRoutinesSection}>
            <span className={`${styles.chevron} ${routinesSectionOpen ? styles.chevronOpen : ''}`}>▸</span>
            Routines ({todayRoutines.length})
          </button>
          {routinesSectionOpen && (
            <div className={styles.routinesSection}>
              {todayRoutines.map((r) => (
                <RoutineChecklist key={r.id} routine={r} />
              ))}
            </div>
          )}
        </>
      )}
      {active.map((task) => renderTaskGroup(task))}
      {completed.length > 0 && (
        <>
          <button
            className={styles.sectionToggle}
            onClick={() => setCompletedOpen((o) => !o)}
          >
            <span className={`${styles.chevron} ${completedOpen ? styles.chevronOpen : ''}`}>▸</span>
            Completed ({completed.length})
          </button>
          {completedOpen && completed.map((task) => renderTaskGroup(task))}
        </>
      )}
    </div>
  );
}
