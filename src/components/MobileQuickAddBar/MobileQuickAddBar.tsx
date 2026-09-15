import { useRef, useState } from 'react';
import type { Priority, CollectionId, CalendarReminderId } from '@/types';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { CollectionPicker } from '@/components/CollectionPicker/CollectionPicker';
import styles from './MobileQuickAddBar.module.css';

const PRIORITY_CYCLE: Priority[] = ['none', 'low', 'medium', 'high'];
const PRIORITY_LABEL: Record<Priority, string> = { none: 'Priority', low: 'Low', medium: 'Med', high: 'High' };

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextWeekendIso(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const daysUntilSat = (6 - day + 7) % 7 || 7;
  return todayPlus(daysUntilSat);
}

// Android-only bottom-anchored quick-add bar (docs/android/01-tasks-app.md §3). Deliberately
// NOT a reuse of desktop's QuickAddInput — that component always redirects to the full
// AddTaskModal on the first (necessarily empty) click, which is a touch-unreachable path;
// see the doc's §3.1 for the full reasoning. This is a clean, independent implementation of
// the same end behaviour (title-only → taskStore.addTask(), no modal).
export function MobileQuickAddBar() {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>('none');
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [dueMenuOpen, setDueMenuOpen] = useState(false);
  const [endeavourMenuOpen, setEndeavourMenuOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const addTask = useTaskStore((s) => s.addTask);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const activeCollectionId = useUIStore(selectActiveCollectionId);
  const showAddTaskWithPrefill = useUIStore((s) => s.showAddTaskWithPrefill);
  const addReminder = useCalendarStore((s) => s.addReminder);

  const reset = () => {
    setTitle('');
    setDueDate(null);
    setPriority('none');
    setCollectionId(null);
    setDueMenuOpen(false);
    setEndeavourMenuOpen(false);
  };

  const submit = () => {
    if (!title.trim()) return;
    let calendarReminderId: CalendarReminderId | null = null;
    if (dueDate) {
      calendarReminderId = addReminder({
        title: title.trim(),
        date: dueDate,
        reminderType: 'task',
      });
    }
    addTask({
      title: title.trim(),
      collectionId: (collectionId ?? activeCollectionId) as never ?? null,
      deadline: dueDate,
      calendarReminderId,
      priority,
    });
    reset();
    inputRef.current?.focus();
  };

  const handleMoreOptions = () => {
    showAddTaskWithPrefill({ title, priority, collectionId: collectionId ?? activeCollectionId, deadline: dueDate });
    reset();
  };

  return (
    <div className={styles.bar}>
      <div className={styles.inputRow}>
        <span className={styles.icon} aria-hidden="true">+</span>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
      </div>

      {title.trim().length > 0 && (
        <div className={styles.chipRow}>
          <div className={styles.chipWrap}>
            <button
              type="button"
              className={`${styles.chip} ${dueDate ? styles.chipActive : ''}`}
              onClick={() => setDueMenuOpen((o) => !o)}
            >
              {dueDate ? new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Due'}
            </button>
            {dueMenuOpen && (
              <div className={styles.popover}>
                <button type="button" onClick={() => { setDueDate(todayPlus(0)); setDueMenuOpen(false); }}>Today</button>
                <button type="button" onClick={() => { setDueDate(todayPlus(1)); setDueMenuOpen(false); }}>Tomorrow</button>
                <button type="button" onClick={() => { setDueDate(nextWeekendIso()); setDueMenuOpen(false); }}>This weekend</button>
                <button
                  type="button"
                  onClick={() => { setDueMenuOpen(false); dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click(); }}
                >Pick a date…</button>
                <input
                  ref={dateInputRef}
                  type="date"
                  className={styles.hiddenDateInput}
                  onChange={(e) => { if (e.target.value) setDueDate(e.target.value); }}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            className={`${styles.chip} ${priority !== 'none' ? styles.chipActive : ''}`}
            onClick={() => {
              const idx = PRIORITY_CYCLE.indexOf(priority);
              setPriority(PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]);
            }}
          >
            {PRIORITY_LABEL[priority]}
          </button>

          <div className={styles.chipWrap}>
            <button
              type="button"
              className={`${styles.chip} ${collectionId ? styles.chipActive : ''}`}
              onClick={() => setEndeavourMenuOpen((o) => !o)}
            >
              {collectionId ? collectionsRecord[collectionId as CollectionId]?.name ?? 'Endeavour' : 'Endeavour'}
            </button>
            {endeavourMenuOpen && (
              <div className={styles.popover}>
                <CollectionPicker
                  collections={Object.values(collectionsRecord)}
                  value={collectionId}
                  onChange={(id) => { setCollectionId(id); setEndeavourMenuOpen(false); }}
                />
              </div>
            )}
          </div>

          <button type="button" className={styles.moreBtn} onClick={handleMoreOptions}>More options…</button>
        </div>
      )}
    </div>
  );
}
