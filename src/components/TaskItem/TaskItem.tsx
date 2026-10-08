import { useEffect, useRef } from 'react';
import { checklistProgress, linkedListIds } from '@/services/taskListLinks';
import { toggleTaskCompletion, taskCompletionOptions } from '@/services/taskCompletion';
import { HoverOptions } from '@/components/HoverOptions/HoverOptions';
import { useListStore } from '@/store/listStore';
import type { Priority, Task } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePlatform } from '@/hooks/usePlatform';
import { hapticLight, hapticWarning } from '@/utils/haptics';
import { useSwipeRow } from '@/hooks/useSwipeRow';
import { archiveTaskWithUndo, deleteTaskWithUndo } from '@/services/undoableActions';
import { formatDeadline, isOverdue } from '@/utils/date';
import { hexToRgba } from '@/utils/color';
import { openBlockers } from '@/utils/taskLinks';
import { LABELS } from '@/config/labels';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import { repeatSummary } from '@/services/recurringTasks';
import styles from './TaskItem.module.css';

// Two 80px actions (Archive, Delete) behind the row on a left swipe.
const SWIPE_LEFT_REVEAL = 160;

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
  const { isAndroid }     = usePlatform();
  const tagsRecord        = useTaskStore((s) => s.tags);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const tasksRecord       = useTaskStore((s) => s.tasks);
  const listsRecord     = useListStore((s) => s.lists);
  const listItemsRecord = useListStore((s) => s.listItems);
  const openTaskPane  = useUIStore((s) => s.openTaskPane);
  // The task open in the pane is marked in the list and scrolled to — including when it was opened
  // from somewhere else (a task link, a notification, Overview). TaskList makes sure it's rendered.
  const isOpen        = useUIStore((s) => s.editingTaskId === task.id);
  const activeCollectionId   = useUIStore(selectActiveCollectionId);
  const colorEnabled         = useSettingsStore((s) => s.colorEnabled);
  const priorityColorEnabled = useSettingsStore((s) => s.priorityColorEnabled);
  const alwaysShowDueDate    = useSettingsStore((s) => s.alwaysShowDueDate);
  const clockFormat          = useSettingsStore((s) => s.clockFormat);
  const timezone             = useSettingsStore((s) => s.timezone);

  // Android swipes (docs/android/11 §9): right completes; left slides the row open on Archive
  // and Delete, which act at once with an Undo toast (decision D2).
  const rowRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeRow(rowRef, {
    enabled:      isAndroid,
    onSwipeRight: () => { hapticLight(); void toggleTaskCompletion(task.id); },
    leftRevealPx: SWIPE_LEFT_REVEAL,
  });

  useEffect(() => {
    if (!isOpen) return;
    // After the parent's sub-task reveal (220ms) has opened, or the row isn't where it ends up yet.
    const timer = setTimeout(() => rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 260);
    return () => clearTimeout(timer);
  }, [isOpen]);

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

  // Waiting on another task (task links): shaded grey (itemBlocked), with a count naming what it waits on.
  const blockers       = task.completed || task.archived ? [] : openBlockers(task, tasksRecord);
  const checklist      = checklistProgress(linkedListIds(task.crossAppRefs), listsRecord, listItemsRecord);
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

  const itemStyle = swipe.offsetX
    ? { ...bgStyle, transform: `translateX(${swipe.offsetX}px)`, transition: swipe.dragging ? 'none' : undefined }
    : bgStyle;

  const itemEl = (
    <div
      ref={rowRef}
      className={`${styles.item} ${task.completed || task.archived ? styles.itemDone : ''} ${blockers.length > 0 ? styles.itemBlocked : ''} ${isOpen ? styles.itemOpen : ''} ${isSubtask ? styles.subtask : ''} ${expanded ? styles.itemExpanded : ''}`}
      style={itemStyle}
      onClick={(e) => { if (swipe.revealed) { swipe.close(); return; } handleRowClick(e); }}
    >
      {/* ── Main row ── */}
      <div className={styles.itemRow}>
        <HoverOptions options={taskCompletionOptions(task.id)}>
          <button
            className={`${styles.checkbox} ${task.completed ? styles.checkboxDone : ''}`}
            onClick={(e) => { e.stopPropagation(); void toggleTaskCompletion(task.id); }}
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {task.completed && <span className={styles.checkmark}>✓</span>}
          </button>
        </HoverOptions>

        <span className={`${styles.title} ${task.completed ? styles.titleDone : ''}`}>
          {task.title}
        </span>

        {task.deadline && !task.completed && (
          <span
            className={`${styles.deadline} ${isOverdue(task.deadline, task.deadlineTime, timezone) ? styles.deadlineOverdue : ''}`}
            style={showDueDate ? { opacity: 1 } : undefined}
            title="Due date"
          >
            ❗{formatDeadline(task.deadline, task.deadlineTime, clockFormat)}
          </span>
        )}

        {task.scheduledAt && !task.completed && (
          <span
            className={styles.scheduled}
            style={showDueDate ? { opacity: 1 } : undefined}
            title="Scheduled date"
          >
            🕐{formatDeadline(task.scheduledAt, task.scheduledTime, clockFormat)}
          </span>
        )}

        {task.repeat && !task.completed && (
          <span className={styles.indicator} style={showDueDate ? { opacity: 1 } : undefined} title={LABELS.recurring.rowTitle(repeatSummary(task.repeat))}>
            {ITEM_FLAG_ICON.repeats}
          </span>
        )}

        {task.kind === 'waiting' && !task.completed && (
          <span className={styles.indicator} style={showDueDate ? { opacity: 1 } : undefined} title="Waiting task">⏳</span>
        )}

        {blockers.length > 0 && (
          <span className={styles.blockedIndicator} title={LABELS.taskLinks.blockedTitle(blockers.map((b) => b.title))}>
            {LABELS.taskLinks.blockedPill(blockers.length)}
          </span>
        )}

        {task.kind === 'milestone' && !task.completed && (
          <span className={styles.milestoneIndicator} title="Milestone">◆</span>
        )}

        {checklist && checklist.total > 0 && !task.completed && (
          <span className={styles.checklistIndicator} title="Linked checklist">
            📋 {checklist.done}/{checklist.total}
          </span>
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
                  try { label = new URL(url.startsWith('http') ? url : `https://${url}`).hostname; } catch { /* not a URL: show it as typed */ }
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

  if (!isAndroid) return itemEl;

  return (
    <div className={styles.swipeWrapper}>
      <div className={`${styles.swipeActions} ${swipe.offsetX < 0 ? styles.swipeActionsShown : ''} ${swipe.revealed ? styles.swipeActionsLive : ''}`}>
        <button
          className={styles.swipeArchiveAction}
          onClick={(e) => { e.stopPropagation(); swipe.close(); archiveTaskWithUndo(task.id); }}
        >
          {LABELS.swipeActions.archive}
        </button>
        <button
          className={styles.swipeDeleteAction}
          onClick={(e) => { e.stopPropagation(); hapticWarning(); deleteTaskWithUndo(task.id); }}
        >
          {LABELS.swipeActions.delete}
        </button>
      </div>
      {itemEl}
    </div>
  );
}
