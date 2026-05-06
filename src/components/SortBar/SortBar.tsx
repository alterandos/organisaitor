import { useUIStore } from '@/store/uiStore';
import type { SortField, SortDir } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import styles from './SortBar.module.css';

const OPTIONS: { value: SortField; label: string }[] = [
  { value: 'createdAt',  label: 'Created'        },
  { value: 'deadline',   label: 'Due date'        },
  { value: 'collection', label: LABELS.collection },
  { value: 'priority',   label: 'Priority'        },
];

export function SortBar() {
  const sortField    = useUIStore((s) => s.sortField);
  const sortDir      = useUIStore((s) => s.sortDir);
  const setSortField = useUIStore((s) => s.setSortField);
  const setSortDir   = useUIStore((s) => s.setSortDir);

  const handleDirClick = (field: SortField, dir: SortDir, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sortField === field) setSortDir(dir);
    else setSortField(field, dir);
  };

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Sort:</span>
      {OPTIONS.map((opt) => {
        const active = sortField === opt.value;
        return (
          <div key={opt.value} className={`${styles.option} ${active ? styles.optionActive : ''}`}>
            <button
              className={styles.optionLabel}
              onClick={() => setSortField(opt.value)}
              title={`Sort by ${opt.label}`}
            >
              {opt.label}
            </button>
            <div className={styles.arrows}>
              <button
                className={`${styles.arrow} ${active && sortDir === 'asc' ? styles.arrowActive : ''}`}
                onClick={(e) => handleDirClick(opt.value, 'asc', e)}
                title="Ascending"
              >↑</button>
              <button
                className={`${styles.arrow} ${active && sortDir === 'desc' ? styles.arrowActive : ''}`}
                onClick={(e) => handleDirClick(opt.value, 'desc', e)}
                title="Descending"
              >↓</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
