import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useListStore } from '@/store/listStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { confirmDialog, confirmDelete } from '@/components/ConfirmDialog/dialogs';
import { toggleChecklistItemWithTasks } from '@/services/taskListLinks';
import type { List, ListId, ListItem, ListItemId, ListFieldSchema } from '@/types/lists';
import styles from './ListsSection.module.css';

function fieldSummary(item: ListItem, fieldSchema: ListFieldSchema[]): string {
  return fieldSchema
    .map((f) => item.data[f.id])
    .filter((v) => v != null && v !== '' && v !== false)
    .map((v) => (v === true ? '✓' : String(v)))
    .join(' · ');
}

// Shopping-list style rendering for kind === 'checklist': unchecked items first (by order), then
// checked ones, struck through. Checking an item moves it to the very bottom (the store action
// bumps its order), so the most recently ticked item is always last.
export function ChecklistView({
  list, items, fieldSchema, tabId,
}: {
  list: List;
  items: ListItem[];
  fieldSchema: ListFieldSchema[];
  tabId: string | null;
}) {
  const addListItem           = useListStore((s) => s.addListItem);
  const updateListItem        = useListStore((s) => s.updateListItem);
  const deleteListItem        = useListStore((s) => s.deleteListItem);
  const uncheckAllListItems   = useListStore((s) => s.uncheckAllListItems);
  const openEditListItem      = useUIStore((s) => s.openEditListItem);

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = [...items].sort((a, b) => a.order - b.order);
  const unchecked = sorted.filter((i) => i.status !== 'done');
  const checked   = sorted.filter((i) => i.status === 'done');

  function handleAdd() {
    const title = draft.trim();
    if (!title) return;
    addListItem({ listId: list.id as ListId, title, tabId });
    setDraft('');
  }

  function handleAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  }

  async function handleDelete(item: ListItem) {
    if (!(await confirmDelete('list item', item.title))) return;
    deleteListItem(item.id);
  }

  async function handleClearChecked() {
    const ok = await confirmDialog({
      title: `${LABELS.checklist.clearChecked}?`,
      message: `${checked.length} checked item${checked.length !== 1 ? 's' : ''} will be removed. You can restore them from the Recycling Bin.`,
      confirmLabel: LABELS.checklist.clearChecked,
      destructive: true,
    });
    if (!ok) return;
    for (const item of checked) deleteListItem(item.id);
  }

  const renderRow = (item: ListItem) => {
    const done = item.status === 'done';
    const summary = fieldSummary(item, fieldSchema);
    return (
      <li key={item.id} className={`${styles.checkRow} ${done ? styles.checkRowDone : ''}`}>
        <button
          className={`${styles.checkBox} ${done ? styles.checkBoxDone : ''}`}
          onClick={() => void toggleChecklistItemWithTasks(item.id)}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Uncheck ${item.title}` : `Check ${item.title}`}
        >
          {done && <span className={styles.checkMark}>✓</span>}
        </button>
        <div className={styles.checkBody}>
          {editingId === item.id ? (
            <input
              autoFocus
              className={styles.inlineTitleInput}
              defaultValue={item.title}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== item.title) updateListItem(item.id as ListItemId, { title: v });
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); }
              }}
            />
          ) : (
            <span className={styles.checkTitle} onClick={() => setEditingId(item.id)}>{item.title}</span>
          )}
          {(summary || item.notes) && (
            <span className={styles.checkMeta}>
              {[summary, item.notes].filter(Boolean).join(' — ')}
            </span>
          )}
        </div>
        <div className={styles.rowActions}>
          <button className={styles.rowActionBtn} onClick={() => openEditListItem(item.id)} title="Edit">✎</button>
          <button className={`${styles.rowActionBtn} ${styles.rowDeleteBtn}`} onClick={() => handleDelete(item)} title="Delete">✕</button>
        </div>
      </li>
    );
  };

  return (
    <div className={styles.checklistWrap}>
      <div className={styles.checkAddRow}>
        <span className={styles.checkAddIcon}>+</span>
        <input
          className={styles.checkAddInput}
          placeholder={LABELS.checklist.addPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleAddKeyDown}
        />
      </div>

      {items.length === 0 && <p className={styles.gridEmptyHint}>{LABELS.checklist.empty}</p>}

      <ul className={styles.checkList}>
        {unchecked.map(renderRow)}
      </ul>

      {checked.length > 0 && (
        <>
          <div className={styles.checkDivider}>
            <span>{checked.length} checked</span>
            <button className={styles.checkClearBtn} onClick={() => uncheckAllListItems(list.id as ListId)}>
              {LABELS.checklist.uncheckAll}
            </button>
            <button className={styles.checkClearBtn} onClick={handleClearChecked}>
              {LABELS.checklist.clearChecked}
            </button>
          </div>
          <ul className={styles.checkList}>
            {checked.map(renderRow)}
          </ul>
        </>
      )}
    </div>
  );
}
