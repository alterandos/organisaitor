import { useMemo, useRef, useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { useSecretsVersion } from '@/services/noteSecrets';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { glossaryEntries, glossaryReferences, type GlossaryEntry } from '@/services/glossary';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { noteView } from '@/services/noteSecrets';
import { rankSearch } from '@/utils/suggestRank';
import { LABELS } from '@/config/labels';
import type { NoteId } from '@/types';
import styles from './GlossaryView.module.css';

type Filter = 'all' | 'definition' | 'concept' | 'acronym';
const FILTERS: Filter[] = ['all', 'definition', 'concept', 'acronym'];

const letterOf = (term: string) => {
  const c = term.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};

// Every Definition, Concept and Acronym across Notes, A–Z (services/glossary.ts): what each
// means, where it's defined (click to go there), and the notes whose text refers to it. Opened
// from the # button; Esc goes back to the notes.
export function GlossaryView() {
  const close = useUIStore((s) => s.closeNotesGlossary);
  useEscapeClose(close);
  const entriesRecord = useNoteStore((s) => s.structuredTagEntries);
  const notes = useNoteStore((s) => s.notes);
  const secrets = useSecretsVersion((s) => s.version);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
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
    return seen;
  }, [all]);

  const shown = useMemo(() => {
    const byKind = filter === 'all' ? all : all.filter((e) => e.typeKey === filter);
    if (!query.trim()) return byKind;
    return rankSearch(byKind, (e: GlossaryEntry) => [
      { text: e.term, weight: 3 }, { text: e.meaning, weight: 1, counted: true }, { text: e.noteTitle, weight: 1 },
    ], () => 0, query);
  }, [all, filter, query]);

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
          <span className={styles.title}>📖 {L.title}</span>
          <span className={styles.count}>{all.length}</span>
          <button type="button" className={styles.closeBtn} onClick={close} title={L.back}>×</button>
        </div>
        <input
          className={styles.search}
          value={query}
          placeholder={L.search}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className={styles.chips}>
          {FILTERS.filter((f) => f === 'all' || kinds.has(f)).map((f) => (
            <button key={f} type="button" className={`${styles.chip} ${filter === f ? styles.chipOn : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? L.all : kinds.get(f)}
            </button>
          ))}
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
            <div className={styles.grid}>
              {section.entries.map((e) => {
                const refs = references.get(e.id) ?? [];
                const total = refs.reduce((n, r) => n + r.count, 0);
                return (
                  <article key={e.id} className={styles.card} style={{ ['--entry-color' as string]: e.color }}>
                    <header className={styles.cardHead}>
                      <span className={styles.cardIcon} aria-hidden="true">{e.locked ? '🔒' : e.icon}</span>
                      <span className={styles.term}>{e.term || L.untitled}</span>
                      <span className={styles.kind}>{e.kindLabel}</span>
                    </header>
                    <p className={styles.meaning}>{e.locked ? L.locked : e.meaning || <span className={styles.muted}>{L.noMeaning}</span>}</p>
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
                          {L.references(total)} {openRefs === e.id ? '▴' : '▾'}
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
