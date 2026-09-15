import { useState, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { useListStore } from '@/store/listStore';
import { useUIStore } from '@/store/uiStore';
import { LIST_ITEM_STATUS_META } from '@/types/lists';
import type { ListId, ListItemId, ListItemStatus, ListItem, ListFieldSchema } from '@/types/lists';
import styles from './ListsSection.module.css';

// ── Status filter (watchlist only) ────────────────────────────────────────────
type StatusFilter = 'all' | ListItemStatus;
const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all',         label: 'All'         },
  { id: 'want',        label: 'Want'        },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done',        label: 'Done'        },
];

function hostnameOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ── Reference cell renderer ───────────────────────────────────────────────────
function RefCell({ field, value }: { field: ListFieldSchema; value: unknown }) {
  if (value == null || value === '') return <span className={styles.refCellMuted}>—</span>;
  switch (field.type) {
    case 'rating': {
      const n = typeof value === 'number' ? value : 0;
      const max = field.max ?? 5;
      return <span className={styles.refCellText}>{n}/{max}</span>;
    }
    case 'boolean':
      return <span className={styles.refCellText}>{value ? '✓' : '—'}</span>;
    case 'url': {
      const href = String(value);
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={styles.refCellUrl} onClick={(e) => e.stopPropagation()}>
          {hostnameOf(href)}
        </a>
      );
    }
    case 'date': {
      const d = new Date(String(value));
      return <span className={styles.refCellText}>{isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()}</span>;
    }
    default:
      return <span className={styles.refCellText}>{String(value)}</span>;
  }
}

