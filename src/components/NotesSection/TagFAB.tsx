import { useState, useRef } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { BUILTIN_TAGS, type BuiltinTag } from '../NoteEditor/builtinTags';
import styles from './TagFAB.module.css';

export function TagFAB() {
  const [open, setOpen]    = useState(false);
  const closeTimer         = useRef<ReturnType<typeof setTimeout> | null>(null);

  const noteTagsRecord       = useNoteStore((s) => s.noteTags);
  const noteTagViewTagIds    = useUIStore((s) => s.noteTagViewTagIds);
  const noteTagViewActive    = useUIStore((s) => s.noteTagViewActive);
  const openNoteTagView      = useUIStore((s) => s.openNoteTagView);
  const closeNoteTagView     = useUIStore((s) => s.closeNoteTagView);

  const userTags = Object.values(noteTagsRecord);

  const hoverOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 280);
  };

  const allTagIds   = [...BUILTIN_TAGS.map((t: BuiltinTag) => t.id), ...userTags.map((t) => t.id)];
  const allSelected = allTagIds.length > 0 && allTagIds.every((id) => noteTagViewTagIds.includes(id));

  const handleTagClick = (id: string) => {
    const newIds = noteTagViewTagIds.includes(id)
      ? noteTagViewTagIds.filter((x) => x !== id)
      : [...noteTagViewTagIds, id];
    if (newIds.length > 0) openNoteTagView(newIds);
    else closeNoteTagView();
  };

  const handleToggleAll = () => {
    if (allSelected) closeNoteTagView();
    else openNoteTagView(allTagIds);
  };

  const isSelected = (id: string) => noteTagViewTagIds.includes(id);

  return (
    <div className={styles.wrap} onMouseEnter={hoverOpen} onMouseLeave={hoverClose}>
      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Filter by tag</span>
            {allTagIds.length > 0 && (
              <button className={styles.toggleAllBtn} onClick={handleToggleAll}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {BUILTIN_TAGS.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Tag types</div>
              {BUILTIN_TAGS.map((t: BuiltinTag, i) => (
                <button
                  key={t.id}
                  className={`${styles.tagRow} ${isSelected(t.id) ? styles.tagRowSelected : ''}`}
                  onClick={() => handleTagClick(t.id)}
                  style={isSelected(t.id) ? { borderLeft: `3px solid ${t.color}` } : undefined}
                >
                  <span className={styles.tagHotkey}>{i + 1}</span>
                  <span>{t.icon}</span>
                  <span className={styles.tagName}>{t.name}</span>
                  {isSelected(t.id) && <span className={styles.check}>✓</span>}
                </button>
              ))}
            </>
          )}

          {userTags.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Your notebooks</div>
              {userTags.map((t, i) => (
                <button
                  key={t.id}
                  className={`${styles.tagRow} ${isSelected(t.id) ? styles.tagRowSelected : ''}`}
                  onClick={() => handleTagClick(t.id)}
                  style={isSelected(t.id) && t.color ? { borderLeft: `3px solid ${t.color}` } : undefined}
                >
                  <span className={styles.tagHotkey}>{BUILTIN_TAGS.length + i + 1 <= 9 ? BUILTIN_TAGS.length + i + 1 : ''}</span>
                  <span>{t.icon ?? '📁'}</span>
                  <span className={styles.tagName}>{t.name}</span>
                  {isSelected(t.id) && <span className={styles.check}>✓</span>}
                </button>
              ))}
            </>
          )}

          {BUILTIN_TAGS.length === 0 && userTags.length === 0 && (
            <div className={styles.empty}>No tags yet</div>
          )}
        </div>
      )}

      <button
        className={`${styles.fab} ${noteTagViewActive ? styles.fabActive : ''} ${noteTagViewTagIds.length > 0 && !noteTagViewActive ? styles.fabHasFilter : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Filter by tag"
        aria-expanded={open}
      >
        {noteTagViewTagIds.length > 0 && !noteTagViewActive
          ? <span className={styles.fabCount}>{noteTagViewTagIds.length}</span>
          : <span className={styles.fabIcon}>#</span>}
      </button>
    </div>
  );
}
