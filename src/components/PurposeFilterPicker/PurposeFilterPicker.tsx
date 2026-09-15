import { useEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import styles from './PurposeFilterPicker.module.css';

interface Props {
  // See CollectionFilterPicker's identical prop for the rationale — same treatment applied
  // here (docs/android/01-tasks-app.md §5).
  variant?: 'dropdown' | 'sheet';
}

export function PurposeFilterPicker({ variant = 'dropdown' }: Props) {
  const purposesRecord      = useTaskStore((s) => s.purposes);
  const activePurposeIds    = useUIStore((s) => s.activePurposeIds);
  const togglePurposeFilter = useUIStore((s) => s.togglePurposeFilter);
  const open                = useUIStore((s) => s.purposePickerOpen);
  const togglePurposePicker = useUIStore((s) => s.togglePurposePicker);
  const closePurposePicker  = useUIStore((s) => s.closePurposePicker);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closePurposePicker();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePurposePicker();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, closePurposePicker]);

  const purposes = Object.values(purposesRecord).filter((p) => !p.archivedAt);
  if (purposes.length === 0) return null;

  const activeCount = activePurposeIds.length;
  const label = activeCount === 0
    ? 'All Purposes'
    : activeCount === 1
    ? purposes.find((p) => p.id === activePurposeIds[0])?.name ?? '1 Purpose'
    : `${activeCount} Purposes`;

  const listContent = purposes.map((p) => {
    const active = activePurposeIds.includes(p.id);
    return (
      <button
        key={p.id}
        className={`${styles.item} ${active ? styles.itemActive : ''}`}
        onClick={() => togglePurposeFilter(p.id)}
        role="option"
        aria-selected={active}
      >
        <span className={`${styles.checkbox} ${active ? styles.checkboxChecked : ''}`}>
          {active && '✓'}
        </span>
        {p.color && <span className={styles.dot} style={{ background: p.color }} />}
        {p.name}
      </button>
    );
  });

  if (variant === 'sheet') {
    return (
      <>
        <button
          type="button"
          className={`${styles.sheetTrigger} ${activeCount > 0 ? styles.sheetTriggerActive : ''}`}
          onClick={togglePurposePicker}
          aria-expanded={open}
          aria-label="Purpose filter"
        >
          ◎
        </button>
        {open && (
          <div className={styles.sheetOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closePurposePicker(); }}>
            <div className={styles.sheetPanel} ref={ref}>
              <div className={styles.sheetHeader}>Purposes</div>
              <div className={styles.sheetList} role="listbox" aria-multiselectable="true">{listContent}</div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`${styles.wrapper} ${open ? styles.open : ''}`} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        onClick={togglePurposePicker}
        aria-expanded={open}
        aria-label="Purpose filter — P"
      >
        <span className={activeCount > 0 ? styles.name : styles.all}>{label}</span>
        <span className={styles.chevron}>▾</span>
      </button>

      <div className={styles.dropdown} role="listbox" aria-multiselectable="true">{listContent}</div>
    </div>
  );
}
