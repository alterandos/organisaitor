import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import type { ManageSection } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { now } from '@/utils/date';
import type { Collection, Purpose, Tag, CollectionId, PurposeId, TagId } from '@/types';
import styles from './ManagePane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';

// Left-nav tabs — add an entry here (+ a render branch below) to extend this view with
// future sections (e.g. Notebooks, List types) without redesigning the layout.
const MANAGE_SECTIONS: { id: ManageSection; label: string; icon: string }[] = [
  { id: 'endeavours', label: LABELS.collectionPlural, icon: '▤' },
  { id: 'purposes',   label: 'Purposes',              icon: '◎' },
  { id: 'tags',       label: 'Tags',                  icon: '#' },
];

interface RowProps {
  color?:      string | null;
  name:        string;
  archived?:   boolean;
  onEdit?:     () => void;
  onArchive?:  () => void;
  onDelete:    () => void;
}

function ManageRow({ color, name, archived, onEdit, onArchive, onDelete }: RowProps) {
  return (
    <div className={`${styles.row} ${archived ? styles.rowArchived : ''}`}>
      <div className={styles.rowMain}>
        {color && <span className={styles.dot} style={{ background: color }} />}
        <span className={styles.name}>{name}</span>
      </div>
      <div className={styles.rowActions}>
        {onEdit && (
          <button className={styles.iconBtn} onClick={onEdit} title="Edit" aria-label={`Edit ${name}`}>✎</button>
        )}
        {onArchive && (
          <button className={styles.iconBtn} onClick={onArchive} title={archived ? 'Restore' : 'Archive'} aria-label={`${archived ? 'Restore' : 'Archive'} ${name}`}>
            {archived ? '↺' : '⊘'}
          </button>
        )}
        <button className={`${styles.iconBtn} ${styles.iconBtnDelete}`} onClick={onDelete} title="Delete" aria-label={`Delete ${name}`}>✕</button>
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className={styles.emptyHint}>{children}</p>;
}

// ── Endeavours ────────────────────────────────────────────────────────────

function EndeavoursSection() {
  const collectionsRecord = useTaskStore((s) => s.collections);
  const updateCollection  = useTaskStore((s) => s.updateCollection);
  const deleteCollection  = useTaskStore((s) => s.deleteCollection);
  const openEditCollection = useUIStore((s) => s.openEditCollection);

  const [archivedOpen, setArchivedOpen] = useState(false);

  const all       = Object.values(collectionsRecord).filter((c) => c.kind === 'project' || c.kind === 'list');
  const active    = all.filter((c) => !c.archivedAt);
  const archived  = all.filter((c) => c.archivedAt);
  const projects  = active.filter((c) => c.kind === 'project');
  const lists     = active.filter((c) => c.kind === 'list');

  const toggleArchive = (c: Collection) => updateCollection(c.id as CollectionId, { archivedAt: c.archivedAt ? null : now() });
  const handleDelete = async (c: Collection) => {
    if (await confirmDelete(LABELS.collection.toLowerCase(), c.name, 'Tasks will be detached but not deleted.')) {
      deleteCollection(c.id as CollectionId);
    }
  };

  return (
    <>
      {active.length === 0 && archived.length === 0 && (
        <EmptyHint>No {LABELS.collectionPlural.toLowerCase()} yet.</EmptyHint>
      )}

      {projects.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupLabel}>{LABELS.collectionKind.project}s</div>
          {projects.map((c) => (
            <ManageRow
              key={c.id}
              color={c.color}
              name={c.name}
              onEdit={() => openEditCollection(c)}
              onArchive={() => toggleArchive(c)}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}

      {lists.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupLabel}>{LABELS.collectionKind.list}s</div>
          {lists.map((c) => (
            <ManageRow
              key={c.id}
              color={c.color}
              name={c.name}
              onEdit={() => openEditCollection(c)}
              onArchive={() => toggleArchive(c)}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className={styles.group}>
          <button className={styles.archivedToggle} onClick={() => setArchivedOpen((o) => !o)}>
            <span className={`${styles.chevron} ${archivedOpen ? styles.chevronOpen : ''}`}>▸</span>
            Archived ({archived.length})
          </button>
          {archivedOpen && archived.map((c) => (
            <ManageRow
              key={c.id}
              color={c.color}
              name={c.name}
              archived
              onEdit={() => openEditCollection(c)}
              onArchive={() => toggleArchive(c)}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Purposes ──────────────────────────────────────────────────────────────

function PurposesSection() {
  const purposesRecord = useTaskStore((s) => s.purposes);
  const updatePurpose  = useTaskStore((s) => s.updatePurpose);
  const deletePurpose  = useTaskStore((s) => s.deletePurpose);
  const openEditPurpose = useUIStore((s) => s.openEditPurpose);

  const [archivedOpen, setArchivedOpen] = useState(false);

  const all      = Object.values(purposesRecord);
  const active   = all.filter((p) => !p.archivedAt);
  const archived = all.filter((p) => p.archivedAt);

  const toggleArchive = (p: Purpose) => updatePurpose(p.id as PurposeId, { archivedAt: p.archivedAt ? null : now() });
  const handleDelete = async (p: Purpose) => {
    if (await confirmDelete('purpose', p.name, 'It will be removed from all tasks.')) {
      deletePurpose(p.id as PurposeId);
    }
  };

  return (
    <>
      {active.length === 0 && archived.length === 0 && <EmptyHint>No purposes yet.</EmptyHint>}

      {active.length > 0 && (
        <div className={styles.group}>
          {active.map((p) => (
            <ManageRow
              key={p.id}
              color={p.color}
              name={p.name}
              onEdit={() => openEditPurpose(p)}
              onArchive={() => toggleArchive(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className={styles.group}>
          <button className={styles.archivedToggle} onClick={() => setArchivedOpen((o) => !o)}>
            <span className={`${styles.chevron} ${archivedOpen ? styles.chevronOpen : ''}`}>▸</span>
            Archived ({archived.length})
          </button>
          {archivedOpen && archived.map((p) => (
            <ManageRow
              key={p.id}
              color={p.color}
              name={p.name}
              archived
              onEdit={() => openEditPurpose(p)}
              onArchive={() => toggleArchive(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Tags ──────────────────────────────────────────────────────────────────

function TagsSection() {
  const tagsRecord = useTaskStore((s) => s.tags);
  const deleteTag  = useTaskStore((s) => s.deleteTag);
  const openEditTag = useUIStore((s) => s.openEditTag);

  const tags = Object.values(tagsRecord);

  const handleDelete = async (t: Tag) => {
    if (await confirmDelete('tag', t.name, 'It will be removed from all tasks.')) {
      deleteTag(t.id as TagId);
    }
  };

  if (tags.length === 0) return <EmptyHint>No tags yet.</EmptyHint>;

  return (
    <div className={styles.group}>
      {tags.map((t) => (
        <ManageRow
          key={t.id}
          color={t.color}
          name={t.name}
          onEdit={() => openEditTag(t)}
          onDelete={() => handleDelete(t)}
        />
      ))}
    </div>
  );
}

// ── Main pane ─────────────────────────────────────────────────────────────

export function ManagePane() {
  const manageOpen    = useUIStore((s) => s.manageOpen);
  const manageSection = useUIStore((s) => s.manageSection);
  const setManageSection = useUIStore((s) => s.setManageSection);
  const closeManage   = useUIStore((s) => s.closeManage);

  useEscapeClose(closeManage, manageOpen);

  if (!manageOpen) return null;

  return (
    <div className={styles.overlay} onMouseDown={closeManage}>
      <div
        className={styles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage library"
      >
        <div className={styles.header}>
          <span className={styles.title}>Manage</span>
          <button className={styles.closeBtn} onClick={closeManage} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <nav className={styles.nav}>
            {MANAGE_SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`${styles.navItem} ${manageSection === s.id ? styles.navItemActive : ''}`}
                onClick={() => setManageSection(s.id)}
              >
                <span className={styles.navIcon}>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            {manageSection === 'endeavours' && <EndeavoursSection />}
            {manageSection === 'purposes'   && <PurposesSection />}
            {manageSection === 'tags'       && <TagsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
