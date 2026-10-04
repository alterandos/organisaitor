import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '@/store/taskStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { formatDate } from '@/utils/date';
import { LABELS } from '@/config/labels';
import { rankSearch, rankSuggestions, type RankField } from '@/utils/suggestRank';
import type { Task } from '@/types';
// Same look as the note and list pickers, so the "link a …" dialogs read as one family.
import styles from '@/components/NotePickerModal/NotePickerModal.module.css';

interface Props {
  title?:     string;
  // Title of the task being linked from: its keywords order the list while the search is empty.
  suggestFrom?: string;
  excludeIds: ReadonlySet<string>;
  onPick:     (taskId: string) => void;
  onClose:    () => void;
}

// The "link a task" search dialog (task links). Portaled for the same reason as NotePickerModal:
// it opens from a pane that scrolls. Ordered like every picker (utils/suggestRank.ts): suggestions
// from the linking task's title, then the rest, open before done; archived tasks aren't offered.
export function TaskPickerModal({ title = LABELS.taskLinks.pickerTitle, suggestFrom, excludeIds, onPick, onClose }: Props) {
  const tasks = useTaskStore((s) => s.tasks);
  const collections = useTaskStore((s) => s.collections);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEscapeClose(onClose);

  const { results, suggested, keywords } = useMemo(() => {
    const candidates = Object.values(tasks).filter((t) => !t.archived && !excludeIds.has(t.id));
    const fieldsOf = (t: Task): RankField[] => [
      { text: t.title, weight: 3 },
      { text: t.collectionId ? collections[t.collectionId]?.name ?? '' : '', weight: 2 },
      { text: t.parentId ? tasks[t.parentId]?.title ?? '' : '', weight: 1 },
      { text: t.notes ?? '', weight: 1, counted: true },
    ];
    // Done tasks sort after open ones wherever recency decides.
    const recencyOf = (t: Task) => new Date(t.updatedAt).getTime() - (t.completed ? 1e13 : 0);
    if (query.trim()) return { results: rankSearch(candidates, fieldsOf, recencyOf, query), suggested: 0, keywords: [] };
    const r = rankSuggestions(candidates, fieldsOf, recencyOf, suggestFrom);
    return { results: r.items, suggested: r.suggested, keywords: r.keywords };
  }, [tasks, collections, excludeIds, query, suggestFrom]);

  const lastIndex = Math.max(0, results.length - 1);
  if (highlightIndex > lastIndex) setHighlight(lastIndex);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, results]);

  const pick = (task: Task) => { onPick(task.id); onClose(); };
  const pickHighlighted = () => { const t = results[highlightIndex]; if (t) pick(t); };

  // Capture phase + stopImmediatePropagation, as in NotePickerModal: the pane underneath binds
  // Ctrl+Enter to its own action and must not also answer while this is on top.
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
  };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      <div className={styles.modal} role="dialog" aria-label={title}>
        <div className={styles.header}>
          <span className={styles.title}>✔ {title}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <input
          autoFocus
          className={styles.search}
          placeholder={LABELS.taskLinks.pickerSearch}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={handleKeyDown}
        />

        <div className={styles.results} ref={listRef}>
          {results.length === 0 && <div className={styles.empty}>{LABELS.taskLinks.pickerEmpty}</div>}
          {results.map((t, i) => {
            const active = i === highlightIndex;
            const endeavour = t.collectionId ? collections[t.collectionId]?.name : null;
            const meta = [
              t.completed ? 'Done' : null,
              endeavour,
              t.deadline ? `Due ${formatDate(t.deadline)}` : null,
            ].filter(Boolean).join(' · ');
            return (
              <Fragment key={t.id}>
              {suggested > 0 && i === 0 && <div className={styles.sectionLabel}>{LABELS.pickers.suggestedFrom(keywords)}</div>}
              {suggested > 0 && i === suggested && <div className={styles.sectionLabel}>{LABELS.pickers.recent}</div>}
              <div
                data-active={active || undefined}
                className={`${styles.result} ${active ? styles.resultActive : ''}`}
                onMouseEnter={() => setHighlight(i)}
              >
                <button type="button" className={styles.resultMain} onClick={() => pick(t)}>
                  <span className={styles.resultTop}>
                    <span className={styles.resultTitle}>{t.title}</span>
                  </span>
                  {meta && <span className={styles.resultPath}>{meta}</span>}
                </button>
              </div>
              </Fragment>
            );
          })}
        </div>

        <div className={styles.footer}>↑↓ navigate · Enter or Ctrl+Enter link · Esc cancel</div>
      </div>
    </div>,
    document.body,
  );
}
