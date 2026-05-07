import { useState, useEffect } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { newTagId } from '@/utils/id';
import { LABELS } from '@/config/labels';
import type { Priority, TagId, PurposeId, CollectionId, TaskKind, TaskId } from '@/types';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import styles from './AddTaskModal.module.css';

type PendingTag = { id: TagId; name: string; isNew: boolean };

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'none',   label: 'None' },
  { value: 'low',    label: 'Low'  },
  { value: 'medium', label: 'Med'  },
  { value: 'high',   label: 'High' },
];

export function AddTaskModal() {
  const taskModalAdvanced  = useUIStore((s) => s.taskModalAdvanced);
  const activeCollectionId = useUIStore((s) => s.activeCollectionId);
  const pendingParentId    = useUIStore((s) => s.pendingParentId);
  const closeModal         = useUIStore((s) => s.closeModal);

  const [advanced, setAdvanced] = useState(taskModalAdvanced || !!pendingParentId);

  const [title,       setTitle]       = useState('');
  const [notes,       setNotes]       = useState('');
  const [deadline,     setDeadline]     = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [priority,    setPriority]    = useState<Priority>('none');

  // Advanced fields — pre-fill collection from active filter
  const [collectionId,       setCollectionId]       = useState<CollectionId | ''>((activeCollectionId ?? '') as CollectionId | '');
  const [selectedPurposeIds, setSelectedPurposeIds] = useState<PurposeId[]>([]);
  const [pendingTags,        setPendingTags]         = useState<PendingTag[]>([]);
  const [tagInput,           setTagInput]            = useState('');
  const [showSuggestions,    setShowSuggestions]     = useState(false);
  const [taskKind,           setTaskKind]            = useState<TaskKind>('action');
  const [parentId,           setParentId]            = useState<TaskId | ''>((pendingParentId as TaskId) ?? '');
  const [links,              setLinks]               = useState<string[]>([]);
  const [linkInput,          setLinkInput]           = useState('');

  const addTask    = useTaskStore((s) => s.addTask);
  const addTag     = useTaskStore((s) => s.addTag);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const purposes   = useTaskStore((s) => s.purposes);
  const tags       = useTaskStore((s) => s.tags);
  const tasksRecord = useTaskStore((s) => s.tasks);

  const collectionList = Object.values(collectionsRecord);
  const purposeList    = Object.values(purposes);
  const existingTags   = Object.values(tags);
  const topLevelTasks  = Object.values(tasksRecord).filter((t) => !t.parentId && !t.completed);

  useEffect(() => { setAdvanced(taskModalAdvanced); }, [taskModalAdvanced]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  const suggestions = tagInput.trim()
    ? existingTags.filter(
        (t) =>
          t.name.toLowerCase().includes(tagInput.toLowerCase()) &&
          !pendingTags.some((p) => p.id === t.id)
      )
    : [];

  const addExistingTag = (tag: { id: TagId; name: string }) => {
    setPendingTags((prev) => [...prev, { id: tag.id, name: tag.name, isNew: false }]);
    setTagInput('');
    setShowSuggestions(false);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setShowSuggestions(false); return; }
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const raw = tagInput.trim();
    if (!raw) return;
    if (pendingTags.some((t) => t.name.toLowerCase() === raw.toLowerCase())) {
      setTagInput('');
      return;
    }
    const existing = existingTags.find((t) => t.name.toLowerCase() === raw.toLowerCase());
    if (existing) {
      setPendingTags((prev) => [...prev, { id: existing.id, name: existing.name, isNew: false }]);
    } else {
      setPendingTags((prev) => [...prev, { id: newTagId(), name: raw, isNew: true }]);
    }
    setTagInput('');
    setShowSuggestions(false);
  };

  const removeTag = (id: TagId) =>
    setPendingTags((prev) => prev.filter((t) => t.id !== id));

  const addLink = () => {
    const url = linkInput.trim();
    if (!url || links.includes(url)) return;
    setLinks((prev) => [...prev, url]);
    setLinkInput('');
  };

  const removeLink = (url: string) => setLinks((prev) => prev.filter((l) => l !== url));

  const togglePurpose = (id: PurposeId) =>
    setSelectedPurposeIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    pendingTags.filter((t) => t.isNew).forEach((t) =>
      addTag({ id: t.id, name: t.name, color: null, notes: null })
    );

    addTask({
      title,
      notes:        notes || null,
      links:        links.filter(Boolean),
      deadline:     deadline     || null,
      deadlineTime: deadlineTime || null,
      priority,
      collectionId: collectionId ? collectionId as CollectionId : null,
      tagIds:       pendingTags.map((t) => t.id),
      purposeIds:   selectedPurposeIds,
      kind:         taskKind,
      parentId:     parentId ? parentId as TaskId : null,
    });
    closeModal();
  };

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>New Task</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── Basic fields ── */}
          <input
            className={styles.titleInput}
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Escape' && closeModal()}
          />

          <textarea
            className={styles.notes}
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>
                {taskKind === 'milestone' ? LABELS.milestoneDate : 'Due date'}
                {taskKind === 'milestone' && <span className={styles.required}>*</span>}
              </label>
              <div className={styles.dateTimeRow}>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={deadline}
                  onChange={(e) => {
                    setDeadline(e.target.value);
                    if (!e.target.value) setDeadlineTime('');
                  }}
                  required={taskKind === 'milestone'}
                />
                {(deadline || taskKind === 'milestone') && (
                  <input
                    type="time"
                    className={styles.timeInput}
                    value={deadlineTime}
                    onChange={(e) => setDeadlineTime(e.target.value)}
                    placeholder="Time"
                  />
                )}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Priority</label>
              <div className={styles.priorityGroup}>
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`${styles.priorityBtn} ${priority === p.value ? styles[`priority_${p.value}`] : ''}`}
                    onClick={() => setPriority(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Endeavour (always visible) ── */}
          {collectionList.length > 0 && (
            <div className={styles.row}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.label}>{LABELS.collection}</label>
                <CollectionPicker
                  collections={collectionList}
                  value={collectionId || null}
                  onChange={(id) => setCollectionId(id ?? '')}
                  noneLabel="No Endeavour"
                />
              </div>
            </div>
          )}

          {/* ── Expand bar (hover to reveal advanced) ── */}
          {!advanced && (
            <div
              className={styles.expandBar}
              onMouseEnter={() => setAdvanced(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setAdvanced(true)}
              aria-label="Show more options"
            >
              <span className={styles.expandBarChevron}>▾</span>
              <span className={styles.expandBarLabel}>More options</span>
            </div>
          )}

          {/* ── Advanced fields ── */}
          {advanced && (
            <div className={styles.advanced}>
              {/* Task kind */}
              <div className={styles.field}>
                <label className={styles.label}>Type</label>
                <div className={styles.kindGroup}>
                  <button
                    type="button"
                    className={`${styles.kindBtn} ${taskKind === 'action' ? styles.kindBtnActive : ''}`}
                    onClick={() => setTaskKind('action')}
                  >
                    {LABELS.taskKind.action}
                  </button>
                  <button
                    type="button"
                    className={`${styles.kindBtn} ${taskKind === 'waiting' ? styles.kindBtnActive : ''}`}
                    onClick={() => setTaskKind('waiting')}
                  >
                    ⏳ {LABELS.taskKind.waiting}
                  </button>
                  <button
                    type="button"
                    className={`${styles.kindBtn} ${taskKind === 'milestone' ? styles.kindBtnActive : ''}`}
                    onClick={() => setTaskKind('milestone')}
                  >
                    ◆ {LABELS.taskKind.milestone}
                  </button>
                </div>
              </div>

              {/* Purposes */}
              {purposeList.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.label}>Purposes</label>
                  <div className={styles.chips}>
                    {purposeList.map((p) => {
                      const active = selectedPurposeIds.includes(p.id as PurposeId);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                          style={active && p.color ? { background: p.color, borderColor: p.color, color: '#fff' } : undefined}
                          onClick={() => togglePurpose(p.id as PurposeId)}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div className={styles.field}>
                <label className={styles.label}>Tags — Enter or comma to add</label>
                <div className={styles.tagBox}>
                  {pendingTags.map((t) => (
                    <span key={t.id} className={styles.tag}>
                      {t.name}
                      <button type="button" className={styles.tagRemove} onClick={() => removeTag(t.id)}>×</button>
                    </span>
                  ))}
                  <input
                    className={styles.tagInput}
                    placeholder={pendingTags.length === 0 ? 'e.g. urgent, reading' : ''}
                    value={tagInput}
                    onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
                    onKeyDown={handleTagKeyDown}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
                  />
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <ul className={styles.suggestions}>
                    {suggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={styles.suggestion}
                          onMouseDown={(e) => { e.preventDefault(); addExistingTag(s); }}
                        >
                          {s.color && <span className={styles.suggestionDot} style={{ background: s.color }} />}
                          {s.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Links */}
              <div className={styles.field}>
                <label className={styles.label}>Links</label>
                {links.length > 0 && (
                  <ul className={styles.linkList}>
                    {links.map((url) => {
                      let label = url;
                      try { label = new URL(url.startsWith('http') ? url : `https://${url}`).hostname; } catch {}
                      return (
                        <li key={url} className={styles.linkRow}>
                          <span className={styles.linkLabel}>{label}</span>
                          <button type="button" className={styles.linkRemove} onClick={() => removeLink(url)} aria-label="Remove link">×</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className={styles.linkInputRow}>
                  <input
                    className={styles.input}
                    type="url"
                    placeholder="https://"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                  />
                  <button type="button" className={styles.linkAddBtn} onClick={addLink} disabled={!linkInput.trim()}>Add</button>
                </div>
              </div>

              {/* Parent task */}
              {topLevelTasks.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.label}>Parent task (sub-task of)</label>
                  <select
                    className={styles.select}
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value as TaskId | '')}
                  >
                    <option value="">None (top-level task)</option>
                    {topLevelTasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!title.trim() || (taskKind === 'milestone' && !deadline)}
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
