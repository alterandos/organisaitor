import { useState, useRef } from 'react';
import { nanoid } from 'nanoid';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import type { RoutineTask, RepeatConfig, PurposeId, TagId } from '@/types';
import styles from './AddRoutineModal.module.css';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS   = [1, 2, 3, 4, 5];

function buildRepeatConfig(daysOfWeek: number[]): RepeatConfig | null {
  if (daysOfWeek.length === 0) return null; // every day = no constraint
  return { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek };
}

export function AddRoutineModal() {
  const addCollection  = useTaskStore((s) => s.addCollection);
  const purposes       = useTaskStore((s) => s.purposes);
  const tags           = useTaskStore((s) => s.tags);
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal  = useUIStore((s) => s.openModal);

  const [name,        setName]        = useState('');
  const [tasks,       setTasks]       = useState<RoutineTask[]>([]);
  const [daysOfWeek,  setDaysOfWeek]  = useState<number[]>([]); // empty = every day
  const [advanced,    setAdvanced]    = useState(false);
  const [color,       setColor]       = useState<string | null>(null);
  const [purposeIds,  setPurposeIds]  = useState<PurposeId[]>([]);
  const [tagIds,      setTagIds]      = useState<TagId[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const newTaskRef = useRef<HTMLInputElement>(null);

  const isVisible = openModal === 'add-routine';
  if (!isVisible) return null;

  function addTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    setTasks((prev) => [...prev, { id: nanoid(8), title, order: prev.length }]);
    setNewTaskTitle('');
    newTaskRef.current?.focus();
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i })));
  }

  function updateTaskTitle(id: string, title: string) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, title } : t));
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function setWeekdays() {
    setDaysOfWeek(WEEKDAYS);
  }

  function setEveryDay() {
    setDaysOfWeek([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addCollection({
      kind:         'routine',
      name:         name.trim(),
      color,
      purposeIds,
      tagIds,
      routineTasks: tasks,
      repeatConfig: buildRepeatConfig(daysOfWeek),
    });
    closeModal();
  }

  const purposeList = Object.values(purposes);
  const tagList     = Object.values(tags);

  const everyDay = daysOfWeek.length === 0;
  const isWeekdays = daysOfWeek.length === 5 && WEEKDAYS.every((d) => daysOfWeek.includes(d));

  return (
    <div className={styles.overlay} onMouseDown={closeModal}>
      <div
        className={styles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New routine"
      >
        <div className={styles.header}>
          <span className={styles.title}>New routine</span>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="ar-name">
              Name <span className={styles.required}>*</span>
            </label>
            <input
              id="ar-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning exercises"
              autoFocus
              required
            />
          </div>

          {/* Sub-tasks */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Steps</span>
            {tasks.length > 0 && (
              <ul className={styles.taskList}>
                {tasks.map((t) => (
                  <li key={t.id} className={styles.taskRow}>
                    <span className={styles.taskDrag}>⠿</span>
                    <input
                      className={styles.taskInput}
                      value={t.title}
                      onChange={(e) => updateTaskTitle(t.id, e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.taskRemoveBtn}
                      onClick={() => removeTask(t.id)}
                      aria-label="Remove step"
                    >✕</button>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.addTaskRow}>
              <input
                ref={newTaskRef}
                className={styles.input}
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add a step…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }}
              />
              <button
                type="button"
                className={styles.addStepBtn}
                onClick={addTask}
                disabled={!newTaskTitle.trim()}
              >Add</button>
            </div>
          </div>

          {/* Repeat schedule */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Repeat</span>
            <div className={styles.repeatPresets}>
              <button
                type="button"
                className={`${styles.presetBtn} ${everyDay ? styles.presetBtnActive : ''}`}
                onClick={setEveryDay}
              >Every day</button>
              <button
                type="button"
                className={`${styles.presetBtn} ${isWeekdays && !everyDay ? styles.presetBtnActive : ''}`}
                onClick={setWeekdays}
              >Weekdays</button>
            </div>
            <div className={styles.dayPicker}>
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.dayBtn} ${daysOfWeek.includes(i) ? styles.dayBtnActive : ''}`}
                  onClick={() => { toggleDay(i); }}
                >
                  {label}
                </button>
              ))}
            </div>
            {everyDay && <p className={styles.repeatHint}>Will appear every day.</p>}
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setAdvanced((v) => !v)}
          >
            <span className={`${styles.chevron} ${advanced ? styles.chevronOpen : ''}`}>▸</span>
            Advanced options
          </button>

          {advanced && (
            <div className={styles.advancedSection}>
              {/* Color */}
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Color</span>
                <ColorPicker palette="standard" value={color} onChange={setColor} />
              </div>

              {/* Purposes */}
              {purposeList.length > 0 && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Purposes</span>
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
                  <span className={styles.fieldLabel}>Tags</span>
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
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim()}>Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}
