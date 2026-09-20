import { useState, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { useListStore } from '@/store/listStore';
import { useListViews, useListItemViews } from '@/store/listViews';
import { isListLocked } from '@/services/listSecrets';
import { onVaultStatus } from '@/services/vault';
import { useUIStore } from '@/store/uiStore';
import { useRecentItemsStore } from '@/store/recentItemsStore';
import { LIST_ITEM_STATUS_META } from '@/types/lists';
import type { ListId, ListItemId, ListItemStatus, ListItem, ListFieldSchema } from '@/types/lists';
import styles from './ListsSection.module.css';
import { alertDialog, confirmDelete } from '@/components/ConfirmDialog/dialogs';

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
        if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
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
              if (e.key === 'Escape') { e.stopPropagation(); onCancelEdit(); }
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
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancelEdit(); } }}
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
  // Read lists/items THROUGH the views: an encrypted list's name/fields/tabs and its items'
  // contents are blank in the store (see services/listSecrets.ts). `rawLists` is only for the
  // lock check. Writes below go through store actions that route encrypted lists themselves.
  const lists      = useListViews();
  const listItems  = useListItemViews();
  const rawLists   = useListStore((s) => s.lists);
  const listTypes  = useListStore((s) => s.listTypes);
  const encryptList = useListStore((s) => s.encryptList);
  const requestDecrypt = useUIStore((s) => s.requestDecrypt);
  const openAccount    = useUIStore((s) => s.openAccount);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  useEffect(() => onVaultStatus((s) => setVaultUnlocked(s === 'unlocked')), []);
  const deleteList     = useListStore((s) => s.deleteList);
  const updateList     = useListStore((s) => s.updateList);
  const updateListItem = useListStore((s) => s.updateListItem);
  const deleteListItem = useListStore((s) => s.deleteListItem);

  const showAddList       = useUIStore((s) => s.showAddList);
  const openEditList      = useUIStore((s) => s.openEditList);
  const showAddListItem   = useUIStore((s) => s.showAddListItem);
  const openEditListItem  = useUIStore((s) => s.openEditListItem);
  const setActiveListId   = useUIStore((s) => s.setActiveListId);
  const setListsLastActive = useUIStore((s) => s.setListsLastActive);

  // Seeded once from the last-active list/tab (uiStore.listsLastActiveListId/TabId) so
  // switching to another app and back restores the same list+tab — the effect below
  // already falls back to the first list if the remembered id no longer exists.
  const [selectedListId, setSelectedListId] = useState<ListId | null>(
    () => (useUIStore.getState().listsLastActiveListId as ListId | null) ?? null
  );
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all');
  const [selectedTabId,  setSelectedTabId]  = useState<string | 'all'>(
    () => useUIStore.getState().listsLastActiveTabId ?? 'all'
  );
  const [addingTab,      setAddingTab]      = useState(false);
  const [newTabName,     setNewTabName]     = useState('');
  const [editingCell,    setEditingCell]    = useState<{ itemId: string; field: string } | null>(null);
  const tabInputRef = useRef<HTMLInputElement>(null);

  // Two-area keyboard navigation, the same idea as Chronicle's tree/list/editor columns
  // (ChronicleView.tsx) but simplified to just "the sidebar list of lists" vs "everything else"
  // — Lists has no equivalent of Chronicle's multi-column drill-down, so up/down between lists
  // is all the nav area needs for now. Ctrl+` swaps focus between the two areas.
  const [focusedArea, setFocusedArea] = useState<'nav' | 'content'>('nav');

  // Tab drag-and-drop reordering — same left/right-side-drop convention as NoteEditor's
  // tab bar (NoteEditor.tsx). "All" is a pinned pseudo-tab (not a real ListTab), so it's
  // never draggable and never a drop target; only entries in selectedList.tabs reorder.
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [tabDragOverInfo, setTabDragOverInfo] = useState<{ tabId: string; side: 'left' | 'right' } | null>(null);
  const draggingTabIdRef = useRef<string | null>(null);
  const tabDragOverIdRef = useRef<string | null>(null);
  const tabDragOverSideRef = useRef<'left' | 'right'>('right');
  const startTabDrag = (tabId: string) => { draggingTabIdRef.current = tabId; setDraggingTabId(tabId); };
  const updateTabDragOver = (tabId: string, side: 'left' | 'right') => {
    tabDragOverIdRef.current = tabId;
    tabDragOverSideRef.current = side;
    setTabDragOverInfo((prev) => prev?.tabId === tabId && prev.side === side ? prev : { tabId, side });
  };
  const clearTabDrag = () => {
    draggingTabIdRef.current = null;
    tabDragOverIdRef.current = null;
    setDraggingTabId(null);
    setTabDragOverInfo(null);
  };

  const allLists = Object.values(lists).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const selectedList = selectedListId ? lists[selectedListId] : null;
  const selectedRaw  = selectedListId ? rawLists[selectedListId] : null;
  const selectedListLocked = !!selectedRaw && isListLocked(selectedRaw);

  // Visual sidebar order (watchlists group, then reference group) — used both by the sidebar
  // render below and by the arrow-key nav-area handler, so pressing ↓ always lands on whatever
  // list actually appears next on screen.
  const navOrder = [
    ...allLists.filter((l) => l.kind === 'watchlist'),
    ...allLists.filter((l) => l.kind !== 'watchlist'),
  ];

  // Keep a valid list selected: fall back to the first list when the selected one is deleted, and
  // pick the first one when nothing is selected yet (adjusts state during render, not in an effect).
  if (selectedListId && !lists[selectedListId]) {
    setSelectedListId(allLists[0]?.id ?? null);
  } else if (!selectedListId && allLists.length > 0) {
    setSelectedListId(allLists[0].id as ListId);
  }

  useEffect(() => {
    setActiveListId(selectedListId);
    return () => setActiveListId(null);
  }, [selectedListId, setActiveListId]);

  // A restored tab id (or one whose tab was since deleted) that no longer exists on the
  // current list falls back to "All", same as removeListTab's own tabId reassignment.
  // (Skipped while the list is locked: its view has no tabs, but they're not gone — resetting
  // here would throw away the remembered tab every time the vault locks or hasn't unlocked yet.)
  if (!selectedListLocked && selectedTabId !== 'all' && !selectedList?.tabs?.some((t) => t.id === selectedTabId)) {
    setSelectedTabId('all');
  }

  // Mirrors the current list+tab into uiStore on every change (and therefore on unmount
  // too, via the cleanup's closure) so switching apps and back restores this same view —
  // kept separate from the activeListId effect above, which must keep clearing to null.
  useEffect(() => {
    return () => setListsLastActive(selectedListId, selectedTabId === 'all' ? null : selectedTabId);
  }, [selectedListId, selectedTabId, setListsLastActive]);

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

  function handleSelectList(id: ListId) {
    useRecentItemsStore.getState().recordVisit('list', id);
    setSelectedListId(id);
    setStatusFilter('all');
    setSelectedTabId('all');
    setAddingTab(false);
    setNewTabName('');
    setEditingCell(null);
  }

  // Ctrl+PgUp/PgDn *and* Ctrl+Tab/Ctrl+Shift+Tab both cycle through this list's tabs (All + each
  // named tab) — two bindings for the same action, matching the convention NoteEditor.tsx uses
  // for note tabs (Ctrl+Tab there was freed up for this once its old job — nav/editor toggle —
  // moved to Ctrl+`, so Lists follows the same split for consistency). Ctrl+T starts adding a
  // new tab (same convention as NoteEditor's Ctrl+T) — unlike cycling, this doesn't require
  // hasTabs: it's exactly what the header's own "+" button does, and is the only runtime way to
  // add a list's very first tab. Ctrl+` toggles which area (sidebar list-of-lists vs. the list's
  // own content/tabs) responds to plain ↑/↓, mirroring Chronicle's tree/list/editor column focus.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable;
      if (isTyping) return;

      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '`') {
        e.preventDefault();
        setFocusedArea((a) => (a === 'nav' ? 'content' : 'nav'));
        return;
      }

      if (!e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && focusedArea === 'nav' && navOrder.length > 0) {
        e.preventDefault();
        const curIdx = navOrder.findIndex((l) => l.id === selectedListId);
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = curIdx === -1 ? 0 : (curIdx + dir + navOrder.length) % navOrder.length;
        handleSelectList(navOrder[nextIdx].id as ListId);
        return;
      }

      if (!selectedList) return;
      if (e.ctrlKey && !e.altKey && (e.key === 'Tab' || e.key === 'PageUp' || e.key === 'PageDown')) {
        if (hasTabs) {
          e.preventDefault();
          const order: (string | 'all')[] = ['all', ...(selectedList.tabs ?? []).map((t) => t.id)];
          const curIdx = order.indexOf(selectedTabId);
          const dir = (e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey)) ? -1 : 1;
          const nextIdx = (curIdx + dir + order.length) % order.length;
          setSelectedTabId(order[nextIdx]);
        }
        return;
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setAddingTab(true);
        setNewTabName('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // navOrder/handleSelectList are recomputed fresh every render from `lists`/`allLists` (not
    // memoized), so depending on `lists` itself keeps this effect from re-subscribing on every
    // render while still capturing an up-to-date navOrder/handleSelectList whenever it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTabs, selectedList, selectedTabId, focusedArea, selectedListId, lists]);

  const displayedItems = allItemsInList
    .filter((i) => !hasTabs || selectedTabId === 'all' || i.tabId === selectedTabId)
    .filter((i) => !isWatchlist || statusFilter === 'all' || i.status === statusFilter)
    .sort((a, b) => a.order - b.order);

  const countByStatus = (s: ListItemStatus) => allItemsInList.filter((i) => i.status === s).length;

  const handleDeleteList = async (id: ListId, name: string) => {
    if (!(await confirmDelete('list', name, 'All its items will be deleted too.'))) return;
    deleteList(id);
  };

  const handleDeleteItem = async (item: ListItem) => {
    if (!(await confirmDelete('list item', item.title))) return;
    deleteListItem(item.id);
  };

  const handleConfirmTab = () => {
    if (!newTabName.trim() || !selectedListId || !selectedList) return;
    const tab = { id: nanoid(8), name: newTabName.trim(), color: null, fieldSchema: [] };
    updateList(selectedListId, { tabs: [...(selectedList.tabs ?? []), tab] });
    setNewTabName('');
    setAddingTab(false);
  };

  const handleTabDrop = () => {
    const dragging = draggingTabIdRef.current;
    const overTabId = tabDragOverIdRef.current;
    const overSide = tabDragOverSideRef.current;
    clearTabDrag();
    if (!dragging || !overTabId || dragging === overTabId || !selectedListId || !selectedList) return;
    const tabs = selectedList.tabs ?? [];
    const draggedTab = tabs.find((t) => t.id === dragging);
    if (!draggedTab) return;
    const rest = tabs.filter((t) => t.id !== dragging);
    const insertIdx = rest.findIndex((t) => t.id === overTabId);
    if (insertIdx === -1) return;
    const newTabs = [...rest];
    newTabs.splice(overSide === 'left' ? insertIdx : insertIdx + 1, 0, draggedTab);
    updateList(selectedListId, { tabs: newTabs });
  };

  // External navigation request (Quick Access, Ctrl+G) — see uiStore.requestListSelection's
  // doc comment for why this can't just write selectedListId directly. Goes through the same
  // handleSelectList as a sidebar click so it also records a visit and resets filters/tabs.
  const pendingListSelectionId  = useUIStore((s) => s.pendingListSelectionId);
  const clearPendingListSelection = useUIStore((s) => s.clearPendingListSelection);
  useEffect(() => {
    if (!pendingListSelectionId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consumes a one-shot selection request posted to uiStore by another section, then clears it
    if (lists[pendingListSelectionId as ListId]) handleSelectList(pendingListSelectionId as ListId);
    clearPendingListSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingListSelectionId, lists]);

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
          {!(rawLists[list.id as ListId] && isListLocked(rawLists[list.id as ListId])) && (
            <button
              className={styles.sidebarActionBtn}
              onClick={(e) => { e.stopPropagation(); openEditList(list.id); }}
              title="Edit list"
            >✎</button>
          )}
          <button
            className={`${styles.sidebarActionBtn} ${styles.sidebarDeleteBtn}`}
            onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id as ListId, list.name); }}
            title="Delete list"
          >✕</button>
        </div>
        {list.isEncrypted && (
          <button
            className={styles.lockBtn}
            onClick={(e) => { e.stopPropagation(); requestDecrypt('list', list.id); }}
            title="Encrypted list. Click to decrypt it"
            aria-label="Decrypt this list"
          >🔒</button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar} ${focusedArea === 'nav' ? styles.navAreaFocused : ''}`}>
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
                {selectedList.isEncrypted && (
                  <button
                    className={styles.headerIconBtn}
                    onClick={() => requestDecrypt('list', selectedList.id)}
                    title={selectedListLocked
                      ? 'Encrypted — locked on this device. Click to decrypt this list'
                      : 'Encrypted list. Click to decrypt it'}
                    aria-label="Decrypt this list"
                  >🔒</button>
                )}
                {!selectedList.isEncrypted && (
                  <button
                    className={styles.addTabBtn}
                    disabled={!vaultUnlocked}
                    onClick={() => {
                      encryptList(selectedList.id as ListId).catch((err) => {
                        console.error('[ListsSection] could not encrypt list:', err);
                        void alertDialog(err instanceof Error ? err.message : 'Could not encrypt this list.');
                      });
                    }}
                    title={vaultUnlocked
                      ? 'Encrypt this list (fully encrypts content uploaded to the cloud)'
                      : 'Unlock encryption in Account first'}
                  >
                    🔒 Encrypt
                  </button>
                )}
                {!selectedListLocked && (
                  <>
                    <button
                      className={styles.headerIconBtn}
                      onClick={() => openEditList(selectedList.id)}
                      title="Edit list"
                    >✎</button>
                  </>
                )}
              </div>
            </div>

            {selectedListLocked ? (
              <div className={styles.emptyMain}>
                <span className={styles.emptyIcon}>🔒</span>
                <p className={styles.emptyTitle}>This list is encrypted</p>
                <p className={styles.emptyHint}>
                  Encryption is locked on this device. Unlock it in Account to see this list’s contents.
                </p>
                <button className={styles.emptyCreateBtn} onClick={openAccount}>Unlock encryption</button>
              </div>
            ) : (
            <>
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
                          className={[
                            styles.listTab,
                            isActive ? styles.listTabActive : '',
                            draggingTabId === tab.id ? styles.listTabDragging : '',
                            tabDragOverInfo?.tabId === tab.id && tabDragOverInfo.side === 'left' ? styles.listTabDragBefore : '',
                            tabDragOverInfo?.tabId === tab.id && tabDragOverInfo.side === 'right' ? styles.listTabDragAfter : '',
                          ].filter(Boolean).join(' ')}
                          style={isActive && tab.color ? { color: tab.color, borderBottomColor: tab.color } : undefined}
                          draggable
                          onDragStart={(e) => {
                            startTabDrag(tab.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', tab.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (draggingTabIdRef.current === tab.id) return;
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const side: 'left' | 'right' = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
                            updateTabDragOver(tab.id, side);
                          }}
                          onDragLeave={(e) => {
                            if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
                            setTabDragOverInfo(null);
                            tabDragOverIdRef.current = null;
                          }}
                          onDrop={(e) => { e.preventDefault(); handleTabDrop(); }}
                          onDragEnd={clearTabDrag}
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
                      if (e.key === 'Escape') { e.stopPropagation(); setAddingTab(false); setNewTabName(''); }
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
          </>
        )}
      </main>
    </div>
  );
}
