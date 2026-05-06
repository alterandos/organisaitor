import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import type { CollectionId } from '@/types';
import styles from './CollectionFilterPicker.module.css';

export function CollectionFilterPicker() {
  const collectionsRecord  = useTaskStore((s) => s.collections);
  const activeCollectionId = useUIStore((s) => s.activeCollectionId);
  const setActiveCollection = useUIStore((s) => s.setActiveCollection);

  const allCollections = Object.values(collectionsRecord);
  if (allCollections.length === 0) return null;

  const projects = allCollections.filter((c) => c.kind === 'project');
  const lists    = allCollections.filter((c) => c.kind === 'list');

  const active = activeCollectionId
    ? collectionsRecord[activeCollectionId as CollectionId]
    : null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.trigger}>
        {active?.color && (
          <span className={styles.dot} style={{ background: active.color }} />
        )}
        <span className={active ? styles.name : styles.all}>
          {active ? active.name : `All ${LABELS.collectionPlural}`}
        </span>
        <span className={styles.chevron}>▾</span>
      </div>

      <div className={styles.dropdown} role="listbox">
        <button
          className={`${styles.item} ${!activeCollectionId ? styles.itemActive : ''}`}
          onClick={() => setActiveCollection(null)}
        >
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
                onClick={() => setActiveCollection(c.id)}
              >
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
                onClick={() => setActiveCollection(c.id)}
              >
                {c.color && <span className={styles.dot} style={{ background: c.color }} />}
                {c.name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
