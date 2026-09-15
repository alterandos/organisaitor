import { useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore, type CalendarLayerKey } from '@/store/settingsStore';
import styles from './CalendarLayersPicker.module.css';

// Which calendar item categories render, filtered via CalendarEvent.eventType /
// CalendarReminder.reminderType. Location/style deliberately kept simple and swappable —
// see settingsStore.calendarLayerVisibility for the actual filter state this reads/writes;
// this component is just today's presentation of it (a header dropdown), not the only one
// it could ever be.
const LAYERS: { key: CalendarLayerKey; label: string }[] = [
  { key: 'events',        label: 'Events'         },
  { key: 'reminders',     label: 'Reminders'      },
  { key: 'taskScheduled', label: 'Task scheduled' },
  { key: 'taskDeadlines', label: 'Task deadlines' },
];

interface Props {
  // See CollectionFilterPicker/PurposeFilterPicker's identical prop for the rationale — same
  // treatment applied here (docs/android/06-web-session-catchup.md, Task 3).
  variant?: 'dropdown' | 'sheet';
}

export function CalendarLayersPicker({ variant = 'dropdown' }: Props) {
  const open   = useUIStore((s) => s.calendarLayersOpen);
  const toggle = useUIStore((s) => s.toggleCalendarLayers);
  const close  = useUIStore((s) => s.closeCalendarLayers);
  const visibility = useSettingsStore((s) => s.calendarLayerVisibility);
  const toggleLayer = useSettingsStore((s) => s.toggleCalendarLayer);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, close]);

  const hiddenCount = LAYERS.filter((l) => !visibility[l.key]).length;

  const listContent = LAYERS.map(({ key, label }) => {
    const active = visibility[key];
    return (
      <button
        key={key}
        type="button"
        className={`${styles.item} ${active ? styles.itemActive : ''}`}
        onClick={() => toggleLayer(key)}
        role="option"
        aria-selected={active}
      >
        <span className={`${styles.checkbox} ${active ? styles.checkboxChecked : ''}`}>
          {active && '✓'}
        </span>
        {label}
      </button>
    );
  });

  if (variant === 'sheet') {
    return (
      <>
        <button
          type="button"
          className={`${styles.sheetTrigger} ${hiddenCount > 0 ? styles.sheetTriggerActive : ''}`}
          onClick={toggle}
          aria-expanded={open}
          aria-label="Calendar layers"
        >
          👁
        </button>
        {open && (
          <div className={styles.sheetOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div className={styles.sheetPanel} ref={ref}>
              <div className={styles.sheetHeader}>Calendar layers</div>
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
        onClick={toggle}
        aria-expanded={open}
        aria-label="Calendar layers"
        title="Choose which item types show on the calendar"
      >
        👁 Layers{hiddenCount > 0 ? ` (${LAYERS.length - hiddenCount}/${LAYERS.length})` : ''}
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox" aria-multiselectable="true">{listContent}</div>
      )}
    </div>
  );
}
