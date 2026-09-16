import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore, selectActiveCollectionId } from '@/store/uiStore';
import { removeCrossAppRefFromTarget } from '@/services/crossAppLinkCleanup';
import { normalizeLinkUrl } from '@/utils/links';
import { inferTaskFromSelection } from '@/utils/textToTask';
import type { NoteId } from '@/types/notes';
import type { CrossAppRefType } from '@/types';
import { BUILTIN_TAGS, type BuiltinTag } from './builtinTags';
import styles from './FloatingToolbar.module.css';

interface Props {
  editor: Editor;
  noteId: string;
}

interface ToolbarPos {
  top: number;
  left: number;
}

interface TagItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  typeKey?: string | null;
  isBuiltin?: boolean;
}

const BASIC_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8',
];

// The "Create ▸" menu (Ctrl+Q / the "+" toolbar button). Task is the only wired option in
// this pass — Calendar/List/Tracker are documented stubs (see BACKLOG.md "Cross-app built-in
// tag types") that show a short "coming soon" message instead of silently doing nothing.
// `enabled: false` entries still get a number/click target so the menu always reads as
// complete, matching the eventual set rather than growing a new row every time a target ships.
interface CreateMenuOption {
  type:    CrossAppRefType;
  label:   string;
  icon:    string;
  enabled: boolean;
}

const CREATE_MENU_OPTIONS: CreateMenuOption[] = [
  { type: 'task',        label: 'Task',            icon: '📋', enabled: true  },
  { type: 'event',       label: 'Calendar item',    icon: '📅', enabled: false },
  { type: 'listItem',    label: 'List item',        icon: '📃', enabled: false },
  { type: 'trackerEntry',label: 'Tracker entry',    icon: '📊', enabled: false },
];

