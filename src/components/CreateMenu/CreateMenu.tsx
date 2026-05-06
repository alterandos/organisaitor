import type { MouseEvent } from 'react';
import { useUIStore } from '@/store/uiStore';
import styles from './CreateMenu.module.css';

const OPTIONS = [
  {
    type: 'task' as const,
    label: 'Task',
    description: 'A single to-do item',
    icon: '✓',
    accent: '#5b6ee1',
  },
  {
    type: 'project' as const,
    label: 'Project',
    description: 'A focused collection of tasks',
    icon: '▤',
    accent: '#10b981',
  },
  {
    type: 'purpose' as const,
    label: 'Purpose / Area',
    description: 'A broader life area, like Career or Health',
    icon: '◎',
    accent: '#f97316',
  },
];

export function CreateMenu() {
  const { showAddTask, showAddCollection, showAddPurpose, closeModal } = useUIStore();

  const handleSelect = (type: 'task' | 'project' | 'purpose') => {
    if (type === 'task') showAddTask();
    else if (type === 'project') showAddCollection();
    else showAddPurpose();
  };

  const handleOverlay = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  return (
    <div className={styles.overlay} onClick={handleOverlay}>
      <div className={styles.menu}>
        <p className={styles.heading}>What would you like to create?</p>
        {OPTIONS.map((opt) => (
          <button
            key={opt.type}
            className={styles.option}
            onClick={() => handleSelect(opt.type)}
          >
            <span className={styles.icon} style={{ background: opt.accent }}>
              {opt.icon}
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{opt.label}</span>
              <span className={styles.desc}>{opt.description}</span>
            </span>
            <span className={styles.arrow}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
