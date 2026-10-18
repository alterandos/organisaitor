import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { SpecialCharInput } from '@/components/NoteEditor/extensions/SpecialCharInput';
import { useNoteStore } from '@/store/noteStore';
import { useStickyStore, STICKY_DESIGNS, DEFAULT_STICKY_PLACE, type StickyDesign } from '@/store/stickyStore';
import { useUIStore } from '@/store/uiStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { addSticky, removeSticky, setStickyContent, stickyDocFrom, stickyDocOf, stickyNotes, type StickyDoc, type StickyMark } from '@/services/stickyNotes';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { DesignIcon, OpenIcon, TrashIcon } from '@/components/Icons';
import { SWATCHES } from '@/config/swatches';
import { LABELS } from '@/config/labels';
import type { Note, NoteId } from '@/types/notes';
import styles from './StickyNotes.module.css';

// The sticky notes (services/stickyNotes.ts) over the Notes section: each stays where it was put
// (dragged by its edge or any part that isn't its text), above the notes and below panes and
// dialogs. Mounted by NotesSection, desktop only. The text is a small Tiptap editor holding only
// what a sticky can (paragraphs, bold, italic, underline, strikethrough: STICKY_MARKS), with the
// usual Ctrl+B / I / U / Shift+S and the same choices in its right-click menu.

// Right-click anywhere in Notes that has no menu of its own: New sticky note.
registerContextMenuProvider({
  id: 'section.notes.sticky',
  kind: 'section',
  when: (ctx) => ctx.section === 'notes',
  items: () => [{ id: 'new-sticky', label: LABELS.stickies.add, icon: '🗒️', run: () => { addSticky(); } }],
});

const SAVE_MS = 400;
const STICKY_W = 208;       // .sticky's width (13rem), for keeping it on the screen
const STICKY_MIN_H = 144;   // its least height
const MIN_W = 144, MIN_H = 96;   // the smallest it can be resized to
const KEY_STEP = 16;             // the grip's arrow keys

