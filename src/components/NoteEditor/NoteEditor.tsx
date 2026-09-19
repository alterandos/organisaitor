import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, getMarkRange } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import { ResizableImage } from './extensions/ResizableImage';
import { HeadingNumbering } from './extensions/HeadingNumbering';
import { SectionDocument, Section, ColumnBlock, Column, MAX_SECTION_COLUMNS } from './extensions/Section';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { NoteId, Note, CollectionId, StructuredTagEntryId } from '@/types';
import { NoteTagMark } from './extensions/NoteTagMark';
import { ArtifactLinkMark } from './extensions/ArtifactLinkMark';
import { FloatingToolbar } from './FloatingToolbar';
import { NoteTOC } from './NoteTOC';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { openExternalLink, normalizeLinkUrl } from '@/utils/links';
import { BUILTIN_TAGS, type BuiltinTag } from './builtinTags';
import { getStructuredTagType } from '@/config/structuredTagTypes';
import { StructuredTagPopover } from './StructuredTagPopover';
import { getNoteBreadcrumb } from '@/utils/notes';
import { selectActiveCollectionId } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { onVaultStatus, registerBeforeLock } from '@/services/vault';
import { noteView, entryView, isNoteLocked } from '@/services/noteSecrets';
import { useNoteView } from '@/store/noteViews';
import styles from './NoteEditor.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';

// Read a note by id THROUGH noteView() — an encrypted note's title/content/tabs are blanked in
// the store and only resolve via the plaintext cache (see services/noteSecrets.ts).
function viewOf(id: string | null | undefined): Note | undefined {
  if (!id) return undefined;
  const raw = useNoteStore.getState().notes[id as NoteId];
  return raw ? noteView(raw) : undefined;
}

// The document schema requires content to be `section+` (see extensions/Section.ts).
// Notes saved before the sections feature (or very old plain-text notes) have block
// nodes directly under doc — wrap them in a single default section so old notes keep
// loading unchanged. Content that's already sectioned round-trips as-is.
function parseContent(raw: string) {
  if (!raw) return '';
  let parsed: { type: string; content?: Record<string, unknown>[] } | null;
  try {
    const candidate = JSON.parse(raw);
    parsed = candidate?.type === 'doc' ? candidate : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    parsed = {
      type: 'doc',
      content: [{ type: 'paragraph', content: raw ? [{ type: 'text', text: raw }] : [] }],
    };
  }
  const content = parsed.content ?? [];
  const alreadySectioned = content.length > 0 && content.every((n) => n.type === 'section');
  if (alreadySectioned) return parsed;
  return {
    type: 'doc',
    content: [{ type: 'section', attrs: { columns: 1 }, content: content.length ? content : [{ type: 'paragraph' }] }],
  };
}

// ── Toolbar icon SVGs ─────────────────────────────────────────────────────

function BulletIcon() {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor">
      <circle cx="1.5" cy="2" r="1.5"/>
      <rect x="4.5" y="1" width="10" height="2" rx="0.75"/>
      <circle cx="1.5" cy="6.5" r="1.5"/>
      <rect x="4.5" y="5.5" width="10" height="2" rx="0.75"/>
      <circle cx="1.5" cy="11" r="1.5"/>
      <rect x="4.5" y="10" width="10" height="2" rx="0.75"/>
    </svg>
  );
}

function OrderedIcon() {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor">
      <text x="0" y="4" fontSize="4.5" fontFamily="system-ui, sans-serif">1.</text>
      <rect x="4.5" y="1" width="10" height="2" rx="0.75"/>
      <text x="0" y="8.5" fontSize="4.5" fontFamily="system-ui, sans-serif">2.</text>
      <rect x="4.5" y="5.5" width="10" height="2" rx="0.75"/>
      <text x="0" y="13" fontSize="4.5" fontFamily="system-ui, sans-serif">3.</text>
      <rect x="4.5" y="10" width="10" height="2" rx="0.75"/>
    </svg>
  );
}

function TocIcon() {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor">
      <rect x="0" y="0.5" width="6" height="1.5" rx="0.5"/>
      <rect x="0" y="4"   width="15" height="1.5" rx="0.5" opacity="0.5"/>
      <rect x="0" y="7"   width="12" height="1.5" rx="0.5" opacity="0.4"/>
      <rect x="0" y="10"  width="13" height="1.5" rx="0.5" opacity="0.5"/>
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor">
      <rect x="0" y="0"  width="15" height="3"  rx="0.5"/>
      <rect x="0" y="4"  width="7"  height="3.5" rx="0.5" opacity="0.6"/>
      <rect x="8" y="4"  width="7"  height="3.5" rx="0.5" opacity="0.6"/>
      <rect x="0" y="9"  width="7"  height="3.5" rx="0.5" opacity="0.4"/>
      <rect x="8" y="9"  width="7"  height="3.5" rx="0.5" opacity="0.4"/>
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor">
      <rect x="0"   y="0" width="6.5" height="13" rx="0.75"/>
      <rect x="8.5" y="0" width="6.5" height="13" rx="0.75" opacity="0.55"/>
    </svg>
  );
}

function SectionBreakIcon() {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor">
      <rect x="0" y="2"   width="4" height="1.6" rx="0.5"/>
      <rect x="5.5" y="2" width="4" height="1.6" rx="0.5"/>
      <rect x="11" y="2"  width="4" height="1.6" rx="0.5"/>
      <rect x="0" y="9.4" width="4" height="1.6" rx="0.5"/>
      <rect x="5.5" y="9.4" width="4" height="1.6" rx="0.5"/>
      <rect x="11" y="9.4"  width="4" height="1.6" rx="0.5"/>
    </svg>
  );
}

// ── Table paste detection ─────────────────────────────────────────────────

type TableData = string[][];

