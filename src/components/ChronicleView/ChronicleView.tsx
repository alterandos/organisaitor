import { useState, useRef, useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getVisibleNoteTagIds, getNoteEffectiveCollectionId, getNotebookIcon } from '@/utils/notes';
import type { NoteTagId, CollectionId } from '@/types';
import type { NoteTag } from '@/types/notes';
import { NoteList } from './NoteList';
import { NotebookLocationView } from './NotebookLocationView';
import { NoteEditor } from '../NoteEditor/NoteEditor';
import { TruncatedText } from '@/components/TruncatedText/TruncatedText';
import styles from './ChronicleView.module.css';
import { LABELS } from '@/config/labels';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';

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

// Is `candidateId` somewhere in `ancestorId`'s subtree? Used to refuse a drop that would
// nest a notebook inside its own descendant (which would create a cycle).
function isDescendantOf(
  noteTags: Record<string, NoteTag>,
  candidateId: string,
  ancestorId: string,
): boolean {
  let current: NoteTag | undefined = noteTags[candidateId];
  while (current?.parentTagId) {
    if (current.parentTagId === ancestorId) return true;
    current = noteTags[current.parentTagId];
  }
  return false;
}

// Explorer/VS-Code-sidebar-style three-zone drop: the top/bottom quarter of a row means
// "reorder as a sibling before/after this one" (possibly under a different parent — whatever
// parent the target belongs to), the middle half means "nest inside this one".
type DropZone = 'before' | 'inside' | 'after';

function zoneForOffset(offsetY: number, height: number): DropZone {
  if (offsetY < height * 0.25) return 'before';
  if (offsetY > height * 0.75) return 'after';
  return 'inside';
}

// New parent a drop would assign, depending on zone: 'inside' nests under the target itself,
// 'before'/'after' place the dragged item as a sibling of the target (under target's own parent).
function newParentForZone(target: NoteTag, zone: DropZone): NoteTagId | null {
  return zone === 'inside' ? (target.id as NoteTagId) : target.parentTagId;
}

function canAcceptZone(
  noteTags: Record<string, NoteTag>,
  draggedId: string,
  target: NoteTag,
  zone: DropZone,
): boolean {
  if (draggedId === target.id) return false;
  const newParent = newParentForZone(target, zone);
  if (newParent === draggedId) return false;
  if (newParent && isDescendantOf(noteTags, newParent, draggedId)) return false;
  return true;
}

// Order value that places the dragged item immediately before/after `target` among target's
// siblings (its current parent's children) — a midpoint between the two neighbouring `order`
// values, the same "don't renumber everyone" convention indentNoteTag/outdentNoteTag already use.
function computeInsertOrder(
  noteTags: Record<string, NoteTag>,
  target: NoteTag,
  zone: 'before' | 'after',
  draggedId: string,
): number {
  const siblings = Object.values(noteTags)
    .filter((t) => t.parentTagId === target.parentTagId && t.kind === 'area' && t.id !== draggedId)
    .sort((a, b) => a.order - b.order);
  const idx = siblings.findIndex((t) => t.id === target.id);
  if (zone === 'before') {
    const prev = siblings[idx - 1];
    return prev ? (prev.order + target.order) / 2 : target.order - 1;
  }
  const next = siblings[idx + 1];
  return next ? (target.order + next.order) / 2 : target.order + 1;
}

interface DragOverInfo { tagId: string; zone: DropZone }

interface TreeNodeProps {
  tag: NoteTag;
  depth: number;
  kbFocused: boolean;
  visibleTagIds: Set<string> | null;
  draggingTagId: string | null;
  dragOverInfo: DragOverInfo | null;
  draggingTagIdRef: RefObject<string | null>;
  dragOverZoneRef: RefObject<DropZone | null>;
  onDragStartTag: (id: NoteTagId) => void;
  onDragOverTag: (id: NoteTagId, zone: DropZone) => void;
  onDragLeaveTag: (id: NoteTagId) => void;
  onDragEndTag: () => void;
}

