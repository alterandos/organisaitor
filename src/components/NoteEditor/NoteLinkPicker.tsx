import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Schema } from '@tiptap/pm/model';
import { NotePickerModal } from '@/components/NotePickerModal/NotePickerModal';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useNoteStore } from '@/store/noteStore';
import { noteView } from '@/services/noteSecrets';
import { ensureBlockId, noteDocFor } from '@/services/noteLinkTargets';
import { passagesOf, type Passage } from '@/utils/noteLinks';
import { MAIN_TAB_ID } from '@/utils/noteTabs';
import { LABELS } from '@/config/labels';
import { EMBED_ICON, NOTE_LINK_ICON } from '@/config/itemIcons';
import type { NoteId } from '@/types';
import styles from '@/components/NotePickerModal/NotePickerModal.module.css';
import own from './NoteLinkPicker.module.css';

export interface PickedLink {
  noteId:  string;
  tabId:   string | null;
  blockId: string | null;
  // What the link reads as when it's put in with no text selected: the heading, else the note's title.
  name:    string;
}

interface Props {
  purpose:     'link' | 'embed';
  schema:      Schema;
  suggestFrom: string;
  onPick:      (picked: PickedLink) => void;
  onClose:     () => void;
}

// Linking or embedding (`[[`, `\ref`, `\embed`, Link to a note…): the note picker, then which part
// of that note (the whole note, a heading and its section, or a paragraph). Choosing a passage gives
// it a lasting id in its note (ensureBlockId) so the link holds as the note changes.
export function NoteLinkPicker({ purpose, schema, suggestFrom, onPick, onClose }: Props) {
  const [note, setNote] = useState<{ id: string; tabId: string | null } | null>(null);
  // The note picker closes itself after a pick; that close moves on to the passage step instead.
  const picked = useRef(false);
  if (!note) {
    return (
      <NotePickerModal
        excludeIds={NO_EXCLUSIONS}
        suggestFrom={suggestFrom}
        onPick={(id, tabId) => { picked.current = true; setNote({ id, tabId: !tabId || tabId === MAIN_TAB_ID ? null : tabId }); }}
        onClose={() => { if (picked.current) picked.current = false; else onClose(); }}
      />
    );
  }
  return <PassageStep key={`${note.id}:${note.tabId}`} purpose={purpose} schema={schema} noteId={note.id} tabId={note.tabId} onPick={onPick} onBack={() => { picked.current = false; setNote(null); }} onClose={onClose} />;
}

type Choice = { kind: 'whole' } | { kind: 'passage'; passage: Passage };

interface StepProps {
  purpose: 'link' | 'embed';
  schema:  Schema;
  noteId:  string;
  tabId:   string | null;
  onPick:  (picked: PickedLink) => void;
  onBack:  () => void;
  onClose: () => void;
}

const SNIPPET = 120;
const NO_EXCLUSIONS: ReadonlySet<string> = new Set();

function PassageStep({ purpose, schema, noteId, tabId, onPick, onBack, onClose }: StepProps) {
  const L = LABELS.noteLinks;
  const raw = useNoteStore((s) => s.notes[noteId as NoteId]);
  const title = raw ? noteView(raw).title || LABELS.mobileNotes.untitled : '';
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEscapeClose(onBack);

  const passages = useMemo(() => {
    void raw;
    const doc = noteDocFor(noteId, tabId, schema);
    return doc ? passagesOf(doc) : [];
  }, [raw, noteId, tabId, schema]);

  const choices = useMemo<Choice[]>(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = passages.filter((p) => words.every((w) => p.text.toLowerCase().includes(w)));
    return [...(words.length ? [] : [{ kind: 'whole' } as Choice]), ...hits.map((passage) => ({ kind: 'passage', passage }) as Choice)];
  }, [passages, query]);

  const last = choices.length - 1;
  if (highlight > Math.max(0, last)) setHighlight(Math.max(0, last));

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlight, choices]);

  const pick = (c: Choice) => {
    if (c.kind === 'whole') { onClose(); onPick({ noteId, tabId, blockId: null, name: title }); return; }
    const blockId = c.passage.blockId ?? ensureBlockId(noteId, tabId, c.passage.pos, schema);
    onClose();
    onPick({ noteId, tabId, blockId, name: c.passage.kind === 'heading' ? c.passage.text : title });
  };

  // Capture phase, as in the other pickers: the pane underneath binds Ctrl+Enter to its own action.
  const pickRef = useRef(() => {});
  useEffect(() => { pickRef.current = () => { const c = choices[highlight]; if (c) pick(c); }; });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); pickRef.current(); }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((i) => Math.min(i + 1, last)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pickRef.current(); }
  };

  const heading = purpose === 'embed' ? L.pickEmbed : L.pickPassage;
  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      <div className={styles.modal} role="dialog" aria-label={heading}>
        <div className={styles.header}>
          <button type="button" className={own.back} onClick={onBack} aria-label={LABELS.mobileNotes.back}>‹</button>
          <span className={styles.title}>{purpose === 'embed' ? EMBED_ICON : NOTE_LINK_ICON} {heading} <span className={own.noteName}>{title}</span></span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>
        <input
          autoFocus
          className={styles.search}
          placeholder={L.searchPassages}
          aria-label={L.searchPassages}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={onKeyDown}
        />
        <div className={styles.results} ref={listRef} role="listbox" aria-label={heading}>
          {choices.length === 0 && <div className={styles.empty}>{L.noPassages}</div>}
          {choices.map((c, i) => {
            const active = i === highlight;
            const text = c.kind === 'whole' ? L.wholeNote : c.passage.text.length > SNIPPET ? `${c.passage.text.slice(0, SNIPPET)}…` : c.passage.text;
            const level = c.kind === 'passage' && c.passage.kind === 'heading' ? c.passage.level : 0;
            return (
              <div
                key={c.kind === 'whole' ? 'whole' : c.passage.pos}
                data-active={active || undefined}
                className={`${styles.result} ${active ? styles.resultActive : ''}`}
                onMouseEnter={() => setHighlight(i)}
                role="option"
                aria-selected={active}
              >
                <button type="button" className={styles.resultMain} onClick={() => pick(c)}>
                  <span
                    className={c.kind === 'whole' ? own.whole : level ? own.heading : own.paragraph}
                    style={level ? { paddingLeft: `${(level - 1) * 0.75}rem` } : undefined}
                  >
                    {text}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div className={styles.footer}>{L.passageFooter}</div>
      </div>
    </div>,
    document.body,
  );
}
