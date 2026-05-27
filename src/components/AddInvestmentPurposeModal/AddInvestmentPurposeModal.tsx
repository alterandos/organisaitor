import { useState, useEffect } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useUIStore } from '@/store/uiStore';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import styles from './AddInvestmentPurposeModal.module.css';

export function AddInvestmentPurposeModal() {
  const [name,  setName]  = useState('');
  const [color, setColor] = useState<string | null>(null);

  const addInvestmentPurpose = usePortfolioStore((s) => s.addInvestmentPurpose);
  const closeModal           = useUIStore((s) => s.closeModal);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addInvestmentPurpose({ name: name.trim(), color });
    closeModal();
  };

  const handleOverlay = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  return (
    <div className={styles.overlay} onClick={handleOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>New Investment Purpose</span>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <input
              className={styles.input}
              placeholder="e.g. Dividend, Growth, Speculative…"
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
              Create Purpose
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
