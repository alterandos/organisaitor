import { useState, useRef, useEffect, useMemo } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getVisibleNoteTagIds, getNoteEffectiveCollectionId } from '@/utils/notes';
import type { NoteTagId, CollectionId } from '@/types';
import type { NoteTag } from '@/types/notes';
import { NoteList } from './NoteList';
import { NoteEditor } from '../NoteEditor/NoteEditor';
import styles from './ChronicleView.module.css';

// ── Column order — extend here to add new panels in future ────────────────

const COLUMNS = ['tree', 'list', 'editor'] as const;
type ColId = (typeof COLUMNS)[number];

// ── Panel resize (drag the divider between panels) ─────────────────────────

const MIN_PANEL_WIDTH = 160;
const MAX_PANEL_WIDTH = 480;

type DragCol = 'tree' | 'list';

// ── Flatten visible tree ──────────────────────────────────────────────────

type FlatItem = { tag: NoteTag; depth: number };

function flattenVisible(
  noteTags: Record<string, NoteTag>,
  expandedIds: NoteTagId[],
  visibleTagIds: Set<string> | null,
  parentId: NoteTagId | null = null,
  depth = 0,
): FlatItem[] {
  const children = Object.values(noteTags)
    .filter((t) => t.parentTagId === parentId && t.kind === 'area' && (!visibleTagIds || visibleTagIds.has(t.id)))
    .sort((a, b) => a.order - b.order);
  const result: FlatItem[] = [];
  for (const tag of children) {
    result.push({ tag, depth });
    if (expandedIds.includes(tag.id as NoteTagId)) {
      result.push(...flattenVisible(noteTags, expandedIds, visibleTagIds, tag.id as NoteTagId, depth + 1));
    }
  }
  return result;
}