export function FloatingToolbar({ editor, noteId }: Props) {
  const [pos, setPos]           = useState<ToolbarPos | null>(null);
  const [showTags, setShowTags] = useState(false);
  const [search, setSearch]     = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl]   = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const noteTagsRecord = useNoteStore((s) => s.noteTags);
  const userTags: TagItem[] = Object.values(noteTagsRecord).map((t) => ({
    id: t.id, name: t.name, icon: t.icon ?? '📁', color: t.color ?? '#6b7280',
  }));

  // ── Create-linked-item menu (Ctrl+Q, or the "+ Create" button — pipe-separated from the
  // rest of the toolbar). Task is fully wired; the other three are documented stubs. ──
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [stubMessage, setStubMessage]       = useState<string | null>(null);
  const noteCollectionId = useNoteStore((s) => s.notes[noteId as NoteId]?.collectionId ?? null);
  const activeCollectionId = useUIStore(selectActiveCollectionId);

  const updatePos = useCallback(() => {
    if (editor.state.selection.empty) { setPos(null); return; }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setPos(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width) { setPos(null); return; }
    setPos({ top: rect.top - 50, left: rect.left + rect.width / 2 });
  }, [editor]);

  useEffect(() => {
    editor.on('selectionUpdate', updatePos);
    return () => { editor.off('selectionUpdate', updatePos); };
  }, [editor, updatePos]);

  // Reset tag/link/color/create picker when toolbar hides
  useEffect(() => {
    if (!pos) {
      setShowTags(false); setSearch('');
      setShowLinkInput(false); setLinkUrl('');
      setShowColorPicker(false);
      setShowCreateMenu(false); setStubMessage(null);
    }
  }, [pos]);

  // Ctrl+Space: select current block (if nothing selected) then open tag picker
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== ' ') return;
      if (!editor.isFocused) return;
      e.preventDefault();
      e.stopPropagation();

      const openTagPicker = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          if (rect.width) setPos({ top: rect.top - 50, left: rect.left + rect.width / 2 });
        }
        setShowTags(true);
      };

      if (editor.state.selection.empty) {
        const { $from } = editor.state.selection;
        editor.chain().focus().setTextSelection({ from: $from.start($from.depth), to: $from.end($from.depth) }).run();
        requestAnimationFrame(openTagPicker);
      } else {
        openTagPicker();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editor]);

  // Ctrl+L (selection non-empty): turn the selected text into a link. The
  // no-selection case is handled separately in NoteEditor (there's no text run to
  // anchor this floating toolbar to, so it uses its own small "New link" pane instead).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'l') return;
      if (!editor.isFocused || editor.state.selection.empty) return;
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width) setPos({ top: rect.top - 50, left: rect.left + rect.width / 2 });
      }
      setLinkUrl((editor.getAttributes('link').href as string) ?? '');
      setShowLinkInput(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editor]);

  // Ctrl+Q (selection non-empty): open the "Create ▸" menu directly, same target as
  // clicking the "+ Create" button below.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'q') return;
      if (!editor.isFocused || editor.state.selection.empty) return;
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width) setPos({ top: rect.top - 50, left: rect.left + rect.width / 2 });
      }
      setStubMessage(null);
      setShowCreateMenu(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editor]);

  // Selecting "Task" from the create menu: run inference, hand the request off to the real
  // AddTaskModal (pre-filled) rather than a bespoke inline form — see CLAUDE.md "Cross-app
  // linking" for why the modal is reused instead of duplicated. The Endeavour is inherited
  // from the note itself when it has one, falling back to whatever Endeavour is currently
  // focused in the Notes section (same default AddTaskModal already uses elsewhere).
  // Defined above the `!pos` early return (rather than down with the other handlers) so the
  // digit/Escape effect below — which must itself live above that return, to satisfy the
  // Rules of Hooks — can safely close over it in every render.
  const selectCreateOption = (option: CreateMenuOption) => {
    if (!option.enabled) {
      setStubMessage(`${option.label} linking is coming soon — see BACKLOG.md.`);
      return;
    }

    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    const inferred = inferTaskFromSelection(text);

    useUIStore.getState().setPendingArtifactLink({ noteId, from, to, targetType: 'task' });
    useUIStore.getState().showAddTaskWithPrefill({
      title:        inferred.title,
      priority:     inferred.priority ?? 'none',
      collectionId: noteCollectionId ?? activeCollectionId ?? null,
      deadline:     inferred.deadline,
      deadlineTime: inferred.deadlineTime,
      links:        inferred.links,
    });
    setShowCreateMenu(false);
    // Collapse the selection so this whole floating toolbar hides once AddTaskModal opens —
    // without this it kept floating on top of the modal, since the selection (and therefore
    // `pos`) was otherwise untouched by opening it. Caught live, not by inspection.
    editor.commands.setTextSelection(to);
  };

  // Escape (whenever the toolbar is visible, in any mode) and digit-select (while the create
  // menu specifically is open) — a document-level listener rather than React onKeyDown,
  // deliberately, since nothing in the menu ever takes DOM focus (no autoFocus anywhere in
  // it): an early version used autoFocus on the first option, which stole focus from the
  // ProseMirror editor the moment the menu opened, silently breaking editor.isFocused for
  // every OTHER editor-focused hotkey (Ctrl+Q itself included) until the user clicked back
  // into the note. Caught via a live round-trip test (pressing Ctrl+Q a second time did
  // nothing), not by inspection. Consolidated here (rather than a handler per sub-panel) so
  // Escape has one obvious priority order: back out of whichever sub-panel is open, or — from
  // the normal button row — collapse the selection and hide the whole toolbar.
  useEffect(() => {
    if (!pos) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showCreateMenu) { setShowCreateMenu(false); setStubMessage(null); return; }
        if (showTags) { setShowTags(false); setSearch(''); return; }
        if (showLinkInput) { setShowLinkInput(false); setLinkUrl(''); return; }
        if (showColorPicker) { setShowColorPicker(false); return; }
        editor.commands.setTextSelection(editor.state.selection.to);
        return;
      }
      if (showCreateMenu) {
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= CREATE_MENU_OPTIONS.length) {
          e.preventDefault();
          selectCreateOption(CREATE_MENU_OPTIONS[num - 1]);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, showCreateMenu, showTags, showLinkInput, showColorPicker]);

  if (!pos) return null;

  // Build filtered tag list: built-ins first, then user tags
  const q = search.toLowerCase();
  const filteredBuiltin: TagItem[] = BUILTIN_TAGS
    .filter((t: BuiltinTag) => t.name.toLowerCase().includes(q))
    .map((t: BuiltinTag) => ({ ...t, isBuiltin: true }));
  const filteredUser: TagItem[] = userTags.filter((t) => t.name.toLowerCase().includes(q));
  const allFiltered: TagItem[] = [...filteredBuiltin, ...filteredUser];

  const grip = (e: React.MouseEvent) => e.preventDefault();

  const applyTagItem = (item: TagItem) => {
    editor.chain().focus().setMark('noteTag', {
      tagId: item.id,
      color: item.color,
      typeKey: item.typeKey ?? null,
    }).run();
    setShowTags(false);
    setSearch('');
  };

  const removeTag = () => {
    editor.chain().focus().unsetMark('noteTag').run();
  };

  const removeArtifactLink = () => {
    const attrs = editor.getAttributes('artifactLink') as { targetType?: CrossAppRefType; targetId?: string };
    editor.chain().focus().unsetMark('artifactLink').run();
    if (attrs.targetType && attrs.targetId) {
      removeCrossAppRefFromTarget(attrs.targetType, attrs.targetId, { type: 'note', id: noteId });
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setShowTags(false); setSearch(''); return; }
    if (e.key === 'Enter' && allFiltered.length === 1) { applyTagItem(allFiltered[0]); return; }
    // 1–9 selects by position in the filtered list
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 1 && num <= 9) {
      e.preventDefault();
      const item = allFiltered[num - 1];
      if (item) applyTagItem(item);
    }
  };

  const hasTagMark = editor.isActive('noteTag');
  const hasArtifactMark = editor.isActive('artifactLink');
  const fmt = (fn: () => void) => { editor.chain().focus(); fn(); };

  const hasLink = editor.isActive('link');

  const openLinkInput = () => {
    setLinkUrl((editor.getAttributes('link').href as string) ?? '');
    setShowLinkInput(true);
  };

  const applyLink = () => {
    const url = normalizeLinkUrl(linkUrl);
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setShowLinkInput(false);
    setLinkUrl('');
  };

  return createPortal(
    <div className={styles.toolbar} style={{ top: pos.top, left: pos.left }} onMouseDown={grip}>
      {showLinkInput ? (
        <div className={styles.linkPicker}>
          <input
            autoFocus
            className={styles.linkInputField}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
              if (e.key === 'Escape') { setShowLinkInput(false); setLinkUrl(''); }
            }}
            placeholder="https://…"
          />
          <button className={styles.linkApplyBtn} onClick={applyLink} title="Apply link">✓</button>
          {hasLink && (
            <button className={styles.linkRemoveBtn} onClick={removeLink} title="Remove link">✕</button>
          )}
        </div>
      ) : showColorPicker ? (
        <div className={styles.colorPicker}>
          <button
            className={styles.colorSwatchDefault}
            onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }}
            title="Default color"
          >Ø</button>
          {BASIC_COLORS.map((c) => (
            <button
              key={c}
              className={styles.colorSwatch}
              style={{ background: c }}
              onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false); }}
              title={c}
            />
          ))}
        </div>
      ) : showCreateMenu ? (
        <div className={styles.createMenu}>
          {stubMessage ? (
            <>
              <div className={styles.stubMessage}>{stubMessage}</div>
              <button className={styles.tagBack} onClick={() => setStubMessage(null)}>← Back</button>
            </>
          ) : (
            <>
              {CREATE_MENU_OPTIONS.map((option, i) => (
                <button
                  key={option.type}
                  className={`${styles.createMenuOption} ${!option.enabled ? styles.createMenuOptionStub : ''}`}
                  onClick={() => selectCreateOption(option)}
                >
                  <span className={styles.tagShortcut}>{i + 1}</span>
                  <span className={styles.tagIcon}>{option.icon}</span>
                  <span>{option.label}</span>
                  {!option.enabled && <span className={styles.createMenuSoon}>soon</span>}
                </button>
              ))}
              <button className={styles.tagBack} onClick={() => setShowCreateMenu(false)}>← Back</button>
            </>
          )}
        </div>
      ) : !showTags ? (
        <>
          <button className={`${styles.btn} ${editor.isActive('bold')      ? styles.on : ''}`} onClick={() => fmt(() => editor.chain().toggleBold().run())}      title="Bold"><strong>B</strong></button>
          <button className={`${styles.btn} ${editor.isActive('italic')    ? styles.on : ''}`} onClick={() => fmt(() => editor.chain().toggleItalic().run())}    title="Italic"><em>I</em></button>
          <button className={`${styles.btn} ${editor.isActive('underline') ? styles.on : ''}`} onClick={() => fmt(() => editor.chain().toggleUnderline().run())} title="Underline"><u>U</u></button>
          <button className={`${styles.btn} ${editor.isActive('strike')    ? styles.on : ''}`} onClick={() => fmt(() => editor.chain().toggleStrike().run())}    title="Strike"><s>S</s></button>
          <button className={`${styles.btn} ${hasLink ? styles.on : ''}`} onClick={openLinkInput} title="Link">🔗</button>
          <button className={styles.btn} onClick={() => setShowColorPicker(true)} title="Text color">
            <span className={styles.colorBtnIcon} />
          </button>
          <div className={styles.div} />
          {hasTagMark ? (
            <button className={`${styles.btn} ${styles.tagBtn} ${styles.on}`} onClick={removeTag} title="Remove tag"># ✕</button>
          ) : (
            <button className={`${styles.btn} ${styles.tagBtn}`} onClick={() => setShowTags(true)} title="Tag selection (Ctrl+Space)"># Tag</button>
          )}
          <div className={styles.div} />
          {hasArtifactMark ? (
            <button className={`${styles.btn} ${styles.createBtn} ${styles.on}`} onClick={removeArtifactLink} title="Remove link">🧩 ✕</button>
          ) : (
            <button className={`${styles.btn} ${styles.createBtn}`} onClick={() => { setStubMessage(null); setShowCreateMenu(true); }} title="Create linked item from selection (Ctrl+Q)">🧩</button>
          )}
        </>
      ) : (
        <div className={styles.tagPicker}>
          <input
            autoFocus
            className={styles.tagSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search tags… (1–9 to pick)"
          />
          <div className={styles.tagList}>
            {allFiltered.length === 0 ? (
              <div className={styles.tagEmpty}>No tags found</div>
            ) : (
              <>
                {filteredBuiltin.map((tag, i) => (
                  <button
                    key={tag.id}
                    className={`${styles.tagOption} ${styles.tagOptionBuiltin}`}
                    onClick={() => applyTagItem(tag)}
                    style={{ borderLeft: `3px solid ${tag.color}` }}
                  >
                    <span className={styles.tagShortcut}>{i + 1}</span>
                    <span className={styles.tagIcon}>{tag.icon}</span>
                    <span>{tag.name}</span>
                  </button>
                ))}
                {filteredBuiltin.length > 0 && filteredUser.length > 0 && (
                  <div className={styles.tagSeparator}>Your tags</div>
                )}
                {filteredUser.map((tag, i) => (
                  <button
                    key={tag.id}
                    className={styles.tagOption}
                    onClick={() => applyTagItem(tag)}
                    style={tag.color !== '#6b7280' ? { borderLeft: `3px solid ${tag.color}` } : undefined}
                  >
                    <span className={styles.tagShortcut}>{filteredBuiltin.length + i + 1 <= 9 ? filteredBuiltin.length + i + 1 : ''}</span>
                    <span className={styles.tagIcon}>{tag.icon}</span>
                    <span>{tag.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
          <button className={styles.tagBack} onClick={() => { setShowTags(false); setSearch(''); }}>← Back</button>
        </div>
      )}
    </div>,
    document.body
  );
}