function NoteTagTreeNode({
  tag, depth, kbFocused, visibleTagIds,
  draggingTagId, dragOverInfo, draggingTagIdRef, dragOverZoneRef,
  onDragStartTag, onDragOverTag, onDragLeaveTag, onDragEndTag,
}: TreeNodeProps) {
  const noteTags          = useNoteStore((s) => s.noteTags);
  const notes             = useNoteStore((s) => s.notes);
  const deleteNoteTag     = useNoteStore((s) => s.deleteNoteTag);
  const indentNoteTag     = useNoteStore((s) => s.indentNoteTag);
  const outdentNoteTag    = useNoteStore((s) => s.outdentNoteTag);
  const updateNoteTag     = useNoteStore((s) => s.updateNoteTag);
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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmDelete('notebook', tag.name, 'All its contents will be deleted too.'))) return;
    deleteNoteTag(tag.id as NoteTagId);
    if (isSelected) setSelected(null);
  };

  // Explorer/VS-Code-sidebar-style drag-and-drop: drop near the top/bottom edge of a row to
  // reorder as a sibling before/after it (possibly reparenting to wherever the target lives);
  // drop in the middle to nest inside it. Refused (no highlight, dropEffect 'none') when it's
  // a no-op or would create a cycle.
  const isDragging = draggingTagId === tag.id;
  const isDropBefore = dragOverInfo?.tagId === tag.id && dragOverInfo.zone === 'before';
  const isDropInside = dragOverInfo?.tagId === tag.id && dragOverInfo.zone === 'inside';
  const isDropAfter  = dragOverInfo?.tagId === tag.id && dragOverInfo.zone === 'after';

  return (
    <div
      className={styles.treeNodeGroup}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={[
          styles.treeNode,
          isSelected ? styles.treeNodeSelected : '',
          kbFocused ? styles.treeNodeKbFocused : '',
          isDragging ? styles.treeNodeDragging : '',
          isDropInside ? styles.treeNodeDropTarget : '',
          isDropBefore ? styles.treeNodeDropBefore : '',
          isDropAfter ? styles.treeNodeDropAfter : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        draggable
        onDragStart={(e) => {
          onDragStartTag(tag.id as NoteTagId);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', tag.id);
        }}
        onDragOver={(e) => {
          const draggedId = draggingTagIdRef.current;
          if (!draggedId) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const zone = zoneForOffset(e.clientY - rect.top, rect.height);
          if (!canAcceptZone(noteTags, draggedId, tag, zone)) {
            e.dataTransfer.dropEffect = 'none';
            if (dragOverInfo?.tagId === tag.id) onDragLeaveTag(tag.id as NoteTagId);
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOverTag(tag.id as NoteTagId, zone);
        }}
        onDragLeave={(e) => {
          if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
          if (dragOverInfo?.tagId === tag.id) onDragLeaveTag(tag.id as NoteTagId);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = draggingTagIdRef.current;
          const zone = dragOverZoneRef.current;
          onDragEndTag();
          if (!draggedId || !zone || !canAcceptZone(noteTags, draggedId, tag, zone)) return;
          const newParentId = newParentForZone(tag, zone);
          if (zone === 'inside') {
            updateNoteTag(draggedId as NoteTagId, { parentTagId: newParentId, order: 999 });
            if (!expandedIds.includes(tag.id as NoteTagId)) toggleExpanded(tag.id as NoteTagId);
          } else {
            const order = computeInsertOrder(noteTags, tag, zone, draggedId);
            updateNoteTag(draggedId as NoteTagId, { parentTagId: newParentId, order });
          }
        }}
        onDragEnd={onDragEndTag}
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
          <span className={styles.nodeIcon}>{getNotebookIcon(tag, noteTags, notes)}</span>
          <TruncatedText
            text={tag.name}
            className={styles.nodeName}
            style={tag.color ? { color: isSelected ? tag.color : undefined } : undefined}
          />
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
            <NoteTagTreeNode
              key={child.id}
              tag={child}
              depth={depth + 1}
              kbFocused={false}
              visibleTagIds={visibleTagIds}
              draggingTagId={draggingTagId}
              dragOverInfo={dragOverInfo}
              draggingTagIdRef={draggingTagIdRef}
              dragOverZoneRef={dragOverZoneRef}
              onDragStartTag={onDragStartTag}
              onDragOverTag={onDragOverTag}
              onDragLeaveTag={onDragLeaveTag}
              onDragEndTag={onDragEndTag}
            />
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

  // Chronicle tree drag-and-drop (nest inside, or reorder before/after — Explorer-style).
  // The dragging id and drop zone are each mirrored into a ref so drop handlers always read
  // the live value (same pattern used for the note-tab drag-and-drop below), since a drop can
  // land on a node in a completely different branch than where the drag started.
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<DragOverInfo | null>(null);
  const draggingTagIdRef = useRef<string | null>(null);
  const dragOverZoneRef  = useRef<DropZone | null>(null);
  const onDragStartTag = (id: NoteTagId) => { draggingTagIdRef.current = id; setDraggingTagId(id); };
  const onDragOverTag = (id: NoteTagId, zone: DropZone) => {
    dragOverZoneRef.current = zone;
    setDragOverInfo((prev) => prev?.tagId === id && prev.zone === zone ? prev : { tagId: id, zone });
  };
  const onDragLeaveTag = (id: NoteTagId) => {
    setDragOverInfo((prev) => prev?.tagId === id ? null : prev);
    if (dragOverZoneRef.current !== null) dragOverZoneRef.current = null;
  };
  const onDragEndTag = () => {
    draggingTagIdRef.current = null;
    dragOverZoneRef.current = null;
    setDraggingTagId(null);
    setDragOverInfo(null);
  };

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
  const notes             = useNoteStore((s) => s.notes);
  const selectedNoteTagId = useUIStore((s) => s.selectedNoteTagId);
  const editingNoteId     = useUIStore((s) => s.editingNoteId);
  const showAddNoteTag   = useUIStore((s) => s.showAddNoteTag);
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

      // ── Ctrl+`: hand keyboard focus to the editor column (previously Ctrl+Tab — moved so
      // Ctrl+Tab/Ctrl+Shift+Tab could become NoteEditor's tab-cycle shortcut instead) ──────
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '`') {
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
                  <p>{visibleTagIds ? `${LABELS.noneInCollection('notebooks')}.` : 'No notebooks yet.'}</p>
                  <button className={styles.panelEmptyLink} onClick={() => showAddNoteTag(null)}>Create one</button>
                </div>
              ) : rootTags.map((tag) => (
                <NoteTagTreeNode
                  key={tag.id}
                  tag={tag}
                  depth={0}
                  kbFocused={false}
                  visibleTagIds={visibleTagIds}
                  draggingTagId={draggingTagId}
                  dragOverInfo={dragOverInfo}
                  draggingTagIdRef={draggingTagIdRef}
                  dragOverZoneRef={dragOverZoneRef}
                  onDragStartTag={onDragStartTag}
                  onDragOverTag={onDragOverTag}
                  onDragLeaveTag={onDragLeaveTag}
                  onDragEndTag={onDragEndTag}
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
        ) : selectedNoteTagId && noteTags[selectedNoteTagId] ? (
          <NotebookLocationView
            tagId={selectedNoteTagId}
            noteIds={getTopLevelNotes(notes, noteTags, selectedNoteTagId, activeCollectionId).map((n) => n.id)}
            visibleTagIds={visibleTagIds}
          />
        ) : (
          <div className={styles.editorEmpty}>Select a notebook to get started</div>
        )}
      </div>

    </div>
  );
}
