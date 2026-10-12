import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { LABELS } from '@/config/labels';
import { HUB_ICON, ITEM_TYPE_ICON } from '@/config/itemIcons';
import { HubIcon } from '@/components/Icons';
import { listHubs, type HubTarget, type LinkChoice } from '@/services/noteHubs';
import { glossaryEntries, type GlossaryEntry } from '@/services/glossary';
import { rankSearch, rankSuggestions, type RankField } from '@/utils/suggestRank';
import { RELATIONS, type HubRef, type HubRelation } from '@/utils/noteHubs';
// Same look as the note, task, list and inbox pickers.
import styles from '@/components/NotePickerModal/NotePickerModal.module.css';
import own from './HubPickerModal.module.css';

type Props =
  // Add to hub: which hub a selected passage goes to.
  | { mode: 'hub'; suggestFrom: string; onPick: (target: HubTarget, relation: HubRelation) => void; onClose: () => void }
  // + Link… in a hub: a Glossary term or a note to link into it (not `excludeNoteId`, the hub's own note).
  | { mode: 'link'; suggestFrom: string; excludeNoteId: string | null; onPick: (choice: LinkChoice, relation: HubRelation) => void; onClose: () => void };

type Row =
  | { key: string; kind: 'hub'; hub: HubRef }
  | { key: string; kind: 'new' }
  | { key: string; kind: 'glossary'; entry: GlossaryEntry }
  | { key: string; kind: 'note'; noteId: string; title: string; text: string; updatedAt: string };

const fieldsOf = (r: Row): RankField[] => {
  switch (r.kind) {
    case 'hub':      return [{ text: r.hub.title, weight: 3 }, { text: r.hub.noteTitle, weight: 2 }, { text: `${r.hub.take} ${r.hub.links.map((l) => l.label).join(' ')}`, weight: 1, counted: true }];
    case 'glossary': return [{ text: r.entry.term, weight: 3 }, { text: r.entry.meaning, weight: 1, counted: true }, { text: r.entry.noteTitle, weight: 1 }];
    case 'note':     return [{ text: r.title, weight: 3 }, { text: r.text, weight: 1, counted: true }];
    default:         return [];
  }
};
const recencyOf = (r: Row) => (r.kind === 'glossary' ? Date.parse(r.entry.updatedAt) || 0 : r.kind === 'note' ? Date.parse(r.updatedAt) || 0 : 0);