export function StickyNotes() {
  const notes = useNoteStore((s) => s.notes);
  const tags = useNoteStore((s) => s.noteTags);
  const stickies = stickyNotes(notes, tags);
  // Re-place them when the window is resized (places are fractions of the window).
  const [, setSize] = useState(0);
  useEffect(() => {
    const onResize = () => setSize((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (stickies.length === 0) return null;
  return createPortal(
    <div className={styles.layer} role="region" aria-label={LABELS.stickies.region}>
      {stickies.map((n) => <StickyNote key={n.id} note={n} />)}
    </div>,
    document.body,
  );
}

const paperFor = (color: string | null) => (color ? SWATCHES.find((s) => s.hex === color)?.pale ?? null : null);

// Only what a sticky can hold (services/stickyNotes.ts STICKY_MARKS), plus the `//name` characters
// every text field has.
const STICKY_EXTENSIONS = [
  StarterKit.configure({
    heading: false, blockquote: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false,
    code: false, codeBlock: false, horizontalRule: false, link: false, dropcursor: false, gapcursor: false, trailingNode: false,
  }),
  Placeholder.configure({ placeholder: LABELS.stickies.placeholder }),
  SpecialCharInput,
];

const MARK_SHORTCUT: Record<StickyMark, string> = { bold: 'Ctrl+B', italic: 'Ctrl+I', underline: 'Ctrl+U', strike: 'Ctrl+Shift+S' };
const MARK_ICON: Record<StickyMark, string> = { bold: 'B', italic: 'I', underline: 'U', strike: 'S' };

function toggleMark(editor: Editor, mark: StickyMark) {
  const chain = editor.chain().focus();
  if (mark === 'bold') chain.toggleBold().run();
  else if (mark === 'italic') chain.toggleItalic().run();
  else if (mark === 'underline') chain.toggleUnderline().run();
  else chain.toggleStrike().run();
}

function StickyNote({ note }: { note: Note }) {
  const place = useStickyStore((s) => s.places[note.id]) ?? DEFAULT_STICKY_PLACE;
  const setPlace = useStickyStore((s) => s.setPlace);
  const locked = isNoteLocked(note);
  const content = locked ? '' : noteView(note).content;
  const stored = locked ? null : stickyDocOf(content);
  const L = LABELS.stickies;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<StickyDoc | null>(null);
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null) { setStickyContent(note.id, pending.current); pending.current = null; }
  };
  const noteId = note.id;
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) setStickyContent(noteId, pending.current);
  }, [noteId]);

  const editor = useEditor({
    extensions: STICKY_EXTENSIONS,
    content: stored ?? '',
    editorProps: { attributes: { class: styles.text, 'aria-label': L.text, 'aria-multiline': 'true', role: 'textbox' } },
    onUpdate: ({ editor: ed }) => {
      const doc = stickyDocFrom(ed.getJSON());
      if (!doc) return;
      pending.current = doc;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_MS);
    },
    onBlur: () => flush(),
  });

  // A change from elsewhere (another device, the note's editor) is taken up unless the sticky is
  // being written in right now.
  const storedKey = stored ? JSON.stringify(stored) : null;
  useEffect(() => {
    if (!editor || editor.isDestroyed || storedKey === null || editor.isFocused || pending.current) return;
    const now = stickyDocFrom(editor.getJSON());
    if (now && JSON.stringify(now) === storedKey) return;
    editor.commands.setContent(JSON.parse(storedKey), { emitUpdate: false });
  }, [editor, storedKey]);

  // Dragging: anywhere but the text, the buttons and the resize grip.
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number; left: number; top: number } | null>(null);
  // Resizing: the grip at the bottom right corner. Width and height are kept on the screen.
  const [resize, setResize] = useState<{ x0: number; y0: number; w0: number; h0: number; w: number; h: number } | null>(null);
  const size = resize ? { w: resize.w, h: resize.h } : { w: place.w, h: place.h };
  const width = size.w ?? STICKY_W;
  const height = size.h ?? STICKY_MIN_H;
  const clampLeft = (v: number) => Math.max(0, Math.min(v, window.innerWidth - width));
  const clampTop = (v: number) => Math.max(0, Math.min(v, window.innerHeight - height));
  const left = drag ? drag.left : clampLeft(place.x * window.innerWidth);
  const top = drag ? drag.top : clampTop(place.y * window.innerHeight);
  const fitW = (v: number) => Math.round(Math.max(MIN_W, Math.min(v, window.innerWidth - left)));
  const fitH = (v: number) => Math.round(Math.max(MIN_H, Math.min(v, window.innerHeight - top)));

  function onGripDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = rootRef.current?.getBoundingClientRect();
    const w0 = place.w ?? box?.width ?? STICKY_W, h0 = place.h ?? box?.height ?? STICKY_MIN_H;
    setResize({ x0: e.clientX, y0: e.clientY, w0, h0, w: w0, h: h0 });
  }
  function onGripMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!resize) return;
    setResize({ ...resize, w: fitW(resize.w0 + e.clientX - resize.x0), h: fitH(resize.h0 + e.clientY - resize.y0) });
  }
  function onGripUp() {
    if (!resize) return;
    setPlace(note.id, { w: resize.w, h: resize.h });
    setResize(null);
  }
  function onGripKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const box = rootRef.current?.getBoundingClientRect();
    setPlace(note.id, { w: fitW((place.w ?? box?.width ?? STICKY_W) + dx * KEY_STEP), h: fitH((place.h ?? box?.height ?? STICKY_MIN_H) + dy * KEY_STEP) });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[contenteditable="true"], button, [data-sticky-grip]')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ dx: e.clientX - left, dy: e.clientY - top, left, top });
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    setDrag({ ...drag, left: clampLeft(e.clientX - drag.dx), top: clampTop(e.clientY - drag.dy) });
  }
  function onPointerUp() {
    if (!drag) return;
    setPlace(note.id, { x: drag.left / window.innerWidth, y: drag.top / window.innerHeight });
    setDrag(null);
  }

  const nextDesign = (d: StickyDesign) => STICKY_DESIGNS[(STICKY_DESIGNS.indexOf(d) + 1) % STICKY_DESIGNS.length];
  const openNote = () => useUIStore.getState().openNote(note.id);

  useContextMenuScope(rootRef, () => ({
    kind: 'sticky-note',
    data: { noteId: note.id },
    items: () => [
      ...(editor && stored !== null && editor.view.dom.contains(document.activeElement)
        ? (Object.keys(MARK_SHORTCUT) as StickyMark[]).map((m) => ({
          id: `format-${m}`, label: L.format[m], icon: editor.isActive(m) ? '✓' : MARK_ICON[m], shortcut: MARK_SHORTCUT[m],
          run: () => toggleMark(editor, m),
        }))
        : []),
      { id: 'open', label: L.open, icon: '📝', run: openNote },
      {
        id: 'design', label: L.design, submenu: [STICKY_DESIGNS.map((d) => ({
          id: d, label: L.designs[d], icon: d === place.design ? '✓' : undefined, run: () => setPlace(note.id, { design: d }),
        }))],
      },
      ...(place.w !== null || place.h !== null ? [{ id: 'size', label: L.resetSize, run: () => setPlace(note.id, { w: null, h: null }) }] : []),
      { id: 'remove', label: L.remove, icon: <TrashIcon width="1em" height="1em" />, destructive: true, run: () => removeSticky(note.id as NoteId) },
    ],
  }));

  const paper = paperFor(note.color);
  return (
    <div
      ref={rootRef}
      className={`${styles.sticky} ${drag ? styles.dragging : ''} ${size.h !== null ? styles.sized : ''}`}
      data-design={place.design}
      style={{ left, top, ...(size.w !== null ? { width: size.w } : {}), ...(size.h !== null ? { height: size.h } : {}), ...(paper ? { ['--paper' as string]: paper } : {}) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className={styles.tools}>
        <button type="button" className={styles.tool} onClick={() => setPlace(note.id, { design: nextDesign(place.design) })}
          title={L.nextDesign(L.designs[place.design])} aria-label={L.nextDesign(L.designs[place.design])}><DesignIcon /></button>
        <button type="button" className={styles.tool} onClick={openNote} title={L.open} aria-label={L.open}><OpenIcon /></button>
        <button type="button" className={styles.tool} onClick={() => removeSticky(note.id as NoteId)} title={L.remove} aria-label={L.remove}>
          <TrashIcon />
        </button>
      </div>
      {locked ? (
        <button type="button" className={styles.message} onClick={() => useUIStore.getState().requestDecrypt('note', note.id)}>🔒 {L.locked}</button>
      ) : stored === null ? (
        <button type="button" className={styles.message} onClick={openNote}>
          <span className={styles.readOnly}>{note.title}</span>
          {L.formatted}
        </button>
      ) : (
        <EditorContent editor={editor} className={styles.textHost} />
      )}
      <div
        className={styles.grip}
        data-sticky-grip=""
        role="separator"
        tabIndex={0}
        aria-label={L.resize}
        title={L.resize}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        onDoubleClick={() => setPlace(note.id, { w: null, h: null })}
        onKeyDown={onGripKey}
      />
    </div>
  );
}
