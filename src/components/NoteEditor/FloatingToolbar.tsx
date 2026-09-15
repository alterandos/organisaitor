import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { useNoteStore } from '@/store/noteStore';
import { normalizeLinkUrl } from '@/utils/links';
import { BUILTIN_TAGS, type BuiltinTag } from './builtinTags';
import styles from './FloatingToolbar.module.css';

interface Props {
  editor: Editor;
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

export function FloatingToolbar({ editor }: Props) {
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

  // Reset tag/link/color picker when toolbar hides
  useEffect(() => {
    if (!pos) { setShowTags(false); setSearch(''); setShowLinkInput(false); setLinkUrl(''); setShowColorPicker(false); }
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
      ) : !showTags ? (
        <>
          <button className={`${styles.btn} ${editor.isActive('bold')      ? styles.on : ''}`} onClick={() => fmt(() => editor.chain().toggleBold().run())}      title="Bold"><strong>B</strong></button>
          <button className={`${styles.btn} ${editor.isActive('italic')    ? styles.on : ''}`} onClick={() => fmt(() => editor.chain().toggleItalic().run())}    title="Italic"><em>I</em></button>
          <button className={`${styles.btn} ${editor.isActive('underline') ? styles.on : ''}`} onClick={() => fmt(() => editor.chain().toggleUnderline().run())} title="Underline"><u>U</u></button>
          <button className={`${styles.btn} ${editor.isActive('strike')    ? styles.on : ''}`} onClick={() => fmt(() => editor.chain().toggleStrike().run())}    title="Strike"><s>S</s></button>
          <button className={`${styles.btn} ${hasLink ? styles.on : ''}`} onClick={openLinkInput} title="Link">🔗</button>
          <button className={styles.btn} onClick={() => setShowColorPicker(true)} title="Text color">
            <span className={styles.colorBtnIcon} style={{ borderBottomColor: (editor.getAttributes('textStyle').color as string) || '#e2e8f0' }}>A</span>
          </button>
          <div className={styles.div} />
          {hasTagMark ? (
            <button className={`${styles.btn} ${styles.tagBtn} ${styles.on}`} onClick={removeTag} title="Remove tag"># ✕</button>
          ) : (
            <button className={`${styles.btn} ${styles.tagBtn}`} onClick={() => setShowTags(true)} title="Tag selection (Ctrl+Space)"># Tag</button>
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
