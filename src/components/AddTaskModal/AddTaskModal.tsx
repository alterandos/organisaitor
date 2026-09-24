import { useState, useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { newTagId } from '@/utils/id';
import { LABELS } from '@/config/labels';
import type { Priority, TagId, PurposeId, CollectionId, TaskKind, TaskId, CrossAppRef } from '@/types';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import { CrossAppRefPicker } from '@/components/CrossAppRefPicker/CrossAppRefPicker';
import styles from './AddTaskModal.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

type PendingTag = { id: TagId; name: string; isNew: boolean };

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'none',   label: 'None' },
  { value: 'low',    label: 'Low'  },
  { value: 'medium', label: 'Med'  },
  { value: 'high',   label: 'High' },
];

export function AddTaskModal() {
  const taskModalAdvanced  = useUIStore((s) => s.taskModalAdvanced);
  const activeCollectionId = useUIStore(selectActiveCollectionId);
  const pendingParentId    = useUIStore((s) => s.pendingParentId);
  const quickAddPrefill    = useUIStore((s) => s.quickAddPrefill);
  const closeModal         = useUIStore((s) => s.closeModal);

  // Abandoning the modal (Escape/backdrop/Cancel) without submitting must drop any pending
  // Notes "Create ▸ Task" link request — otherwise a later, unrelated task creation could
  // pick it up. Reads uiStore imperatively (not a subscribed value) since this is an
  // event-time check, not something the component needs to re-render on. The success path
  // (handleSubmit) does NOT use this: it resolves the link first and lets NoteEditor clear
  // it itself once the mark is applied (see uiStore).
  const handleClose = () => {
    if (useUIStore.getState().pendingArtifactLink) useUIStore.getState().clearPendingArtifactLink();
    closeModal();
  };

  const [advanced, setAdvanced] = useState(taskModalAdvanced || !!pendingParentId);
  const formRef = useRef<HTMLFormElement>(null);

  const [title,         setTitle]         = useState(quickAddPrefill?.title ?? '');
  const [notes,         setNotes]         = useState('');
  const [deadline,      setDeadline]      = useState(quickAddPrefill?.deadline ?? '');
  const [deadlineTime,  setDeadlineTime]  = useState(quickAddPrefill?.deadlineTime ?? '');
  const [scheduledAt,   setScheduledAt]   = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  // A sub-task starts with its parent's priority, Endeavour, tags and purposes; the user's
  // own pick always wins over that (tracked per-field via a *Touched ref, same pattern as
  // priority already used).
  const parentTaskInitial = pendingParentId ? useTaskStore.getState().tasks[pendingParentId as TaskId] : undefined;

  const [priority,      setPriority]      = useState<Priority>(
    quickAddPrefill?.priority ?? parentTaskInitial?.priority ?? 'none'
  );
  const priorityTouched = useRef(quickAddPrefill?.priority !== undefined);

  // Advanced fields — pre-fill collection from the parent task (sub-task creation), else the
  // active filter, or from MobileQuickAddBar's "More options…" handoff
  // (docs/android/01-tasks-app.md §3.2) when that took place instead
  const [collectionId,       setCollectionId]       = useState<CollectionId | ''>(
    (quickAddPrefill?.collectionId
      ?? (pendingParentId ? (parentTaskInitial?.collectionId ?? '') : (activeCollectionId ?? ''))
    ) as CollectionId | ''
  );
  const collectionTouched = useRef(quickAddPrefill?.collectionId !== undefined);
  const [selectedPurposeIds, setSelectedPurposeIds] = useState<PurposeId[]>(parentTaskInitial?.purposeIds ?? []);
  const purposesTouched = useRef(false);
  const [pendingTags,        setPendingTags]         = useState<PendingTag[]>(
    (parentTaskInitial?.tagIds ?? []).map((id) => ({ id, name: useTaskStore.getState().tags[id]?.name ?? '', isNew: false }))
  );
  const tagsTouched = useRef(false);
  const [tagInput,           setTagInput]            = useState('');
  const [showSuggestions,    setShowSuggestions]     = useState(false);
  const [taskKind,           setTaskKind]            = useState<TaskKind>('action');
  const [parentId,           setParentId]            = useState<TaskId | ''>((pendingParentId as TaskId) ?? '');
  const [links,              setLinks]               = useState<string[]>(quickAddPrefill?.links ?? []);
  const [linkInput,          setLinkInput]           = useState('');
  // Manually-picked links only — the automatic "created from this note" backlink (see
  // pendingArtifactLink below) is kept separate and merged in at submit time, so removing a
  // manual pick here can never be mistaken for undoing the automatic one.
  const [manualCrossAppRefs, setManualCrossAppRefs]  = useState<CrossAppRef[]>([]);

  const addTag  = useTaskStore((s) => s.addTag);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const purposes   = useTaskStore((s) => s.purposes);
  const tags       = useTaskStore((s) => s.tags);
  const tasksRecord = useTaskStore((s) => s.tasks);

  const collectionList = Object.values(collectionsRecord);
  const purposeList    = Object.values(purposes).filter((p) => !p.archivedAt);
  const existingTags   = Object.values(tags);
  const topLevelTasks  = Object.values(tasksRecord).filter((t) => !t.parentId && !t.completed && !t.archived);

  const [prevTaskModalAdvanced, setPrevTaskModalAdvanced] = useState(taskModalAdvanced);
  if (prevTaskModalAdvanced !== taskModalAdvanced) {
    setPrevTaskModalAdvanced(taskModalAdvanced);
    setAdvanced(taskModalAdvanced);
  }

  useEscapeClose(() => { handleClose(); });

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
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
    tagsTouched.current = true;
    setPendingTags((prev) => [...prev, { id: tag.id, name: tag.name, isNew: false }]);
    setTagInput('');
    setShowSuggestions(false);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Only consumes Escape while there is a suggestions list to dismiss; otherwise it falls
    // through to the modal's own close (this input is always present, unlike the inline editors).
    if (e.key === 'Escape') { if (showSuggestions && suggestions.length > 0) { e.stopPropagation(); setShowSuggestions(false); } return; }
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const raw = tagInput.trim();
    if (!raw) return;
    if (pendingTags.some((t) => t.name.toLowerCase() === raw.toLowerCase())) {
      setTagInput('');
      return;
    }
    const existing = existingTags.find((t) => t.name.toLowerCase() === raw.toLowerCase());
    tagsTouched.current = true;
    if (existing) {
      setPendingTags((prev) => [...prev, { id: existing.id, name: existing.name, isNew: false }]);
    } else {
      setPendingTags((prev) => [...prev, { id: newTagId(), name: raw, isNew: true }]);
    }
    setTagInput('');
    setShowSuggestions(false);
  };

  const removeTag = (id: TagId) => {
    tagsTouched.current = true;
    setPendingTags((prev) => prev.filter((t) => t.id !== id));
  };

  const addLink = () => {
    const url = linkInput.trim();
    if (!url || links.includes(url)) return;
    setLinks((prev) => [...prev, url]);
    setLinkInput('');
  };

  const removeLink = (url: string) => setLinks((prev) => prev.filter((l) => l !== url));

  const togglePurpose = (id: PurposeId) => {
    purposesTouched.current = true;
    setSelectedPurposeIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    pendingTags.filter((t) => t.isNew).forEach((t) =>
      addTag({ id: t.id, name: t.name, color: null, notes: null })
    );

    // If this creation originated from a Notes selection (FloatingToolbar's "+ Create"
    // menu), record the reverse link now and report the new id back so NoteEditor can
    // apply the forward ArtifactLinkMark and clear the pending request itself. The ref's
    // `type` is the *source* of the link (always 'note' today) — not
    // pendingArtifactLink.targetType, which instead describes the forward mark's target
    // (i.e. 'task', what's being created) and would be backwards here. Merged with whatever
    // was manually picked via the "Linked items" field, deduped in case the same note was
    // both the creation source and manually re-added.
    const pendingArtifactLink = useUIStore.getState().pendingArtifactLink;
    const autoRef = pendingArtifactLink
      ? [{ type: 'note' as const, id: pendingArtifactLink.noteId, ...(pendingArtifactLink.tabId ? { tabId: pendingArtifactLink.tabId } : {}) }]
      : [];
    const crossAppRefs = [...autoRef, ...manualCrossAppRefs].filter(
      (ref, i, all) => all.findIndex((r) => r.type === ref.type && r.id === ref.id) === i
    );

    const taskId = addTaskWithCalendar({
      title,
      notes:           notes || null,
      links:           links.filter(Boolean),
      deadline:        deadline     || null,
      deadlineTime:    deadlineTime || null,
      scheduledAt:     scheduledAt  || null,
      scheduledTime:   scheduledTime || null,
      priority,
      collectionId: collectionId ? collectionId as CollectionId : null,
      tagIds:       pendingTags.map((t) => t.id),
      purposeIds:   selectedPurposeIds,
      kind:         taskKind,
      parentId:     parentId ? parentId as TaskId : null,
      crossAppRefs,
    });

    if (pendingArtifactLink) useUIStore.getState().resolveArtifactLink(taskId);
    closeModal();
  };

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>New Task</span>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">✕</button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit}>
          {/* ── Basic fields ── */}
          <input
            className={styles.titleInput}
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
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
                  <TimeInput
                    className={styles.timeInput}
                    value={deadlineTime}
                    onChange={setDeadlineTime}
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
                    onClick={() => { priorityTouched.current = true; setPriority(p.value); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>{LABELS.scheduledFor}</label>
              <div className={styles.dateTimeRow}>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={scheduledAt}
                  onChange={(e) => {
                    setScheduledAt(e.target.value);
                    if (!e.target.value) setScheduledTime('');
                  }}
                />
                {scheduledAt && (
                  <TimeInput
                    className={styles.timeInput}
                    value={scheduledTime}
                    onChange={setScheduledTime}
                    placeholder="Time"
                  />
                )}
              </div>
              {scheduledAt && (
                <span className={styles.scheduledHint}>Added to calendar automatically</span>
              )}
            </div>
          </div>

          {/* ── Endeavour (always visible) ── */}
          {collectionList.length > 0 && (
            <div className={styles.row}>
              <div className={`${styles.field} ${styles.fieldGrow}`}>
                <label className={styles.label}>{LABELS.collection}</label>
                <CollectionPicker
                  collections={collectionList}
                  value={collectionId || null}
                  onChange={(id) => { collectionTouched.current = true; setCollectionId(id ?? ''); }}
                  noneLabel={LABELS.noCollection}
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
                    onBlur={addLink}
                  />
                  <button type="button" className={styles.linkAddBtn} onClick={addLink} disabled={!linkInput.trim()}>Add</button>
                </div>
              </div>

              {/* Linked items (Notes today; Calendar/List/Tracker are stubs in the picker
                  itself — see CLAUDE.md "Cross-app linking") */}
              <div className={styles.field}>
                <label className={styles.label}>Linked items</label>
                <CrossAppRefPicker value={manualCrossAppRefs} onChange={setManualCrossAppRefs} suggestFrom={title} />
              </div>

              {/* Parent task */}
              {topLevelTasks.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.label}>Parent task (sub-task of)</label>
                  <select
                    className={styles.select}
                    value={parentId}
                    onChange={(e) => {
                      const next = e.target.value as TaskId | '';
                      setParentId(next);
                      const nextParent = next ? tasksRecord[next] : undefined;
                      if (!priorityTouched.current) setPriority(nextParent?.priority || 'none');
                      if (!collectionTouched.current) setCollectionId(nextParent?.collectionId ?? '');
                      if (!tagsTouched.current) {
                        setPendingTags((nextParent?.tagIds ?? []).map((id) => ({ id, name: tags[id]?.name ?? '', isNew: false })));
                      }
                      if (!purposesTouched.current) setSelectedPurposeIds(nextParent?.purposeIds ?? []);
                    }}
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
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
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
