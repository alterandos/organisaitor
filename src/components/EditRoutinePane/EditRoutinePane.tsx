import { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { useTaskStore } from '@/store/taskStore';
import { useRoutineStore } from '@/store/routineStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import type { RoutineTask, RepeatConfig, CollectionId, PurposeId, TagId } from '@/types';
import styles from './EditRoutinePane.module.css';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS   = [1, 2, 3, 4, 5];

function buildRepeatConfig(daysOfWeek: number[]): RepeatConfig | null {
  if (daysOfWeek.length === 0) return null;
  return { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek };
}

export function EditRoutinePane() {
  const collections      = useTaskStore((s) => s.collections);
  const updateCollection = useTaskStore((s) => s.updateCollection);
  const deleteCollection = useTaskStore((s) => s.deleteCollection);
  const purposes         = useTaskStore((s) => s.purposes);
  const tags             = useTaskStore((s) => s.tags);
  const deleteInstances  = useRoutineStore((s) => s.deleteInstancesForRoutine);

  const editRoutineOpen  = useUIStore((s) => s.editRoutineOpen);
  const editingRoutineId = useUIStore((s) => s.editingRoutineId);
  const closeEditRoutine = useUIStore((s) => s.closeEditRoutine);
  const activeRoutineId  = useUIStore((s) => s.activeRoutineId);
  const setActiveRoutine = useUIStore((s) => s.setActiveRoutine);

  const routine = editingRoutineId
    ? (collections[editingRoutineId as CollectionId] ?? null)
    : null;

  const [name,       setName]       = useState('');
  const [color,      setColor]      = useState<string | null>(null);
  const [purposeIds, setPurposeIds] = useState<PurposeId[]>([]);
  const [tagIds,     setTagIds]     = useState<TagId[]>([]);
  const [tasks,      setTasks]      = useState<RoutineTask[]>([]);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [newTitle,   setNewTitle]   = useState('');

  useEffect(() => {
    if (routine) {
      setName(routine.name);
      setColor(routine.color ?? null);
      setPurposeIds((routine.purposeIds ?? []) as PurposeId[]);
      setTagIds((routine.tagIds ?? []) as TagId[]);
      setTasks(routine.routineTasks ?? []);
      setDaysOfWeek(routine.repeatConfig?.daysOfWeek ?? []);
    }
  }, [routine?.id]);

  if (!editRoutineOpen || !routine) return null;

  function addStep() {
    const title = newTitle.trim();
    if (!title) return;
    setTasks((prev) => [...prev, { id: nanoid(8), title, order: prev.length }]);
    setNewTitle('');
  }

  function removeStep(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i })));
  }

  function updateStepTitle(id: string, title: string) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, title } : t));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= tasks.length) return;
    setTasks((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((t, i) => ({ ...t, order: i }));
    });
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function handleSave() {
    if (!name.trim() || !routine) return;
    updateCollection(routine.id, {
      name:         name.trim(),
      color,
      purposeIds,
      tagIds,
      routineTasks: tasks,
      repeatConfig: buildRepeatConfig(daysOfWeek),
    });
    closeEditRoutine();
  }

  function handleDelete() {
    if (!routine) return;
    if (!window.confirm(`Delete routine "${routine.name}"? History will also be deleted.`)) return;
    deleteInstances(routine.id as CollectionId);
    deleteCollection(routine.id as CollectionId);
    if (activeRoutineId === routine.id) setActiveRoutine(null);
    closeEditRoutine();
  }

  const everyDay  = daysOfWeek.length === 0;
  const isWeekdays = daysOfWeek.length === 5 && WEEKDAYS.every((d) => daysOfWeek.includes(d));
  const purposeList = Object.values(purposes);
  const tagList     = Object.values(tags);

  return (
    <>
      <div className={styles.overlay} onClick={closeEditRoutine} />
      <aside className={styles.pane} role="complementary" aria-label="Edit routine">
        <div className={styles.header}>
          <span className={styles.heading}>Edit routine</span>
          <button className={styles.closeBtn} onClick={closeEditRoutine} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          {/* Name */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="erp-name">Name</label>
            <input
              id="erp-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Color */}
          <div className={styles.field}>
            <span className={styles.label}>Color</span>
            <ColorPicker palette="standard" value={color} onChange={setColor} />
          </div>

          {/* Purposes */}
          {purposeList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>Purposes</span>
              <div className={styles.chips}>
                {purposeList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.chip} ${purposeIds.includes(p.id as PurposeId) ? styles.chipActive : ''}`}
                    onClick={() => setPurposeIds((prev) =>
                      prev.includes(p.id as PurposeId)
                        ? prev.filter((x) => x !== p.id)
                        : [...prev, p.id as PurposeId]
                    )}
                    style={p.color ? { '--chip-color': p.color } as React.CSSProperties : undefined}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {tagList.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>Tags</span>
              <div className={styles.chips}>
                {tagList.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.chip} ${tagIds.includes(t.id as TagId) ? styles.chipActive : ''}`}
                    onClick={() => setTagIds((prev) =>
                      prev.includes(t.id as TagId)
                        ? prev.filter((x) => x !== t.id)
                        : [...prev, t.id as TagId]
                    )}
                    style={t.color ? { '--chip-color': t.color } as React.CSSProperties : undefined}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          <div className={styles.schemaSection}>
            <div className={styles.schemaHeader}>
              <span className={styles.label}>Steps</span>
              <span className={styles.schemaMeta}>{tasks.length} step{tasks.length !== 1 ? 's' : ''}</span>
            </div>

            {tasks.length === 0 && (
              <p className={styles.noFields}>No steps yet. Add one below.</p>
            )}

            {tasks.map((task, idx) => (
              <div key={task.id} className={styles.fieldRow}>
                <div className={styles.fieldRowTop}>
                  <input
                    className={styles.stepInput}
                    value={task.title}
                    onChange={(e) => updateStepTitle(task.id, e.target.value)}
                  />
                  <div className={styles.fieldRowActions}>
                    <button className={styles.fieldActionBtn} onClick={() => moveStep(idx, -1)} disabled={idx === 0} title="Move up">↑</button>
                    <button className={styles.fieldActionBtn} onClick={() => moveStep(idx, 1)} disabled={idx === tasks.length - 1} title="Move down">↓</button>
                    <button className={`${styles.fieldActionBtn} ${styles.fieldActionBtnDelete}`} onClick={() => removeStep(task.id)} title="Remove">✕</button>
                  </div>
                </div>
              </div>
            ))}

            <div className={styles.addStepRow}>
              <input
                className={styles.miniInput}
                placeholder="Add a step…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }}
              />
              <button
                className={styles.addFieldConfirmBtn}
                type="button"
                onClick={addStep}
                disabled={!newTitle.trim()}
              >Add</button>
            </div>
          </div>

          {/* Repeat schedule */}
          <div className={styles.schemaSection}>
            <span className={styles.label}>Repeat</span>
            <div className={styles.repeatPresets}>
              <button
                type="button"
                className={`${styles.presetBtn} ${everyDay ? styles.presetBtnActive : ''}`}
                onClick={() => setDaysOfWeek([])}
              >Every day</button>
              <button
                type="button"
                className={`${styles.presetBtn} ${isWeekdays && !everyDay ? styles.presetBtnActive : ''}`}
                onClick={() => setDaysOfWeek(WEEKDAYS)}
              >Weekdays</button>
            </div>
            <div className={styles.dayPicker}>
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.dayBtn} ${daysOfWeek.includes(i) ? styles.dayBtnActive : ''}`}
                  onClick={() => toggleDay(i)}
                >
                  {label}
                </button>
              ))}
            </div>
            {everyDay && <p className={styles.repeatHint}>Will appear every day.</p>}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.deleteBtn} onClick={handleDelete}>Delete routine</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!name.trim()}>Save changes</button>
        </div>
      </aside>
    </>
  );
}