// Add to hub, and a hub's + Link…: ordered like every picker (utils/suggestRank.ts) by the words of
// what's being linked (the selected text, or the hub's name and take), then the most recent. Below
// the search, how it relates (Related unless chosen). Portaled, like the other pickers.
export function HubPickerModal(props: Props) {
  const { mode, suggestFrom, onClose } = props;
  const notesRaw = useNoteStore((s) => s.notes);
  const entriesRaw = useNoteStore((s) => s.structuredTagEntries);
  const notes = useNoteViews();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [relation, setRelation] = useState<HubRelation>('related');
  const listRef = useRef<HTMLDivElement>(null);
  const L = LABELS.hubs;
  const excludeNoteId = props.mode === 'link' ? props.excludeNoteId : null;

  useEscapeClose(onClose);

  const { rows, suggested, keywords } = useMemo(() => {
    void notesRaw; void entriesRaw;
    let candidates: Row[];
    if (mode === 'hub') {
      candidates = listHubs().map((hub) => ({ key: `hub:${hub.noteId}:${hub.hubId}`, kind: 'hub', hub }));
    } else {
      const terms: Row[] = glossaryEntries().filter((e) => !e.locked && e.term).map((entry) => ({ key: `term:${entry.id}`, kind: 'glossary', entry }));
      const noteRows: Row[] = Object.values(notes)
        .filter((n) => !n.archivedAt && n.id !== excludeNoteId)
        .map((n) => ({ key: `note:${n.id}`, kind: 'note', noteId: n.id, title: n.title || 'Untitled', text: n.abstract ?? '', updatedAt: n.updatedAt }));
      candidates = [...terms, ...noteRows];
    }
    const ranked = query.trim()
      ? { items: rankSearch(candidates, fieldsOf, recencyOf, query), suggested: 0, keywords: [] as string[] }
      : rankSuggestions(candidates, fieldsOf, recencyOf, suggestFrom);
    const list = ranked.items.slice(0, 60);
    if (mode === 'hub') list.push({ key: 'new', kind: 'new' });
    return { rows: list, suggested: Math.min(ranked.suggested, list.length), keywords: ranked.keywords };
  }, [mode, notes, notesRaw, entriesRaw, excludeNoteId, query, suggestFrom]);

  const last = Math.max(0, rows.length - 1);
  if (highlight > last) setHighlight(last);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlight, rows]);

  const choose = (r: Row) => {
    onClose();
    if (props.mode === 'hub') {
      if (r.kind === 'new') props.onPick({ newHere: true }, relation);
      else if (r.kind === 'hub') props.onPick(r.hub, relation);
    } else if (r.kind === 'glossary') props.onPick({ kind: 'glossary', entryId: r.entry.id, label: r.entry.term }, relation);
    else if (r.kind === 'note') props.onPick({ kind: 'note', noteId: r.noteId, label: r.title }, relation);
  };

  // Capture phase + stopImmediatePropagation, as in the other pickers: the pane underneath binds
  // Ctrl+Enter to its own action and must not also answer while this is on top.
  const chooseRef = useRef(() => {});
  useEffect(() => { chooseRef.current = () => { const r = rows[highlight]; if (r) choose(r); }; });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        chooseRef.current();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((i) => Math.min(i + 1, last)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); chooseRef.current(); }
  };

  const title = mode === 'hub' ? L.pickerTitle : L.linkPickerTitle;
  const describe = (r: Row): { top: string; path: string | null } => {
    switch (r.kind) {
      case 'hub':      return { top: `${HUB_ICON} ${r.hub.title || L.untitled}`, path: `${r.hub.noteTitle || 'Untitled'} · ${L.linkCount(r.hub.links.length)}` };
      case 'new':      return { top: `＋ ${L.newHere}`, path: null };
      case 'glossary': return { top: `${r.entry.icon} ${r.entry.term}`, path: [r.entry.kindLabel, r.entry.meaning].filter(Boolean).join(' · ') };
      case 'note':     return { top: `${ITEM_TYPE_ICON.note} ${r.title}`, path: L.kinds.note };
    }
  };
  const empty = mode === 'hub' ? (rows.length === 1 ? L.noHubs : null) : rows.length === 0 ? L.noMatches : null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      <div className={styles.modal} role="dialog" aria-label={title}>
        <div className={styles.header}>
          <span className={`${styles.title} ${own.title}`}><HubIcon className={own.icon} /> {title}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <input
          autoFocus
          className={styles.search}
          placeholder={mode === 'hub' ? L.search : L.linkSearch}
          aria-label={mode === 'hub' ? L.search : L.linkSearch}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={onKeyDown}
        />
        <div className={own.relations} role="radiogroup" aria-label={L.relation}>
          <span className={own.relationsLabel}>{L.relation}</span>
          {RELATIONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={relation === r}
              className={`${own.relation} ${relation === r ? own.relationOn : ''}`}
              onClick={() => setRelation(r)}
            >
              {L.relations[r].label}
            </button>
          ))}
        </div>

        <div className={styles.results} ref={listRef} role="listbox" aria-label={title}>
          {empty && <div className={styles.empty}>{empty}</div>}
          {rows.map((r, i) => {
            const active = i === highlight;
            const { top, path } = describe(r);
            return (
              <Fragment key={r.key}>
                {suggested > 0 && i === 0 && <div className={styles.sectionLabel}>{LABELS.pickers.suggestedFrom(keywords)}</div>}
                {suggested > 0 && i === suggested && r.kind !== 'new' && <div className={styles.sectionLabel}>{LABELS.pickers.recent}</div>}
                <div
                  data-active={active || undefined}
                  className={`${styles.result} ${active ? styles.resultActive : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                  role="option"
                  aria-selected={active}
                >
                  <button type="button" className={styles.resultMain} onClick={() => choose(r)}>
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