// ── Inline field input (shared: watchlist card fields + reference table cells) ─
function FieldInput({
  field,
  value,
  onSave,
  onCancel,
  className,
}: {
  field: ListFieldSchema;
  value: unknown;
  onSave: (value: unknown) => void;
  onCancel: () => void;
  className?: string;
}) {
  if (field.type === 'select') {
    return (
      <select
        autoFocus
        className={className}
        defaultValue={value == null ? '' : String(value)}
        onChange={(e) => onSave(e.target.value === '' ? null : e.target.value)}
        onBlur={onCancel}
      >
        <option value="">—</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
  return (
    <input
      autoFocus
      className={className}
      type={inputType}
      defaultValue={value == null ? '' : String(value)}
      onBlur={(e) => onSave(inputType === 'number'
        ? (e.target.value === '' ? null : Number(e.target.value))
        : (e.target.value === '' ? null : e.target.value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

// ── Watchlist item card ───────────────────────────────────────────────────────
function ItemCard({
  item,
  fieldSchema,
  editingField,
  onStartEdit,
  onCancelEdit,
  onTitleSave,
  onFieldSave,
  onNotesSave,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  item: ListItem;
  fieldSchema: ListFieldSchema[];
  editingField: string | null;
  onStartEdit: (field: string) => void;
  onCancelEdit: () => void;
  onTitleSave: (title: string) => void;
  onFieldSave: (fieldId: string, value: unknown) => void;
  onNotesSave: (notes: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: ListItemStatus) => void;
}) {
  const meta = LIST_ITEM_STATUS_META[item.status];
  const previewFields = fieldSchema
    .filter((f) => item.data[f.id] != null && item.data[f.id] !== '')
    .slice(0, 3);

  return (
    <div className={styles.itemCard}>
      <div className={styles.itemCardTop}>
        {editingField === 'title' ? (
          <input
            autoFocus
            className={styles.inlineTitleInput}
            defaultValue={item.title}
            onBlur={(e) => { const v = e.target.value.trim(); v ? onTitleSave(v) : onCancelEdit(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') onCancelEdit();
            }}
          />
        ) : (
          <span className={styles.itemTitle} onClick={() => onStartEdit('title')}>{item.title}</span>
        )}
        <div className={styles.itemCardActions}>
          <button className={styles.itemActionBtn} onClick={onEdit} title="Edit">✎</button>
          <button className={`${styles.itemActionBtn} ${styles.itemDeleteBtn}`} onClick={onDelete} title="Remove">✕</button>
        </div>
      </div>

      {previewFields.length > 0 && (
        <div className={styles.itemFields}>
          {previewFields.map((f) => {
            if (f.type === 'rating') {
              const n = typeof item.data[f.id] === 'number' ? item.data[f.id] as number : 0;
              const max = f.max ?? 5;
              return (
                <div key={f.id} className={styles.itemField}>
                  <span className={styles.itemFieldLabel}>{f.name}</span>
                  <span className={styles.stars}>
                    {Array.from({ length: max }, (_, i) => (
                      <span
                        key={i}
                        className={i < n ? styles.starFilled : styles.starEmpty}
                        onClick={() => onFieldSave(f.id, i + 1 === n ? 0 : i + 1)}
                      >★</span>
                    ))}
                  </span>
                </div>
              );
            }
            if (f.type === 'boolean') {
              return (
                <div key={f.id} className={styles.itemField}>
                  <span className={styles.itemFieldLabel}>{f.name}</span>
                  <span className={styles.itemFieldValue} onClick={() => onFieldSave(f.id, !item.data[f.id])}>
                    {item.data[f.id] ? '✓' : '—'}
                  </span>
                </div>
              );
            }
            const isEditing = editingField === f.id;
            return (
              <div key={f.id} className={styles.itemField}>
                <span className={styles.itemFieldLabel}>{f.name}</span>
                {isEditing ? (
                  <FieldInput
                    field={f}
                    value={item.data[f.id]}
                    className={styles.inlineFieldInput}
                    onSave={(v) => onFieldSave(f.id, v)}
                    onCancel={onCancelEdit}
                  />
                ) : (
                  <span className={styles.itemFieldValue} onClick={() => onStartEdit(f.id)}>
                    {String(item.data[f.id])}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingField === 'notes' ? (
        <textarea
          autoFocus
          className={styles.inlineNotesInput}
          defaultValue={item.notes ?? ''}
          onBlur={(e) => onNotesSave(e.target.value.trim() || null)}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancelEdit(); }}
        />
      ) : item.notes ? (
        <p className={styles.itemNotes} title={item.notes} onClick={() => onStartEdit('notes')}>{item.notes}</p>
      ) : null}

      {item.links.length > 0 && (
        <div className={styles.itemLinks}>
          {item.links.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className={styles.itemLink}>
              {hostnameOf(url)}
            </a>
          ))}
        </div>
      )}

      <div className={styles.itemCardBottom}>
        <div className={styles.statusPills}>
          {(Object.keys(LIST_ITEM_STATUS_META) as ListItemStatus[]).map((s) => (
            <button
              key={s}
              className={`${styles.statusPill} ${item.status === s ? styles.statusPillActive : ''}`}
              style={item.status === s ? { background: meta.color + '22', color: meta.color, borderColor: meta.color + '66' } : undefined}
              onClick={() => onStatusChange(s)}
              title={LIST_ITEM_STATUS_META[s].label}
            >
              {LIST_ITEM_STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────
export function ListsSection() {
  const lists      = useListStore((s) => s.lists);
  const listItems  = useListStore((s) => s.listItems);
  const listTypes  = useListStore((s) => s.listTypes);
  const deleteList     = useListStore((s) => s.deleteList);
  const updateList     = useListStore((s) => s.updateList);
  const updateListItem = useListStore((s) => s.updateListItem);
  const deleteListItem = useListStore((s) => s.deleteListItem);

  const showAddList       = useUIStore((s) => s.showAddList);
  const openEditList      = useUIStore((s) => s.openEditList);
  const showAddListItem   = useUIStore((s) => s.showAddListItem);
  const openEditListItem  = useUIStore((s) => s.openEditListItem);
  const setActiveListId   = useUIStore((s) => s.setActiveListId);

  const [selectedListId, setSelectedListId] = useState<ListId | null>(null);
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all');
  const [selectedTabId,  setSelectedTabId]  = useState<string | 'all'>('all');
  const [addingTab,      setAddingTab]      = useState(false);
  const [newTabName,     setNewTabName]     = useState('');
  const [editingCell,    setEditingCell]    = useState<{ itemId: string; field: string } | null>(null);
  const tabInputRef = useRef<HTMLInputElement>(null);

  const allLists = Object.values(lists).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const selectedList = selectedListId ? lists[selectedListId] : null;

  useEffect(() => {
    if (selectedListId && !lists[selectedListId]) {
      setSelectedListId(allLists[0]?.id ?? null);
    }
    if (!selectedListId && allLists.length > 0) {
      setSelectedListId(allLists[0].id as ListId);
    }
  }, [lists]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActiveListId(selectedListId);
    return () => setActiveListId(null);
  }, [selectedListId, setActiveListId]);

  useEffect(() => {
    if (addingTab) tabInputRef.current?.focus();
  }, [addingTab]);

  const allItemsInList = selectedListId
    ? Object.values(listItems).filter((i) => i.listId === selectedListId)
    : [];

  const isWatchlist = selectedList?.kind === 'watchlist';
  const hasTabs     = (selectedList?.tabs?.length ?? 0) > 0;

  // For reference tables: use the active tab's field schema if it has fields, else list-level schema
  const tableFieldSchema = (() => {
    if (!selectedList) return [];
    if (selectedTabId !== 'all' && selectedList.tabs) {
      const tab = selectedList.tabs.find((t) => t.id === selectedTabId);
      if (tab && (tab.fieldSchema ?? []).length > 0) return tab.fieldSchema ?? [];
    }
    return selectedList.fieldSchema ?? [];
  })();
  const showTabBar  = hasTabs || addingTab;

  // Ctrl+PgUp/PgDn cycles through this list's tabs (All + each named tab), matching the same
  // hotkey already used to cycle Note tabs (NoteEditor.tsx) — one convention for "tabs" app-wide.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!hasTabs || !selectedList) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable;
      if (isTyping) return;
      if (!e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.key !== 'PageUp' && e.key !== 'PageDown') return;

      e.preventDefault();
      const order: (string | 'all')[] = ['all', ...(selectedList.tabs ?? []).map((t) => t.id)];
      const curIdx = order.indexOf(selectedTabId);
      const dir = e.key === 'PageDown' ? 1 : -1;
      const nextIdx = (curIdx + dir + order.length) % order.length;
      setSelectedTabId(order[nextIdx]);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [hasTabs, selectedList, selectedTabId]);

  const displayedItems = allItemsInList
    .filter((i) => !hasTabs || selectedTabId === 'all' || i.tabId === selectedTabId)
    .filter((i) => !isWatchlist || statusFilter === 'all' || i.status === statusFilter)
    .sort((a, b) => a.order - b.order);

  const countByStatus = (s: ListItemStatus) => allItemsInList.filter((i) => i.status === s).length;

  const handleDeleteList = (id: ListId, name: string) => {
    if (!window.confirm(`Delete list "${name}" and all its items?`)) return;
    deleteList(id);
  };

  const handleDeleteItem = (item: ListItem) => {
    if (!window.confirm(`Remove "${item.title}" from the list?`)) return;
    deleteListItem(item.id);
  };

  const handleConfirmTab = () => {
    if (!newTabName.trim() || !selectedListId || !selectedList) return;
    const tab = { id: nanoid(8), name: newTabName.trim(), color: null, fieldSchema: [] };
    updateList(selectedListId, { tabs: [...(selectedList.tabs ?? []), tab] });
    setNewTabName('');
    setAddingTab(false);
  };

  const handleSelectList = (id: ListId) => {
    setSelectedListId(id);
    setStatusFilter('all');
    setSelectedTabId('all');
    setAddingTab(false);
    setNewTabName('');
    setEditingCell(null);
  };

  // Group sidebar lists by kind
  const watchlists    = allLists.filter((l) => l.kind === 'watchlist');
  const referenceLists = allLists.filter((l) => l.kind !== 'watchlist');

  const renderSidebarItem = (list: typeof allLists[0]) => {
    const listType = list.typeId ? listTypes[list.typeId] : null;
    const itemCount = Object.values(listItems).filter((i) => i.listId === list.id).length;
    const isSelected = list.id === selectedListId;
    return (
      <div
        key={list.id}
        className={`${styles.sidebarItem} ${isSelected ? styles.sidebarItemActive : ''}`}
        onClick={() => handleSelectList(list.id as ListId)}
        style={isSelected && list.color ? { borderLeftColor: list.color } : undefined}
      >
        <span className={styles.sidebarItemIcon}>{list.icon ?? listType?.icon ?? '📋'}</span>
        <div className={styles.sidebarItemInfo}>
          <span className={styles.sidebarItemName}>{list.name}</span>
          <span className={styles.sidebarItemCount}>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.sidebarItemActions}>
          <button
            className={styles.sidebarActionBtn}
            onClick={(e) => { e.stopPropagation(); openEditList(list.id); }}
            title="Edit list"
          >✎</button>
          <button
            className={`${styles.sidebarActionBtn} ${styles.sidebarDeleteBtn}`}
            onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id as ListId, list.name); }}
            title="Delete list"
          >✕</button>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>My Lists</span>
          <button className={styles.sidebarNewBtn} onClick={showAddList} title="New list">+</button>
        </div>

        <div className={styles.sidebarList}>
          {allLists.length === 0 ? (
            <div className={styles.sidebarEmpty}>
              <span>No lists yet</span>
              <button className={styles.sidebarEmptyBtn} onClick={showAddList}>Create one</button>
            </div>
          ) : (
            <>
              {watchlists.length > 0 && (
                <>
                  {referenceLists.length > 0 && (
                    <div className={styles.kindDivider}>Watchlists</div>
                  )}
                  {watchlists.map(renderSidebarItem)}
                </>
              )}
              {referenceLists.length > 0 && (
                <>
                  <div className={styles.kindDivider}>Reference</div>
                  {referenceLists.map(renderSidebarItem)}
                </>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className={styles.main}>
        {!selectedList ? (
          <div className={styles.emptyMain}>
            <span className={styles.emptyIcon}>📋</span>
            <p className={styles.emptyTitle}>No list selected</p>
            <p className={styles.emptyHint}>Create a list to get started</p>
            <button className={styles.emptyCreateBtn} onClick={showAddList}>New list</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className={styles.mainHeader}>
              <div className={styles.mainHeaderLeft}>
                <span className={styles.mainListIcon}>
                  {selectedList.icon ?? (selectedList.typeId ? listTypes[selectedList.typeId]?.icon : null) ?? '📋'}
                </span>
                <div>
                  <h2 className={styles.mainListName}>{selectedList.name}</h2>
                  {selectedList.description && (
                    <p className={styles.mainListDesc}>{selectedList.description}</p>
                  )}
                </div>
              </div>
              <div className={styles.mainHeaderRight}>
                <button
                  className={styles.addTabBtn}
                  onClick={() => { setAddingTab(true); setNewTabName(''); }}
                  title="Add tab"
                >
                  + Tab
                </button>
                <button
                  className={styles.headerIconBtn}
                  onClick={() => openEditList(selectedList.id)}
                  title="Edit list"
                >✎</button>
              </div>
            </div>

            {/* Tab bar */}
            {showTabBar && (
              <div className={styles.listTabs}>
                {hasTabs && (
                  <>
                    <button
                      className={`${styles.listTab} ${selectedTabId === 'all' ? styles.listTabActive : ''}`}
                      onClick={() => setSelectedTabId('all')}
                    >
                      All
                      <span className={styles.listTabCount}>{allItemsInList.length}</span>
                    </button>
                    {selectedList.tabs.map((tab) => {
                      const count = allItemsInList.filter((i) => i.tabId === tab.id).length;
                      const isActive = selectedTabId === tab.id;
                      return (
                        <button
                          key={tab.id}
                          className={`${styles.listTab} ${isActive ? styles.listTabActive : ''}`}
                          style={isActive && tab.color ? { color: tab.color, borderBottomColor: tab.color } : undefined}
                          onClick={() => setSelectedTabId(tab.id)}
                        >
                          {tab.name}
                          <span className={styles.listTabCount}>{count}</span>
                        </button>
                      );
                    })}
                  </>
                )}
                {addingTab ? (
                  <input
                    ref={tabInputRef}
                    className={styles.tabAddInput}
                    placeholder="Tab name…"
                    value={newTabName}
                    onChange={(e) => setNewTabName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleConfirmTab(); }
                      if (e.key === 'Escape') { setAddingTab(false); setNewTabName(''); }
                    }}
                    onBlur={() => {
                      if (newTabName.trim()) handleConfirmTab();
                      else { setAddingTab(false); setNewTabName(''); }
                    }}
                  />
                ) : (
                  <button
                    className={styles.tabAddShortcut}
                    onClick={() => { setAddingTab(true); setNewTabName(''); }}
                    title="Add tab"
                  >+</button>
                )}
              </div>
            )}

            {/* Status tabs — watchlist only */}
            {isWatchlist && (
              <div className={styles.statusTabs}>
                {STATUS_TABS.map((tab) => {
                  const count = tab.id === 'all' ? allItemsInList.length : countByStatus(tab.id as ListItemStatus);
                  return (
                    <button
                      key={tab.id}
                      className={`${styles.statusTab} ${statusFilter === tab.id ? styles.statusTabActive : ''}`}
                      onClick={() => setStatusFilter(tab.id)}
                    >
                      {tab.label}
                      <span className={styles.statusTabCount}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Content */}
            {isWatchlist ? (
              <div className={styles.itemsGrid}>
                {displayedItems.length === 0 && allItemsInList.length > 0 && (
                  <p className={styles.gridEmptyHint}>No items match this filter</p>
                )}
                {displayedItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    fieldSchema={selectedList.fieldSchema}
                    editingField={editingCell?.itemId === item.id ? editingCell.field : null}
                    onStartEdit={(field) => setEditingCell({ itemId: item.id, field })}
                    onCancelEdit={() => setEditingCell(null)}
                    onTitleSave={(title) => { updateListItem(item.id as ListItemId, { title }); setEditingCell(null); }}
                    onFieldSave={(fieldId, value) => { updateListItem(item.id as ListItemId, { data: { ...item.data, [fieldId]: value } }); setEditingCell(null); }}
                    onNotesSave={(notes) => { updateListItem(item.id as ListItemId, { notes }); setEditingCell(null); }}
                    onEdit={() => openEditListItem(item.id)}
                    onDelete={() => handleDeleteItem(item)}
                    onStatusChange={(status) => updateListItem(item.id as ListItemId, { status })}
                  />
                ))}
                <button
                  className={styles.addItemTile}
                  onClick={() => showAddListItem(selectedList.id, selectedTabId !== 'all' ? selectedTabId : null)}
                  title="Add item"
                >
                  <span className={styles.addItemTileIcon}>+</span>
                </button>
              </div>
            ) : (
              <div className={styles.refTableWrap}>
                <table className={styles.refTable}>
                  <thead>
                    <tr>
                      {tableFieldSchema.map((f) => (
                        <th key={f.id}>{f.name}</th>
                      ))}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map((item) => (
                      <tr key={item.id}>
                        {tableFieldSchema.map((f) => {
                          if (f.type === 'boolean') {
                            return (
                              <td
                                key={f.id}
                                className={styles.refCellClickable}
                                onClick={() => updateListItem(item.id as ListItemId, { data: { ...item.data, [f.id]: !item.data[f.id] } })}
                              >
                                <RefCell field={f} value={item.data[f.id]} />
                              </td>
                            );
                          }
                          if (f.type === 'rating') {
                            const n = typeof item.data[f.id] === 'number' ? item.data[f.id] as number : 0;
                            const max = f.max ?? 5;
                            return (
                              <td key={f.id}>
                                <span className={styles.stars}>
                                  {Array.from({ length: max }, (_, i) => (
                                    <span
                                      key={i}
                                      className={i < n ? styles.starFilled : styles.starEmpty}
                                      onClick={() => updateListItem(item.id as ListItemId, { data: { ...item.data, [f.id]: i + 1 === n ? 0 : i + 1 } })}
                                    >★</span>
                                  ))}
                                </span>
                              </td>
                            );
                          }
                          const isEditing = editingCell?.itemId === item.id && editingCell.field === f.id;
                          return (
                            <td
                              key={f.id}
                              className={isEditing ? undefined : styles.refCellClickable}
                              onClick={() => { if (!isEditing) setEditingCell({ itemId: item.id, field: f.id }); }}
                            >
                              {isEditing ? (
                                <FieldInput
                                  field={f}
                                  value={item.data[f.id]}
                                  onSave={(v) => { updateListItem(item.id as ListItemId, { data: { ...item.data, [f.id]: v } }); setEditingCell(null); }}
                                  onCancel={() => setEditingCell(null)}
                                />
                              ) : (
                                <RefCell field={f} value={item.data[f.id]} />
                              )}
                            </td>
                          );
                        })}
                        <td className={styles.rowActionsCell}>
                          <div className={styles.rowActions}>
                            <button
                              className={styles.rowActionBtn}
                              onClick={() => openEditListItem(item.id)}
                              title="Edit"
                            >✎</button>
                            <button
                              className={`${styles.rowActionBtn} ${styles.rowDeleteBtn}`}
                              onClick={() => handleDeleteItem(item)}
                              title="Delete"
                            >✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr
                      className={styles.addItemTableRow}
                      onClick={() => showAddListItem(selectedList.id, selectedTabId !== 'all' ? selectedTabId : null)}
                    >
                      <td
                        colSpan={tableFieldSchema.length + 1}
                        className={styles.addItemTableCell}
                      >
                        <span className={styles.addItemTableIcon}>+</span>
                        <span className={styles.addItemTableLabel}>Add item</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
