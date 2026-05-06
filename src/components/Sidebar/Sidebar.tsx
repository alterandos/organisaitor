import { useState } from 'react';
import type { TagId, PurposeId, CollectionId } from '@/types';
import { LABELS } from '@/config/labels';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import styles from './Sidebar.module.css';

interface Props {
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}

export function Sidebar({ onHoverEnter, onHoverLeave }: Props) {
  const [tagsOpen,       setTagsOpen]       = useState(true);
  const [purposesOpen,   setPurposesOpen]   = useState(true);
  const [projectsOpen,   setProjectsOpen]   = useState(true);
  const [listsOpen,      setListsOpen]      = useState(true);

  const sidebarOpen         = useUIStore((s) => s.sidebarOpen);
  const activeTagIds        = useUIStore((s) => s.activeTagIds);
  const toggleTagFilter     = useUIStore((s) => s.toggleTagFilter);
  const openEditTag         = useUIStore((s) => s.openEditTag);
  const openEditPurpose     = useUIStore((s) => s.openEditPurpose);
  const openEditCollection  = useUIStore((s) => s.openEditCollection);

  const tagsRecord        = useTaskStore((s) => s.tags);
  const purposesRecord    = useTaskStore((s) => s.purposes);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const deleteTag         = useTaskStore((s) => s.deleteTag);
  const deletePurpose     = useTaskStore((s) => s.deletePurpose);
  const deleteCollection  = useTaskStore((s) => s.deleteCollection);

  const tags     = Object.values(tagsRecord);
  const purposes = Object.values(purposesRecord);
  const allCollections = Object.values(collectionsRecord);
  const projects = allCollections.filter((c) => c.kind === 'project');
  const lists    = allCollections.filter((c) => c.kind === 'list');

  const handleDeleteTag = (id: TagId, name: string) => {
    if (window.confirm(`Delete tag "${name}"? It will be removed from all tasks.`)) {
      deleteTag(id);
    }
  };

  const handleDeletePurpose = (id: PurposeId, name: string) => {
    if (window.confirm(`Delete purpose "${name}"? It will be removed from all tasks.`)) {
      deletePurpose(id);
    }
  };

  const handleDeleteCollection = (id: CollectionId, name: string) => {
    if (window.confirm(`Delete "${name}"? Tasks will be detached but not deleted.`)) {
      deleteCollection(id);
    }
  };

  function renderCollectionSection(
    items: typeof allCollections,
    label: string,
    open: boolean,
    setOpen: (v: boolean) => void,
  ) {
    if (items.length === 0) return null;
    return (
      <div className={styles.section}>
        <button className={styles.sectionToggle} onClick={() => setOpen(!open)}>
          <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}>▸</span>
          <span>{label}s</span>
          <span className={styles.count}>{items.length}</span>
        </button>
        {open && (
          <div className={styles.sectionBody}>
            {items.map((col) => (
              <div key={col.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span
                    className={styles.dot}
                    style={{ background: col.color ?? 'var(--color-border)' }}
                  />
                  <span className={styles.name}>{col.name}</span>
                </div>
                <button
                  className={styles.iconBtn}
                  onClick={() => openEditCollection(col)}
                  aria-label={`Edit ${col.name}`}
                  title="Edit"
                >✎</button>
                <button
                  className={`${styles.iconBtn} ${styles.deleteIconBtn}`}
                  onClick={() => handleDeleteCollection(col.id as CollectionId, col.name)}
                  aria-label={`Delete ${col.name}`}
                  title="Delete"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      className={`${styles.pane} ${sidebarOpen ? styles.open : ''}`}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <div className={styles.body}>

        {/* ── Tags ── */}
        <div className={styles.section}>
          <button className={styles.sectionToggle} onClick={() => setTagsOpen((o) => !o)}>
            <span className={`${styles.chevron} ${tagsOpen ? styles.chevronOpen : ''}`}>▸</span>
            <span>Tags</span>
            {tags.length > 0 && <span className={styles.count}>{tags.length}</span>}
          </button>
          {tagsOpen && (
            <div className={styles.sectionBody}>
              {tags.length === 0
                ? <p className={styles.empty}>No tags yet</p>
                : tags.map((tag) => {
                    const isActive = activeTagIds.includes(tag.id);
                    return (
                      <div
                        key={tag.id}
                        className={`${styles.row} ${isActive ? styles.rowActive : ''}`}
                        style={isActive && tag.color ? { background: tag.color + '18' } : undefined}
                      >
                        <button className={styles.rowMain} onClick={() => toggleTagFilter(tag.id)}>
                          <span
                            className={styles.dot}
                            style={{ background: tag.color ?? 'var(--color-border)' }}
                          />
                          <span className={styles.name}>{tag.name}</span>
                        </button>
                        <button
                          className={styles.iconBtn}
                          onClick={() => openEditTag(tag)}
                          aria-label={`Edit ${tag.name}`}
                          title="Edit"
                        >✎</button>
                        <button
                          className={`${styles.iconBtn} ${styles.deleteIconBtn}`}
                          onClick={() => handleDeleteTag(tag.id as TagId, tag.name)}
                          aria-label={`Delete ${tag.name}`}
                          title="Delete"
                        >×</button>
                      </div>
                    );
                  })
              }
            </div>
          )}
        </div>

        {/* ── Purposes ── */}
        <div className={styles.section}>
          <button className={styles.sectionToggle} onClick={() => setPurposesOpen((o) => !o)}>
            <span className={`${styles.chevron} ${purposesOpen ? styles.chevronOpen : ''}`}>▸</span>
            <span>Purposes</span>
            {purposes.length > 0 && <span className={styles.count}>{purposes.length}</span>}
          </button>
          {purposesOpen && (
            <div className={styles.sectionBody}>
              {purposes.length === 0
                ? <p className={styles.empty}>No purposes yet</p>
                : purposes.map((purpose) => (
                    <div key={purpose.id} className={styles.row}>
                      <div className={styles.rowMain}>
                        <span
                          className={styles.dot}
                          style={{ background: purpose.color ?? 'var(--color-border)' }}
                        />
                        <span className={styles.name}>{purpose.name}</span>
                      </div>
                      <button
                        className={styles.iconBtn}
                        onClick={() => openEditPurpose(purpose)}
                        aria-label={`Edit ${purpose.name}`}
                        title="Edit"
                      >✎</button>
                      <button
                        className={`${styles.iconBtn} ${styles.deleteIconBtn}`}
                        onClick={() => handleDeletePurpose(purpose.id as PurposeId, purpose.name)}
                        aria-label={`Delete ${purpose.name}`}
                        title="Delete"
                      >×</button>
                    </div>
                  ))
              }
            </div>
          )}
        </div>

        {/* ── Projects ── */}
        {renderCollectionSection(
          projects,
          LABELS.collectionKind.project,
          projectsOpen,
          setProjectsOpen,
        )}

        {/* ── Lists ── */}
        {renderCollectionSection(
          lists,
          LABELS.collectionKind.list,
          listsOpen,
          setListsOpen,
        )}

      </div>
    </aside>
  );
}
