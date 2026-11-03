import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useNoteStore } from '@/store/noteStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { closeSelectionMenu, getSelectionMenu } from './selectionMenuState';
import { objectTriggerStorage } from './NoteObjectTrigger';
import { linkToTerm, selectionActions, termsFor, type SelectionActionGroup } from './selectionActions';
import { useFloatingPlacement } from '@/utils/floatingPlacement';
import styles from './NoteObjectMenu.module.css';

const MAX_TERMS = 7;

interface Props {
  editor: Editor;
}

interface Item {
  key:      string;
  group:    'suggested' | 'terms' | SelectionActionGroup;
  icon:     ReactNode;
  label:    string;
  detail?:  string;
  color?:   string;
  run:      () => void;
}

// The menu `\` opens on selected text (objects/selectionMenu.ts): link it to a Glossary term
// (suggested from the selected words, the "link a …" picker pattern of utils/suggestRank.ts), or
// mark it as a new Definition or Concept, Important at a level, or Review later. Typing filters
// both; ↑/↓ and Enter choose; Esc goes back to the text with the selection as it was.
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

  // The terms to link to, then everything else that can be done with the selection
  // (objects/selectionActions.ts, the list right-click reads too).
  const items = useMemo(() => {
    void entriesVersion; void secretsVersion;
    const { terms, suggested, any } = termsFor(selected, query);
    const after = (run: () => void) => () => { close(); run(); };
    const linkItems: Item[] = terms.slice(0, MAX_TERMS).map((e, i) => ({
      key: `term-${e.id}`, group: i < suggested ? 'suggested' : 'terms', icon: e.icon, label: e.term,
      detail: e.meaning || e.noteTitle, color: e.color,
      run: after(() => {
        linkToTerm(editor, range, e);
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.to)));
      }),
    }));
    // Marks are made with the cursor back in the text; the rest open something of their own.
    const actions: Item[] = selectionActions(editor, range).map((a) => ({
      ...a,
      run: a.group === 'mark' && a.set !== 'glossary' ? after(a.run) : () => { closeSelectionMenu(view); a.run(); },
    }));
    const q = query.trim().toLowerCase();
    const shown = q ? actions.filter((m) => m.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || m.label.toLowerCase().includes(q)) : actions;
    return { all: [...linkItems, ...shown], hasTerms: any };
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
  const groupLabel: Record<Item['group'], string> = { suggested: L.suggested, terms: L.linkGroup, mark: L.markGroup, turn: L.turnGroup, link: L.linkOther, send: L.sendGroup };
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
        {!items.hasTerms && !query && <li role="presentation" className={styles.emptyNote}>{L.noTerms}</li>}
        {items.all.map((item, i) => (
          <Fragment key={item.key}>
            {(i === 0 || item.group !== items.all[i - 1].group) && (
              <li role="presentation" className={styles.group}>{groupLabel[item.group]}</li>
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
              {item.color && <span className={styles.swatch} style={{ background: item.color }} aria-hidden="true" />}
            </li>
          </Fragment>
        ))}
      </ul>
      <div className={styles.footer}>{L.hint}</div>
    </div>,
    document.body,
  );
}
