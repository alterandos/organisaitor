import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types';
import type { Note } from '@/types/notes';
import { NoteTOC } from './NoteTOC';
import { NoteBacklinks } from './NoteBacklinks';
import styles from './MobileNoteSidePanel.module.css';

// The open note's side panel on a phone (MobileNotes, F24): what the desktop shows around the
// editor — the tabs, the contents outline and key points, "Linked from" and the note's details —
// in one panel that slides in from the right (a swipe in from near the right edge, or the
// heading's ☰). On the Escape stack, so Back closes it before it closes the note.

export interface PanelTab { id: string; name: string; isMain: boolean }

export function MobileNoteSidePanel({ note, tabs, activeTabId, editor, noteLocked, onSwitchTab, onClose }: {
  note:        Note;
  tabs:        PanelTab[];
  activeTabId: string | null;          // null = the main tab
  editor:      Editor | null;
  noteLocked:  boolean;
  onSwitchTab: (tabId: string | null) => void;
  onClose:     () => void;
}) {
  useEscapeClose(onClose);
  const L = LABELS.mobileNotes;
  const [renaming, setRenaming] = useState<{ id: string; isMain: boolean; value: string } | null>(null);

  function commitRename() {
    if (!renaming) return;
    const name = renaming.value.trim();
    const store = useNoteStore.getState();
    if (name) {
      if (renaming.isMain) store.renameMainTab(note.id as NoteId, name);
      else store.renameNoteTab(note.id as NoteId, renaming.id, name);
    }
    setRenaming(null);
  }

  function addTab() {
    const name = `Tab ${note.tabs.length + 2}`;
    const id = useNoteStore.getState().addNoteTab(note.id as NoteId, name);
    onSwitchTab(id);
    setRenaming({ id, isMain: false, value: name });
  }

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={styles.panel} role="dialog" aria-label={L.panelTitle}>
        <header className={styles.header}>
          <span className={styles.title}>{L.panelTitle}</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label={L.closePanel}>✕</button>
        </header>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{L.tabs}</h3>
            {tabs.map((t) => {
              const activeId = t.isMain ? null : t.id;
              const active = activeTabId === activeId;
              if (renaming?.id === t.id) {
                return (
                  <input
                    key={t.id}
                    className={styles.renameInput}
                    autoFocus
                    value={renaming.value}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); }
                    }}
                  />
                );
              }
              return (
                <div key={t.id} className={`${styles.tab} ${active ? styles.tabActive : ''}`}>
                  <button
                    type="button"
                    className={styles.tabName}
                    onClick={() => { if (!active) { onSwitchTab(activeId); onClose(); } }}
                    aria-current={active || undefined}
                  >{t.name}</button>
                  {active && !noteLocked && (
                    <button
                      type="button"
                      className={styles.tabRename}
                      onClick={() => setRenaming({ id: t.id, isMain: t.isMain, value: t.name })}
                      aria-label={LABELS.rowActions.edit}
                    >✎</button>
                  )}
                </div>
              );
            })}
            {!noteLocked && (
              <button type="button" className={styles.addTab} onClick={addTab}>+ {L.addTab}</button>
            )}
          </section>

          {editor && !noteLocked && (
            <section className={styles.section}>
              <NoteTOC editor={editor} onClose={onClose} embedded />
            </section>
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{L.linkedFrom}</h3>
            <NoteBacklinks note={note} activeTabId={activeTabId} editor={editor} canInsert={false} onSwitchTab={(id) => { onSwitchTab(id); onClose(); }} />
          </section>

          <section className={styles.section}>
            <button
              type="button"
              className={styles.details}
              onClick={() => { onClose(); useUIStore.getState().showEditNoteMeta(note.id); }}
            >{L.details}</button>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
