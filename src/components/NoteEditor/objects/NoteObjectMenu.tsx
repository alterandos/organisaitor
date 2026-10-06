import { useEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState, type Editor } from '@tiptap/react';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import type { NoteObjectContext } from './types';
import { getSession } from './session';
import { acceptKind, commitSession, dismissSession, resolveDraft, setHighlight, setOverride } from './actions';
import { objectTriggerStorage } from './NoteObjectTrigger';
import styles from './NoteObjectMenu.module.css';

const MENU_WIDTH = 344;
const ROOM_NEEDED = 260;

interface Props {
  editor:     Editor;
  getContext: () => NoteObjectContext | null;
}

// The menu under (or above) a `\` being typed: the kinds that match while picking, then a live
// preview of what Enter will create, with editable fields. It never holds state of its own — the
// session (objects/session.ts) does — so the keyboard in the editor and the mouse here always
// agree.
export function NoteObjectMenu({ editor, getContext }: Props) {
  const session = useEditorState({ editor, selector: ({ editor: ed }) => (ed ? getSession(ed.state) : null) });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [, reposition] = useReducer((n: number) => n + 1, 0);

  const visible = !!session && (session.interp.phase === 'composing' || session.interp.matches.length > 0);
  const view = editor.view;
  const dismiss = () => { if (!view.isDestroyed) dismissSession(view); };

  // Android's back button (and Escape while focus is in a field) close it like any overlay.
  useEscapeClose(dismiss, visible);

  // Follow the text when the note scrolls or the window resizes.
  useEffect(() => {
    if (!visible) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [visible]);

  // A press anywhere but the editor or this menu ends the session (the text stays).
  useEffect(() => {
    if (!session) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || view.dom.contains(t)) return;
      dismiss();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  });

  // Tab in the editor moves into the fields.
  useEffect(() => {
    const storage = objectTriggerStorage(editor);
    storage.focusFields = () => {
      const first = inputRefs.current.find(Boolean);
      if (!first) return false;
      first.focus();
      first.select();
      return true;
    };
    return () => { storage.focusFields = null; };
  }, [editor]);

  if (!session || !visible || view.isDestroyed) return null;
  const ctx = getContext();
  if (!ctx) return null;

  let rect: { left: number; top: number; bottom: number };
  try { rect = view.coordsAtPos(session.anchor); } catch { return null; }
  const below = window.innerHeight - rect.bottom >= ROOM_NEEDED || rect.top < ROOM_NEEDED;
  const position = {
    left: Math.max(8, Math.min(rect.left - 6, window.innerWidth - MENU_WIDTH - 8)),
    ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
  };

  const backToText = () => view.focus();
  const commit = (mode: 'quick' | 'full') => {
    if (commitSession(view, mode, ctx) && mode === 'quick') view.focus();
  };

  let content: React.ReactNode;
  if (session.interp.phase === 'picking') {
    const { matches } = session.interp;
    content = (
      <>
        <ul className={styles.kinds} role="listbox">
          {matches.map((kind, i) => (
            <li
              key={kind.id}
              role="option"
              aria-selected={i === session.highlight}
              className={`${styles.kind} ${i === session.highlight ? styles.kindActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => { if (i !== session.highlight) setHighlight(view, i); }}
              onClick={() => { acceptKind(view, kind); view.focus(); }}
            >
              <span className={styles.kindIcon} aria-hidden="true">{kind.icon}</span>
              <span className={styles.kindText}>
                <span className={styles.kindLabel}>{kind.label}</span>
                <span className={styles.kindHint}>{kind.hint}</span>
              </span>
              <span className={styles.kindKeyword}>\{[kind.id, ...kind.aliases].reduce((a, b) => (b.length < a.length ? b : a))}</span>
            </li>
          ))}
        </ul>
        <div className={styles.footer}>{LABELS.noteObjects.pickHint}</div>
      </>
    );
  } else {
    const { kind, body } = session.interp;
    const { draft, invalid } = resolveDraft(kind, body, session.overrides, ctx);
    const fields = kind.fields(draft);
    content = (
      <>
        <div className={styles.header}>
          <span className={styles.kindIcon} aria-hidden="true">{kind.icon}</span>
          <span className={styles.headerLabel}>{LABELS.noteObjects.newKind(kind.label)}</span>
        </div>
        <div className={styles.fields}>
          {fields.map((f, i) => (
            <label key={f.key} className={styles.field}>
              <span className={styles.fieldLabel}>{f.label}</span>
              <input
                ref={(el) => { inputRefs.current[i] = el; }}
                className={`${styles.fieldInput} ${invalid.includes(f.key) ? styles.fieldInvalid : ''}`}
                value={session.overrides[f.key] ?? f.value}
                placeholder={f.placeholder}
                onChange={(e) => setOverride(view, f.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(e.ctrlKey || e.metaKey ? 'full' : 'quick'); }
                  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); backToText(); }
                  else if (e.key === 'Tab' && ((!e.shiftKey && i === fields.length - 1) || (e.shiftKey && i === 0))) { e.preventDefault(); backToText(); }
                }}
              />
            </label>
          ))}
        </div>
        {session.error && <div className={styles.error} role="alert">{session.error}</div>}
        <div className={styles.actions}>
          <span className={styles.footerText}>{LABELS.noteObjects.composeHint}</span>
          <button type="button" className={styles.secondaryBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => commit('full')}>
            {LABELS.noteObjects.moreOptions} <kbd className={styles.kbd}>Ctrl+↵</kbd>
          </button>
          <button type="button" className={styles.primaryBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => commit('quick')}>
            {LABELS.noteObjects.create} <kbd className={styles.kbd}>↵</kbd>
          </button>
        </div>
      </>
    );
  }

  return createPortal(
    <div ref={menuRef} className={styles.menu} style={position}>{content}</div>,
    document.body,
  );
}
