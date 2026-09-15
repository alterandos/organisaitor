import { useEffect, useRef, useState } from 'react';
import type { Priority, Task } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePlatform } from '@/hooks/usePlatform';
import { hapticLight } from '@/utils/haptics';
import { formatDeadline, isOverdue } from '@/utils/date';
import { hexToRgba } from '@/utils/color';
import styles from './TaskItem.module.css';

const SWIPE_ACTION_THRESHOLD = 70;
const SWIPE_DELETE_REVEAL    = 88;

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
  const toggleTask        = useTaskStore((s) => s.toggleTask);
  const deleteTask        = useTaskStore((s) => s.deleteTask);
  const deleteEvent       = useCalendarStore((s) => s.deleteEvent);
  const deleteReminder    = useCalendarStore((s) => s.deleteReminder);
  const tagsRecord        = useTaskStore((s) => s.tags);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const tasksRecord       = useTaskStore((s) => s.tasks);
  const openTaskPane  = useUIStore((s) => s.openTaskPane);
  const activeCollectionId   = useUIStore(selectActiveCollectionId);
  const colorEnabled         = useSettingsStore((s) => s.colorEnabled);
  const priorityColorEnabled = useSettingsStore((s) => s.priorityColorEnabled);
  const alwaysShowDueDate    = useSettingsStore((s) => s.alwaysShowDueDate);
  const clockFormat          = useSettingsStore((s) => s.clockFormat);
  const timezone             = useSettingsStore((s) => s.timezone);

  // Android-only swipe gestures (no desktop equivalent): swipe right toggles complete,
  // swipe left reveals a delete action (tap to confirm — never auto-delete on release).
  // Native (non-passive) listeners are required, not React's onTouchMove, since React
  // attaches touch handlers as passive — e.preventDefault() there is a silent no-op and
  // the list would keep scrolling underneath a horizontal drag.
  const rowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; dx: number; locked: 'h' | 'v' | null } | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteRevealed, setDeleteRevealed] = useState(false);

  useEffect(() => {
    if (!isAndroid) return;
    const el = rowRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, dx: 0, locked: null };
      setIsDragging(true);
    };
    const onTouchMove = (e: TouchEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.touches[0].clientX - d.startX;
      const dy = e.touches[0].clientY - d.startY;
      if (d.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        d.locked = Math.abs(dx) > Math.abs(dy) * 2 ? 'h' : 'v';
      }
      if (d.locked === 'h') {
        e.preventDefault();
        d.dx = dx;
        setSwipeX(dx);
      }
    };
    const onTouchEnd = () => {
      const d = dragRef.current;
      if (d?.locked === 'h') {
        if (d.dx > SWIPE_ACTION_THRESHOLD) {
          hapticLight();
          toggleTask(task.id);
          setSwipeX(0);
          setDeleteRevealed(false);
        } else if (d.dx < -SWIPE_ACTION_THRESHOLD) {
          setSwipeX(-SWIPE_DELETE_REVEAL);
          setDeleteRevealed(true);
        } else {
          setSwipeX(0);
          setDeleteRevealed(false);
        }
      }
      dragRef.current = null;
      setIsDragging(false);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [isAndroid, task.id, toggleTask]);

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

  const itemStyle = swipeX
    ? { ...bgStyle, transform: `translateX(${swipeX}px)`, transition: isDragging ? 'none' : undefined }
    : bgStyle;

  const itemEl = (
    <div
      ref={rowRef}
      className={`${styles.item} ${task.completed ? styles.itemDone : ''} ${isSubtask ? styles.subtask : ''} ${expanded ? styles.itemExpanded : ''}`}
      style={itemStyle}
      onClick={(e) => { if (deleteRevealed) { setSwipeX(0); setDeleteRevealed(false); return; } handleRowClick(e); }}
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

        {task.kind === 'waiting' && !task.completed && (
          <span className={styles.indicator} style={showDueDate ? { opacity: 1 } : undefined} title="Waiting task">⏳</span>
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

  if (!isAndroid) return itemEl;

  return (
    <div className={styles.swipeWrapper}>
      <button
        className={styles.swipeDeleteAction}
        style={{ opacity: deleteRevealed ? 1 : 0, pointerEvents: deleteRevealed ? 'auto' : 'none' }}
        onClick={(e) => {
          e.stopPropagation();
          if (task.calendarEventId) deleteEvent(task.calendarEventId);
          if (task.calendarReminderId) deleteReminder(task.calendarReminderId);
          deleteTask(task.id);
        }}
        aria-label="Delete task"
      >
        Delete
      </button>
      {itemEl}
    </div>
  );
}
