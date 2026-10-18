import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useNoteStore } from '@/store/noteStore';
import { LABELS } from '@/config/labels';
import { INBOX_ICON } from '@/config/itemIcons';
import { listInboxes, type SendTarget } from '@/services/noteInbox';
import { rankSearch, rankSuggestions, type RankField } from '@/utils/suggestRank';
import type { InboxRef } from '@/utils/noteInboxes';
// Same look as the note, task and list pickers, so the "send / link to …" dialogs read as one family.
import styles from '@/components/NotePickerModal/NotePickerModal.module.css';
import own from './InboxPickerModal.module.css';
import { CloseIcon } from '@/components/Icons';

interface Props {
  // The selected text: its keywords order the inboxes while the search is empty.
  suggestFrom: string;
  onSend:      (target: SendTarget, makeTask: boolean) => void;
  onClose:     () => void;
}

type Choice = { kind: 'inbox'; inbox: InboxRef } | { kind: 'new' };

const fieldsOf = (i: InboxRef): RankField[] => [
  { text: i.title, weight: 3 },
  { text: i.noteTitle, weight: 2 },
  { text: i.items.map((it) => it.fullText).join(' '), weight: 1, counted: true },
];
const recencyOf = (i: InboxRef) => Math.max(0, ...i.items.map((it) => Date.parse(it.sentAt ?? '') || 0));

// Send to inbox: every inbox in a readable note, ordered like every picker (utils/suggestRank.ts):
// suggested from the selected words, then the most recently used. The last choice makes a new
// inbox at the end of this note. Portaled, like the other pickers.
export function InboxPickerModal({ suggestFrom, onSend, onClose }: Props) {
  const notes = useNoteStore((s) => s.notes);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [makeTask, setMakeTask] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const L = LABELS.sendToInbox;

  useEscapeClose(onClose);

  const { choices, suggested, keywords } = useMemo(() => {
    void notes;
    const inboxes = listInboxes();
    const ranked = query.trim()
      ? { items: rankSearch(inboxes, fieldsOf, recencyOf, query), suggested: 0, keywords: [] as string[] }
      : rankSuggestions(inboxes, fieldsOf, recencyOf, suggestFrom);
    const list: Choice[] = ranked.items.map((inbox) => ({ kind: 'inbox', inbox }));
    list.push({ kind: 'new' });
    return { choices: list, suggested: ranked.suggested, keywords: ranked.keywords };
  }, [notes, query, suggestFrom]);

  const last = choices.length - 1;
  if (highlight > last) setHighlight(last);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlight, choices]);

  const send = (c: Choice) => { onClose(); onSend(c.kind === 'new' ? { newHere: true } : c.inbox, makeTask); };

  // Capture phase + stopImmediatePropagation, as in the other pickers: the pane underneath binds
  // Ctrl+Enter to its own action and must not also answer while this is on top.
  const sendRef = useRef(() => {});
  useEffect(() => { sendRef.current = () => { const c = choices[highlight]; if (c) send(c); }; });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        sendRef.current();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((i) => Math.min(i + 1, last)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); sendRef.current(); }
  };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      <div className={styles.modal} role="dialog" aria-label={L.pickerTitle}>
        <div className={styles.header}>
          <span className={styles.title}>{INBOX_ICON} {L.pickerTitle}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <input
          autoFocus
          className={styles.search}
          placeholder={L.search}
          aria-label={L.search}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={onKeyDown}
        />
        <label className={own.option}>
          <input type="checkbox" checked={makeTask} onChange={(e) => setMakeTask(e.target.checked)} />
          {L.alsoTask}
        </label>

        <div className={styles.results} ref={listRef} role="listbox" aria-label={L.pickerTitle}>
          {choices.length === 1 && <div className={styles.empty}>{L.empty}</div>}
          {choices.map((c, i) => {
            const active = i === highlight;
            const top = c.kind === 'new' ? `＋ ${L.newHere}` : `${INBOX_ICON} ${c.inbox.title || LABELS.noteBlocks.inbox.defaultTitle}`;
            const path = c.kind === 'new' ? null : `${c.inbox.noteTitle || 'Untitled'} · ${c.inbox.items.length}`;
            return (
              <Fragment key={c.kind === 'new' ? 'new' : `${c.inbox.noteId}:${c.inbox.inboxId}`}>
                {suggested > 0 && i === 0 && <div className={styles.sectionLabel}>{LABELS.pickers.suggestedFrom(keywords)}</div>}
                {suggested > 0 && i === suggested && c.kind === 'inbox' && <div className={styles.sectionLabel}>{LABELS.pickers.recent}</div>}
                <div
                  data-active={active || undefined}
                  className={`${styles.result} ${active ? styles.resultActive : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                  role="option"
                  aria-selected={active}
                >
                  <button type="button" className={styles.resultMain} onClick={() => send(c)}>
                    <span className={styles.resultTop}><span className={styles.resultTitle}>{top}</span></span>
                    {path && <span className={styles.resultPath}>{path}</span>}
                  </button>
                </div>
              </Fragment>
            );
          })}
        </div>

        <div className={styles.footer}>{L.footer}</div>
      </div>
    </div>,
    document.body,
  );
}
