import { useEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { getOrderedEndeavours } from '@/utils/collections';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import styles from './CollectionFilterPicker.module.css';

interface Props {
  // 'dropdown' (default) is desktop's positioned-dropdown chrome, unchanged. 'sheet' renders
  // the exact same option list and selection wiring inside a bottom-sheet instead — see
  // docs/android/01-tasks-app.md §5: there's no separable logic layer here to extract, so
  // this is "same component, new chrome", not a refactor into a shared hook.
  variant?: 'dropdown' | 'sheet';
}

export function CollectionFilterPicker({ variant = 'dropdown' }: Props) {
  const collectionsRecord   = useTaskStore((s) => s.collections);
  const activeCollectionId  = useUIStore(selectActiveCollectionId);
  const setActiveCollection = useUIStore((s) => s.setActiveCollection);
  const open                = useUIStore((s) => s.endeavourPickerOpen);
  const toggleEndeavourPicker = useUIStore((s) => s.toggleEndeavourPicker);
  const closeEndeavourPicker  = useUIStore((s) => s.closeEndeavourPicker);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeEndeavourPicker();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEndeavourPicker();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, closeEndeavourPicker]);

  const ordered = getOrderedEndeavours(collectionsRecord);
  if (ordered.length === 0) return null;

  const projects = ordered.filter((c) => c.kind === 'project');
  const lists    = ordered.filter((c) => c.kind === 'list');
  const indexOf  = (id: string) => ordered.findIndex((c) => c.id === id) + 1;

  const active = activeCollectionId
    ? collectionsRecord[activeCollectionId as CollectionId]
    : null;

  const select = (id: CollectionId | null) => { setActiveCollection(id); closeEndeavourPicker(); };

  const listContent = (
    <>
      <button
        className={`${styles.item} ${!activeCollectionId ? styles.itemActive : ''}`}
        onClick={() => select(null)}
      >
        <span className={styles.indexBadge}>0</span>
        All {LABELS.collectionPlural}
      </button>

      {projects.length > 0 && (
        <>
          <div className={styles.divider} />
          <div className={styles.groupHeader}>{LABELS.collectionKind.project}s</div>
          {projects.map((c) => (
            <button
              key={c.id}
              className={`${styles.item} ${activeCollectionId === c.id ? styles.itemActive : ''}`}
              onClick={() => select(c.id as CollectionId)}
            >
              {indexOf(c.id) <= 9 && <span className={styles.indexBadge}>{indexOf(c.id)}</span>}
              {c.color && <span className={styles.dot} style={{ background: c.color }} />}
              {c.name}
            </button>
          ))}
        </>
      )}

      {lists.length > 0 && (
        <>
          <div className={styles.divider} />
          <div className={styles.groupHeader}>{LABELS.collectionKind.list}s</div>
          {lists.map((c) => (
            <button
              key={c.id}
              className={`${styles.item} ${activeCollectionId === c.id ? styles.itemActive : ''}`}
              onClick={() => select(c.id as CollectionId)}
            >
              {indexOf(c.id) <= 9 && <span className={styles.indexBadge}>{indexOf(c.id)}</span>}
              {c.color && <span className={styles.dot} style={{ background: c.color }} />}
              {c.name}
            </button>
          ))}
        </>
      )}
    </>
  );

  if (variant === 'sheet') {
    return (
      <>
        <button
          type="button"
          className={`${styles.sheetTrigger} ${active ? styles.sheetTriggerActive : ''}`}
          onClick={toggleEndeavourPicker}
          aria-expanded={open}
          aria-label={`${LABELS.collection} filter`}
        >
          ▽
        </button>
        {open && (
          <div className={styles.sheetOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeEndeavourPicker(); }}>
            <div className={styles.sheetPanel} ref={ref}>
              <div className={styles.sheetHeader}>{LABELS.collectionPlural}</div>
              <div className={styles.sheetList} role="listbox">{listContent}</div>
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
        onClick={toggleEndeavourPicker}
        aria-expanded={open}
        aria-label={`${LABELS.collection} filter — Ctrl+E`}
      >
        {active?.color && (
          <span className={styles.dot} style={{ background: active.color }} />
        )}
        <span className={active ? styles.name : styles.all}>
          {active ? active.name : `All ${LABELS.collectionPlural}`}
        </span>
        <span className={styles.chevron}>▾</span>
      </button>

      <div className={styles.dropdown} role="listbox">{listContent}</div>
    </div>
  );
}
