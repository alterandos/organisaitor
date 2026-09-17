import { useState, useEffect, useRef } from 'react';
import type { Priority, TagId, PurposeId, TaskKind, TaskId, TimeIntensity } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { deleteTaskWithCleanup, unlinkCrossAppRef } from '@/services/crossAppLinkCleanup';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import type { CrossAppRef } from '@/types';
import styles from './TaskPane.module.css';

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 'low',    label: 'Low',    color: '#22c55e' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'high',   label: 'High',   color: '#ef4444' },
];

export function TaskPane() {
  const editingTaskId  = useUIStore((s) => s.editingTaskId);
  const closeTaskPane  = useUIStore((s) => s.closeTaskPane);
  const openTaskPane   = useUIStore((s) => s.openTaskPane);
  const showAddSubtask = useUIStore((s) => s.showAddSubtask);

  const tasksRecord       = useTaskStore((s) => s.tasks);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const purposesRecord    = useTaskStore((s) => s.purposes);
  const tagsRecord        = useTaskStore((s) => s.tags);
  const updateTask        = useTaskStore((s) => s.updateTask);
  const addTask           = useTaskStore((s) => s.addTask);

  const addEvent    = useCalendarStore((s) => s.addEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const addReminder    = useCalendarStore((s) => s.addReminder);
  const updateReminder = useCalendarStore((s) => s.updateReminder);
  const deleteReminder = useCalendarStore((s) => s.deleteReminder);

  const task = editingTaskId ? tasksRecord[editingTaskId as TaskId] : null;

  const [title,          setTitle]          = useState('');
  const [notes,          setNotes]          = useState('');
  const [tagSearch,      setTagSearch]      = useState('');
  const [tagDropOpen,    setTagDropOpen]    = useState(false);
  const [subtaskInput,   setSubtaskInput]   = useState('');
  const [linkInput,      setLinkInput]      = useState('');
  const [editingLinkIdx, setEditingLinkIdx] = useState<number | null>(null);
  const [editingLinkVal, setEditingLinkVal] = useState('');
  const tagInputRef  = useRef<HTMLInputElement>(null);
  const notesRef     = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? '');
    }
  }, [task?.id]);

  // Notes field grows with content up to 40% of the window height, then scrolls.
  useEffect(() => {
    const el = notesRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [notes]);

  useEffect(() => {
    const handleResize = () => {
      const el = notesRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTaskPane(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [closeTaskPane]);

  if (!task) return null;

  const taskId = task.id;

  const collectionList = Object.values(collectionsRecord);
  const purposeList    = Object.values(purposesRecord);
  const tagList        = Object.values(tagsRecord);

  const saveTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) updateTask(taskId, { title: trimmed });
    else if (!trimmed) setTitle(task.title);
  };

  const saveNotes = () => {
    const val = notes.trim() || null;
    if (val !== task.notes) updateTask(taskId, { notes: val });
  };

  // Mirrors handleScheduledAtChange/handleScheduledTimeChange below exactly — same
  // create/update/delete-shadow-entity pattern, just producing a CalendarReminder
  // (reminderType: 'task') instead of a CalendarEvent.
  const handleDeadlineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value || null;
    if (!val) {
      if (task.calendarReminderId) {
        deleteReminder(task.calendarReminderId);
        updateTask(taskId, { deadline: null, deadlineTime: null, calendarReminderId: null });
      } else {
        updateTask(taskId, { deadline: null, deadlineTime: null });
      }
    } else if (task.calendarReminderId) {
      updateReminder(task.calendarReminderId, { date: val, title: task.title });
      updateTask(taskId, { deadline: val });
    } else {
      const remId = addReminder({ title: task.title, date: val, time: task.deadlineTime ?? null, reminderType: 'task' });
      updateTask(taskId, { deadline: val, calendarReminderId: remId });
    }
  };

  const handleDeadlineTimeChange = (v: string) => {
    const val = v || null;
    if (task.calendarReminderId) updateReminder(task.calendarReminderId, { time: val });
    updateTask(taskId, { deadlineTime: val });
  };

  const handleScheduledAtChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value || null;
    if (!val) {
      if (task.calendarEventId) {
        deleteEvent(task.calendarEventId);
        updateTask(taskId, { scheduledAt: null, scheduledTime: null, calendarEventId: null });
      } else {
        updateTask(taskId, { scheduledAt: null, scheduledTime: null });
      }
    } else if (task.calendarEventId) {
      updateEvent(task.calendarEventId, { date: val, title: task.title });
      updateTask(taskId, { scheduledAt: val });
    } else {
      const evId = addEvent({ title: task.title, date: val, startTime: task.scheduledTime ?? null, eventType: 'task' });
      updateTask(taskId, { scheduledAt: val, calendarEventId: evId });
    }
  };

  const handleScheduledTimeChange = (v: string) => {
    const val = v || null;
    if (task.calendarEventId) updateEvent(task.calendarEventId, { startTime: val });
    updateTask(taskId, { scheduledTime: val });
  };

  const handlePriorityClick = (p: Priority) =>
    updateTask(taskId, { priority: p === task.priority ? 'none' : p });

  const handleKindClick = (k: TaskKind) =>
    updateTask(taskId, { kind: k });

  const handleIntensityClick = (i: TimeIntensity) =>
    updateTask(taskId, { timeIntensity: i === (task.timeIntensity ?? null) ? null : i });

  const togglePurpose = (id: PurposeId) => {
    const current = task.purposeIds ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    updateTask(taskId, { purposeIds: next });
  };

  const toggleTag = (id: TagId) => {
    const current = task.tagIds ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    updateTask(taskId, { tagIds: next });
  };

  const handleAddSubtask = () => {
    const trimmed = subtaskInput.trim();
    if (!trimmed) return;
    // Inherit from parent — extend this list as new inheritable fields are added
    addTask({
      title:        trimmed,
      parentId:     taskId,
      collectionId: task.collectionId,
    });
    setSubtaskInput('');
  };

  const handleDelete = () => {
    deleteTaskWithCleanup(taskId);
    closeTaskPane();
  };

  const currentLinks = task.links ?? [];

  const navigateToCrossAppRef = (ref: CrossAppRef) => {
    if (ref.type !== 'note') return; // only 'note' targets are navigable today
    useUIStore.getState().setActiveView('notes');
    useUIStore.getState().openNote(ref.id);
  };

  const handleCrossAppRefsChange = (next: CrossAppRef[]) => {
    const removed = (task.crossAppRefs ?? []).filter(
      (r) => !next.some((n) => n.type === r.type && n.id === r.id)
    );
    removed.forEach((ref) => unlinkCrossAppRef('task', taskId, ref));
    updateTask(taskId, { crossAppRefs: next });
  };

  const addLink = () => {
    const url = linkInput.trim();
    if (!url) return;
    updateTask(taskId, { links: [...currentLinks, url] });
    setLinkInput('');
  };

  const deleteLink = (idx: number) =>
    updateTask(taskId, { links: currentLinks.filter((_, i) => i !== idx) });

  const startEditLink = (idx: number) => {
    setEditingLinkIdx(idx);
    setEditingLinkVal(currentLinks[idx]);
  };

  const commitEditLink = (idx: number) => {
    const url = editingLinkVal.trim();
    if (url) {
      const next = [...currentLinks];
      next[idx] = url;
      updateTask(taskId, { links: next });
    }
    setEditingLinkIdx(null);
  };

  const subtasks = (task.subtaskIds ?? [])
    .map((id) => tasksRecord[id])
    .filter(Boolean);

  return (
    <>
      <div className={styles.overlay} onClick={closeTaskPane} />
      <aside className={styles.pane}>
        <header className={styles.header}>
          <span className={styles.heading}>Task</span>
          <button className={styles.closeBtn} onClick={closeTaskPane} aria-label="Close">×</button>
        </header>

        <div className={styles.body}>
          <input
            className={styles.titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            aria-label="Task title"
          />

          <textarea
            ref={notesRef}
            className={styles.notesInput}
            placeholder="Add notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={3}
          />

          <div className={styles.field}>
            <span className={styles.label}>
              {task.kind === 'milestone' ? LABELS.milestoneDate : 'Due date'}
            </span>
            <div className={styles.dateTimeRow}>
              <input
                type="date"
                className={styles.dateInput}
                value={task.deadline ?? ''}
                onChange={handleDeadlineChange}
                required={task.kind === 'milestone'}
              />
              {(task.deadline || task.kind === 'milestone') && (
                <TimeInput
                  className={styles.timeInput}
                  value={task.deadlineTime ?? ''}
                  onChange={handleDeadlineTimeChange}
                  placeholder="Time"
                />
              )}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{LABELS.scheduledFor}</span>
            <div className={styles.dateTimeRow}>
              <input
                type="date"
                className={styles.dateInput}
                value={task.scheduledAt ?? ''}
                onChange={handleScheduledAtChange}
              />
              {task.scheduledAt && (
                <TimeInput
                  className={styles.timeInput}
                  value={task.scheduledTime ?? ''}
                  onChange={handleScheduledTimeChange}
                  placeholder="Time"
                />
              )}
            </div>
            {task.scheduledAt && (
              <span className={styles.scheduledHint}>
                {task.calendarEventId ? 'Synced to calendar' : 'Added to calendar'}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Priority</span>
            <div className={styles.row}>
              {PRIORITY_OPTIONS.map((opt) => {
                const active = task.priority === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={`${styles.pill} ${active ? styles.pillActive : ''}`}
                    style={active ? { borderColor: opt.color, color: opt.color } : undefined}
                    onClick={() => handlePriorityClick(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Type</span>
            <div className={styles.row}>
              {(['action', 'waiting', 'milestone'] as TaskKind[]).map((k) => (
                <button
                  key={k}
                  className={`${styles.pill} ${task.kind === k ? styles.pillKindActive : ''}`}
                  onClick={() => handleKindClick(k)}
                >
                  {k === 'waiting' && '⏳ '}
                  {k === 'milestone' && '◆ '}
                  {LABELS.taskKind[k]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Time intensity</span>
            <div className={styles.row}>
              {([
                { value: 'low',    label: 'Low',  color: '#22c55e' },
                { value: 'medium', label: 'Med',  color: '#f59e0b' },
                { value: 'high',   label: 'High', color: '#ef4444' },
              ] as { value: TimeIntensity; label: string; color: string }[]).map((opt) => {
                const active = (task.timeIntensity ?? null) === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={`${styles.pill} ${active ? styles.pillActive : ''}`}
                    style={active ? { borderColor: opt.color, color: opt.color } : undefined}
                    onClick={() => handleIntensityClick(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {collectionList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>{LABELS.collection}</span>
              <CollectionPicker
                collections={collectionList}
                value={task.collectionId}
                onChange={(id) => updateTask(taskId, { collectionId: id })}
                noneLabel="No Endeavour"
              />
            </div>
          )}

          {purposeList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>Purposes</span>
              <div className={styles.chips}>
                {purposeList.map((p) => {
                  const active = (task.purposeIds ?? []).includes(p.id as PurposeId);
                  return (
                    <button
                      key={p.id}
                      className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                      style={active && p.color
                        ? { background: p.color + '22', borderColor: p.color, color: p.color }
                        : undefined}
                      onClick={() => togglePurpose(p.id as PurposeId)}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>Tags</span>
            <div className={styles.tagBox} onClick={() => tagInputRef.current?.focus()}>
              {(task.tagIds ?? []).map((id) => {
                const tag = tagsRecord[id];
                if (!tag) return null;
                return (
                  <span
                    key={id}
                    className={styles.activeTag}
                    style={tag.color ? { borderColor: tag.color, color: tag.color, background: tag.color + '18' } : undefined}
                  >
                    {tag.name}
                    <button
                      className={styles.tagRemove}
                      onMouseDown={(e) => { e.preventDefault(); toggleTag(id); }}
                      aria-label={`Remove ${tag.name}`}
                    >×</button>
                  </span>
                );
              })}
              <input
                ref={tagInputRef}
                className={styles.tagInput}
                placeholder={!(task.tagIds ?? []).length ? 'Add tags…' : ''}
                value={tagSearch}
                onChange={(e) => { setTagSearch(e.target.value); setTagDropOpen(true); }}
                onFocus={() => setTagDropOpen(true)}
                onBlur={() => setTimeout(() => setTagDropOpen(false), 150)}
              />
            </div>
            {tagDropOpen && (
              <ul className={styles.tagSuggestions}>
                {tagList
                  .filter((t) =>
                    !(task.tagIds ?? []).includes(t.id as TagId) &&
                    t.name.toLowerCase().includes(tagSearch.toLowerCase())
                  )
                  .map((t) => (
                    <li key={t.id}>
                      <button
                        className={styles.tagSuggestion}
                        onMouseDown={(e) => { e.preventDefault(); toggleTag(t.id as TagId); setTagSearch(''); }}
                      >
                        {t.color && <span className={styles.tagDot} style={{ background: t.color }} />}
                        {t.name}
                      </button>
                    </li>
                  ))
                }
                {tagList.filter((t) => !(task.tagIds ?? []).includes(t.id as TagId)).length === 0 && (
                  <li className={styles.tagEmpty}>All tags added</li>
                )}
              </ul>
            )}
          </div>

          {/* ── Links ── */}
          <div className={styles.field}>
            <span className={styles.label}>Links</span>
            {currentLinks.map((url, idx) => (
              <div key={idx} className={styles.linkRow}>
                {editingLinkIdx === idx ? (
                  <input
                    className={styles.linkEditInput}
                    value={editingLinkVal}
                    autoFocus
                    onChange={(e) => setEditingLinkVal(e.target.value)}
                    onBlur={() => commitEditLink(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEditLink(idx);
                      if (e.key === 'Escape') setEditingLinkIdx(null);
                    }}
                  />
                ) : (
                  <a
                    href={url.startsWith('http') ? url : `https://${url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.linkAnchor}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {url}
                  </a>
                )}
                <button
                  className={styles.linkIconBtn}
                  onClick={() => startEditLink(idx)}
                  aria-label="Edit link"
                  title="Edit"
                >✎</button>
                <button
                  className={`${styles.linkIconBtn} ${styles.linkDeleteBtn}`}
                  onClick={() => deleteLink(idx)}
                  aria-label="Delete link"
                  title="Delete"
                >×</button>
              </div>
            ))}
            <div className={styles.linkAdd}>
              <input
                className={styles.linkInput}
                placeholder="https://…"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                onBlur={addLink}
              />
              <button
                type="button"
                className={styles.linkAddBtn}
                onClick={addLink}
                disabled={!linkInput.trim()}
              >+</button>
            </div>
          </div>

          {/* ── Linked items (Notes today; Calendar/List/Tracker are stubs in the picker
               itself — see CLAUDE.md "Cross-app linking"). Populated automatically by the
               Notes "Create ▸ Task" flow, and manually addable/removable here. ── */}
          <div className={styles.field}>
            <span className={styles.label}>Linked items</span>
            <CrossAppRefPicker
              value={task.crossAppRefs ?? []}
              onChange={handleCrossAppRefsChange}
              onNavigate={navigateToCrossAppRef}
            />
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
                      onClick={() => useTaskStore.getState().toggleTask(sub.id)}
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
                    >↗</button>
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
        </div>

        <footer className={styles.footer}>
          <button className={styles.deleteBtn} onClick={handleDelete}>Delete task</button>
        </footer>
      </aside>
    </>
  );
}
