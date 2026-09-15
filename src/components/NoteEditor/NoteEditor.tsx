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
import type { NoteId, Note } from '@/types';
import { NoteTagMark } from './extensions/NoteTagMark';
import { FloatingToolbar } from './FloatingToolbar';
import { NoteTOC } from './NoteTOC';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { openExternalLink, normalizeLinkUrl } from '@/utils/links';
import { BUILTIN_TAGS } from './builtinTags';
import styles from './NoteEditor.module.css';

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

  const note = editingNoteId ? notes[editingNoteId as NoteId] : null;

  const [title, setTitle]           = useState('');
  const [tocOpen, setTocOpen]       = useState(false);
  const [abstract, setAbstract]     = useState<string | null>(null);
  const [abstractCollapsed, setAbstractCollapsed] = useState(false);
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Captured once at mount: which note+tab uiStore remembers as last-active, so the load
  // effect below can restore that tab the first time it loads that same note (and only
  // that first time — later note switches within this same mount reset to Main normally).
  const [initialTabRestore] = useState(() => ({
    noteId: useUIStore.getState().notesLastEditingNoteId,
    tabId:  useUIStore.getState().notesLastActiveTabId,
  }));
  const hasRestoredTabRef = useRef(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ tabId: string; side: 'left' | 'right' } | null>(null);
  // Refs mirror the drag state so onDrop always reads live values (no stale closure)
  const draggingTabIdRef = useRef<string | null>(null);
  const dragOverTabIdRef = useRef<string | null>(null);
  const dragOverSideRef  = useRef<'left' | 'right'>('right');
  const activeTabIdRef   = useRef<string | null>(null);
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
  }, [cancelHoverClear, scheduleHoverClear, cancelSectionHoverClear, scheduleSectionHoverClear]);

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
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      setNewLinkPane(null);
    };
    const id = setTimeout(() => {
      document.addEventListener('click', handler);
      document.addEventListener('keydown', handler);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [newLinkPane]);

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
        if (tabId !== null) {
          useNoteStore.getState().updateNoteTabContent(id as NoteId, tabId, JSON.stringify(ed.getJSON()));
        } else {
          updateNote(id as NoteId, { content: JSON.stringify(ed.getJSON()) });
        }
      }, 1500);
    },
  });

  // Keep editorRef in sync so runTableCmd can access it without a dependency
  editorRef.current = editor;

  // Load content when the open note changes
  useEffect(() => {
    if (!editor) return;
    // Reset to Main when switching notes — except right after mount, when we restore
    // whatever tab was open in notesLastEditingNoteId (uiStore), so coming back to Notes
    // from another app lands on the same tab, not just the same note.
    let nextTabId: string | null = null;
    if (!hasRestoredTabRef.current) {
      hasRestoredTabRef.current = true;
      if (
        note && note.id === initialTabRestore.noteId && initialTabRestore.tabId &&
        note.tabs?.some((t) => t.id === initialTabRestore.tabId)
      ) {
        nextTabId = initialTabRestore.tabId;
      }
    }
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
    editor.commands.setContent(parseContent(note.content));
    isLoadingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, editor]);

  // Focus the editor when the signal increments (Right arrow from nav column)
  useEffect(() => {
    if (!focusSignal) return;
    editor?.commands.focus('end');
  }, [focusSignal, editor]);

  // Mirrors the current tab into uiStore on every change, so it's already correct by the
  // time notesLastEditingNoteId is snapshotted on leaving the Notes section.
  useEffect(() => {
    setNotesLastActiveTab(activeTabId);
  }, [activeTabId, setNotesLastActiveTab]);

  // Capture-phase shortcuts that must intercept before Tiptap handles the same keys
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (!editor.isFocused) return;

      // Ctrl+Tab → return focus to navigation columns (Ctrl+Left/Right are left alone
      // here so they keep their normal word-jump behaviour inside the editor)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'Tab') {
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
        const currentNote = useNoteStore.getState().notes[id as NoteId];
        if (!currentNote) return;
        const defaultName = `Tab ${currentNote.tabs.length + 1}`;
        const newTabId = addNoteTab(id as NoteId, defaultName);
        switchTab(newTabId);
        setRenamingTabId(newTabId);
        setRenameValue(defaultName);
        return;
      }

      // Ctrl+PageUp/Down → cycle through tabs
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault();
        e.stopPropagation();
        const id = currentNoteIdRef.current;
        if (!id) return;
        const currentNote = useNoteStore.getState().notes[id as NoteId];
        if (!currentNote) return;
        const display = buildDisplayOrder(currentNote);
        const allTabIds = display.map(({ id: tid, isMain }) => isMain ? null : tid);
        const curIdx = allTabIds.indexOf(activeTabIdRef.current);
        const dir = e.key === 'PageDown' ? 1 : -1;
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

      // Ctrl+1–4 → apply built-in tag to selection (or select block first)
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const digit = parseInt(e.key);
        if (digit >= 1 && digit <= BUILTIN_TAGS.length) {
          const tag = BUILTIN_TAGS[digit - 1];
          e.preventDefault();
          const applyTag = () => {
            editor.chain().focus().setMark('noteTag', { tagId: tag.id, color: tag.color, typeKey: tag.typeKey }).run();
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
    const latestNote = useNoteStore.getState().notes[id as NoteId];
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
          <div style={{ position: 'relative' }}>
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
          <div style={{ position: 'relative' }}>
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
          <div style={{ position: 'relative' }}>
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
          <div style={{ position: 'relative' }}>
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
                const noteState = useNoteStore.getState().notes[id as NoteId];
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
          onMouseLeave={() => { scheduleHoverClear(); scheduleSectionHoverClear(); }}
        >
          {editor && <FloatingToolbar editor={editor} />}
          <EditorContent editor={editor} className={styles.editor} />
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
