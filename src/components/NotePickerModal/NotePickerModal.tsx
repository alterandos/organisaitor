import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNoteStore } from '@/store/noteStore';
import { useNoteViews } from '@/store/noteViews';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { getNoteBreadcrumb } from '@/utils/notes';
import { getNoteTabTexts } from '@/utils/noteSearchText';
import { extractKeywords, stemForMatch } from '@/utils/keywords';
import styles from './NotePickerModal.module.css';

interface Props {
  excludeIds: ReadonlySet<string>;
  // Title of the item being linked from. While the search box is empty its keywords are used to
  // suggest notes; the first keystroke replaces them with the typed search.
  suggestFrom?: string;
  // tabId is set only for a note that has extra tabs: MAIN_TAB_ID or a NoteTab id.
  onPick:     (noteId: string, tabId?: string) => void;
  onClose:    () => void;
}

interface TabCandidate {
  id:   string;
  name: string;
  text: string;
  lowerName: string;
  lowerText: string;
}

interface Candidate {
  id:        string;
  title:     string;
  path:      string;
  hasTabs:   boolean;   // more than the main tab — only then is a tab chosen
  tabs:      TabCandidate[];   // main first; always at least one
  lower:     { title: string; path: string };
  encrypted: boolean;
  updatedAt: string;
  sortTime:  number;
}

interface Row {
  c:       Candidate;
  bestTab: number;   // index into c.tabs of the best-matching tab (0 = main when nothing stands out)
}

interface TermStat { title: boolean; path: boolean; tabs: number[] }

const MAX_RESULTS = 50;
const MAX_SUGGESTIONS = 20;
const SNIPPET_LENGTH = 140;

function highlight(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className={styles.mark}>{part}</mark> : part));
}

function snippetFor(text: string, terms: string[]): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const hit = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (hit === undefined || hit < SNIPPET_LENGTH / 2) return text.slice(0, SNIPPET_LENGTH);
  const start = hit - 30;
  return `…${text.slice(start, start + SNIPPET_LENGTH)}`;
}

// How much one term matches each part of a note. A tab scores 2 for its name plus its text (1 for
// presence, or — when `counted` — a log-scaled hit count capped at 3, so a long tab can't win on
// volume alone).
function termStat(c: Candidate, term: string, counted: boolean): TermStat {
  return {
    title: c.lower.title.includes(term),
    path:  c.lower.path.includes(term),
    tabs:  c.tabs.map((t) => {
      let score = t.lowerName.includes(term) ? 2 : 0;
      if (counted) {
        let count = 0;
        for (let at = t.lowerText.indexOf(term); at !== -1 && count < 50; at = t.lowerText.indexOf(term, at + term.length)) count++;
        if (count) score += Math.min(1 + Math.log(count), 3);
      } else if (t.lowerText.includes(term)) {
        score += 1;
      }
      return score;
    }),
  };
}

// Combines a candidate's per-term stats into a note score (title 3, path 2, its best tab) and the
// index of the tab that scored highest — the one pre-selected for linking.
function combine(stats: TermStat[], weights: number[], tabCount: number): { score: number; bestTab: number } {
  let score = 0;
  const tabScore = new Array<number>(tabCount).fill(0);
  stats.forEach((s, k) => {
    score += weights[k] * ((s.title ? 3 : 0) + (s.path ? 2 : 0) + Math.max(...s.tabs));
    s.tabs.forEach((v, i) => { tabScore[i] += weights[k] * v; });
  });
  let bestTab = 0;
  tabScore.forEach((v, i) => { if (v > tabScore[bestTab]) bestTab = i; });
  return { score, bestTab };
}

