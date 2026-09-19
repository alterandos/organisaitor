import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useRecentItemsStore, type RecentItemEntry } from '@/store/recentItemsStore';
import { searchQuickAccessItems, resolveRecentItems, pruneStaleRecentEntries, navigateToQuickAccessItem, type QuickAccessItem } from '@/utils/quickAccess';
import styles from './QuickAccessPane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';

type Mode = 'recent' | 'frequent';

function sortEntries(entries: RecentItemEntry[], mode: Mode): RecentItemEntry[] {
  return [...entries].sort((a, b) => {
    if (mode === 'frequent' && a.visitCount !== b.visitCount) return b.visitCount - a.visitCount;
    return new Date(b.lastVisitedAt).getTime() - new Date(a.lastVisitedAt).getTime();
  });
}

export function QuickAccessPane() {
  const closeQuickAccess = useUIStore((s) => s.closeQuickAccess);
  const recentCount       = useSettingsStore((s) => s.quickAccessRecentCount);
  const setRecentCount    = useSettingsStore((s) => s.setQuickAccessRecentCount);
  const recentEntries     = useRecentItemsStore((s) => s.items);

  const [query, setQuery]                 = useState('');
  const [mode, setMode]                   = useState<Mode>('recent');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery('');
    setMode('recent');
    setHighlightIndex(0);
    // Autofocus needs a tick — the portal content isn't in the DOM yet on the same render
    // this effect fires in (mount effects run right after the DOM commit, which is enough
    // for a plain focus() call, but a rAF avoids any doubt across browsers/portals).
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  const trimmed = query.trim();
  const { items, staleEntries } = useMemo(() => {
    if (trimmed) return { items: searchQuickAccessItems(trimmed), staleEntries: [] as RecentItemEntry[] };
    // Resolve the whole sorted history (not just the top N raw entries) before slicing to
    // recentCount — a stale entry (its note/task/etc. since deleted) among the top N would
    // otherwise waste a display slot instead of letting the next-ranked valid entry fill it.
    const sorted = sortEntries(Object.values(recentEntries), mode);
    const { items: resolved, stale } = resolveRecentItems(sorted);
    return { items: resolved.slice(0, recentCount), staleEntries: stale };
  }, [trimmed, mode, recentCount, recentEntries]);

  useEffect(() => {
    if (staleEntries.length > 0) pruneStaleRecentEntries(staleEntries);
  }, [staleEntries]);

  useEffect(() => {
    setHighlightIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEscapeClose(closeQuickAccess);

  const select = (item: QuickAccessItem) => {
    navigateToQuickAccessItem(item);
    closeQuickAccess();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[highlightIndex];
      if (item) select(item);
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeQuickAccess(); }}
    >
      <div className={styles.panel}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="text"
          placeholder="Jump to a note, task, list, tracker, routine, or Endeavour…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
        />

        {!trimmed && (
          <div className={styles.controls}>
            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeBtn} ${mode === 'recent' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('recent')}
                type="button"
              >Recent</button>
              <button
                className={`${styles.modeBtn} ${mode === 'frequent' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('frequent')}
                type="button"
              >Frequent</button>
            </div>
            <label className={styles.countControl}>
              Show
              <input
                type="number"
                min={3}
                max={20}
                value={recentCount}
                onChange={(e) => setRecentCount(Number(e.target.value))}
              />
            </label>
          </div>
        )}

        <div className={styles.list}>
          {items.length === 0 && (
            <div className={styles.empty}>
              {trimmed ? 'No matches' : 'Nothing visited yet — items you open will show up here'}
            </div>
          )}
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.item} ${i === highlightIndex ? styles.itemActive : ''}`}
              onMouseEnter={() => setHighlightIndex(i)}
              onClick={() => select(item)}
            >
              <span className={styles.itemIcon}>{item.icon}</span>
              <span className={styles.itemText}>
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={styles.itemSubtitle}>{item.subtitle}</span>
              </span>
            </button>
          ))}
        </div>

        <div className={styles.footer}>↑↓ navigate · Enter open · Esc close</div>
      </div>
    </div>,
    document.body
  );
}
