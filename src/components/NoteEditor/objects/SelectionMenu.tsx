import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useNoteStore } from '@/store/noteStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { glossaryEntries, type GlossaryEntry } from '@/services/glossary';
import { rankSearch, rankSuggestions } from '@/utils/suggestRank';
import { linkConceptRef } from '../extensions/ConceptRef';
import { IMPORTANCE_LEVELS } from '../extensions/importanceLevels';
import { setImportance, toggleReview } from '../extensions/Importance';
import { BUILTIN_TAGS } from '../builtinTags';
import { quoteFromSelection } from '../extensions/Quote';
import { closeSelectionMenu, getSelectionMenu } from './selectionMenuState';
import { objectTriggerStorage } from './NoteObjectTrigger';
import styles from './NoteObjectMenu.module.css';

const MENU_WIDTH = 344;
const ROOM_NEEDED = 300;
const MAX_TERMS = 7;

interface Props {
  editor: Editor;
  // Definition… / Concept…: the structured-tag popover NoteEditor opens for a new term.
  onMarkAs: (typeKey: string, from: number, to: number) => void;
}

interface Item {
  key:      string;
  group:    'suggested' | 'link' | 'mark' | 'turn';
  icon:     string;
  label:    string;
  detail?:  string;
  color?:   string;
  run:      () => void;
}

const termFields = (e: GlossaryEntry) => [
  { text: e.term, weight: 3 },
  { text: e.meaning, weight: 1, counted: true },
  { text: e.noteTitle, weight: 1 },
];

// The menu `\` opens on selected text (objects/selectionMenu.ts): link it to a Glossary term
// (suggested from the selected words, the "link a …" picker pattern of utils/suggestRank.ts), or
// mark it as a new Definition or Concept, Important at a level, or Review later. Typing filters
// both; ↑/↓ and Enter choose; Esc goes back to the text with the selection as it was.
export function SelectionMenu({ editor, onMarkAs }: Props) {
  const range = useEditorState({ editor, selector: ({ editor: ed }) => (ed ? getSelectionMenu(ed.state) : null) });
  const open = !!range && !editor.view.isDestroyed;
  if (!open || !range) return null;
  return <SelectionMenuPanel key={`${range.from}-${range.to}`} editor={editor} range={range} onMarkAs={onMarkAs} />;
}

function SelectionMenuPanel({ editor, range, onMarkAs }: Props & { range: { from: number; to: number } }) {
  const view = editor.view;
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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
  const reviewing = useMemo(() => {
    let on = false;
    view.state.doc.nodesBetween(range.from, range.to, (n) => {
      if (n.isText && n.marks.some((m) => m.type.name === 'noteTag' && m.attrs.typeKey === 'important' && m.attrs.reviewDue)) on = true;
    });
    return on;
  }, [view, range]);

  const items = useMemo(() => {
    void entriesVersion; void secretsVersion;
    const L = LABELS.selectionMenu;
    const entries = glossaryEntries().filter((e) => !e.locked && e.term);
    const recency = (e: GlossaryEntry) => Date.parse(e.updatedAt) || 0;
    let ranked: GlossaryEntry[];
    let suggestedCount = 0;
    if (query.trim()) {
      ranked = rankSearch(entries, termFields, recency, query);
    } else {
      const r = rankSuggestions(entries, termFields, recency, selected);
      ranked = r.items;
      suggestedCount = r.suggested;
    }
    const after = (run: () => void) => () => { close(); run(); };
    const linkItems: Item[] = ranked.slice(0, MAX_TERMS).map((e, i) => ({
      key: `term-${e.id}`, group: i < suggestedCount ? 'suggested' : 'link', icon: e.icon, label: e.term,
      detail: e.meaning || e.noteTitle, color: e.color,
      run: after(() => {
        linkConceptRef(view, range.from, range.to, { id: e.id, typeKey: e.typeKey });
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.to)));
      }),
    }));
    const tag = (typeKey: string) => BUILTIN_TAGS.find((t) => t.typeKey === typeKey)!;
    const marks: Item[] = [
      { key: 'definition', group: 'mark', icon: tag('definition').icon, label: L.definition, color: tag('definition').color, run: () => { closeSelectionMenu(view); onMarkAs('definition', range.from, range.to); } },
      { key: 'concept', group: 'mark', icon: tag('concept').icon, label: L.concept, color: tag('concept').color, run: () => { closeSelectionMenu(view); onMarkAs('concept', range.from, range.to); } },
      ...IMPORTANCE_LEVELS.map((lv): Item => ({
        key: `important-${lv.level}`, group: 'mark', icon: lv.icon, label: lv.label, color: lv.color,
        run: after(() => setImportance(view, range.from, range.to, lv.level)),
      })),
      { key: 'review', group: 'mark', icon: '🔁', label: reviewing ? LABELS.importance.stopReviewing : LABELS.importance.reviewLater, run: after(() => toggleReview(view, range.from, range.to)) },
      { key: 'quote', group: 'turn', icon: '❝', label: LABELS.noteBlocks.quote.turnInto, run: () => { closeSelectionMenu(view); quoteFromSelection(view, range.from, range.to); } },
    ];
    const q = query.trim().toLowerCase();
    const markItems = q ? marks.filter((m) => m.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || m.label.toLowerCase().includes(q)) : marks;
    return { all: [...linkItems, ...markItems], hasTerms: entries.length > 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- close/onMarkAs are per-render closures over stable things
  }, [query, selected, reviewing, entriesVersion, secretsVersion]);

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

  let rect: { left: number; top: number; bottom: number };
  try { rect = view.coordsAtPos(range.to); } catch { return null; }
  const below = window.innerHeight - rect.bottom >= ROOM_NEEDED || rect.top < ROOM_NEEDED;
  const position = {
    left: Math.max(8, Math.min(rect.left - 6, window.innerWidth - MENU_WIDTH - 8)),
    ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
  };

  const L = LABELS.selectionMenu;
  const groupLabel = { suggested: L.suggested, link: L.linkGroup, mark: L.markGroup, turn: L.turnGroup };
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
