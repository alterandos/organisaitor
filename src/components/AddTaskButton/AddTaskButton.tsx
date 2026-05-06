import { useUIStore } from '@/store/uiStore';
import type { CalendarItemKind } from '@/types';
import { LABELS } from '@/config/labels';
import styles from './AddTaskButton.module.css';

type TaskDialType = 'tag' | 'collection' | 'purpose' | 'task';
type CalDialType  = 'event' | 'reminder';

const TASK_OPTIONS: { type: TaskDialType; label: string; color: string; icon: string }[] = [
  { type: 'tag',        label: 'Tag',              color: '#8b5cf6', icon: '#' },
  { type: 'collection', label: LABELS.collection,  color: '#10b981', icon: '▤' },
  { type: 'purpose',    label: 'Purpose',          color: '#f97316', icon: '◎' },
  { type: 'task',       label: 'Task',             color: '#5b6ee1', icon: '+' },
];

const CAL_OPTIONS: { type: CalDialType; label: string; color: string; icon: string }[] = [
  { type: 'reminder', label: LABELS.calendarItemKind.reminder, color: '#10b981', icon: '◉' },
  { type: 'event',    label: LABELS.calendarItemKind.event,    color: '#5b6ee1', icon: '+' },
];

export function AddTaskButton() {
  const activeView         = useUIStore((s) => s.activeView);
  const showAddTask        = useUIStore((s) => s.showAddTask);
  const showAddCollection  = useUIStore((s) => s.showAddCollection);
  const showAddPurpose     = useUIStore((s) => s.showAddPurpose);
  const showAddTag         = useUIStore((s) => s.showAddTag);
  const showAddCalendarItem = useUIStore((s) => s.showAddCalendarItem);

  const handleTaskOption = (type: TaskDialType) => {
    if (type === 'collection') showAddCollection();
    else if (type === 'purpose') showAddPurpose();
    else if (type === 'tag') showAddTag();
    else showAddTask();
  };

  const handleCalOption = (type: CalDialType) => {
    showAddCalendarItem(undefined, type as CalendarItemKind);
  };

  if (activeView === 'calendar') {
    return (
      <div className={styles.speedDial}>
        <div className={styles.options} role="group" aria-label="Create options">
          {CAL_OPTIONS.map((opt) => (
            <div key={opt.type} className={styles.optionRow}>
              <span className={styles.optionLabel}>{opt.label}</span>
              <button
                className={styles.optionBtn}
                style={{ background: opt.color }}
                onClick={() => handleCalOption(opt.type)}
                aria-label={`Create ${opt.label}`}
              >
                {opt.icon}
              </button>
            </div>
          ))}
        </div>

        <button
          className={styles.fab}
          onClick={() => showAddCalendarItem()}
          aria-label="Add calendar item"
        >
          <span className={styles.fabIcon}>+</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.speedDial}>
      <div className={styles.options} role="group" aria-label="Create options">
        {TASK_OPTIONS.map((opt) => (
          <div key={opt.type} className={styles.optionRow}>
            <span className={styles.optionLabel}>{opt.label}</span>
            <button
              className={styles.optionBtn}
              style={{ background: opt.color }}
              onClick={() => handleTaskOption(opt.type)}
              aria-label={`Create ${opt.label}`}
            >
              {opt.icon}
            </button>
          </div>
        ))}
      </div>

      <button
        className={styles.fab}
        onClick={showAddTask}
        aria-label="Add task"
      >
        <span className={styles.fabIcon}>+</span>
      </button>
    </div>
  );
}
