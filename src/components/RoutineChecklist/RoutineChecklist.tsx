import { useRoutineStore } from '@/store/routineStore';
import { useTrackerStore } from '@/store/trackerStore';
import type { Collection, CollectionId } from '@/types';
import { todayIso } from '@/utils/date';
import styles from './RoutineChecklist.module.css';

interface RoutineChecklistProps {
  routine: Collection;
}

export function RoutineChecklist({ routine }: RoutineChecklistProps) {
  const today = todayIso();

  const getOrCreateInstance  = useRoutineStore((s) => s.getOrCreateInstance);
  const toggleRoutineTask     = useRoutineStore((s) => s.toggleRoutineTask);
  const completeRoutine       = useRoutineStore((s) => s.completeRoutine);
  const addEntry              = useTrackerStore((s) => s.addEntry);

  const instance = getOrCreateInstance(routine.id as CollectionId, today);
  const tasks    = routine.routineTasks ?? [];
  const checked  = instance.checked;
  const done     = instance.completed;
  const progress = tasks.length > 0 ? checked.length : 0;
  const total    = tasks.length;

  function handleToggle(taskId: string) {
    if (done) return;
    toggleRoutineTask(routine.id as CollectionId, today, taskId);
  }

  function handleComplete() {
    if (done) return;
    const entry = addEntry({
      trackerId: routine.id as CollectionId,
      date:      today,
      data:      {},
      notes:     null,
    });
    // addEntry returns void — look up the freshly created entry
    const entries = useTrackerStore.getState().entries;
    const created = Object.values(entries).find(
      (e) => e.trackerId === routine.id && e.date === today
    );
    completeRoutine(routine.id as CollectionId, today, created?.id ?? null);
  }

  return (
    <div className={`${styles.card} ${done ? styles.cardDone : ''}`}>
      <div className={styles.cardHeader}>
        <div className={styles.nameRow}>
          {routine.color && (
            <span className={styles.dot} style={{ background: routine.color }} />
          )}
          <span className={styles.routineName}>{routine.name}</span>
        </div>
        {total > 0 && (
          <span className={`${styles.progress} ${done ? styles.progressDone : ''}`}>
            {done ? '✓' : `${progress}/${total}`}
          </span>
        )}
      </div>

      {tasks.length > 0 && (
        <ul className={styles.tasks}>
          {tasks.map((t) => {
            const isChecked = checked.includes(t.id);
            return (
              <li key={t.id} className={styles.taskRow}>
                <label className={`${styles.taskLabel} ${done ? styles.taskLabelDone : ''}`}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={isChecked || done}
                    onChange={() => handleToggle(t.id)}
                    disabled={done}
                  />
                  <span className={`${styles.taskTitle} ${(isChecked || done) ? styles.taskTitleDone : ''}`}>
                    {t.title}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {done ? (
        <p className={styles.doneLabel}>Logged ✓</p>
      ) : (
        <button
          className={styles.completeBtn}
          onClick={handleComplete}
          disabled={total > 0 && progress < total}
          title={total > 0 && progress < total ? 'Tick all steps to complete' : 'Log completion'}
        >
          {total === 0 ? 'Log completion' : progress === total ? 'Mark done' : `${total - progress} steps left`}
        </button>
      )}
    </div>
  );
}
