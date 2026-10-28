import { useRef, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { usePinAction } from '@/hooks/usePinAction';
import { useUIStore } from '@/store/uiStore';
import type { ManageSection } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { now } from '@/utils/date';
import type { Collection, Purpose, Tag, CollectionId, PurposeId, TagId } from '@/types';
import styles from './ManagePane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { endeavourInUse, purposeInUse, tagInUse } from '@/services/inUse';
import { TruncatedText } from '@/components/TruncatedText/TruncatedText';
import { RowOptionsMenu } from '@/components/RowHoverActions/RowOptionsMenu';
import { RowAction } from '@/components/RowHoverActions/RowAction';
import { ArchiveIcon, CloseIcon, DisclosureIcon, EditIcon, EndeavourIcon, PurposeIcon, RestoreIcon, TagIcon, TrashIcon, TypeIcon } from '@/components/Icons';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { addStarterSet, itemsOfType, makeTagAType } from '@/services/itemTypes';
import { typeDescendants } from '@/utils/itemTypes';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { showToast } from '@/components/Toast/showToast';
import type { ItemType, ItemTypeId } from '@/types';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';

// Left-nav tabs — add an entry here (+ a render branch below) to extend this view with
// future sections (e.g. Notebooks, List types) without redesigning the layout.
const MANAGE_SECTIONS: { id: ManageSection; label: string; Icon: typeof TagIcon }[] = [
  { id: 'endeavours', label: LABELS.collectionPlural, Icon: EndeavourIcon },
  { id: 'purposes',   label: 'Purposes',              Icon: PurposeIcon },
  { id: 'tags',       label: 'Tags',                  Icon: TagIcon },
  { id: 'types',      label: LABELS.itemTypes.title,  Icon: TypeIcon },
];

// Each section's "+ New" (2026-10-18: Manage could edit and delete but not create). Opens the
// same creation modal the Sidebar does; it sits above Manage (z-index 102).
const NEW_ACTIONS: Record<ManageSection, () => void> = {
  endeavours: () => useUIStore.getState().showAddCollection(),
  purposes:   () => useUIStore.getState().showAddPurpose(),
  tags:       () => useUIStore.getState().showAddTag(),
  types:      () => useUIStore.getState().showAddItemType(),
};

interface RowProps {
  color?:      string | null;
  icon?:       React.ReactNode;  // in place of the colour dot (a Type's icon)
  name:        string;
  detail?:     string;           // a short line after the name (what a Type extends, how many use it)
  extra?:      React.ReactNode;  // more RowActions, before Delete
  archived?:   boolean;
  onEdit?:     () => void;
  onArchive?:  () => void;
  onDelete:    () => void;
  pinId?:      string;   // an Endeavour, which can be pinned to Quick Access
}

function ManageRow({ color, icon, name, detail, extra, archived, onEdit, onArchive, onDelete, pinId }: RowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const pin = usePinAction('endeavour', pinId ?? '');
  return (
    <div ref={rowRef} className={`${styles.row} ${archived ? styles.rowArchived : ''}`}>
      <RowOptionsMenu rowRef={rowRef} title={name} icon={icon ?? (color && <span className={styles.dot} style={{ background: color }} />)}>
        {onEdit && (
          <RowAction className={styles.iconBtn} icon={<EditIcon />} label={LABELS.rowActions.edit} onClick={onEdit} />
        )}
        {onArchive && (
          <RowAction
            className={styles.iconBtn}
            icon={archived ? <RestoreIcon width="1em" height="1em" /> : <ArchiveIcon width="1em" height="1em" />}
            label={archived ? LABELS.rowActions.restore : LABELS.rowActions.archive}
            onClick={onArchive}
          />
        )}
        {pinId && !archived && <RowAction className={styles.iconBtn} {...pin} />}
        {extra}
        <RowAction className={`${styles.iconBtn} ${styles.iconBtnDelete}`} icon={<TrashIcon width="1em" height="1em" />} label={LABELS.rowActions.delete} onClick={onDelete} destructive />
      </RowOptionsMenu>
      <div className={styles.rowMain}>
        <TruncatedText text={name} className={styles.name} />
        {detail && <span className={styles.detail}>{detail}</span>}
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
    if (await confirmDelete(LABELS.collection.toLowerCase(), c.name, 'Tasks will be detached but not deleted.', { empty: !endeavourInUse(c.id as CollectionId) })) {
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
              pinId={c.id}
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
              pinId={c.id}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className={styles.group}>
          <button className={styles.archivedToggle} onClick={() => setArchivedOpen((o) => !o)}>
            <DisclosureIcon open={archivedOpen} className={styles.chevron} />
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
              pinId={c.id}
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
    if (await confirmDelete('purpose', p.name, 'It will be removed from all tasks.', { empty: !purposeInUse(p.id as PurposeId) })) {
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
            <DisclosureIcon open={archivedOpen} className={styles.chevron} />
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
    if (await confirmDelete('tag', t.name, 'It will be removed from all tasks.', { empty: !tagInUse(t.id as TagId) })) {
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
          extra={<RowAction className={styles.iconBtn} icon={<TypeIcon width="1em" height="1em" />} label={LABELS.itemTypes.fromTag} onClick={() => makeTagAType(t.id as TagId)} />}
        />
      ))}
    </div>
  );
}

// ── Types (docs/features/endeavours.md phase 3) ──────────────────────────

function TypesSection() {
  const typesRecord = useItemTypeStore((s) => s.types);
  const openEditItemType = useUIStore((s) => s.openEditItemType);
  const types = Object.values(typesRecord).sort((a, b) => a.name.localeCompare(b.name));

  const handleDelete = async (t: ItemType) => {
    const used = itemsOfType(t.id);
    const kids = typeDescendants(typesRecord, t.id).filter((k) => k.extendsId === t.id);
    if (!(await confirmDelete(LABELS.itemTypes.noun.toLowerCase(), t.name, LABELS.itemTypes.deleteDetail(used, kids.length), { empty: used === 0 && kids.length === 0 }))) return;
    for (const k of kids) useItemTypeStore.getState().updateItemType(k.id, { extendsId: null });
    useItemTypeStore.getState().deleteItemType(t.id);
  };

  const detailOf = (t: ItemType) => [
    t.extendsId && typesRecord[t.extendsId] ? `${LABELS.itemTypes.extends.toLowerCase()} ${typesRecord[t.extendsId].name}` : '',
    LABELS.itemTypes.usedBy(itemsOfType(t.id)),
  ].filter(Boolean).join(' · ');

  return (
    <div className={styles.group}>
      {types.length === 0 && <EmptyHint>{LABELS.itemTypes.empty}</EmptyHint>}
      {types.map((t) => (
        <ManageRow
          key={t.id}
          icon={<ItemIcon icon={t.icon} fallback="🏷️" />}
          name={t.name}
          detail={detailOf(t)}
          archived={!!t.archivedAt}
          onEdit={() => openEditItemType(t.id as ItemTypeId)}
          onArchive={() => useItemTypeStore.getState().updateItemType(t.id, { archivedAt: t.archivedAt ? null : now() })}
          onDelete={() => handleDelete(t)}
        />
      ))}
    </div>
  );
}

// ── Main pane ─────────────────────────────────────────────────────────────

export function ManagePane() {
  const paneResize = usePaneWidth('manage-nav', { edge: 'right', min: 140, max: 360 });
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
          <button className={styles.closeBtn} onClick={closeManage} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          <nav style={paneResize.style} className={styles.nav}>
            {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
            {MANAGE_SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`${styles.navItem} ${manageSection === s.id ? styles.navItemActive : ''}`}
                onClick={() => setManageSection(s.id)}
              >
                <span className={styles.navIcon}><s.Icon width="1em" height="1em" /></span>
                {s.label}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            <div className={styles.toolbar}>
              {manageSection === 'types' && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  title={LABELS.itemTypes.starterSets.university}
                  onClick={() => showToast({ message: LABELS.itemTypes.startersAdded(addStarterSet('university')) })}
                >
                  {LABELS.itemTypes.starters}
                </button>
              )}
              <button type="button" className={styles.newBtn} onClick={NEW_ACTIONS[manageSection]}>
                + {LABELS.manage.new[manageSection]}
              </button>
            </div>
            {manageSection === 'endeavours' && <EndeavoursSection />}
            {manageSection === 'purposes'   && <PurposesSection />}
            {manageSection === 'tags'       && <TagsSection />}
            {manageSection === 'types'      && <TypesSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
