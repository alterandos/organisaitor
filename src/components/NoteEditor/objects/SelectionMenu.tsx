import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState, type Editor } from '@tiptap/react';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useNoteStore } from '@/store/noteStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { closeSelectionMenu, getSelectionMenu } from './selectionMenuState';
import { objectTriggerStorage } from './NoteObjectTrigger';
import { selectionActions, selectionGroup, termsFor } from './selectionActions';
import { useFloatingPlacement } from '@/utils/floatingPlacement';
import styles from './NoteObjectMenu.module.css';

interface Props {
  editor: Editor;
}

interface Item {
  key:      string;
  heading:  string;
  shortcut?: string;
  icon:     ReactNode;
  label:    string;
  detail?:  string;
  color?:   string;
  run:      () => void;
}

// The menu `\` opens on selected text (objects/selectionMenu.ts): everything in
// objects/selectionActions.ts, in its groups' order (turn into, send, annotate, link), then the
// Glossary terms to link it to (suggested from the selected words, the "link a …" picker pattern
// of utils/suggestRank.ts), last because they're the least often wanted (the user, 2026-11-10).
// Typing filters both; ↑/↓ and Enter choose; Esc goes back to the text with the selection as it was.
export function SelectionMenu({ editor }: Props) {
  const range = useEditorState({ editor, selector: ({ editor: ed }) => (ed ? getSelectionMenu(ed.state) : null) });
  const open = !!range && !editor.view.isDestroyed;
  if (!open || !range) return null;
  return <SelectionMenuPanel key={`${range.from}-${range.to}`} editor={editor} range={range} />;
}

function SelectionMenuPanel({ editor, range }: Props & { range: { from: number; to: number } }) {
  const view = editor.view;
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Under the cursor, or above it; too tall either way, the list scrolls (utils/floatingPlacement.ts).
  const anchorBox = (() => {
    if (view.isDestroyed) return null;
    try { const r = view.coordsAtPos(range.to); return { left: r.left - 6, right: r.left - 6, top: r.top, bottom: r.bottom }; } catch { return null; }
  })();
  const { ref: menuRef, style: position } = useFloatingPlacement<HTMLDivElement>(anchorBox, { gap: 6 });
  const entriesVersion = useNoteStore((s) => s.structuredTagEntries);
  const secretsVersion = useSecretsVersion((s) => s.version);

  const close = (refocus = true) => {
    if (view.isDestroyed) return;
    closeSelectionMenu(view);
    if (refocus) view.focus();
  };
  useEscapeClose(() => close());

  useEffect(() => { inputRef.current?.focus(); }, []);

  // A press outside the menu closes it, leaving the selection.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  });

  const selected = view.state.doc.textBetween(range.from, range.to, ' ');

  // Everything that can be done with the selection, the Glossary terms last (objects/
  // selectionActions.ts: the list, order and groups right-click reads too), filtered by the query.
  const items = useMemo(() => {
    void entriesVersion; void secretsVersion;
    const all: Item[] = selectionActions(editor, range, query).map((a) => ({
      ...a,
      heading: a.heading ?? selectionGroup(a.group).label,
      // Marks are made with the cursor back in the text; the rest open something of their own.
      run: a.group === 'mark' && a.set !== 'glossary' ? () => { close(); a.run(); } : () => { closeSelectionMenu(view); a.run(); },
    }));
    return { all, hasTerms: termsFor(selected).any };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- close is a per-render closure over stable things
  }, [query, selected, entriesVersion, secretsVersion]);

  const current = Math.min(highlight, Math.max(0, items.all.length - 1));

  // ↑/↓ and Enter, from the search box or forwarded from the editor.
  function navigate(key: string): boolean {
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const n = items.all.length;
      if (n) setHighlight((current + (key === 'ArrowDown' ? 1 : -1) + n) % n);
      return true;
    }
    if (key === 'Enter') { items.all[current]?.run(); return true; }
    return false;
  }

  // Keys typed before the search box had focus reach the editor: the menu takes them, so a fast
  // `\conc` filters the menu rather than replacing the selected text.
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });
  useEffect(() => {
    const storage = objectTriggerStorage(editor);
    storage.selectionMenuKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
      if (navigateRef.current(event.key)) return true;
      if (event.key === 'Backspace') { setQuery((q) => q.slice(0, -1)); inputRef.current?.focus(); return true; }
      if (event.key.length === 1) { setQuery((q) => q + event.key); setHighlight(0); inputRef.current?.focus(); return true; }
      return false;
    };
    return () => { storage.selectionMenuKey = null; };
  }, [editor]);

  if (!anchorBox) return null;

  const L = LABELS.selectionMenu;
  return createPortal(
    <div ref={menuRef} className={styles.menu} style={position} onMouseDown={(e) => { if (e.target !== inputRef.current) e.preventDefault(); }}>
      <input
        ref={inputRef}
        className={styles.search}
        value={query}
        placeholder={L.search}
        onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
        onKeyDown={(e) => { if (navigate(e.key)) { e.preventDefault(); e.stopPropagation(); } }}
      />
      <ul className={styles.kinds} role="listbox">
        {items.all.map((item, i) => (
          <Fragment key={item.key}>
            {(i === 0 || item.heading !== items.all[i - 1].heading) && (
              <li role="presentation" className={styles.group}>{item.heading}</li>
            )}
            <li
              role="option"
              aria-selected={i === current}
              className={`${styles.kind} ${i === current ? styles.kindActive : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => item.run()}
            >
              <span className={styles.kindIcon} aria-hidden="true">{item.icon}</span>
              <span className={styles.kindText}>
                <span className={styles.kindLabel}>{item.label}</span>
                {item.detail && <span className={styles.kindHint}>{item.detail}</span>}
              </span>
              {item.shortcut && <kbd className={styles.shortcut}>{item.shortcut}</kbd>}
              {item.color && <span className={styles.swatch} style={{ background: item.color }} aria-hidden="true" />}
            </li>
          </Fragment>
        ))}
        {!items.hasTerms && !query && <li role="presentation" className={styles.emptyNote}>{L.noTerms}</li>}
      </ul>
      <div className={styles.footer}>{L.hint}</div>
    </div>,
    document.body,
  );
}
