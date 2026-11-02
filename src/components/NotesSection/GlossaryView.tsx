import { useMemo, useRef, useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { glossaryEntries, glossaryKindLine, glossaryReferences, toggleGlossaryKind, type GlossaryEntry } from '@/services/glossary';
import { getStructuredTagType } from '@/config/structuredTagTypes';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { noteView } from '@/services/noteSecrets';
import { rankSearch } from '@/utils/suggestRank';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types';
import styles from './GlossaryView.module.css';
import { CloseIcon, DisclosureIcon, GlossaryIcon } from '@/components/Icons';

// The kinds to filter by, any combination (2026-11-01: none picked is All).
const KINDS = ['definition', 'concept', 'acronym', 'profile'];
// How important, at least (BlockImportance.ts; a record's level is entryImportance): to study the
// key terms only.
type Importance = 0 | 1 | 3;
const IMPORTANCE_FILTERS: Importance[] = [0, 1, 3];

const letterOf = (term: string) => {
  const c = term.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};

// Every Definition, Concept and Acronym across Notes, A–Z (services/glossary.ts): what each
// means, where it's defined (click to go there), and the notes whose text refers to it. Opened
// from the # button; Esc goes back to the notes.
export function GlossaryView() {
  const closeNotesView = useUIStore((s) => s.closeNotesView);
  const close = () => closeNotesView('glossary');
  useEscapeClose(close);
  const entriesRecord = useNoteStore((s) => s.structuredTagEntries);
  const notes = useNoteStore((s) => s.notes);
  const secrets = useSecretsVersion((s) => s.version);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const layout = useUIStore((s) => s.glossaryLayout);
  const setLayout = useUIStore((s) => s.setGlossaryLayout);
  const [minImportance, setMinImportance] = useState<Importance>(0);
  const [openRefs, setOpenRefs] = useState<string | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const L = LABELS.glossary;

  const { all, references } = useMemo(() => {
    void entriesRecord; void notes; void secrets;
    return { all: glossaryEntries(), references: glossaryReferences() };
  }, [entriesRecord, notes, secrets]);

  const kinds = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of all) if (!seen.has(e.typeKey)) seen.set(e.typeKey, e.kindLabel);
    // A kind only some record also counts as (an acronym held on a definition) gets its filter too.
    for (const e of all) for (const k of e.kinds) if (!seen.has(k)) seen.set(k, getStructuredTagType(k)?.label ?? k);
    return seen;
  }, [all]);

  const shown = useMemo(() => {
    // A record shown only because it's an acronym (ASX on a definition) is listed by its acronym,
    // whichever way it was made.
    const byKind = (picked.size === 0 ? all : all.filter((e) => e.kinds.some((k) => picked.has(k))))
      .filter((e) => e.importance >= minImportance)
      .map((e) => {
        const asAcronym = picked.size > 0 && e.kinds.every((k) => k === 'acronym' || !picked.has(k));
        return asAcronym && e.short && e.short !== e.term ? { ...e, term: e.short, meaning: e.long ? `${e.long}${e.meaning ? ` · ${e.meaning}` : ''}` : e.meaning } : e;
      })
      .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
    if (!query.trim()) return byKind;
    return rankSearch(byKind, (e: GlossaryEntry) => [
      { text: e.term, weight: 3 }, { text: e.meaning, weight: 1, counted: true }, { text: e.noteTitle, weight: 1 },
    ], () => 0, query);
  }, [all, picked, query, minImportance]);

  const sections = useMemo(() => {
    if (query.trim()) return [{ letter: '', entries: shown }];
    const map = new Map<string, GlossaryEntry[]>();
    for (const e of shown) {
      const l = letterOf(e.term);
      map.set(l, [...(map.get(l) ?? []), e]);
    }
    return [...map.entries()].map(([letter, entries]) => ({ letter, entries }));
  }, [shown, query]);

  const noteTitle = (id: string) => {
    const n = notes[id as NoteId];
    return n ? noteView(n).title || L.untitledNote : L.untitledNote;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.title}><GlossaryIcon className={styles.titleIcon} />{L.title}</span>
          <span className={styles.count}>{all.length}</span>
          <span className={styles.layouts} role="group" aria-label={L.layout}>
            {(['tiles', 'list'] as const).map((l) => (
              <button key={l} type="button" className={`${styles.layoutBtn} ${layout === l ? styles.layoutOn : ''}`} aria-pressed={layout === l} title={L.layouts[l]} aria-label={L.layouts[l]} onClick={() => setLayout(l)}>
                <LayoutIcon layout={l} />
              </button>
            ))}
          </span>
          <button type="button" className={styles.closeBtn} onClick={close} title={L.back} aria-label={L.back}><CloseIcon /></button>
        </div>
        <input
          className={styles.search}
          value={query}
          placeholder={L.search}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className={styles.chips}>
          <button type="button" className={`${styles.chip} ${picked.size === 0 ? styles.chipOn : ''}`} aria-pressed={picked.size === 0} onClick={() => setPicked(new Set())}>
            {L.all}
          </button>
          {KINDS.filter((k) => kinds.has(k)).map((k) => (
            <button key={k} type="button" className={`${styles.chip} ${picked.has(k) ? styles.chipOn : ''}`} aria-pressed={picked.has(k)} onClick={() => setPicked(toggleGlossaryKind(picked, k, kinds))}>
              {kinds.get(k)}
            </button>
          ))}
          {all.some((e) => e.importance) && (
            <span className={styles.importanceChips}>
              {IMPORTANCE_FILTERS.map((lv) => (
                <button key={lv} type="button" className={`${styles.chip} ${minImportance === lv ? styles.chipOn : ''}`} onClick={() => setMinImportance(lv)}>
                  {lv === 0 ? LABELS.importance.filterAll : lv === 1 ? `⭐ ${LABELS.importance.filterKey}` : `❗ ${LABELS.importance.filterCritical}`}
                </button>
              ))}
            </span>
          )}
          {!query.trim() && sections.length > 1 && (
            <span className={styles.letters}>
              {sections.map((s) => (
                <button key={s.letter} type="button" className={styles.letter} onClick={() => sectionRefs.current.get(s.letter)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  {s.letter}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      <div className={styles.body}>
        {all.length === 0 ? (
          <div className={styles.empty}>{L.empty}</div>
        ) : shown.length === 0 ? (
          <div className={styles.empty}>{L.noMatch}</div>
        ) : sections.map((section) => (
          <section key={section.letter || 'results'} ref={(el) => { if (el) sectionRefs.current.set(section.letter, el); }}>
            {section.letter && <h3 className={styles.sectionLetter}>{section.letter}</h3>}
            <div className={layout === 'list' ? styles.list : styles.grid}>
              {section.entries.map((e) => {
                const refs = references.get(e.id) ?? [];
                const total = refs.reduce((n, r) => n + r.count, 0);
                return (
                  <article key={e.id} className={layout === 'list' ? styles.row : styles.card} style={{ ['--entry-color' as string]: e.color }}>
                    <header className={styles.cardHead}>
                      <span className={styles.cardIcon} aria-hidden="true">{e.locked ? '🔒' : e.icon}</span>
                      <span className={styles.term}>{e.term || L.untitled}</span>
                      <span className={styles.kind}>{glossaryKindLine(e)}</span>
                    </header>
                    <p className={styles.meaning} title={layout === 'list' && !e.locked ? e.meaning : undefined}>{e.locked ? L.locked : e.meaning || <span className={styles.muted}>{L.noMeaning}</span>}</p>
                    <footer className={styles.cardFoot}>
                      <button
                        type="button"
                        className={styles.link}
                        title={L.definedAt([...e.notebookPath, e.noteTitle || L.untitledNote])}
                        onClick={() => openNotePassage(e.noteId, definitionPassage(e.id))}
                      >
                        {L.definedIn(e.noteTitle || L.untitledNote, e.notebookPath.at(-1))}
                      </button>
                      {total > 0 ? (
                        <button type="button" className={styles.refs} aria-expanded={openRefs === e.id} onClick={() => setOpenRefs(openRefs === e.id ? null : e.id)}>
                          {L.references(total)} <DisclosureIcon open={openRefs === e.id} />
                        </button>
                      ) : (
                        <span className={styles.muted}>{L.noReferences}</span>
                      )}
                    </footer>
                    {openRefs === e.id && (
                      <ul className={styles.refList}>
                        {refs.map((r) => (
                          <li key={r.noteId}>
                            <button type="button" className={styles.link} onClick={() => openNotePassage(r.noteId, { mark: 'conceptRef', attr: 'entryId', value: e.id })}>
                              {noteTitle(r.noteId)}
                            </button>
                            {r.count > 1 && <span className={styles.muted}> × {r.count}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function LayoutIcon({ layout }: { layout: 'tiles' | 'list' }) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {layout === 'tiles'
        ? <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>
        : <><path d="M2 4h12" /><path d="M2 8h12" /><path d="M2 12h12" /></>}
    </svg>
  );
}
