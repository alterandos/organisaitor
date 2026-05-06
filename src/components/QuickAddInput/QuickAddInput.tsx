import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import styles from './QuickAddInput.module.css';

export function QuickAddInput() {
  const [value, setValue] = useState('');
  const addTask            = useTaskStore((s) => s.addTask);
  const showAddTask        = useUIStore((s) => s.showAddTask);
  const activeCollectionId = useUIStore((s) => s.activeCollectionId);

  const submit = () => {
    if (!value.trim()) return;
    addTask({ title: value, collectionId: activeCollectionId as never ?? null });
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  // Clicking the wrapper (or empty input) opens the full task modal
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    // Only intercept clicks on the wrapper/icon, not when the user has already started typing
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT';
    if (isInput && value.trim()) return; // let them keep typing
    if (isInput && !value.trim()) {
      showAddTask();
    }
  };

  return (
    <div className={styles.wrapper} onClick={handleClick}>
      <span className={styles.icon} aria-hidden="true">+</span>
      <input
        className={styles.input}
        placeholder="Add a task..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={false}
      />
    </div>
  );
}
