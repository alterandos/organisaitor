import { useMemo, useState } from 'react';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { usePinnedItemsStore } from '@/store/pinnedItemsStore';
import { useRecentItemsStore } from '@/store/recentItemsStore';
import { resolvePinnedItems, resolveRecentItems, searchQuickAccessItems, type QuickAccessItem } from '@/utils/quickAccess';
import { PinIcon, SearchIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import styles from './NoteSplitView.module.css';

const RECENT_COUNT = 8;
const L = LABELS.noteViews;
const freeNotes = (items: QuickAccessItem[], openIds: ReadonlySet<string>) => items.filter((i) => i.type === 'note' && !openIds.has(i.entityId));

// A pane with no note yet (asked for by the user 2026-10-22): the notes pinned to Quick Access as
// small cards, then the notes visited lately (Go to's Recent), and a search over every note. The
// same items Quick Access shows, read through utils/quickAccess.ts, so the two never disagree.
// Notes already open in another pane are left out (a note is in one pane at most).
export function EmptyPane({ openIds, onPick, onChoose }: { openIds: ReadonlySet<string>; onPick: (noteId: string) => void; onChoose: () => void }) {
  const pins = usePinnedItemsStore((s) => s.pins);
  const recentEntries = useRecentItemsStore((s) => s.items);
  const [query, setQuery] = useState('');

  const pinned = useMemo(() => freeNotes(resolvePinnedItems(pins), openIds), [pins, openIds]);
  const recent = useMemo(() => {
    const sorted = Object.values(recentEntries).filter((e) => e.type === 'note')
      .sort((a, b) => new Date(b.lastVisitedAt).getTime() - new Date(a.lastVisitedAt).getTime());
    return freeNotes(resolveRecentItems(sorted).items, openIds).filter((i) => !pinned.some((p) => p.key === i.key)).slice(0, RECENT_COUNT);
  }, [recentEntries, openIds, pinned]);
  const found = useMemo(() => (query.trim() ? freeNotes(searchQuickAccessItems(query.trim(), 12), openIds) : []), [query, openIds]);

  const row = (item: QuickAccessItem) => (
    <li key={item.key}>
      <button type="button" className={styles.pickRow} onClick={() => onPick(item.entityId)}>
        <span className={styles.pickIcon} aria-hidden="true"><ItemIcon icon={item.icon} /></span>
        <span className={styles.pickTitle}>{item.title}</span>
        {item.subtitle && <span className={styles.pickSub}>{item.subtitle}</span>}
      </button>
    </li>
  );

  return (
    <div className={styles.emptyPane}>
      <h2 className={styles.emptyHeading}>{L.empty}</h2>
      <label className={styles.pickSearch}>
        <SearchIcon className={styles.pickSearchIcon} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={L.searchNotes}
          aria-label={L.searchNotes}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) { e.preventDefault(); onPick(found[0].entityId); } }}
        />
      </label>
      {query.trim() ? (
        found.length ? <ul className={styles.pickList}>{found.map(row)}</ul> : <p className={styles.pickNone}>{LABELS.quickAccess.noMatches}</p>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className={styles.pickSection}>
              <h3 className={styles.pickLabel}><PinIcon aria-hidden="true" /> {LABELS.quickAccess.pinned}</h3>
              <div className={styles.pickCards}>
                {pinned.map((item) => (
                  <button key={item.key} type="button" className={styles.pickCard} onClick={() => onPick(item.entityId)} title={item.subtitle || item.title}>
                    <span className={styles.pickCardIcon} aria-hidden="true"><ItemIcon icon={item.icon} /></span>
                    <span className={styles.pickCardTitle}>{item.title}</span>
                    {item.subtitle && <span className={styles.pickCardSub}>{item.subtitle}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
          {recent.length > 0 && (
            <section className={styles.pickSection}>
              <h3 className={styles.pickLabel}>{LABELS.quickAccess.recent}</h3>
              <ul className={styles.pickList}>{recent.map(row)}</ul>
            </section>
          )}
        </>
      )}
      <button type="button" className={styles.choose} onClick={onChoose}>{L.choose}</button>
    </div>
  );
}
