import type { Priority, Task } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDeadline, isOverdue } from '@/utils/date';
import { hexToRgba } from '@/utils/color';
import styles from './TaskItem.module.css';

const PRIORITY_GRADIENT: Partial<Record<Priority, string>> = {
  low:    'linear-gradient(to left, rgba(34,197,94,0.4),    transparent 24%)',
  medium: 'linear-gradient(to left, rgba(245,158,11,0.4),   transparent 24%)',
  high:   'linear-gradient(to left, rgba(239,68,68,0.4),    transparent 24%)',
};

interface Props {
  task:             Task;
  collectionColor:  string | null;
  isSubtask?:       boolean;
  expanded?:        boolean;
  onToggleExpand?:  () => void;
  forceDueDate?:    boolean;
}

export function TaskItem({ task, collectionColor, isSubtask, expanded = false, onToggleExpand, forceDueDate = false }: Props) {
  const toggleTask        = useTaskStore((s) => s.toggleTask);
  const tagsRecord        = useTaskStore((s) => s.tags);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const tasksRecord       = useTaskStore((s) => s.tasks);
  const openTaskPane  = useUIStore((s) => s.openTaskPane);
  const activeCollectionId   = useUIStore((s) => s.activeCollectionId);
  const colorEnabled         = useSettingsStore((s) => s.colorEnabled);
  const priorityColorEnabled = useSettingsStore((s) => s.priorityColorEnabled);
  const alwaysShowDueDate    = useSettingsStore((s) => s.alwaysShowDueDate);

  const bgStyle: React.CSSProperties = {};
  if (collectionColor) {
    bgStyle.borderLeftColor = collectionColor;
    if (colorEnabled && !task.completed) {
      bgStyle.backgroundColor = hexToRgba(collectionColor, 0.07);
    }
  }
  if (priorityColorEnabled && !task.completed && task.priority !== 'none') {
    bgStyle.backgroundImage = PRIORITY_GRADIENT[task.priority];
  }

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') === e.currentTarget.querySelector(`.${styles.checkbox}`)) return;
    openTaskPane(task.id);
  };

  const subtaskIds     = task.subtaskIds ?? [];
  const hasSubtasks    = subtaskIds.length > 0;
  const subtaskTotal   = subtaskIds.length;
  const subtaskDone    = subtaskIds.filter((id) => tasksRecord[id]?.completed).length;
  const activeTags     = (task.tagIds ?? []).map((id) => tagsRecord[id]).filter(Boolean);
  const collection     = task.collectionId ? collectionsRecord[task.collectionId] : null;
  const showCollection = !isSubtask && !activeCollectionId && !!collection;
  const activeLinks    = task.links ?? [];
  const hasDetails     = !task.completed && (!!task.notes || activeTags.length > 0 || showCollection || activeLinks.length > 0);
  const canExpand      = (hasDetails || hasSubtasks) && !!onToggleExpand;
  const showDueDate    = alwaysShowDueDate || forceDueDate || task.kind === 'milestone';

  return (
    <div
      className={`${styles.item} ${task.completed ? styles.itemDone : ''} ${isSubtask ? styles.subtask : ''} ${expanded ? styles.itemExpanded : ''}`}
      style={bgStyle}
      onClick={handleRowClick}
    >
      {/* ── Main row ── */}
      <div className={styles.itemRow}>
        <button
          className={`${styles.checkbox} ${task.completed ? styles.checkboxDone : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {task.completed && <span className={styles.checkmark}>✓</span>}
        </button>

        <span className={`${styles.title} ${task.completed ? styles.titleDone : ''}`}>
          {task.title}
        </span>

        {task.deadline && !task.completed && (
          <span
            className={`${styles.deadline} ${isOverdue(task.deadline, task.deadlineTime) ? styles.deadlineOverdue : ''}`}
            style={showDueDate ? { opacity: 1 } : undefined}
          >
            {formatDeadline(task.deadline, task.deadlineTime)}
          </span>
        )}

        {task.kind === 'waiting' && !task.completed && (
          <span className={styles.indicator} title="Waiting task">⏳</span>
        )}

        {task.kind === 'milestone' && !task.completed && (
          <span className={styles.milestoneIndicator} title="Milestone">◆</span>
        )}

        {hasSubtasks && !task.completed && (
          <span className={styles.subtaskIndicator} title="Sub-tasks">
            {subtaskDone}/{subtaskTotal}
          </span>
        )}

      </div>

      {/* ── Details (hover or explicit expand) ── */}
      {hasDetails && (
        <div className={`${styles.hoverDetails} ${expanded ? styles.hoverDetailsOpen : ''}`}>
          <div className={styles.hoverDetailsInner}>
            {(showCollection || activeTags.length > 0) && (
              <div className={styles.hoverMeta}>
                {showCollection && (
                  <span
                    className={styles.hoverCollection}
                    style={collection!.color ? { color: collection!.color } : undefined}
                  >
                    {collection!.name}
                  </span>
                )}
                {showCollection && activeTags.length > 0 && (
                  <span className={styles.hoverSep}>|</span>
                )}
                {activeTags.length > 0 && (
                  <div className={styles.hoverTags}>
                    {activeTags.map((tag) => tag && (
                      <span
                        key={tag.id}
                        className={styles.hoverTag}
                        style={tag.color
                          ? { background: tag.color + '22', borderColor: tag.color, color: tag.color }
                          : undefined}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {task.notes && (
              <p className={styles.hoverNotes}>{task.notes}</p>
            )}
            {activeLinks.length > 0 && (
              <div className={styles.hoverLinks}>
                {activeLinks.map((url, i) => {
                  let label = url;
                  try { label = new URL(url.startsWith('http') ? url : `https://${url}`).hostname; } catch {}
                  return (
                    <a
                      key={i}
                      href={url.startsWith('http') ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.hoverLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {label}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {canExpand && (
        <div
          className={`${styles.expandStrip} ${expanded ? styles.expandStripOpen : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleExpand!(); }}
          role="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <span className={`${styles.expandStripChevron} ${expanded ? styles.expandStripChevronUp : ''}`} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
