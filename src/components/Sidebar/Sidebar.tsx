import { useState } from 'react';
import type { TagId, PurposeId, CollectionId } from '@/types';
import { LABELS } from '@/config/labels';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import styles from './Sidebar.module.css';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { TruncatedText } from '@/components/TruncatedText/TruncatedText';
import { useRowHoverActions } from '@/components/RowHoverActions/useRowHoverActions';
import { RowHoverActionsMenu } from '@/components/RowHoverActions/RowHoverActionsMenu';
import type { Collection, Tag, Purpose } from '@/types';

interface Props {
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}

// Each row type gets its own tiny component (rather than inline JSX inside a .map()) because
// useRowHoverActions is a hook — it has to be called once per row instance, not once per
// iteration of a shared parent's render (which would violate the rules of hooks whenever the
// list's length changes between renders).

function SidebarCollectionRow({ col, onEdit, onDelete }: { col: Collection; onEdit: () => void; onDelete: () => void }) {
  const { anchorRef, open, rowHandlers, menuHandlers } = useRowHoverActions<HTMLDivElement>();
  return (
    <div ref={anchorRef} className={styles.row} {...rowHandlers}>
      <div className={styles.rowMain}>
        <span className={styles.dot} style={{ background: col.color ?? 'var(--color-border)' }} />
        <TruncatedText text={col.name} className={styles.name} />
      </div>
      <RowHoverActionsMenu anchorRef={anchorRef} open={open} {...menuHandlers}>
        <button className={styles.iconBtn} onClick={onEdit} aria-label={`Edit ${col.name}`} title="Edit">✎</button>
        <button className={`${styles.iconBtn} ${styles.deleteIconBtn}`} onClick={onDelete} aria-label={`Delete ${col.name}`} title="Delete">×</button>
      </RowHoverActionsMenu>
    </div>
  );
}

function SidebarTagRow({ tag, isActive, onToggle, onEdit, onDelete }: { tag: Tag; isActive: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const { anchorRef, open, rowHandlers, menuHandlers } = useRowHoverActions<HTMLDivElement>();
  return (
    <div
      ref={anchorRef}
      className={`${styles.row} ${isActive ? styles.rowActive : ''}`}
      style={isActive && tag.color ? { background: tag.color + '18' } : undefined}
      {...rowHandlers}
    >
      <button className={styles.rowMain} onClick={onToggle}>
        <span className={styles.dot} style={{ background: tag.color ?? 'var(--color-border)' }} />
        <TruncatedText text={tag.name} className={styles.name} />
      </button>
      <RowHoverActionsMenu anchorRef={anchorRef} open={open} {...menuHandlers}>
        <button className={styles.iconBtn} onClick={onEdit} aria-label={`Edit ${tag.name}`} title="Edit">✎</button>
        <button className={`${styles.iconBtn} ${styles.deleteIconBtn}`} onClick={onDelete} aria-label={`Delete ${tag.name}`} title="Delete">×</button>
      </RowHoverActionsMenu>
    </div>
  );
}

function SidebarPurposeRow({ purpose, onEdit, onDelete }: { purpose: Purpose; onEdit: () => void; onDelete: () => void }) {
  const { anchorRef, open, rowHandlers, menuHandlers } = useRowHoverActions<HTMLDivElement>();
  return (
    <div ref={anchorRef} className={styles.row} {...rowHandlers}>
      <div className={styles.rowMain}>
        <span className={styles.dot} style={{ background: purpose.color ?? 'var(--color-border)' }} />
        <TruncatedText text={purpose.name} className={styles.name} />
      </div>
      <RowHoverActionsMenu anchorRef={anchorRef} open={open} {...menuHandlers}>
        <button className={styles.iconBtn} onClick={onEdit} aria-label={`Edit ${purpose.name}`} title="Edit">✎</button>
        <button className={`${styles.iconBtn} ${styles.deleteIconBtn}`} onClick={onDelete} aria-label={`Delete ${purpose.name}`} title="Delete">×</button>
      </RowHoverActionsMenu>
    </div>
  );
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
  const openManage          = useUIStore((s) => s.openManage);
  const closeSidebar        = useUIStore((s) => s.closeSidebar);

  useEscapeClose(closeSidebar, sidebarOpen);

  const tagsRecord        = useTaskStore((s) => s.tags);
  const purposesRecord    = useTaskStore((s) => s.purposes);
  const collectionsRecord = useTaskStore((s) => s.collections);
  const deleteTag         = useTaskStore((s) => s.deleteTag);
  const deletePurpose     = useTaskStore((s) => s.deletePurpose);
  const deleteCollection  = useTaskStore((s) => s.deleteCollection);

  const tags     = Object.values(tagsRecord);
  const purposes = Object.values(purposesRecord).filter((p) => !p.archivedAt);
  const allCollections = Object.values(collectionsRecord).filter((c) => !c.archivedAt);
  const projects = allCollections.filter((c) => c.kind === 'project');
  const lists    = allCollections.filter((c) => c.kind === 'list');

  const handleDeleteTag = async (id: TagId, name: string) => {
    if (await confirmDelete('tag', name, 'It will be removed from all tasks.')) {
      deleteTag(id);
    }
  };

  const handleDeletePurpose = async (id: PurposeId, name: string) => {
    if (await confirmDelete('purpose', name, 'It will be removed from all tasks.')) {
      deletePurpose(id);
    }
  };

  const handleDeleteCollection = async (id: CollectionId, name: string) => {
    if (await confirmDelete(LABELS.collection.toLowerCase(), name, 'Tasks will be detached but not deleted.')) {
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
              <SidebarCollectionRow
                key={col.id}
                col={col}
                onEdit={() => openEditCollection(col)}
                onDelete={() => handleDeleteCollection(col.id as CollectionId, col.name)}
              />
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

        {/* ── Manage ── */}
        <button className={styles.manageBtn} onClick={() => openManage()}>
          <span className={styles.manageIcon}>⚙</span>
          Manage Library
          <kbd className={styles.manageKbd}>M</kbd>
        </button>

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
                : tags.map((tag) => (
                    <SidebarTagRow
                      key={tag.id}
                      tag={tag}
                      isActive={activeTagIds.includes(tag.id)}
                      onToggle={() => toggleTagFilter(tag.id)}
                      onEdit={() => openEditTag(tag)}
                      onDelete={() => handleDeleteTag(tag.id as TagId, tag.name)}
                    />
                  ))
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
                    <SidebarPurposeRow
                      key={purpose.id}
                      purpose={purpose}
                      onEdit={() => openEditPurpose(purpose)}
                      onDelete={() => handleDeletePurpose(purpose.id as PurposeId, purpose.name)}
                    />
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
