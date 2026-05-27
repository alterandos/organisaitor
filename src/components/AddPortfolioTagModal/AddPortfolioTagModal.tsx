import { useState, useEffect } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import styles from './AddPortfolioTagModal.module.css';

export function AddPortfolioTagModal() {
  const [name,  setName]  = useState('');
  const [color, setColor] = useState<string | null>(null);

  const addPortfolioTag = usePortfolioStore((s) => s.addPortfolioTag);
  const closeModal      = useUIStore((s) => s.closeModal);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addPortfolioTag({ name: name.trim(), color });
    closeModal();
  };

  const handleOverlay = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  return (
    <div className={styles.overlay} onClick={handleOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>New Tag</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <input
              className={styles.input}
              placeholder="Tag name (e.g. UK Equities, Watchlist A)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Colour</label>
            <ColorPicker value={color} onChange={setColor} palette="light" />
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!name.trim()}
              style={color ? { background: color } : undefined}
            >
              Create Tag
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
