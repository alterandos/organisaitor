import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListStore } from '@/store/listStore';
import { useListViews } from '@/store/listViews';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import type { List } from '@/types/lists';
// Same look as the note picker, so the two "link a …" dialogs read as one family.
import styles from '@/components/NotePickerModal/NotePickerModal.module.css';

interface Props {
  excludeIds: ReadonlySet<string>;
  onPick:     (listId: string) => void;
  onClose:    () => void;
}

// The "link a list" search dialog (CrossAppRefPicker's + List). Portaled for the same reason as
// NotePickerModal: it opens from forms that scroll. Checklists first (they're the ones a task can
// tick off), then by name.
export function ListPickerModal({ excludeIds, onPick, onClose }: Props) {
  const lists = useListViews();
  const items = useListStore((s) => s.listItems);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEscapeClose(onClose);

  const counts = useMemo(() => {
    const out: Record<string, { total: number; done: number }> = {};
    for (const i of Object.values(items)) {
      const c = (out[i.listId] ??= { total: 0, done: 0 });
      c.total++;
      if (i.status === 'done') c.done++;
    }
    return out;
  }, [items]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(lists)
      .filter((l) => !excludeIds.has(l.id) && (!q || l.name.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.kind === 'checklist') - Number(a.kind === 'checklist') || a.name.localeCompare(b.name));
  }, [lists, excludeIds, query]);

  const lastIndex = Math.max(0, results.length - 1);
  if (highlightIndex > lastIndex) setHighlight(lastIndex);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, results]);

  const pick = (list: List) => { onPick(list.id); onClose(); };
  const pickHighlighted = () => { const l = results[highlightIndex]; if (l) pick(l); };

  // Capture phase + stopImmediatePropagation, as in NotePickerModal: the pane underneath binds
  // Ctrl+Enter to its own save and must not also answer while this is on top.
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
      <div className={styles.modal} role="dialog" aria-label={LABELS.listLinks.pickerTitle}>
        <div className={styles.header}>
          <span className={styles.title}>📋 {LABELS.listLinks.pickerTitle}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <input
          autoFocus
          className={styles.search}
          placeholder={LABELS.listLinks.pickerSearch}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={handleKeyDown}
        />

        <div className={styles.results} ref={listRef}>
          {results.length === 0 && <div className={styles.empty}>{LABELS.listLinks.pickerEmpty}</div>}
          {results.map((l, i) => {
            const active = i === highlightIndex;
            const c = counts[l.id] ?? { total: 0, done: 0 };
            const meta = l.kind === 'checklist'
              ? `${LABELS.listKind.checklist.one} · ${c.done}/${c.total} ticked`
              : `${LABELS.listKind[l.kind].one} · ${c.total} item${c.total !== 1 ? 's' : ''}`;
            return (
              <div
                key={l.id}
                data-active={active || undefined}
                className={`${styles.result} ${active ? styles.resultActive : ''}`}
                onMouseEnter={() => setHighlight(i)}
              >
                <button type="button" className={styles.resultMain} onClick={() => pick(l)}>
                  <span className={styles.resultTop}>
                    <span className={styles.resultTitle}>{l.isEncrypted ? '🔒 ' : ''}{l.icon ? `${l.icon} ` : ''}{l.name}</span>
                  </span>
                  <span className={styles.resultPath}>{meta}</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className={styles.footer}>↑↓ navigate · Enter or Ctrl+Enter link · Esc cancel</div>
      </div>
    </div>,
    document.body,
  );
}
