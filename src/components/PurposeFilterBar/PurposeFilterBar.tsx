import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import styles from './PurposeFilterBar.module.css';

export function PurposeFilterBar() {
  const purposesRecord     = useTaskStore((s) => s.purposes);
  const activePurposeIds   = useUIStore((s) => s.activePurposeIds);
  const togglePurposeFilter = useUIStore((s) => s.togglePurposeFilter);

  const purposes = Object.values(purposesRecord);
  if (purposes.length === 0) return null;

  return (
    <div className={styles.bar}>
      {purposes.map((p) => {
        const active = activePurposeIds.includes(p.id);
        return (
          <button
            key={p.id}
            className={`${styles.pill} ${active ? styles.pillActive : ''}`}
            style={active && p.color
              ? { background: p.color, borderColor: p.color, color: '#fff' }
              : p.color
              ? { borderColor: p.color, color: p.color }
              : undefined}
            onClick={() => togglePurposeFilter(p.id)}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
