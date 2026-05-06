import { useState, useRef, useEffect } from 'react';
import type { Collection, CollectionId } from '@/types';
import styles from './CollectionPicker.module.css';

interface Props {
  collections: Collection[];
  value:       string | null;
  onChange:    (id: CollectionId | null) => void;
  noneLabel?:  string;
}

export function CollectionPicker({ collections, value, onChange, noneLabel = 'None' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = value ? collections.find((c) => c.id === value) ?? null : null;

  const projects = collections.filter((c) => c.kind === 'project');
  const lists    = collections.filter((c) => c.kind === 'list');

  const select = (id: CollectionId | null) => { onChange(id); setOpen(false); };

  return (
    <div className={styles.root} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={styles.swatch}
          style={{ background: selected?.color ?? 'var(--color-border)' }}
        />
        <span className={styles.triggerLabel}>
          {selected ? selected.name : noneLabel}
        </span>
        <span className={styles.triggerChevron}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <button className={styles.option} onClick={() => select(null)}>
            <span className={`${styles.swatch} ${styles.swatchNone}`} />
            <span>{noneLabel}</span>
          </button>

          {projects.length > 0 && (
            <div className={styles.group}>
              <span className={styles.groupLabel}>Projects</span>
              {projects.map((c) => (
                <button
                  key={c.id}
                  className={`${styles.option} ${value === c.id ? styles.optionActive : ''}`}
                  onClick={() => select(c.id as CollectionId)}
                >
                  <span className={styles.swatch} style={{ background: c.color ?? 'var(--color-border)' }} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}

          {lists.length > 0 && (
            <div className={styles.group}>
              <span className={styles.groupLabel}>Lists</span>
              {lists.map((c) => (
                <button
                  key={c.id}
                  className={`${styles.option} ${value === c.id ? styles.optionActive : ''}`}
                  onClick={() => select(c.id as CollectionId)}
                >
                  <span className={styles.swatch} style={{ background: c.color ?? 'var(--color-border)' }} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
