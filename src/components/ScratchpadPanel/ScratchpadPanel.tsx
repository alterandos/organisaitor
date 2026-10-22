import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent } from '@tiptap/react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { cutScratchpad, ensureScratchpad, scratchpadNote, scratchpadText } from '@/services/scratchpad';
import { simpleNoteExtensions, useSimpleNoteEditor } from '@/components/StickyNotes/useSimpleNoteEditor';
import { showToast } from '@/components/Toast/showToast';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { CloseIcon, DesignIcon, OpenIcon, ScratchpadIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import { usePlatform } from '@/hooks/usePlatform';
import { errorMessage } from '@/utils/log';
import type { Note } from '@/types/notes';
import styles from './ScratchpadPanel.module.css';

const L = LABELS.scratchpad;
const EXTENSIONS = simpleNoteExtensions(L.placeholder);

// The scratchpad (Alt+P, services/scratchpad.ts): a panel over whatever is open, for jotting
// something down for a moment. Copy all / Cut all take its whole text; Escape or Alt+P closes it.
// No Ctrl+Enter: it has no primary action. Its note is made the first time it's opened.
export function ScratchpadPanel() {
  const notes = useNoteStore((s) => s.notes);
  const tags = useNoteStore((s) => s.noteTags);
  const note = scratchpadNote(notes, tags);
  const close = useUIStore((s) => s.closeScratchpad);
  useEscapeClose(close);
  const { isAndroid } = usePlatform();
  const saved = useSettingsStore((s) => s.scratchpadPos);
  const setSaved = useSettingsStore((s) => s.setScratchpadPos);
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => { if (!note) ensureScratchpad(); }, [note]);

  // Dragged by its header (not on a button) to anywhere in the window; double-click puts it back.
  // Desktop only: on a phone it sits above the bottom bar.
  const startMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel || e.button !== 0 || isAndroid || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    const grab = { x: e.clientX - r.left, y: e.clientY - r.top };
    const head = e.currentTarget;
    head.setPointerCapture(e.pointerId);
    let last = { x: r.left, y: r.top };
    const move = (ev: PointerEvent) => { last = clampToWindow(ev.clientX - grab.x, ev.clientY - grab.y, r.width, r.height); setDragPos(last); };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      setDragPos(null);
      setSaved(last);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  };
  const at = dragPos ?? (saved && !isAndroid ? clampToWindow(saved.x, saved.y, Math.min(380, window.innerWidth - 32), Math.min(460, window.innerHeight - 96)) : null);

  return createPortal(
    <div ref={panelRef} className={`${styles.panel} ${at ? styles.moved : ''}`} style={at ? { left: at.x, top: at.y } : undefined} role="dialog" aria-label={L.region}>
      {note ? <ScratchpadBody key={note.id} note={note} onClose={close} onMoveStart={startMove} onMoveReset={() => setSaved(null)} movable={!isAndroid} /> : null}
    </div>,
    document.body,
  );
}

// Kept wholly inside the window, so the header can always be reached to move it back. The size is
// the panel's own (ScratchpadPanel.module.css: up to 380 × 460).
function clampToWindow(x: number, y: number, w: number, h: number) {
  return { x: Math.max(0, Math.min(x, window.innerWidth - w)), y: Math.max(0, Math.min(y, window.innerHeight - h)) };
}

function ScratchpadBody({ note, onClose, onMoveStart, onMoveReset, movable }: { note: Note; onClose: () => void; onMoveStart: (e: React.PointerEvent<HTMLDivElement>) => void; onMoveReset: () => void; movable: boolean }) {
  const design = useSettingsStore((s) => s.scratchpadDesign);
  const setDesign = useSettingsStore((s) => s.setScratchpadDesign);
  const { editor, locked, stored, flush } = useSimpleNoteEditor(note, EXTENSIONS, { class: styles.text, 'aria-label': L.title, 'aria-multiline': 'true', role: 'textbox' }, true);

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.focus('end');
  }, [editor]);

  // Whatever was just typed is saved first, so the clipboard gets all of it.
  const current = () => { flush(); return useNoteStore.getState().notes[note.id] ?? note; };
  async function copyAll() {
    try {
      await navigator.clipboard.writeText(scratchpadText(current()));
      showToast({ message: L.copied });
    } catch (e) { await alertDialog(errorMessage(e)); }
  }
  async function cutAll() {
    try { await cutScratchpad(current()); } catch (e) { await alertDialog(errorMessage(e)); }
  }
  const openInNotes = () => {
    flush();
    onClose();
    const ui = useUIStore.getState();
    ui.setActiveView('notes');
    ui.openNote(note.id);
  };
  const other = design === 'paper' ? 'simple' : 'paper';
  const editable = !locked && stored !== null;

  return (
    <div className={styles.pad} data-design={design}>
      <div className={styles.head} onPointerDown={onMoveStart} onDoubleClick={(e) => { if (!(e.target as Element).closest('button')) onMoveReset(); }} title={movable ? L.move : undefined}>
        <span className={styles.name}><ScratchpadIcon /> {L.title}</span>
        <button type="button" className={styles.textBtn} onClick={copyAll} disabled={!editable}>{L.copyAll}</button>
        <button type="button" className={styles.textBtn} onClick={cutAll} disabled={!editable}>{L.cutAll}</button>
        <span className={styles.spacer} />
        <button type="button" className={styles.iconBtn} onClick={() => setDesign(other)} title={`${L.design}: ${L.designs[other]}`} aria-label={`${L.design}: ${L.designs[other]}`}><DesignIcon /></button>
        <button type="button" className={styles.iconBtn} onClick={openInNotes} title={L.open} aria-label={L.open}><OpenIcon /></button>
        <button type="button" className={styles.iconBtn} onClick={onClose} title={L.close} aria-label={L.close}><CloseIcon /></button>
      </div>
      {locked ? (
        <button type="button" className={styles.message} onClick={() => useUIStore.getState().requestDecrypt('note', note.id)}>🔒 {L.locked}</button>
      ) : stored === null ? (
        <button type="button" className={styles.message} onClick={openInNotes}>{L.formatted}</button>
      ) : (
        <EditorContent editor={editor} className={styles.textHost} />
      )}
    </div>
  );
}