// Get top-level notes for a tag, sorted newest-first (mirrors NoteList sort); when an
// Endeavour is focused, only notes whose effective Endeavour matches are included.
function getTopLevelNotes(
  notesRecord: Record<string, { id: string; tagIds: string[]; archivedAt: string | null; parentId: string | null; updatedAt: string; collectionId: CollectionId | null }>,
  noteTags: Record<string, NoteTag>,
  tagId: string,
  activeCollectionId: CollectionId | null,
) {
  return Object.values(notesRecord)
    .filter((n) => n.tagIds.includes(tagId) && !n.archivedAt && !n.parentId)
    .filter((n) => !activeCollectionId || getNoteEffectiveCollectionId(n, noteTags) === activeCollectionId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// ── Tree node (recursive) ─────────────────────────────────────────────────

interface TreeNodeProps {
  tag: NoteTag;
  depth: number;
  kbFocused: boolean;
  visibleTagIds: Set<string> | null;
}

function NoteTagTreeNode({ tag, depth, kbFocused, visibleTagIds }: TreeNodeProps) {
  const noteTags          = useNoteStore((s) => s.noteTags);
  const deleteNoteTag     = useNoteStore((s) => s.deleteNoteTag);
  const indentNoteTag     = useNoteStore((s) => s.indentNoteTag);
  const outdentNoteTag    = useNoteStore((s) => s.outdentNoteTag);
  const selectedNoteTagId = useUIStore((s) => s.selectedNoteTagId);
  const expandedIds       = useUIStore((s) => s.expandedNoteTagIds);
  const toggleExpanded    = useUIStore((s) => s.toggleNoteTagExpanded);
  const setSelected       = useUIStore((s) => s.setSelectedNoteTag);
  const showAddNoteTag    = useUIStore((s) => s.showAddNoteTag);
  const openEditNoteTag   = useUIStore((s) => s.openEditNoteTag);

  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const children = Object.values(noteTags)
    .filter((t) => t.parentTagId === tag.id && (!visibleTagIds || visibleTagIds.has(t.id)))
    .sort((a, b) => a.order - b.order);

  const siblings = Object.values(noteTags)
    .filter((t) => t.parentTagId === tag.parentTagId && t.kind === 'area')
    .sort((a, b) => a.order - b.order);
  const myPos = siblings.findIndex((t) => t.id === tag.id);
  const canIndent  = myPos > 0;
  const canOutdent = tag.parentTagId !== null;

  const hasChildren = children.length > 0;
  const isPermanentlyExpanded = expandedIds.includes(tag.id as NoteTagId);
  const isExpanded  = isPermanentlyExpanded || hoverExpanded;
  const isSelected  = selectedNoteTagId === tag.id;

  const handleMouseEnter = () => {
    if (!hasChildren) return;
    hoverTimer.current = setTimeout(() => setHoverExpanded(true), 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverExpanded(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${tag.name}" and all its contents?`)) return;
    deleteNoteTag(tag.id as NoteTagId);
    if (isSelected) setSelected(null);
  };

  return (
    <div
      className={styles.treeNodeGroup}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`${styles.treeNode} ${isSelected ? styles.treeNodeSelected : ''} ${kbFocused ? styles.treeNodeKbFocused : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <button
          className={styles.toggleBtn}
          onClick={() => toggleExpanded(tag.id as NoteTagId)}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren
            ? (isExpanded ? '▾' : '▸')
            : <span className={styles.togglePlaceholder} />}
        </button>

        <button
          className={styles.nodeContent}
          onClick={() => {
            setSelected(tag.id as NoteTagId);
            if (hasChildren && !isPermanentlyExpanded) toggleExpanded(tag.id as NoteTagId);
          }}
        >
          <span className={styles.nodeIcon}>{tag.icon || (tag.kind === 'tag' ? '🏷️' : '📁')}</span>
          <span
            className={styles.nodeName}
            style={tag.color ? { color: isSelected ? tag.color : undefined } : undefined}
          >
            {tag.name}
          </span>
        </button>

        <div className={styles.nodeActions}>
          {canIndent && (
            <button
              className={styles.nodeActionBtn}
              onClick={(e) => { e.stopPropagation(); indentNoteTag(tag.id as NoteTagId); }}
              title="Make sub-section of the one above"
            >↳</button>
          )}
          {canOutdent && (
            <button
              className={styles.nodeActionBtn}
              onClick={(e) => { e.stopPropagation(); outdentNoteTag(tag.id as NoteTagId); }}
              title="Move up one level"
            >↰</button>
          )}
          <button
            className={styles.nodeActionBtn}
            onClick={(e) => { e.stopPropagation(); showAddNoteTag(tag.id as NoteTagId); }}
            title="Add section"
          >+</button>
          <button
            className={styles.nodeActionBtn}
            onClick={(e) => { e.stopPropagation(); openEditNoteTag(tag.id); }}
            title="Edit"
          >✎</button>
          <button
            className={`${styles.nodeActionBtn} ${styles.nodeActionDelete}`}
            onClick={handleDelete}
            title="Delete"
          >×</button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {children.map((child) => (
            <NoteTagTreeNode key={child.id} tag={child} depth={depth + 1} kbFocused={false} visibleTagIds={visibleTagIds} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────

export function ChronicleView() {
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);

  // Panel resize — persisted width per panel, with a live drag override while dragging
  const chronicleTreeWidth    = useSettingsStore((s) => s.chronicleTreeWidth);
  const chronicleListWidth    = useSettingsStore((s) => s.chronicleListWidth);
  const setChronicleTreeWidth = useSettingsStore((s) => s.setChronicleTreeWidth);
  const setChronicleListWidth = useSettingsStore((s) => s.setChronicleListWidth);
  const [dragCol, setDragCol]           = useState<DragCol | null>(null);
  const [liveTreeWidth, setLiveTreeWidth] = useState<number | null>(null);
  const [liveListWidth, setLiveListWidth] = useState<number | null>(null);
  const dragStateRef = useRef<{ col: DragCol; startX: number; startWidth: number; current: number } | null>(null);

  const treeWidth = liveTreeWidth ?? chronicleTreeWidth;
  const listWidth = liveListWidth ?? chronicleListWidth;

  const startDrag = (col: DragCol) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startWidth = col === 'tree' ? chronicleTreeWidth : chronicleListWidth;
    dragStateRef.current = { col, startX: e.clientX, startWidth, current: startWidth };
    setDragCol(col);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const d = dragStateRef.current;
      if (!d) return;
      const next = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, d.startWidth + (e.clientX - d.startX)));
      d.current = next;
      if (d.col === 'tree') setLiveTreeWidth(next); else setLiveListWidth(next);
    };
    const handleUp = () => {
      const d = dragStateRef.current;
      if (!d) return;
      if (d.col === 'tree') setChronicleTreeWidth(d.current); else setChronicleListWidth(d.current);
      dragStateRef.current = null;
      setDragCol(null);
      setLiveTreeWidth(null);
      setLiveListWidth(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation — which column has focus
  const [focusedCol, setFocusedCol] = useState<ColId>('tree');
  const focusedColRef = useRef<ColId>('tree');
  focusedColRef.current = focusedCol;

  // Signal to focus the Tiptap editor (incremented each time we enter the editor column)
  const [editorFocusSignal, setEditorFocusSignal] = useState(0);
  // Most recent nav column before entering the editor (so Ctrl+Left returns here)
  const lastNavColRef = useRef<Exclude<ColId, 'editor'>>('list');

  const noteTags          = useNoteStore((s) => s.noteTags);
  const selectedNoteTagId = useUIStore((s) => s.selectedNoteTagId);
  const editingNoteId     = useUIStore((s) => s.editingNoteId);
  const showAddNoteTag    = useUIStore((s) => s.showAddNoteTag);
  const showAddNote       = useUIStore((s) => s.showAddNote);
  const activeCollectionId = useUIStore(selectActiveCollectionId) as CollectionId | null;

  // When an Endeavour is focused (header dropdown), only show notebooks that belong to
  // it — plus their ancestors, so the tree stays navigable down to them.
  const visibleTagIds = useMemo(
    () => (activeCollectionId ? getVisibleNoteTagIds(noteTags, activeCollectionId) : null),
    [noteTags, activeCollectionId]
  );

  const rootTags = Object.values(noteTags)
    .filter((t) => t.parentTagId === null && t.kind === 'area' && (!visibleTagIds || visibleTagIds.has(t.id)))
    .sort((a, b) => a.order - b.order);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  // Reads all dynamic state from getState() so the effect runs once and never goes stale.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const uiState = useUIStore.getState();
      if (uiState.openModal) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true')) return;

      const col = focusedColRef.current;
      const noteState = useNoteStore.getState();
      const activeCollection = selectActiveCollectionId(uiState) as CollectionId | null;
      const visible = activeCollection ? getVisibleNoteTagIds(noteState.noteTags, activeCollection) : null;

      // ── Ctrl+Tab: hand keyboard focus to the editor column ──────────────
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'Tab') {
        e.preventDefault();
        if (col !== 'editor') {
          lastNavColRef.current = col as Exclude<ColId, 'editor'>;
          setEditorFocusSignal((s) => s + 1);
          setFocusedCol('editor');
        }
        return;
      }

      // ── Up / Down / PageUp / PageDown: navigate within the focused column ─
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp') {
        const dir = (e.key === 'ArrowDown' || e.key === 'PageDown') ? 1 : -1;

        if (col === 'tree') {
          e.preventDefault();
          const flat = flattenVisible(noteState.noteTags, uiState.expandedNoteTagIds, visible);
          if (flat.length === 0) return;
          const idx = flat.findIndex((item) => item.tag.id === uiState.selectedNoteTagId);
          const next = flat[Math.max(0, Math.min(flat.length - 1, idx + dir))];
          uiState.setSelectedNoteTag(next.tag.id as NoteTagId);

        } else if (col === 'list') {
          e.preventDefault();
          const tagId = uiState.selectedNoteTagId;
          if (!tagId) return;
          const ns = getTopLevelNotes(noteState.notes, noteState.noteTags, tagId, activeCollection);
          if (ns.length === 0) return;
          const idx = ns.findIndex((n) => n.id === uiState.editingNoteId);
          // If nothing is selected yet, start at the appropriate end
          const startIdx = idx === -1 ? (dir === 1 ? 0 : ns.length - 1) : Math.max(0, Math.min(ns.length - 1, idx + dir));
          uiState.openNote(ns[startIdx].id);
        }
        // editor column: arrow keys belong to Tiptap, don't intercept
        return;
      }

      // ── Right: advance to next column (column-specific pre-checks first) ─
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const colIdx = COLUMNS.indexOf(col);

        if (col === 'tree') {
          const tagId = uiState.selectedNoteTagId;
          if (!tagId) {
            const flat = flattenVisible(noteState.noteTags, uiState.expandedNoteTagIds, visible);
            if (flat.length > 0) uiState.setSelectedNoteTag(flat[0].tag.id as NoteTagId);
            return;
          }
          const hasChildren = Object.values(noteState.noteTags).some(
            (t) => t.parentTagId === tagId && t.kind === 'area' && (!visible || visible.has(t.id))
          );
          if (hasChildren && !uiState.expandedNoteTagIds.includes(tagId)) {
            uiState.toggleNoteTagExpanded(tagId);
            return; // expand first, don't advance column yet
          }
          // Seed the list with the first note if nothing is open
          const ns = getTopLevelNotes(noteState.notes, noteState.noteTags, tagId, activeCollection);
          if (ns.length > 0 && !uiState.editingNoteId) uiState.openNote(ns[0].id);
        }

        const nextCol = COLUMNS[colIdx + 1];
        if (nextCol) {
          if (nextCol === 'editor') {
            // Remember where we came from so Ctrl+Left can return here
            lastNavColRef.current = col as Exclude<ColId, 'editor'>;
            // Signal NoteEditor to grab keyboard focus
            setEditorFocusSignal((s) => s + 1);
          }
          setFocusedCol(nextCol);
        }
        return;
      }

      // ── Left: retreat to previous column (column-specific pre-checks first) ─
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const colIdx = COLUMNS.indexOf(col);

        if (col === 'tree') {
          // Collapse selected tag if it's expanded, rather than going left (already leftmost)
          const tagId = uiState.selectedNoteTagId;
          if (tagId && uiState.expandedNoteTagIds.includes(tagId)) {
            uiState.toggleNoteTagExpanded(tagId);
          }
          return;
        }

        const prevCol = COLUMNS[colIdx - 1];
        if (prevCol) setFocusedCol(prevCol);
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // empty deps — all state read via getState(), focusedCol via ref

  return (
    <div className={styles.container}>

      {/* ── Panel 1: Notebook tree ───────────────────────────────────────── */}
      <div
        className={`${styles.panel} ${styles.treePanel} ${treeCollapsed ? styles.panelCollapsed : ''} ${focusedCol === 'tree' ? styles.panelFocused : ''} ${dragCol ? styles.panelNoTransition : ''}`}
        style={!treeCollapsed ? { width: treeWidth, minWidth: MIN_PANEL_WIDTH } : undefined}
      >
        {treeCollapsed ? (
          <button className={styles.expandStrip} onClick={() => setTreeCollapsed(false)} title="Expand notebooks">▸</button>
        ) : (
          <>
            <div className={styles.panelHeader}>
              <span className={styles.panelLabel}>Chronicle</span>
              <div className={styles.panelActions}>
                <button className={styles.panelIconBtn} onClick={() => showAddNoteTag(null)} title="New notebook">+</button>
                <button className={styles.panelIconBtn} onClick={() => setTreeCollapsed(true)} title="Collapse">◀</button>
              </div>
            </div>
            <div className={styles.panelBody}>
              {rootTags.length === 0 ? (
                <div className={styles.panelEmpty}>
                  <p>{visibleTagIds ? 'No notebooks in this Endeavour.' : 'No notebooks yet.'}</p>
                  <button className={styles.panelEmptyLink} onClick={() => showAddNoteTag(null)}>Create one</button>
                </div>
              ) : rootTags.map((tag) => (
                <NoteTagTreeNode
                  key={tag.id}
                  tag={tag}
                  depth={0}
                  kbFocused={false}
                  visibleTagIds={visibleTagIds}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {!treeCollapsed && (
        <div
          className={`${styles.divider} ${dragCol === 'tree' ? styles.dividerActive : ''}`}
          onMouseDown={startDrag('tree')}
        />
      )}

      {/* ── Panel 2: Note list ───────────────────────────────────────────── */}
      <div
        className={`${styles.panel} ${styles.listPanel} ${listCollapsed ? styles.panelCollapsed : ''} ${focusedCol === 'list' ? styles.panelFocused : ''} ${dragCol ? styles.panelNoTransition : ''}`}
        style={!listCollapsed ? { width: listWidth, minWidth: MIN_PANEL_WIDTH } : undefined}
        onClick={() => setFocusedCol('list')}
      >
        {listCollapsed ? (
          <button className={styles.expandStrip} onClick={() => setListCollapsed(false)} title="Expand note list">▸</button>
        ) : (
          <>
            <div className={styles.panelHeader}>
              <span className={styles.panelLabel}>Notes</span>
              <div className={styles.panelActions}>
                <button className={styles.panelIconBtn} onClick={showAddNote} title="New note" disabled={!selectedNoteTagId}>+</button>
                <button className={styles.panelIconBtn} onClick={() => setListCollapsed(true)} title="Collapse">◀</button>
              </div>
            </div>
            <div className={styles.panelBody}>
              {selectedNoteTagId ? (
                <NoteList tagId={selectedNoteTagId} onAddNote={showAddNote} hideHeader />
              ) : (
                <div className={styles.panelEmpty}><p>Select a notebook</p></div>
              )}
            </div>
          </>
        )}
      </div>

      {!listCollapsed && (
        <div
          className={`${styles.divider} ${dragCol === 'list' ? styles.dividerActive : ''}`}
          onMouseDown={startDrag('list')}
        />
      )}

      {/* ── Panel 3: Editor ─────────────────────────────────────────────── */}
      <div
        className={`${styles.panel} ${styles.editorPanel} ${focusedCol === 'editor' ? styles.panelFocused : ''}`}
        onClick={() => setFocusedCol('editor')}
      >
        {editingNoteId ? (
          <NoteEditor
            focusSignal={editorFocusSignal}
            onNavReturn={() => setFocusedCol(lastNavColRef.current)}
          />
        ) : (
          <div className={styles.editorEmpty}>
            {selectedNoteTagId ? 'Select a note to edit, or create a new one' : 'Select a notebook to get started'}
          </div>
        )}
      </div>

    </div>
  );
}