function detectAndParseTable(text: string): TableData | null {
  const lines = text.trim().split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;

  // Markdown table: has | separators and a divider row
  if (lines[0].includes('|') && lines.some((l) => /^\s*\|[-:\s|]+\|\s*$/.test(l))) {
    const data = lines
      .filter((l) => !/^\s*\|[-:\s|]+\|\s*$/.test(l))  // remove divider rows
      .map((l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
    if (data.length >= 2 && data[0].length >= 2) return data;
  }

  // TSV (tab-separated): uniform tab count across rows
  if (lines[0].includes('\t')) {
    const cols = lines[0].split('\t').length;
    const data = lines.map((l) => l.split('\t'));
    if (data.every((r) => r.length === cols) && cols >= 2) return data;
  }

  return null;
}

function insertTableFromData(
  view: import('@tiptap/pm/view').EditorView,
  data: TableData,
) {
  const { schema } = view.state;
  const { table, table_row: tableRow, table_header: tableHeader, table_cell: tableCell } = schema.nodes;
  if (!table || !tableRow || !tableHeader || !tableCell) return false;

  const rows = data.map((rowData, rowIdx) => {
    const cellType = rowIdx === 0 ? tableHeader : tableCell;
    const cells = rowData.map((text) => {
      const content = text.trim()
        ? schema.nodes.paragraph.create(null, schema.text(text.trim()))
        : schema.nodes.paragraph.create();
      return cellType.create(null, content);
    });
    return tableRow.create(null, cells);
  });

  const tableNode = table.create(null, rows);
  const tr = view.state.tr.replaceSelectionWith(tableNode);
  view.dispatch(tr);
  return true;
}

// ── Tab display order helper ──────────────────────────────────────────────
// Builds the unified ordered list of all tabs (main + named) for the tab bar.
// tabOrder persists the user's chosen order including '__main__' as a sentinel.
// If tabOrder is empty, default is: main tab first, then note.tabs in array order.
type DisplayTab = { id: string; name: string; isMain: boolean };

function buildDisplayOrder(note: Note): DisplayTab[] {
  const tabOrder = note.tabOrder ?? [];
  const order = tabOrder.length
    ? tabOrder
    : ['__main__', ...note.tabs.map((t) => t.id)];
  return order.flatMap((id): DisplayTab[] => {
    if (id === '__main__') return [{ id: '__main__', name: note.mainTabName || 'Main', isMain: true }];
    const tab = note.tabs.find((t) => t.id === id);
    return tab ? [{ id: tab.id, name: tab.name, isMain: false }] : [];
  });
}

// ── Main component ────────────────────────────────────────────────────────

interface NoteEditorProps {
  focusSignal?: number;  // Increment to grab keyboard focus in the editor
  onNavReturn?: () => void;  // Ctrl+Left: return focus to the navigation columns
}

export function NoteEditor({ focusSignal, onNavReturn }: NoteEditorProps) {
  const editingNoteId       = useUIStore((s) => s.editingNoteId);
  const closeNote           = useUIStore((s) => s.closeNote);
  const setNotesLastActiveTab = useUIStore((s) => s.setNotesLastActiveTab);
  const noteTagViewReturn   = useUIStore((s) => s.noteTagViewReturn);
  const setNoteTagViewReturn = useUIStore((s) => s.setNoteTagViewReturn);
  const openNoteTagView     = useUIStore((s) => s.openNoteTagView);
  const notes               = useNoteStore((s) => s.notes);
  const noteTags            = useNoteStore((s) => s.noteTags);
  const updateNote          = useNoteStore((s) => s.updateNote);
  const touchNote           = useNoteStore((s) => s.touchNote);
  const noteHeadingStyle    = useSettingsStore((s) => s.noteHeadingStyle);
  const setNoteHeadingStyle = useSettingsStore((s) => s.setNoteHeadingStyle);
  const noteEditorZoom      = useSettingsStore((s) => s.noteEditorZoom);
  const nudgeNoteEditorZoom = useSettingsStore((s) => s.nudgeNoteEditorZoom);

  const addNoteTab      = useNoteStore((s) => s.addNoteTab);
  const removeNoteTab   = useNoteStore((s) => s.removeNoteTab);
  const renameNoteTab   = useNoteStore((s) => s.renameNoteTab);
  const renameMainTab   = useNoteStore((s) => s.renameMainTab);
  const reorderNoteTabs = useNoteStore((s) => s.reorderNoteTabs);

  // Structured tag entries (Acronym today — see src/config/structuredTagTypes.ts)
  const addStructuredTagEntry     = useNoteStore((s) => s.addStructuredTagEntry);
  const updateStructuredTagEntry  = useNoteStore((s) => s.updateStructuredTagEntry);
  const deleteStructuredTagEntry  = useNoteStore((s) => s.deleteStructuredTagEntry);
  const [structuredTagRequest, setStructuredTagRequest] = useState<{
    mode: 'create' | 'edit';
    tag: BuiltinTag;
    top: number; left: number;
    range: { from: number; to: number } | null;   // create mode only — where to apply the mark
    entryId: string | null;                        // edit mode only
    initialTerm: string;
    initialFields: Record<string, string>;
    initialCollectionId: string | null;
    meta?: { createdAt: string; updatedAt: string; breadcrumb: string };
  } | null>(null);
  const [structuredTagHover, setStructuredTagHover] = useState<HTMLElement | null>(null);
  const clearStructuredHoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawNote = editingNoteId ? notes[editingNoteId as NoteId] : null;
  const note = useNoteView(editingNoteId);

  const [title, setTitle]           = useState('');
  const [tocOpen, setTocOpen]       = useState(false);
  const [abstract, setAbstract]     = useState<string | null>(null);
  const [abstractCollapsed, setAbstractCollapsed] = useState(false);
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  // See src/services/vault.ts — encryption applies to Note.content (Main tab) only, not
  // NoteTab.content. A locked encrypted note shows a placeholder instead of the editor;
  // see the `noteLocked` render guard below.
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  useEffect(() => onVaultStatus((s) => setVaultUnlocked(s === 'unlocked')), []);
  // `note` (a view) re-derives when the plaintext cache changes, so this is current every render.
  const noteLocked = !!rawNote && isNoteLocked(rawNote);
  // Seeded once from uiStore's last-active note+tab (notesLastEditingNoteId/
  // notesLastActiveTabId) so switching to another app and back restores the same tab —
  // same "seed the state directly, don't restore-after-the-fact" pattern ListsSection.tsx
  // uses for selectedListId/selectedTabId. An earlier version of this restored the tab via
  // a *separate* effect after mounting with plain `null`, which raced against the mirror
  // effect below (that effect fired on every render, including the very first one with the
  // not-yet-restored `null`, so it could clobber notesLastActiveTabId back to null before
  // the restore effect ever ran) — seeding directly here removes that race by construction.
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    const s = useUIStore.getState();
    if (!editingNoteId || s.notesLastEditingNoteId !== editingNoteId || !s.notesLastActiveTabId) return null;
    return note?.tabs?.some((t) => t.id === s.notesLastActiveTabId) ? s.notesLastActiveTabId : null;
  });
  // True once the load effect below has run for the first time — distinguishes "this is
  // the initial mount, whose tab was already seeded above, don't reset it" from "the user
  // switched to a genuinely different note while already mounted, which should reset to
  // Main" (both cases change `note?.id`, the effect's dependency).
  const hasRestoredTabRef = useRef(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ tabId: string; side: 'left' | 'right' } | null>(null);
  // Refs mirror the drag state so onDrop always reads live values (no stale closure)
  const draggingTabIdRef = useRef<string | null>(null);
  const dragOverTabIdRef = useRef<string | null>(null);
  const dragOverSideRef  = useRef<'left' | 'right'>('right');
  // Seeded from activeTabId's own (already-seeded) initial value — useRef's argument is
  // only used on the very first render, so this stays in sync with the state above at mount.
  const activeTabIdRef   = useRef<string | null>(activeTabId);
  const onNavReturnRef  = useRef(onNavReturn);
  onNavReturnRef.current = onNavReturn;
  const saveRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abstractSaveRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteIdRef      = useRef<string | null>(null);
  const isLoadingRef          = useRef(false);
  const containerRef          = useRef<HTMLDivElement>(null);

  // ── Table insert picker ───────────────────────────────────────────────────
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tablePickerRows, setTablePickerRows] = useState(3);
  const [tablePickerCols, setTablePickerCols] = useState(3);

  // ── Columns picker (per-section layout) ───────────────────────────────────
  const [columnsPickerOpen, setColumnsPickerOpen] = useState(false);

  // ── Font color picker (ribbon) ─────────────────────────────────────────────
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // ── "New link" pane — Ctrl+L with no selection (nothing to anchor the
  // selection-based FloatingToolbar link popover to) ─────────────────────────
  const [newLinkPane, setNewLinkPane] = useState<{ top: number; left: number } | null>(null);
  const [newLinkText, setNewLinkText] = useState('');
  const [newLinkUrl, setNewLinkUrl]   = useState('');

  // ── Table hover controls ──────────────────────────────────────────────────
  const [tableHover, setTableHover] = useState<{
    tableEl: HTMLElement;
    rowEl:   HTMLElement | null;
    cellEl:  HTMLElement | null;
  } | null>(null);
  const clearHoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to the editor so runTableCmd doesn't need editor as a dep
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const cancelHoverClear = useCallback(() => {
    if (clearHoverRef.current) { clearTimeout(clearHoverRef.current); clearHoverRef.current = null; }
  }, []);

  const scheduleHoverClear = useCallback(() => {
    clearHoverRef.current = setTimeout(() => setTableHover(null), 180);
  }, []);

  // ── Section hover: "lock columns" checkbox ────────────────────────────────
  // `locked` is tracked in React state (not re-read from the DOM at render time) so the
  // checkbox updates immediately on click — nothing else forces NoteEditor to re-render
  // when a ProseMirror transaction changes an attribute on an already-mounted DOM node.
  const [sectionHover, setSectionHover] = useState<{ el: HTMLElement; locked: boolean } | null>(null);
  const clearSectionHoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelSectionHoverClear = useCallback(() => {
    if (clearSectionHoverRef.current) { clearTimeout(clearSectionHoverRef.current); clearSectionHoverRef.current = null; }
  }, []);

  const scheduleSectionHoverClear = useCallback(() => {
    clearSectionHoverRef.current = setTimeout(() => setSectionHover(null), 180);
  }, []);

  const runTableCmd = useCallback((cellEl: HTMLElement | null, cmd: string) => {
    const ed = editorRef.current;
    if (!ed || !cellEl) return;
    try {
      const pos = ed.view.posAtDOM(cellEl, 0) + 1;
      const $pos = ed.state.doc.resolve(pos);
      ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near($pos)));
      switch (cmd) {
        case 'addRowAfter':    ed.commands.addRowAfter();    break;
        case 'deleteRow':      ed.commands.deleteRow();      break;
        case 'addColumnAfter': ed.commands.addColumnAfter(); break;
        case 'deleteColumn':   ed.commands.deleteColumn();   break;
        case 'deleteTable':    ed.commands.deleteTable();    break;
      }
    } catch { /* ignore stale positions */ }
    setTableHover(null);
  }, []);

  const handleEditorMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    cancelHoverClear();
    const tableEl = target.closest('table') as HTMLElement | null;
    if (tableEl) {
      const rowEl  = target.closest('tr')      as HTMLElement | null;
      const cellEl = target.closest('td, th')  as HTMLElement | null;
      setTableHover((h) =>
        h?.tableEl === tableEl && h.rowEl === rowEl && h.cellEl === cellEl
          ? h
          : { tableEl, rowEl, cellEl }
      );
    } else {
      scheduleHoverClear();
    }

    cancelSectionHoverClear();
    const sectionEl = target.closest('[data-type="section"]') as HTMLElement | null;
    const sectionColumns = sectionEl ? parseInt(sectionEl.getAttribute('data-columns') || '1', 10) : 1;
    if (sectionEl && sectionColumns >= 2) {
      const locked = sectionEl.getAttribute('data-locked') === 'true';
      setSectionHover((h) => (h?.el === sectionEl && h.locked === locked) ? h : { el: sectionEl, locked });
    } else {
      scheduleSectionHoverClear();
    }

    if (clearStructuredHoverRef.current) { clearTimeout(clearStructuredHoverRef.current); clearStructuredHoverRef.current = null; }
    const structuredEl = target.closest('mark[data-structured-entry-id]') as HTMLElement | null;
    if (structuredEl) {
      setStructuredTagHover((h) => (h === structuredEl ? h : structuredEl));
    } else {
      clearStructuredHoverRef.current = setTimeout(() => setStructuredTagHover(null), 180);
    }
  }, [cancelHoverClear, scheduleHoverClear, cancelSectionHoverClear, scheduleSectionHoverClear]);

  // ── Structured tag entries (Acronym today) ─────────────────────────────────
  // Reads everything dynamic via .getState() rather than closured hook values, since
  // openStructuredTagCreate is called from the editor-focused keydown effect below, whose
  // dependency array is just [editor] — same "never goes stale" convention already used by
  // ChronicleView's keyboard-nav effect for the identical reason.
  const openStructuredTagCreate = (tag: BuiltinTag, from: number, to: number) => {
    if (!editor) return;
    const typeDef = getStructuredTagType(tag.typeKey);
    if (!typeDef) return;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    const contextText = editor.state.doc.resolve(from).parent.textContent;
    const inferred = typeDef.infer?.(selectedText, contextText) ?? { term: selectedText, fields: {} };
    const coords = editor.view.coordsAtPos(to);
    const currentNote = currentNoteIdRef.current ? useNoteStore.getState().notes[currentNoteIdRef.current as NoteId] : null;
    setStructuredTagRequest({
      mode: 'create',
      tag,
      top: coords.bottom + 8,
      left: coords.left,
      range: { from, to },
      entryId: null,
      initialTerm: inferred.term,
      initialFields: inferred.fields,
      initialCollectionId: currentNote?.collectionId ?? selectActiveCollectionId(useUIStore.getState()),
    });
  };

  const openStructuredTagEditFromEl = (el: HTMLElement) => {
    const entryId = el.getAttribute('data-structured-entry-id');
    const tagId   = el.getAttribute('data-tag-id');
    if (!entryId || !tagId) return;
    const noteState = useNoteStore.getState();
    const rawEntry = noteState.structuredTagEntries[entryId as StructuredTagEntryId];
    const entry = rawEntry ? entryView(rawEntry) : undefined;
    const tag   = BUILTIN_TAGS.find((t) => t.id === tagId);
    const typeDef = tag ? getStructuredTagType(tag.typeKey) : undefined;
    if (!entry || !tag || !typeDef) return;
    const rect = el.getBoundingClientRect();
    const entryNote = noteState.notes[entry.noteId];
    setStructuredTagRequest({
      mode: 'edit',
      tag,
      top: rect.bottom + 8,
      left: rect.left,
      range: null,
      entryId: entry.id,
      initialTerm: entry.term,
      initialFields: entry.fields as Record<string, string>,
      initialCollectionId: entry.collectionId,
      meta: {
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        breadcrumb: entryNote ? getNoteBreadcrumb(entryNote, noteState.noteTags) : 'Unknown note',
      },
    });
    setStructuredTagHover(null);
  };

  const handleStructuredTagSave = (data: { term: string; fields: Record<string, string>; collectionId: string | null }) => {
    if (!structuredTagRequest || !editor) return;
    if (structuredTagRequest.mode === 'create' && structuredTagRequest.range) {
      const { from, to } = structuredTagRequest.range;
      const entryId = addStructuredTagEntry({
        typeKey:      structuredTagRequest.tag.typeKey,
        tagId:        structuredTagRequest.tag.id,
        term:         data.term,
        fields:       data.fields,
        noteId:       (currentNoteIdRef.current ?? '') as NoteId,
        collectionId: data.collectionId as CollectionId | null,
      });
      editor.chain().focus().setTextSelection({ from, to }).setMark('noteTag', {
        tagId: structuredTagRequest.tag.id,
        color: structuredTagRequest.tag.color,
        typeKey: structuredTagRequest.tag.typeKey,
        structuredEntryId: entryId,
      }).run();
    } else if (structuredTagRequest.mode === 'edit' && structuredTagRequest.entryId) {
      updateStructuredTagEntry(structuredTagRequest.entryId as StructuredTagEntryId, {
        term: data.term, fields: data.fields, collectionId: data.collectionId as CollectionId | null,
      });
    }
    setStructuredTagRequest(null);
  };

  // Removes the noteTag mark everywhere it appears in the CURRENTLY LOADED note's content —
  // the only note whose live doc this component can reach. If the entry's own note isn't
  // the one currently open, its mark is left as-is (orphaned) until that note is next
  // opened; acceptable for v1, same scope note as the cross-note dedup question flagged in
  // CLAUDE.md/BACKLOG.md for this feature.
  const handleStructuredTagDelete = () => {
    if (!structuredTagRequest?.entryId || !editor) return;
    const targetEntryId = structuredTagRequest.entryId;
    deleteStructuredTagEntry(targetEntryId as StructuredTagEntryId);
    const ranges: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'noteTag' && m.attrs.structuredEntryId === targetEntryId)) {
        ranges.push({ from: pos, to: pos + node.nodeSize });
      }
    });
    if (ranges.length > 0) {
      let chain = editor.chain().focus();
      ranges.forEach(({ from, to }) => { chain = chain.setTextSelection({ from, to }).unsetMark('noteTag'); });
      chain.run();
    }
    setStructuredTagRequest(null);
  };

  // Close table picker / note menu when clicking outside
  useEffect(() => {
    if (!tablePickerOpen) return;
    const handler = () => setTablePickerOpen(false);
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [tablePickerOpen]);

  useEffect(() => {
    if (!columnsPickerOpen) return;
    const handler = () => setColumnsPickerOpen(false);
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [columnsPickerOpen]);

  useEffect(() => {
    if (!colorPickerOpen) return;
    const handler = () => setColorPickerOpen(false);
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [colorPickerOpen]);

  useEffect(() => {
    if (!newLinkPane) return;
    const handler = () => setNewLinkPane(null);
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handler);
    };
  }, [newLinkPane]);

  useEscapeClose(() => setNewLinkPane(null), !!newLinkPane);

  const insertNewLink = () => {
    const url = normalizeLinkUrl(newLinkUrl);
    if (!url || !editor) return;
    const text = newLinkText.trim() || url;
    editor.chain().focus().insertContent({
      type: 'text',
      text,
      marks: [{ type: 'link', attrs: { href: url } }],
    }).run();
    setNewLinkPane(null);
  };

  useEffect(() => {
    if (!noteMenuOpen) return;
    const handler = () => setNoteMenuOpen(false);
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [noteMenuOpen]);

  // Ctrl+scroll to zoom the editor
  const onWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    nudgeNoteEditorZoom(e.deltaY > 0 ? -0.1 : 0.1);
  }, [nudgeNoteEditorZoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ document: false, link: { openOnClick: false, HTMLAttributes: { class: styles.link } } }),
      SectionDocument,
      Section,
      ColumnBlock,
      Column,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      NoteTagMark,
      ArtifactLinkMark,
      ResizableImage.configure({ allowBase64: true, inline: false }),
      Superscript,
      Subscript,
      TextStyle,
      Color,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      HeadingNumbering,
    ],
    content: '',
    editorProps: {
      attributes: { class: styles.editorContent },
      handleDOMEvents: {
        // Chromium/WebKit have a native "Ctrl/Cmd+click follows a link inside contenteditable"
        // behaviour that fires on the link's own default action regardless of what a later
        // `click`-phase preventDefault() does — the only reliable way to suppress it is to cancel
        // the anchor's `mousedown` before that native behaviour ever engages. This also stops the
        // native contenteditable behaviour of a plain click just placing the cursor, since our
        // own `click` handler below fully replaces both outcomes (open vs. select-to-edit).
        mousedown(view, event) {
          const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
          if (anchor && view.dom.contains(anchor)) event.preventDefault();
          return false;
        },
        // Links: a click inside contenteditable never triggers the browser's native navigation
        // (mousedown above already suppressed the one exception, Ctrl/Cmd+click), so this handles
        // opening explicitly for every environment (not just Tauri) — plain click opens (via the
        // Tauri-aware helper), Ctrl/Cmd+click selects the link's text instead, so it's easy to
        // edit (e.g. with Ctrl+L) without navigating away.
        // NB: App.tsx's app-wide `a[target="_blank"]` click interceptor deliberately excludes
        // anything inside `.ProseMirror` (this editor) so a click here isn't handled twice.
        click(view, event) {
          const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
          if (!anchor || !view.dom.contains(anchor)) return false;

          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const linkType = view.state.schema.marks.link;
          const range = coords && linkType ? getMarkRange(view.state.doc.resolve(coords.pos), linkType) : null;

          event.preventDefault();

          if (event.ctrlKey || event.metaKey) {
            if (range) {
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)));
            }
            return true;
          }

          openExternalLink(anchor.getAttribute('href') || '');
          return true;
        },
      },
      handleClick(view, pos, event) {
        const target = event.target as HTMLElement;

        const artifactEl = target.closest('mark[data-artifact-id]') as HTMLElement | null;
        if (artifactEl) {
          const targetType = artifactEl.getAttribute('data-artifact-type');
          const targetId = artifactEl.getAttribute('data-artifact-id');
          // Ctrl/Cmd+click selects the mark's text (so it can be unlinked via the
          // toolbar), same convention as the plain `link` mark above and noteTag below.
          if (event.ctrlKey || event.metaKey) {
            const $pos = view.state.doc.resolve(pos);
            const markType = view.state.schema.marks.artifactLink;
            const range = markType ? getMarkRange($pos, markType) : null;
            if (range) {
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)));
            }
            return true;
          }
          if (targetType === 'task' && targetId && useTaskStore.getState().tasks[targetId as import('@/types').TaskId]) {
            useUIStore.getState().setActiveView('tasks');
            useUIStore.getState().openTaskPane(targetId);
          }
          const calendar = useCalendarStore.getState();
          if (targetType === 'event' && targetId && calendar.events[targetId as import('@/types').CalendarEventId]) {
            useUIStore.getState().setActiveView('calendar');
            useUIStore.getState().requestCalendarDate(calendar.events[targetId as import('@/types').CalendarEventId].date);
            useUIStore.getState().openCalendarEventPane(targetId);
          }
          if (targetType === 'reminder' && targetId && calendar.reminders[targetId as import('@/types').CalendarReminderId]) {
            useUIStore.getState().setActiveView('calendar');
            useUIStore.getState().requestCalendarDate(calendar.reminders[targetId as import('@/types').CalendarReminderId].date);
            useUIStore.getState().openCalendarReminderPane(targetId);
          }
          return true;
        }

        if (!target.closest('mark[data-tag-id]')) return false;
        const $pos = view.state.doc.resolve(pos);
        const markType = view.state.schema.marks.noteTag;
        if (!markType) return false;
        const range = getMarkRange($pos, markType);
        if (!range) return false;
        // If this mark range is already selected, let the click place the cursor normally
        const { from, to } = view.state.selection;
        if (from === range.from && to === range.to) return false;
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to))
        );
        return true;
      },
      handlePaste(view, event) {
        // Image paste
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result as string;
              if (!src) return;
              const node = view.state.schema.nodes.image?.create({ src });
              if (!node) return;
              view.dispatch(view.state.tr.replaceSelectionWith(node));
            };
            reader.readAsDataURL(file);
            return true;
          }
        }

        // Table paste from TSV / Markdown table
        const text = event.clipboardData?.getData('text/plain');
        if (text) {
          const tableData = detectAndParseTable(text);
          if (tableData) {
            event.preventDefault();
            return insertTableFromData(view, tableData);
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (isLoadingRef.current) return;
      const id = currentNoteIdRef.current;
      const tabId = activeTabIdRef.current;
      if (!id) return;
      if (saveRef.current) clearTimeout(saveRef.current);
      saveRef.current = setTimeout(() => {
        // The store decides whether this note is encrypted and, if so, re-encrypts (see
        // noteStore.editNote) — the editor just saves plaintext like it always did.
        const json = JSON.stringify(ed.getJSON());
        if (tabId !== null) {
          useNoteStore.getState().updateNoteTabContent(id as NoteId, tabId, json);
        } else {
          updateNote(id as NoteId, { content: json });
        }
      }, 1500);
    },
  });

  // Keep editorRef in sync so runTableCmd can access it without a dependency
  editorRef.current = editor;

  // Load content when the open note changes
  useEffect(() => {
    if (!editor) return;
    // A debounced save from the previous note may still be pending. Write it now, while the
    // editor still holds that note's content — the timer would otherwise fire after setContent
    // below and save the NEW note's content under the OLD note's id.
    if (saveRef.current && currentNoteIdRef.current && currentNoteIdRef.current !== note?.id) flushCurrentTab();
    // Reset to Main when switching notes — except on the very first run (the initial
    // mount), whose tab was already seeded above from notesLastActiveTabId, so coming
    // back to Notes from another app lands on the same tab, not just the same note. On
    // the first run this recomputes the same value activeTabId was already seeded with
    // (a no-op set), rather than skipping the call — same "always call it once,
    // unconditionally" shape as every other assignment in this effect.
    const nextTabId = hasRestoredTabRef.current ? null : activeTabId;
    hasRestoredTabRef.current = true;
    setActiveTabId(nextTabId);
    activeTabIdRef.current = nextTabId;
    setRenamingTabId(null);
    if (!note) {
      currentNoteIdRef.current = null;
      isLoadingRef.current = true;
      editor.commands.setContent('');
      isLoadingRef.current = false;
      setTitle('');
      setAbstract(null);
      setAbstractCollapsed(false);
      return;
    }
    touchNote(note.id);
    currentNoteIdRef.current = note.id;
    setTitle(note.title);
    setAbstract(note.abstract ?? null);
    setAbstractCollapsed(false);
    isLoadingRef.current = true;
    // A locked note's view has blank content — keep the editor empty (it's hidden behind the
    // lock placeholder anyway) rather than ever parsing anything derived from ciphertext.
    editor.commands.setContent(noteLocked ? '' : parseContent(note.content));
    isLoadingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, editor]);

  // The open note just became locked or readable (Lock now, or the vault unlocked — e.g. via
  // Account, or a trusted-device auto-unlock landing after the note opened). Reload the editor
  // and the title/abstract inputs from the current view WITHOUT resetting the tab the way a
  // full note-switch (the effect above) would. On lock this also wipes the plaintext out of the
  // ProseMirror doc, so locking doesn't leave the text sitting in a hidden editor.
  useEffect(() => {
    if (!editor || !note) return;
    isLoadingRef.current = true;
    if (noteLocked) {
      editor.commands.setContent('');
    } else {
      const tabId = activeTabIdRef.current;
      const tab = tabId ? note.tabs.find((t) => t.id === tabId) : null;
      editor.commands.setContent(parseContent(tab ? tab.content : note.content));
    }
    isLoadingRef.current = false;
    setTitle(note.title);
    setAbstract(note.abstract ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteLocked]);

  // The editor unmounts whenever no note is open (e.g. moving to another notebook) — save any
  // edit still sitting in its debounce first. Reads flushCurrentTab through a ref so the
  // cleanup calls the latest closure, not the one from the render that registered it.
  const flushOnUnmountRef = useRef<() => void>(() => {});
  useEffect(() => { flushOnUnmountRef.current = () => { if (saveRef.current) flushCurrentTab(); }; });
  useEffect(() => () => flushOnUnmountRef.current(), []);

  // Focus the editor when the signal increments (Right arrow from nav column)
  useEffect(() => {
    if (!focusSignal) return;
    editor?.commands.focus('end');
  }, [focusSignal, editor]);

  // Mirrors the current tab into uiStore via the cleanup (not the effect body itself) —
  // same pattern as ListsSection's selectedListId/selectedTabId mirror. Cleanup fires
  // right before activeTabId changes again, or on unmount, so it always writes "the tab
  // that was active until just now" — never the just-mounted `null` default, which the
  // old fire-on-every-render version did on its very first run, racing the seed above.
  useEffect(() => {
    return () => setNotesLastActiveTab(activeTabId);
  }, [activeTabId, setNotesLastActiveTab]);

  // Capture-phase shortcuts that must intercept before Tiptap handles the same keys
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (!editor.isFocused) return;

      // Ctrl+` → return focus to navigation columns (Ctrl+Left/Right are left alone here
      // so they keep their normal word-jump behaviour inside the editor). Previously
      // Ctrl+Tab; freed up so Ctrl+Tab/Ctrl+Shift+Tab could become the tab-cycle shortcut
      // below, matching how Ctrl+Tab is used for cycling almost everywhere else (browsers,
      // IDEs) rather than for pane-switching.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '`') {
        e.preventDefault();
        e.stopPropagation();
        editor.commands.blur();
        onNavReturnRef.current?.();
        return;
      }

      // Ctrl+T → new tab, prompting for a name immediately (reuses the same "click an
      // already-active tab to rename" input, pre-filled with the default name and
      // auto-selected on focus — Enter or clicking outside accepts it, Escape cancels).
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        e.stopPropagation();
        const id = currentNoteIdRef.current;
        if (!id) return;
        const currentNote = viewOf(id);
        if (!currentNote) return;
        const defaultName = `Tab ${currentNote.tabs.length + 1}`;
        const newTabId = addNoteTab(id as NoteId, defaultName);
        switchTab(newTabId);
        setRenamingTabId(newTabId);
        setRenameValue(defaultName);
        return;
      }

      // Ctrl+PageUp/Down *and* Ctrl+Tab/Ctrl+Shift+Tab → cycle through tabs (two bindings for
      // the same action; Ctrl+Tab was freed up for this once its old job — see above — moved
      // to Ctrl+`).
      const isTabCycleKey = e.key === 'Tab' ? true : !e.shiftKey && (e.key === 'PageUp' || e.key === 'PageDown');
      if (e.ctrlKey && !e.altKey && isTabCycleKey) {
        e.preventDefault();
        e.stopPropagation();
        const id = currentNoteIdRef.current;
        if (!id) return;
        const currentNote = viewOf(id);
        if (!currentNote) return;
        const display = buildDisplayOrder(currentNote);
        const allTabIds = display.map(({ id: tid, isMain }) => isMain ? null : tid);
        const curIdx = allTabIds.indexOf(activeTabIdRef.current);
        const dir = (e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey)) ? -1 : 1;
        const nextIdx = (curIdx + dir + allTabIds.length) % allTabIds.length;
        switchTab(allTabIds[nextIdx]);
        return;
      }
    };
    document.addEventListener('keydown', handler, true); // capture phase
    return () => document.removeEventListener('keydown', handler, true);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // No ESC handler here — the inline editor stays open while in the notes section.
  // ESC is handled by individual modals (AddNoteTagModal, EditNoteTagModal, etc.).

  // Editor-specific hotkeys (only when editor is focused)
  const awaitingHeadingRef = useRef(false);
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (!editor.isFocused) { awaitingHeadingRef.current = false; return; }

      // Ctrl+H → enter heading-number sequence
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'h') {
        e.preventDefault();
        awaitingHeadingRef.current = true;
        return;
      }

      // Digit after Ctrl+H
      if (awaitingHeadingRef.current) {
        awaitingHeadingRef.current = false;
        if (e.key === '0') { e.preventDefault(); editor.chain().focus().setParagraph().run(); return; }
        if (['1','2','3','4','5'].includes(e.key)) {
          e.preventDefault();
          editor.chain().focus().setHeading({ level: parseInt(e.key) as 1|2|3|4|5 }).run();
          return;
        }
        return; // any other key cancels silently
      }

      // Ctrl+1–7 → apply built-in tag to selection (or select block first); pressing the
      // same digit again on text already carrying that exact tag removes it instead.
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const digit = parseInt(e.key);
        if (digit >= 1 && digit <= BUILTIN_TAGS.length) {
          const tag = BUILTIN_TAGS[digit - 1];
          e.preventDefault();
          const applyTag = () => {
            if (editor.isActive('noteTag', { tagId: tag.id })) {
              const entryId = editor.getAttributes('noteTag').structuredEntryId as string | null;
              editor.chain().focus().unsetMark('noteTag').run();
              if (entryId) deleteStructuredTagEntry(entryId as StructuredTagEntryId);
            } else if (getStructuredTagType(tag.typeKey)) {
              const { from, to } = editor.state.selection;
              openStructuredTagCreate(tag, from, to);
              editor.commands.setTextSelection(to);
            } else {
              editor.chain().focus().setMark('noteTag', { tagId: tag.id, color: tag.color, typeKey: tag.typeKey }).run();
            }
          };
          if (editor.state.selection.empty) {
            const { $from } = editor.state.selection;
            editor.chain().focus().setTextSelection({ from: $from.start($from.depth), to: $from.end($from.depth) }).run();
            requestAnimationFrame(applyTag);
          } else {
            applyTag();
          }
          return;
        }
      }

      // Ctrl+L (no selection) → open the "New link" pane (text + URL, both editable).
      // With a selection, this is handled by FloatingToolbar's own Ctrl+L instead.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l' && editor.state.selection.empty) {
        e.preventDefault();
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        setNewLinkText('');
        setNewLinkUrl('');
        setNewLinkPane({ top: coords.bottom + 6, left: coords.left });
        return;
      }

      // Ctrl+. → bullet list
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '.') {
        e.preventDefault();
        editor.chain().focus().toggleBulletList().run();
        return;
      }

      // Ctrl+/ → ordered list
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '/') {
        e.preventDefault();
        editor.chain().focus().toggleOrderedList().run();
        return;
      }

      // Ctrl+Shift+- → subscript  |  Ctrl+Shift+= → superscript
      if (e.ctrlKey && e.shiftKey && !e.altKey) {
        if (e.code === 'Minus') {
          e.preventDefault();
          editor.chain().focus().toggleSubscript().run();
          return;
        }
        if (e.code === 'Equal') {
          e.preventDefault();
          editor.chain().focus().toggleSuperscript().run();
          return;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // deleteStructuredTagEntry is a stable zustand action; openStructuredTagCreate reads
  // everything dynamic via .getState() internally (see its own comment above) — neither
  // needs to be a dep, so this effect still only needs to re-subscribe when `editor` changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // ── Tab switching ─────────────────────────────────────────────────────────

  const flushCurrentTab = () => {
    const id = currentNoteIdRef.current;
    const tabId = activeTabIdRef.current;
    if (!id || !editor) return;
    if (saveRef.current) { clearTimeout(saveRef.current); saveRef.current = null; }
    const content = JSON.stringify(editor.getJSON());
    if (tabId !== null) {
      useNoteStore.getState().updateNoteTabContent(id as NoteId, tabId, content);
    } else {
      updateNote(id as NoteId, { content });
    }
  };

  const switchTab = (tabId: string | null) => {
    flushCurrentTab();
    setActiveTabId(tabId);
    activeTabIdRef.current = tabId;
    const id = currentNoteIdRef.current;
    if (!id || !editor) return;
    const latestNote = viewOf(id);
    if (!latestNote) return;
    isLoadingRef.current = true;
    if (tabId === null) {
      editor.commands.setContent(parseContent(latestNote.content));
    } else {
      const tab = latestNote.tabs.find((t) => t.id === tabId);
      editor.commands.setContent(parseContent(tab?.content ?? ''));
    }
    isLoadingRef.current = false;
  };

  // Flush unsaved edits BEFORE the vault key is dropped: once locked nothing can be encrypted,
  // so a still-pending autosave/title/abstract debounce would be refused and the edit lost.
  // Registered with vault.lockVault(); reads its inputs through a ref so it always sees the
  // latest title/abstract/editor rather than the closure from whichever render registered it.
  const beforeLockRef = useRef<() => void>(() => {});
  useEffect(() => {
    beforeLockRef.current = () => {
      const id = currentNoteIdRef.current;
      if (!id || !editor) return;
      if (!useNoteStore.getState().notes[id as NoteId]?.isEncrypted) return;
      if (abstractSaveRef.current) { clearTimeout(abstractSaveRef.current); abstractSaveRef.current = null; updateNote(id as NoteId, { abstract }); }
      flushCurrentTab();
      if (title.trim()) updateNote(id as NoteId, { title: title.trim() });
    };
  });
  useEffect(() => registerBeforeLock(() => beforeLockRef.current()), []);

  // Notes "Create ▸ Task" flow (FloatingToolbar): a selection was turned into a request to
  // create some other entity, and AddTaskModal has now reported the new id back via
  // uiStore.pendingArtifactLink.resolvedTargetId. Apply the forward ArtifactLinkMark at the
  // originally-captured selection, flush immediately (same reasoning as the tab-switch flush
  // above — don't wait on the debounce, in case the user switches away right after), then
  // clear the pending request so it can't be picked up again.
  const pendingArtifactLink = useUIStore((s) => s.pendingArtifactLink);
  useEffect(() => {
    if (!editor) return;
    if (!pendingArtifactLink?.resolvedTargetId) return;
    if (pendingArtifactLink.noteId !== note?.id) return;
    editor.chain()
      .setTextSelection({ from: pendingArtifactLink.from, to: pendingArtifactLink.to })
      .setMark('artifactLink', { targetType: pendingArtifactLink.targetType, targetId: pendingArtifactLink.resolvedTargetId })
      .run();
    flushCurrentTab();
    useUIStore.getState().clearPendingArtifactLink();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingArtifactLink, editor, note?.id]);

  // ── Drag helpers: update ref + state together so both drop handlers and CSS are correct ──
  const startDrag = (tabId: string) => {
    draggingTabIdRef.current = tabId;
    setDraggingTabId(tabId);
  };
  const updateDragOver = (tabId: string, side: 'left' | 'right') => {
    dragOverTabIdRef.current = tabId;
    dragOverSideRef.current = side;
    setDragOverInfo((prev) => prev?.tabId === tabId && prev.side === side ? prev : { tabId, side });
  };
  const clearDrag = () => {
    draggingTabIdRef.current = null;
    dragOverTabIdRef.current = null;
    setDraggingTabId(null);
    setDragOverInfo(null);
  };

  const handleAddTab = () => {
    const id = currentNoteIdRef.current;
    if (!id) return;
    const tabCount = (note?.tabs.length ?? 0) + 1;
    const defaultName = `Tab ${tabCount}`;
    const newTabId = addNoteTab(id as NoteId, defaultName);
    switchTab(newTabId);
    setRenamingTabId(newTabId);
    setRenameValue(defaultName);
  };

  const handleRemoveTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const id = currentNoteIdRef.current;
    if (!id) return;
    if (activeTabId === tabId) switchTab(null);
    removeNoteTab(id as NoteId, tabId);
  };

  const scheduleTitle = (value: string) => {
    const id = currentNoteIdRef.current;
    if (!id) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      updateNote(id as NoteId, { title: value.trim() || 'Untitled' });
    }, 1500);
  };

  const scheduleAbstract = (value: string | null) => {
    const id = currentNoteIdRef.current;
    if (!id) return;
    if (abstractSaveRef.current) clearTimeout(abstractSaveRef.current);
    abstractSaveRef.current = setTimeout(() => {
      updateNote(id as NoteId, { abstract: value });
    }, 1500);
  };

  // ── Tag attribute helpers ─────────────────────────────────────────────────
  const tagsWithSchema = note
    ? note.tagIds
        .map((id) => noteTags[id])
        .filter((t) => t?.kind === 'tag' && t.fieldSchema?.length > 0)
    : [];

  const handleAttrChange = (tagId: string, fieldId: string, value: unknown) => {
    const id = currentNoteIdRef.current;
    if (!id || !note) return;
    updateNote(id as NoteId, {
      tagData: {
        ...note.tagData,
        [tagId]: { ...(note.tagData?.[tagId] ?? {}), [fieldId]: value },
      },
    });
  };

  // Current heading level for the dropdown
  const currentHeadingValue = editor
    ? (([1, 2, 3, 4, 5].find((l) => editor.isActive('heading', { level: l }))?.toString()) ?? 'p')
    : 'p';

  // Current section's column count, for highlighting the active option in the picker
  const currentSectionColumns = editor
    ? (Array.from({ length: MAX_SECTION_COLUMNS }, (_, i) => i + 1).find((n) => editor.isActive('section', { columns: n })) ?? 1)
    : 1;

  const handleHeadingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val.startsWith('style:')) {
      setNoteHeadingStyle(val.slice(6) as 'academic' | 'highlight');
      // Snap the select back to the current heading level
      e.target.value = currentHeadingValue;
      return;
    }
    if (val === 'p') {
      editor?.chain().focus().setParagraph().run();
    } else {
      editor?.chain().focus().setHeading({ level: parseInt(val) as 1 | 2 | 3 | 4 | 5 }).run();
    }
  };

  if (!note) {
    return <div className={styles.empty}>Select a note to start editing</div>;
  }

  return (
    <div className={styles.container} ref={containerRef}>
      {/* ── Title bar ────────────────────────────────────────────────────── */}
      <div className={styles.titleBar}>
        {noteTagViewReturn && (
          <button
            className={styles.backBtn}
            onClick={() => {
              closeNote();
              openNoteTagView(noteTagViewReturn);
              setNoteTagViewReturn(null);
            }}
            title="Back to tag view"
          >
            ← Tags
          </button>
        )}
        {note?.isEncrypted && (
          <button
            type="button"
            className={styles.lockBadge}
            onClick={() => useUIStore.getState().requestDecrypt('note', note.id)}
            title={noteLocked
              ? 'Encrypted — locked on this device. Click to decrypt this note'
              : 'Encrypted note. Click to decrypt it'}
            aria-label="Decrypt this note"
          >🔒</button>
        )}
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); scheduleTitle(e.target.value); }}
          onBlur={() => {
            const id = currentNoteIdRef.current;
            if (id && title.trim()) updateNote(id as NoteId, { title: title.trim() });
          }}
          placeholder="Untitled note"
          className={styles.titleInput}
          disabled={noteLocked}
        />
        

        <div className={styles.toolbar}>
          {/* Heading style selector */}
          <select
            className={styles.headingSelect}
            value={currentHeadingValue}
            onChange={handleHeadingChange}
            title="Paragraph / heading style"
          >
            <option value="p">Normal</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
            <option value="4">Heading 4</option>
            <option value="5">Heading 5</option>
            <optgroup label="── Heading style">
              <option value="style:academic">Academic {noteHeadingStyle === 'academic' ? '✓' : ''}</option>
              <option value="style:highlight">Highlight {noteHeadingStyle === 'highlight' ? '✓' : ''}</option>
            </optgroup>
          </select>

          <div className={styles.toolbarDivider} />

          {/* Bullet list */}
          <button
            className={`${styles.toolbarBtn} ${editor?.isActive('bulletList') ? styles.toolbarBtnActive : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <BulletIcon />
          </button>

          {/* Ordered list */}
          <button
            className={`${styles.toolbarBtn} ${editor?.isActive('orderedList') ? styles.toolbarBtnActive : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <OrderedIcon />
          </button>

          {/* Superscript / Subscript */}
          <button
            className={`${styles.toolbarBtn} ${editor?.isActive('superscript') ? styles.toolbarBtnActive : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleSuperscript().run()}
            title="Superscript (Ctrl+Shift+=)"
          >x²</button>
          <button
            className={`${styles.toolbarBtn} ${editor?.isActive('subscript') ? styles.toolbarBtnActive : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleSubscript().run()}
            title="Subscript (Ctrl+Shift+-)"
          >x₂</button>

          {/* Font color (full picker) */}
          <div className={styles.popoverAnchor}>
            <button
              className={`${styles.toolbarBtn} ${colorPickerOpen ? styles.toolbarBtnActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); setColorPickerOpen((o) => !o); }}
              title="Text color"
            >
              <span className={styles.colorIconLetter}>
                A
                <span
                  className={styles.colorIconBar}
                  style={{ background: (editor?.getAttributes('textStyle').color as string) || 'currentColor' }}
                />
              </span>
            </button>
            {colorPickerOpen && (
              <div className={styles.colorPickerPopover} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={styles.colorDefaultBtn}
                  onClick={() => { editor?.chain().focus().unsetColor().run(); setColorPickerOpen(false); }}
                >
                  Default color
                </button>
                <ColorPicker
                  value={(editor?.getAttributes('textStyle').color as string) || null}
                  onChange={(color) => {
                    if (color) editor?.chain().focus().setColor(color).run();
                    else editor?.chain().focus().unsetColor().run();
                    setColorPickerOpen(false);
                  }}
                />
                <ColorPicker
                  palette="light"
                  value={(editor?.getAttributes('textStyle').color as string) || null}
                  onChange={(color) => {
                    if (color) editor?.chain().focus().setColor(color).run();
                    else editor?.chain().focus().unsetColor().run();
                    setColorPickerOpen(false);
                  }}
                />
              </div>
            )}
          </div>

          <div className={styles.toolbarDivider} />

          {/* Insert table (with row/col picker) */}
          <div className={styles.popoverAnchor}>
            <button
              className={`${styles.toolbarBtn} ${tablePickerOpen ? styles.toolbarBtnActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); setTablePickerOpen((o) => !o); }}
              title="Insert table"
            >
              <TableIcon />
            </button>
            {tablePickerOpen && (
              <div className={styles.tablePicker} onClick={(e) => e.stopPropagation()}>
                <div className={styles.tablePickerField}>
                  <span className={styles.tablePickerLabel}>Rows</span>
                  <input
                    type="number" min={1} max={20}
                    className={styles.tablePickerInput}
                    value={tablePickerRows}
                    onChange={(e) => setTablePickerRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div className={styles.tablePickerField}>
                  <span className={styles.tablePickerLabel}>Cols</span>
                  <input
                    type="number" min={1} max={20}
                    className={styles.tablePickerInput}
                    value={tablePickerCols}
                    onChange={(e) => setTablePickerCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <button
                  className={styles.tablePickerInsert}
                  onClick={() => {
                    editor?.chain().focus().insertTable({ rows: tablePickerRows, cols: tablePickerCols, withHeaderRow: true }).run();
                    setTablePickerOpen(false);
                  }}
                >
                  Insert {tablePickerRows}×{tablePickerCols}
                </button>
              </div>
            )}
          </div>

          <div className={styles.toolbarDivider} />

          {/* Columns (per-section layout) */}
          <div className={styles.popoverAnchor}>
            <button
              className={`${styles.toolbarBtn} ${columnsPickerOpen ? styles.toolbarBtnActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); setColumnsPickerOpen((o) => !o); }}
              title="Columns"
            >
              <ColumnsIcon />
            </button>
            {columnsPickerOpen && (
              <div className={styles.columnsPicker} onClick={(e) => e.stopPropagation()}>
                {Array.from({ length: MAX_SECTION_COLUMNS }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={`${styles.columnsOption} ${currentSectionColumns === n ? styles.columnsOptionActive : ''}`}
                    onClick={() => { if (editor) editor.chain().focus().setSectionColumns(n, editor.state.selection.from).run(); setColumnsPickerOpen(false); }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section break */}
          <button
            className={styles.toolbarBtn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().insertSectionBreak().run()}
            title="Insert section break"
          >
            <SectionBreakIcon />
          </button>

          <div className={styles.toolbarDivider} />

          {/* TOC toggle */}
          <button
            className={`${styles.toolbarBtn} ${tocOpen ? styles.toolbarBtnActive : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTocOpen((o) => !o)}
            title="Toggle navigation pane"
          >
            <TocIcon />
          </button>

          <div className={styles.toolbarDivider} />

          {/* Note options menu */}
          <div className={styles.popoverAnchor}>
            <button
              className={`${styles.toolbarBtnText} ${noteMenuOpen ? styles.toolbarBtnActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); setNoteMenuOpen((o) => !o); }}
              title="Note options"
            >Note ▾</button>
            {noteMenuOpen && (
              <div className={styles.noteMenu} onClick={(e) => e.stopPropagation()}>
                <button
                  className={styles.noteMenuItem}
                  onClick={() => {
                    const id = currentNoteIdRef.current;
                    if (abstract !== null) {
                      setAbstract(null);
                      if (id) updateNote(id as NoteId, { abstract: null });
                    } else {
                      setAbstract('');
                      setAbstractCollapsed(false);
                      if (id) updateNote(id as NoteId, { abstract: '' });
                    }
                    setNoteMenuOpen(false);
                  }}
                >
                  {abstract !== null ? '✓ Abstract' : 'Add abstract'}
                </button>
                <button
                  className={styles.noteMenuItem}
                  disabled={!vaultUnlocked && !note?.isEncrypted}
                  title={!vaultUnlocked && !note?.isEncrypted ? 'Unlock encryption in Settings → Account first' : undefined}
                  onClick={() => {
                    const id = currentNoteIdRef.current;
                    if (!id || !editor) return;
                    if (!noteLocked) {
                      // Save anything still sitting in a debounce first, so the payload built from
                      // the store includes the very latest text.
                      flushCurrentTab();
                      if (title.trim()) updateNote(id as NoteId, { title: title.trim() });
                    }
                    if (note?.isEncrypted) {
                      // Removing encryption asks for the passphrase (same as clicking the 🔒).
                      useUIStore.getState().requestDecrypt('note', id);
                      setNoteMenuOpen(false);
                      return;
                    }
                    useNoteStore.getState().encryptNote(id as NoteId).catch((err) => {
                      console.error('[NoteEditor] encryption toggle failed:', err);
                      void alertDialog(err instanceof Error ? err.message : 'Could not change encryption for this note.');
                    });
                    setNoteMenuOpen(false);
                  }}
                >
                  {note?.isEncrypted ? '🔓 Remove encryption' : '🔒 Encrypt this note'}
                </button>
              </div>
            )}
          </div>
        </div>

        <button className={styles.closeBtn} onClick={closeNote} title="Close (Esc)">✕</button>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className={styles.tabBar}>
        {buildDisplayOrder(note).map(({ id: tabId, name: tabName, isMain }) => {
          const activeId = isMain ? null : tabId;
          const isActive = activeTabId === activeId;
          return (
            <div
              key={tabId}
              className={[
                styles.tabItem,
                isActive ? styles.tabActive : '',
                draggingTabId === tabId ? styles.tabDragging : '',
                dragOverInfo?.tabId === tabId && dragOverInfo.side === 'left' ? styles.tabDragBefore : '',
                dragOverInfo?.tabId === tabId && dragOverInfo.side === 'right' ? styles.tabDragAfter : '',
              ].filter(Boolean).join(' ')}
              draggable={renamingTabId !== tabId}
              onDragStart={(e) => {
                startDrag(tabId);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tabId);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggingTabIdRef.current === tabId) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const side: 'left' | 'right' = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
                updateDragOver(tabId, side);
              }}
              onDragLeave={(e) => {
                // Only clear when leaving the tab entirely, not when entering a child (e.g. the × button)
                if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
                setDragOverInfo(null);
                dragOverTabIdRef.current = null;
              }}
              onDrop={(e) => {
                e.preventDefault();
                const dragging = draggingTabIdRef.current;
                const overTabId = dragOverTabIdRef.current;
                const overSide = dragOverSideRef.current;
                clearDrag();
                if (!dragging || !overTabId || dragging === overTabId) return;
                const id = currentNoteIdRef.current;
                if (!id) return;
                const noteState = viewOf(id);
                if (!noteState) return;
                const currentOrder = (noteState.tabOrder ?? []).length
                  ? noteState.tabOrder
                  : ['__main__', ...noteState.tabs.map((t) => t.id)];
                const rest = currentOrder.filter((tid) => tid !== dragging);
                const insertIdx = rest.indexOf(overTabId);
                if (insertIdx === -1) return;
                rest.splice(overSide === 'left' ? insertIdx : insertIdx + 1, 0, dragging);
                reorderNoteTabs(id as NoteId, rest);
              }}
              onDragEnd={clearDrag}
              onClick={() => {
                if (isActive) {
                  setRenamingTabId(tabId);
                  setRenameValue(tabName);
                } else {
                  switchTab(activeId);
                }
              }}
            >
              {renamingTabId === tabId ? (
                <input
                  className={styles.tabRenameInput}
                  autoFocus
                  value={renameValue}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    if (renameValue.trim()) {
                      if (isMain) renameMainTab(currentNoteIdRef.current as NoteId, renameValue);
                      else renameNoteTab(currentNoteIdRef.current as NoteId, tabId, renameValue);
                    }
                    setRenamingTabId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (renameValue.trim()) {
                        if (isMain) renameMainTab(currentNoteIdRef.current as NoteId, renameValue);
                        else renameNoteTab(currentNoteIdRef.current as NoteId, tabId, renameValue);
                      }
                      setRenamingTabId(null);
                    }
                    if (e.key === 'Escape') setRenamingTabId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className={styles.tabName}>{tabName}</span>
              )}
              {!isMain && (
                <button
                  className={styles.tabClose}
                  onClick={(e) => handleRemoveTab(e, tabId)}
                  title="Close tab"
                >×</button>
              )}
            </div>
          );
        })}
        <button className={styles.tabAdd} onClick={handleAddTab} title="Add tab">+</button>
      </div>

      {/* ── Abstract ─────────────────────────────────────────────────────── */}
      {abstract !== null && (
        <div className={styles.abstractSection}>
          <div className={styles.abstractHeader}>
            <span className={styles.abstractLabel}>Abstract</span>
            <button
              className={styles.abstractToggleBtn}
              onClick={() => setAbstractCollapsed((c) => !c)}
              title={abstractCollapsed ? 'Expand' : 'Collapse'}
            >
              {abstractCollapsed ? '▶' : '▼'}
            </button>
          </div>
          {!abstractCollapsed && (
            <textarea
              className={styles.abstractInput}
              value={abstract}
              onChange={(e) => { setAbstract(e.target.value); scheduleAbstract(e.target.value); }}
              onBlur={() => {
                const id = currentNoteIdRef.current;
                if (id) {
                  if (abstractSaveRef.current) clearTimeout(abstractSaveRef.current);
                  updateNote(id as NoteId, { abstract });
                }
              }}
              placeholder="Brief summary of this note…"
              rows={3}
            />
          )}
        </div>
      )}

      {/* ── Tag attributes ───────────────────────────────────────────────── */}
      {tagsWithSchema.length > 0 && (
        <div className={styles.attributesSection}>
          {tagsWithSchema.map((tag) => {
            const tagData = note?.tagData?.[tag.id] ?? {};
            return (
              <div key={tag.id} className={styles.attrGroup}>
                <span className={styles.attrGroupLabel}>
                  {tag.icon || '🏷️'} {tag.name}
                </span>
                <div className={styles.attrFields}>
                  {tag.fieldSchema.map((field) => {
                    const val = tagData[field.id];
                    if (field.type === 'boolean') {
                      return (
                        <div key={field.id} className={styles.attrField}>
                          <input
                            type="checkbox"
                            className={styles.attrCheckbox}
                            checked={!!val}
                            onChange={(e) => handleAttrChange(tag.id, field.id, e.target.checked)}
                          />
                          <span className={styles.attrFieldLabel}>{field.name}</span>
                        </div>
                      );
                    }
                    if (field.type === 'select' && field.options?.length) {
                      return (
                        <div key={field.id} className={styles.attrField}>
                          <span className={styles.attrFieldLabel}>{field.name}:</span>
                          <select
                            className={styles.attrSelect}
                            value={(val as string) ?? ''}
                            onChange={(e) => handleAttrChange(tag.id, field.id, e.target.value)}
                          >
                            <option value="">—</option>
                            {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      );
                    }
                    return (
                      <div key={field.id} className={styles.attrField}>
                        <span className={styles.attrFieldLabel}>{field.name}:</span>
                        <input
                          type={field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                          className={styles.attrInput}
                          value={(val as string) ?? ''}
                          onChange={(e) => handleAttrChange(tag.id, field.id, e.target.value)}
                          placeholder={field.type === 'url' ? 'https://…' : field.name}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Editor + optional TOC ─────────────────────────────────────────── */}
      <div
        className={`${styles.editorArea} ${noteHeadingStyle === 'highlight' ? styles.hsHighlight : ''}`}
        style={noteEditorZoom !== 1 ? { zoom: noteEditorZoom } : undefined}
      >
        <div
          className={styles.editorWrap}
          onMouseOver={handleEditorMouseOver}
          onMouseLeave={() => {
            scheduleHoverClear();
            scheduleSectionHoverClear();
            clearStructuredHoverRef.current = setTimeout(() => setStructuredTagHover(null), 180);
          }}
        >
          {noteLocked ? (
            <div className={styles.lockedPlaceholder}>
              🔒 This note is encrypted and locked on this device.
              <br />
              Click the unlock icon in the toolbar or go to Account Settings to unlock it.
            </div>
          ) : (
            <>
              {editor && <FloatingToolbar editor={editor} noteId={note.id} onStructuredTag={openStructuredTagCreate} />}
              <EditorContent editor={editor} className={styles.editor} />
            </>
          )}
        </div>

        {tocOpen && editor && (
          <NoteTOC editor={editor} onClose={() => setTocOpen(false)} />
        )}
      </div>

      {/* ── Section hover: lock-columns checkbox (portal, position:fixed) ── */}
      {sectionHover && createPortal((() => {
        const rect = sectionHover.el.getBoundingClientRect();
        return (
          <label
            className={styles.sectionLockToggle}
            style={{ position: 'fixed', top: rect.top + 6, left: rect.right - 6, transform: 'translateX(-100%)' }}
            onMouseEnter={cancelSectionHoverClear}
            onMouseLeave={scheduleSectionHoverClear}
            title="Lock columns: text stays in the column you typed it in, instead of spreading evenly across all columns"
          >
            <input
              type="checkbox"
              checked={sectionHover.locked}
              onChange={() => {
                const ed = editorRef.current;
                if (!ed) return;
                const pos = ed.view.posAtDOM(sectionHover.el, 0) + 1;
                ed.commands.toggleSectionLocked(pos);
                setSectionHover((h) => (h ? { ...h, locked: !h.locked } : h));
              }}
            />
            <span>Lock columns</span>
          </label>
        );
      })(), document.body)}

      {/* ── Structured tag hover: edit pencil (portal, position:fixed) ────── */}
      {structuredTagHover && !structuredTagRequest && createPortal((() => {
        const rect = structuredTagHover.getBoundingClientRect();
        return (
          <button
            type="button"
            className={styles.structuredTagEditBtn}
            style={{ position: 'fixed', top: rect.top - 24, left: rect.left }}
            onMouseEnter={() => { if (clearStructuredHoverRef.current) clearTimeout(clearStructuredHoverRef.current); }}
            onMouseLeave={() => { clearStructuredHoverRef.current = setTimeout(() => setStructuredTagHover(null), 180); }}
            onClick={() => openStructuredTagEditFromEl(structuredTagHover)}
            title="Edit"
          >
            ✎
          </button>
        );
      })(), document.body)}

      {structuredTagRequest && (() => {
        const typeDef = getStructuredTagType(structuredTagRequest.tag.typeKey);
        if (!typeDef) return null;
        return (
          <StructuredTagPopover
            top={structuredTagRequest.top}
            left={structuredTagRequest.left}
            typeDef={typeDef}
            tagColor={structuredTagRequest.tag.color}
            tagIcon={structuredTagRequest.tag.icon}
            mode={structuredTagRequest.mode}
            initialTerm={structuredTagRequest.initialTerm}
            initialFields={structuredTagRequest.initialFields}
            initialCollectionId={structuredTagRequest.initialCollectionId}
            meta={structuredTagRequest.meta}
            onSave={handleStructuredTagSave}
            onCancel={() => setStructuredTagRequest(null)}
            onDelete={structuredTagRequest.mode === 'edit' ? handleStructuredTagDelete : undefined}
          />
        );
      })()}

      {/* ── Table hover controls (portal, position:fixed) ─────────────────── */}
      {tableHover && createPortal((() => {
        const { tableEl, rowEl, cellEl } = tableHover;
        const tr  = tableEl.getBoundingClientRect();
        const rr  = rowEl?.getBoundingClientRect();
        const cr  = cellEl?.getBoundingClientRect();
        const anyCell  = tableEl.querySelector('td, th')         as HTMLElement | null;
        const rowCell  = rowEl?.querySelector('td, th')          as HTMLElement | null;

        const ctrlProps = {
          onMouseEnter: cancelHoverClear,
          onMouseLeave: scheduleHoverClear,
        };

        return (
          <>
            {/* Delete table — top-right corner */}
            <button
              {...ctrlProps}
              className={styles.tableDeleteBtn}
              style={{ position: 'fixed', top: tr.top - 10, left: tr.right - 10, transform: 'translate(-50%,-50%)' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runTableCmd(anyCell, 'deleteTable')}
              title="Delete table"
            >×</button>

            {/* Row controls — right side of hovered row */}
            {rr && rowCell && (
              <div
                {...ctrlProps}
                className={styles.tableCtrlGroup}
                style={{ position: 'fixed', top: rr.top + rr.height / 2, left: tr.right + 6, transform: 'translateY(-50%)' }}
              >
                <button
                  className={styles.tableCtrlBtn}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runTableCmd(rowCell, 'addRowAfter')}
                  title="Add row below"
                >+row</button>
                <button
                  className={`${styles.tableCtrlBtn} ${styles.tableCtrlBtnDanger}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runTableCmd(rowCell, 'deleteRow')}
                  title="Delete row"
                >−row</button>
              </div>
            )}

            {/* Column controls — below hovered column */}
            {cr && cellEl && (
              <div
                {...ctrlProps}
                className={styles.tableCtrlGroup}
                style={{ position: 'fixed', top: tr.bottom + 6, left: cr.left + cr.width / 2, transform: 'translateX(-50%)' }}
              >
                <button
                  className={styles.tableCtrlBtn}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runTableCmd(cellEl, 'addColumnAfter')}
                  title="Add column after"
                >+col</button>
                <button
                  className={`${styles.tableCtrlBtn} ${styles.tableCtrlBtnDanger}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runTableCmd(cellEl, 'deleteColumn')}
                  title="Delete column"
                >−col</button>
              </div>
            )}
          </>
        );
      })(), document.body)}

      {/* ── New link pane (Ctrl+L with no selection) ───────────────────────── */}
      {newLinkPane && createPortal(
        <div
          className={styles.newLinkPane}
          style={{ position: 'fixed', top: newLinkPane.top, left: newLinkPane.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            className={styles.newLinkField}
            placeholder="Text to display"
            value={newLinkText}
            onChange={(e) => setNewLinkText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertNewLink(); } }}
          />
          <input
            className={styles.newLinkField}
            placeholder="https://…"
            value={newLinkUrl}
            onChange={(e) => setNewLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertNewLink(); } }}
          />
          <button
            type="button"
            className={styles.newLinkInsertBtn}
            disabled={!newLinkUrl.trim()}
            onClick={insertNewLink}
          >
            Insert link
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