// The "link to a note" search used by CrossAppRefPicker (Task / Calendar item panes and the Add
// Task modal). Two notes in different notebooks can share a title, so every result shows where
// the note lives (its notebook path), a preview of its content and when it was last edited, and
// the search covers all three — typing "exchanges lecture" finds a note titled "Lecture 3" inside
// the Exchanges notebook. Portaled to the body so it is never clipped or shifted by the scrollable
// form/pane that opened it. Locked encrypted notes appear by their notebook path only.
//
// A note with extra tabs shows its tabs as chips and links to one specific tab: the search covers
// tab names and each tab's own text, and the best-matching tab is pre-selected (Tab / Shift+Tab or
// a click changes it). A note without tabs is linked as a whole.
//
// Suggestions (empty search box + `suggestFrom`): the item's title is reduced to keywords, each
// keyword is looked up in every note's title, notebook path and tab text, and notes are ranked by
// the hits, weighting a keyword by how rare it is across the user's notes (so "exchange" outranks
// "meeting" when few notes mention it). Nothing is indexed up front: the per-tab plain text is
// cached (utils/noteSearchText.ts) and the scoring is a substring scan of it.
export function NotePickerModal({ excludeIds, suggestFrom, onPick, onClose }: Props) {
  const notes    = useNoteViews();
  const noteTags = useNoteStore((s) => s.noteTags);

  const [query, setQuery]               = useState('');
  const [highlightIndex, setHighlight]  = useState(0);
  // Tabs the user picked by hand for a row (note id → tab id), overriding the pre-selected best one.
  const [tabOverride, setTabOverride]   = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);

  useEscapeClose(onClose);

  const candidates = useMemo<Candidate[]>(
    () => Object.values(notes)
      .filter((n) => !n.archivedAt && !excludeIds.has(n.id))
      .map((n) => {
        const title = n.title || (n.isEncrypted ? 'Locked note' : 'Untitled');
        const path  = getNoteBreadcrumb(n, noteTags);
        return {
          id:        n.id,
          title,
          path,
          hasTabs:   n.tabs.length > 0,
          tabs:      getNoteTabTexts(n).map((t) => ({ ...t, lowerName: t.name.toLowerCase(), lowerText: t.text.toLowerCase() })),
          lower:     { title: title.toLowerCase(), path: path.toLowerCase() },
          encrypted: n.isEncrypted,
          updatedAt: n.updatedAt,
          sortTime:  new Date(n.lastViewedAt ?? n.updatedAt).getTime(),
        };
      }),
    [notes, noteTags, excludeIds],
  );

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const keywords = useMemo(() => extractKeywords(suggestFrom), [suggestFrom]);
  const keywordStems = useMemo(() => keywords.map(stemForMatch), [keywords]);

  // The suggestion ranking is independent of the typed query, so typing and clearing don't redo it.
  const suggestions = useMemo<Row[]>(() => {
    if (keywordStems.length === 0) return [];
    const stats = candidates.map((c) => keywordStems.map((k) => termStat(c, k, true)));
    const idf = keywordStems.map((_, k) => {
      const df = stats.filter((s) => s[k].title || s[k].path || s[k].tabs.some((v) => v > 0)).length;
      return Math.log(1 + candidates.length / (1 + df));
    });
    const scored: { row: Row; score: number }[] = [];
    candidates.forEach((c, i) => {
      const { score, bestTab } = combine(stats[i], idf, c.tabs.length);
      if (score > 0) scored.push({ row: { c, bestTab }, score });
    });
    return scored.sort((a, b) => b.score - a.score || b.row.c.sortTime - a.row.c.sortTime).slice(0, MAX_SUGGESTIONS).map((s) => s.row);
  }, [candidates, keywordStems]);

  const suggesting = terms.length === 0 && suggestions.length > 0;
  const activeTerms = terms.length ? terms : suggesting ? keywordStems : [];

  const results = useMemo<Row[]>(() => {
    if (terms.length === 0) {
      const recent = [...candidates].sort((a, b) => b.sortTime - a.sortTime).map((c) => ({ c, bestTab: 0 }));
      if (suggestions.length === 0) return recent.slice(0, MAX_RESULTS);
      const taken = new Set(suggestions.map((r) => r.c.id));
      return [...suggestions, ...recent.filter((r) => !taken.has(r.c.id))].slice(0, MAX_RESULTS);
    }
    const ones = terms.map(() => 1);
    const scored: { row: Row; score: number }[] = [];
    for (const c of candidates) {
      const stats = terms.map((t) => termStat(c, t, false));
      if (stats.some((s) => !s.title && !s.path && s.tabs.every((v) => v === 0))) continue;
      const { score, bestTab } = combine(stats, ones, c.tabs.length);
      scored.push({ row: { c, bestTab }, score });
    }
    return scored.sort((a, b) => b.score - a.score || b.row.c.sortTime - a.row.c.sortTime).slice(0, MAX_RESULTS).map((s) => s.row);
  }, [candidates, terms, suggestions]);

  const tabIndexFor = (row: Row): number => {
    const chosen = tabOverride[row.c.id];
    const at = chosen ? row.c.tabs.findIndex((t) => t.id === chosen) : -1;
    return at >= 0 ? at : row.bestTab;
  };

  const lastIndex = Math.max(0, results.length - 1);
  if (highlightIndex > lastIndex) setHighlight(lastIndex);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, results]);

  const pick = (row: Row, tabIndex = tabIndexFor(row)) => {
    onPick(row.c.id, row.c.hasTabs ? row.c.tabs[tabIndex].id : undefined);
    onClose();
  };
  const pickHighlighted = () => { const r = results[highlightIndex]; if (r) pick(r); };

  const cycleTab = (row: Row, step: number) => {
    const n = row.c.tabs.length;
    setTabOverride((prev) => ({ ...prev, [row.c.id]: row.c.tabs[(tabIndexFor(row) + step + n) % n].id }));
  };

  // Capture phase + stopImmediatePropagation: the pane or modal underneath binds Ctrl+Enter to
  // its own save, and must not also answer while this picker is on top.
  const pickRef = useRef(pickHighlighted);
  useEffect(() => { pickRef.current = pickHighlighted; });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        pickRef.current();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((i) => Math.min(i + 1, lastIndex)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pickHighlighted(); }
    else if (e.key === 'Tab') {
      const row = results[highlightIndex];
      if (row?.c.hasTabs) { e.preventDefault(); cycleTab(row, e.shiftKey ? -1 : 1); }
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      // Keeps App's global single-key hotkeys from firing behind the picker when a result has focus.
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      <div className={styles.modal} role="dialog" aria-label="Link a note">
        <div className={styles.header}>
          <span className={styles.title}>📝 Link a note</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <input
          autoFocus
          className={styles.search}
          placeholder="Search by title, notebook, tab or content…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); setTabOverride({}); }}
          onKeyDown={handleKeyDown}
        />

        <div className={styles.results} ref={listRef}>
          {results.length === 0 && (
            <div className={styles.empty}>{terms.length ? 'No notes match' : 'No notes to link yet'}</div>
          )}
          {results.map((row, i) => {
            const { c } = row;
            const active = i === highlightIndex;
            const tabIndex = tabIndexFor(row);
            const tab = c.tabs[tabIndex];
            const hasHits = activeTerms.length > 0 && (terms.length > 0 || i < suggestions.length);
            const snippet = hasHits ? snippetFor(tab.text, activeTerms) : tab.text.slice(0, SNIPPET_LENGTH);
            const marks = hasHits ? activeTerms : [];
            return (
              <Fragment key={c.id}>
                {suggesting && i === 0 && (
                  <div className={styles.sectionLabel}>Suggested from “{keywords.join(', ')}”</div>
                )}
                {suggesting && i === suggestions.length && (
                  <div className={styles.sectionLabel}>Recent</div>
                )}
                <div
                  data-active={active || undefined}
                  className={`${styles.result} ${active ? styles.resultActive : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <button type="button" className={styles.resultMain} onClick={() => pick(row)}>
                    <span className={styles.resultTop}>
                      <span className={styles.resultTitle}>
                        {c.encrypted ? '🔒 ' : ''}{highlight(c.title, marks)}
                      </span>
                      <span className={styles.resultDate}>
                        {new Date(c.updatedAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className={styles.resultPath}>📓 {highlight(c.path, marks)}</span>
                    {snippet && <span className={styles.resultSnippet}>{highlight(snippet, marks)}</span>}
                  </button>
                  {c.hasTabs && (
                    <span className={styles.tabChips} role="group" aria-label="Tab to link">
                      {c.tabs.map((t, ti) => (
                        <button
                          key={t.id}
                          type="button"
                          className={`${styles.tabChip} ${ti === tabIndex ? styles.tabChipActive : ''}`}
                          onClick={() => pick(row, ti)}
                          title={`Link to the “${t.name}” tab`}
                        >
                          {highlight(t.name, marks)}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>

        <div className={styles.footer}>↑↓ navigate · Tab switches the note's tab · Enter or Ctrl+Enter link · Esc cancel</div>
      </div>
    </div>,
    document.body,
  );
}
