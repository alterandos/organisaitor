import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { allPassages, canInsertPicture, copyPassage, embedHere, hereFor, linkHere, noteSchema, openPassage, passageDoc } from '@/services/lookUp';
import { passageWhere, searchPassages, type Passage } from '@/utils/notePassages';
import { CloseIcon, ImageIcon, LinkIcon, OpenIcon, SearchIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import { EditorContent, useEditor } from '@tiptap/react';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import noteStyles from '@/components/NoteEditor/NoteEditor.module.css';
import { LookUpMarks, markPassage } from './lookUpMarks';
import styles from './LookUpPane.module.css';

const L = LABELS.lookUp;

// Look up (Alt+L, from anywhere): type, the passages and pictures found list on one side, the one
// highlighted shows on the other as it reads now; then Embed here, Link here, Copy or Open, or Esc.
// "Here" is the note that was in front when it opened (services/lookUp.ts).
export function LookUpPane() {
  const close = useUIStore((s) => s.closeLookUp);
  const [here] = useState(hereFor);
  const schema = useMemo(noteSchema, []);
  const passages = useMemo(() => allPassages(schema), [schema]);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const results = useMemo(() => searchPassages(passages, query), [passages, query]);
  const current: Passage | undefined = results[Math.min(highlight, results.length - 1)];
  const listRef = useRef<HTMLUListElement>(null);

  const canEmbed = !!here && (!current || current.kind !== 'picture' || canInsertPicture(current, here));
  useEscapeClose(close);
  useCtrlEnterSubmit(() => { if (current && canEmbed) embed(); }, !!current);

  function embed() { if (current && here) { close(); embedHere(current, here); } }
  function link() { if (current && here) { close(); linkHere(current, here); } }
  function open() { if (current) { close(); openPassage(current, schema); } }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight, results]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = results.length;
      if (n) setHighlight((Math.min(highlight, n - 1) + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      open();
    }
  };

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.modal} role="dialog" aria-label={L.title}>
        <div className={styles.searchRow}>
          <SearchIcon className={styles.searchIcon} />
          <input className={styles.search} autoFocus value={query} placeholder={L.placeholder} aria-label={L.placeholder}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); }} onKeyDown={onKeyDown} />
          <button type="button" className={styles.closeBtn} onClick={close} aria-label={L.close}><CloseIcon /></button>
        </div>
        <div className={styles.body}>
          <ul ref={listRef} className={styles.results} role="listbox" aria-label={L.results}>
            {results.map((p, i) => (
              <li key={`${p.noteId}:${p.tabId}:${p.pos}`} role="option" aria-selected={p === current}
                className={`${styles.result} ${p === current ? styles.resultActive : ''}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => setHighlight(i)} onDoubleClick={open}>
                <span className={styles.resultText} data-kind={p.kind}>
                  {p.kind === 'picture' && <ImageIcon className={styles.kindIcon} />}
                  {p.term && <span className={styles.termIcon} aria-hidden="true">{p.term.icon}</span>}
                  {p.term ? <><b>{p.text}</b>{p.term.meaning && <span className={styles.termMeaning}> · {p.term.meaning}</span>}</> : p.text || L.picture}
                </span>
                <span className={styles.resultNote}>{passageWhere(p).join(' › ')}</span>
              </li>
            ))}
            {query.trim() && !results.length && <li className={styles.empty}>{L.nothing}</li>}
            {!query.trim() && <li className={styles.empty}>{L.hint}</li>}
          </ul>
          <section className={styles.preview} aria-live="polite">
            {current ? (
              <>
                <Where passage={current} />
                <Preview key={`${current.noteId}:${current.tabId}:${current.term?.entryId ?? ''}`} passage={current} />
              </>
            ) : <p className={styles.empty}>{L.previewHint}</p>}
          </section>
        </div>
        <footer className={styles.actions}>
          <span className={styles.hereNote}>{here ? '' : L.noHere}</span>
          <button type="button" className={styles.btn} disabled={!current} onClick={() => current && void copyPassage(current, schema)}>{L.copy}</button>
          <button type="button" className={styles.btn} disabled={!current} onClick={open} title="Enter"><OpenIcon /> {L.open}</button>
          <button type="button" className={styles.btn} disabled={!current || !here} onClick={link}><LinkIcon /> {L.link}</button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!current || !canEmbed} onClick={embed} title="Ctrl+Enter">
            {current?.term ? L.insertCard : current?.kind === 'picture' ? L.insertPicture : L.embed}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// The passage in the note it's from, drawn by the note editor itself (read-only, the same
// extensions a note uses, as the block guide's examples are), so it looks as it does there: heading
// numbers, maths, cards, every block. What's around it is greyed; the passage is scrolled to.
// Mounted per note tab (keyed), so moving between passages of one tab only moves the marks.
function Preview({ passage }: { passage: Passage }) {
  const extensions = useMemo(() => [...noteEditorExtensions({ noteEncrypted: () => null, linkClass: noteStyles.link }), LookUpMarks], []);
  const [content] = useState(() => passageDoc(passage, noteSchema())?.toJSON() ?? '');
  const editor = useEditor({
    extensions,
    content,
    editable: false,
    editorProps: { attributes: { class: `${noteStyles.editorContent} ${styles.previewText}`, 'aria-label': L.preview } },
  });
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editor || editor.isDestroyed || passage.term) return;
    editor.view.dispatch(markPassage(editor.state, passage));
    const frame = requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[data-lookup-passage]')?.scrollIntoView?.({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [editor, passage]);
  return (
    <div ref={wrap}>
      <EditorContent editor={editor} />
    </div>
  );
}

// Where it is: notebook › note › tab, the note in bold.
function Where({ passage }: { passage: Passage }) {
  return (
    <nav className={styles.where} aria-label={L.where}>
      {passage.term && <span className={styles.definedIn}>{L.definedIn}</span>}
      {passage.notebooks.map((n, i) => <span key={i}>{n}</span>)}
      <b>{passage.noteTitle}</b>
      {passage.tabName && <span>{passage.tabName}</span>}
    </nav>
  );
}
