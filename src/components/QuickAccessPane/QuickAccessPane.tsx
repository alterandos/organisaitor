import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { createPortal } from 'react-dom';
import { useUIStore, type QuickAccessTab } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useRecentItemsStore, type RecentItemEntry } from '@/store/recentItemsStore';
import { usePinnedItemsStore, pinKey, type PinnableType } from '@/store/pinnedItemsStore';
import { searchQuickAccessItems, resolveRecentItems, resolvePinnedItems, pruneStaleRecentEntries, navigateToQuickAccessItem, placesByUse, type QuickAccessItem } from '@/utils/quickAccess';
import { isPinnable, togglePin, pinMenuItem } from '@/services/quickAccessPins';
import type { Place } from '@/config/places';
import styles from './QuickAccessPane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useLongPress } from '@/hooks/useLongPress';
import { usePlatform } from '@/hooks/usePlatform';
import { useContextMenuScope } from '@/contextMenu/useContextMenuScope';
import { ActionSheet, type ActionSheetItem } from '@/components/ActionSheet/ActionSheet';
import { PinIcon, QuickAccessIcon, SearchIcon, UnpinIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';

type Mode = 'recent' | 'frequent';
const L = LABELS.quickAccess;

function sortEntries(entries: RecentItemEntry[], mode: Mode): RecentItemEntry[] {
  return [...entries].sort((a, b) => {
    if (mode === 'frequent' && a.visitCount !== b.visitCount) return b.visitCount - a.visitCount;
    return new Date(b.lastVisitedAt).getTime() - new Date(a.lastVisitedAt).getTime();
  });
}

// Quick Access (Q): what's pinned, in the person's order, then the Places row. Go to (Ctrl+G):
// search and Recent / Frequent. One overlay, two tabs; typing searches everything on either.
export function QuickAccessPane() {
  const closeQuickAccess  = useUIStore((s) => s.closeQuickAccess);
  const tab               = useUIStore((s) => s.quickAccessTab);
  const setTab            = useUIStore((s) => s.setQuickAccessTab);
  const recentCount       = useSettingsStore((s) => s.quickAccessRecentCount);
  const setRecentCount    = useSettingsStore((s) => s.setQuickAccessRecentCount);
  const recentEntries     = useRecentItemsStore((s) => s.items);
  const pins              = usePinnedItemsStore((s) => s.pins);
  const reorder           = usePinnedItemsStore((s) => s.reorder);

  const [query, setQuery]                 = useState('');
  const [mode, setMode]                   = useState<Mode>('recent');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus needs a tick — the portal content isn't in the DOM yet on the same render
    // this effect fires in (mount effects run right after the DOM commit, which is enough
    // for a plain focus() call, but a rAF avoids any doubt across browsers/portals).
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  const trimmed = query.trim();
  const showingPins = !trimmed && tab === 'pinned';
  const { items, staleEntries } = useMemo(() => {
    if (trimmed) return { items: searchQuickAccessItems(trimmed), staleEntries: [] as RecentItemEntry[] };
    if (tab === 'pinned') return { items: resolvePinnedItems(pins), staleEntries: [] as RecentItemEntry[] };
    // Resolve the whole sorted history (not just the top N raw entries) before slicing to
    // recentCount — a stale entry (its note/task/etc. since deleted) among the top N would
    // otherwise waste a display slot instead of letting the next-ranked valid entry fill it.
    const sorted = sortEntries(Object.values(recentEntries), mode);
    const { items: resolved, stale } = resolveRecentItems(sorted);
    return { items: resolved.slice(0, recentCount), staleEntries: stale };
  }, [trimmed, tab, pins, mode, recentCount, recentEntries]);

  useEffect(() => {
    if (staleEntries.length > 0) pruneStaleRecentEntries(staleEntries);
  }, [staleEntries]);

  const lastIndex = Math.max(0, items.length - 1);
  if (highlightIndex > lastIndex) setHighlightIndex(lastIndex);

  useEscapeClose(closeQuickAccess);

  const switchTab = (next: QuickAccessTab) => {
    setTab(next);
    setHighlightIndex(0);
    inputRef.current?.focus();
  };

  // Ctrl+Tab / Ctrl+Shift+Tab switch between Quick Access and Go to. Caught on the window in the
  // capture phase and stopped there, so the note or list under the pane doesn't also change tab.
  const switchTabRef = useRef(switchTab);
  useLayoutEffect(() => { switchTabRef.current = switchTab; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      switchTabRef.current(useUIStore.getState().quickAccessTab === 'pinned' ? 'goto' : 'pinned');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const select = (item: QuickAccessItem) => {
    navigateToQuickAccessItem(item);
    closeQuickAccess();
  };

  // Moves a pin one place up or down (Alt+↑↓, the long-press sheet), keeping the highlight on it.
  const movePin = (item: QuickAccessItem, delta: -1 | 1) => {
    const ids = items.map((i) => i.key);
    const from = ids.indexOf(item.key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder(ids);
    setHighlightIndex(to);
  };
  const dropPin = (dragged: string, onto: string) => {
    const ids = items.map((i) => i.key).filter((k) => k !== dragged);
    ids.splice(ids.indexOf(onto) + (items.findIndex((i) => i.key === dragged) < items.findIndex((i) => i.key === onto) ? 1 : 0), 0, dragged);
    reorder(ids);
  };

  // Ordered when the pane opens, so the row doesn't reshuffle under the pointer.
  const [places] = useState(() => placesByUse(useRecentItemsStore.getState().items));
  const [badges] = useState(() => new Map(places.map((p) => [p.id, p.badge?.() ?? 0])));
  const openPlace = (place: Place) => {
    closeQuickAccess();
    place.open();
  };
  // ← → move along the row; ↓ returns to the search box.
  const handlePlaceKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const next = e.key === 'ArrowRight' ? btn.nextElementSibling : e.key === 'ArrowLeft' ? btn.previousElementSibling : null;
    if (next instanceof HTMLElement) { e.preventDefault(); next.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); inputRef.current?.focus(); }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showingPins && e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const item = items[highlightIndex];
      if (item) movePin(item, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'ArrowDown') {
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

  const [dragging, setDragging] = useState<string | null>(null);

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeQuickAccess(); }}
    >
      <div className={styles.panel}>
        <div className={styles.tabs} role="tablist" aria-label={L.tabs}>
          {([['pinned', L.title, QuickAccessIcon, 'Q'], ['goto', L.goTo, SearchIcon, 'Ctrl+G']] as const).map(([id, label, Icon, key]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
              onClick={() => switchTab(id)}
              title={`${label} (${key})`}
            >
              <Icon className={styles.tabIcon} />{label}
            </button>
          ))}
        </div>

        <input
          ref={inputRef}
          className={styles.searchInput}
          type="text"
          placeholder={LABELS.quickAccessPlaceholder}
          aria-label={LABELS.quickAccessPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
        />

        {!trimmed && tab === 'goto' && (
          <div className={styles.controls}>
            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeBtn} ${mode === 'recent' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('recent')}
                type="button"
              >{L.recent}</button>
              <button
                className={`${styles.modeBtn} ${mode === 'frequent' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('frequent')}
                type="button"
              >{L.frequent}</button>
            </div>
            <label className={styles.countControl}>
              {L.show}
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
          {showingPins && items.length > 0 && <div className={styles.listHeading}>{L.pinned}</div>}
          {items.length === 0 && (
            <div className={styles.empty}>
              {trimmed ? L.noMatches : showingPins ? L.noPins : L.noRecent}
            </div>
          )}
          {items.map((item, i) => (
            <ItemRow
              key={item.key}
              item={item}
              active={i === highlightIndex}
              reorderable={showingPins}
              first={i === 0}
              last={i === items.length - 1}
              dragging={dragging === item.key}
              onHover={() => setHighlightIndex(i)}
              onSelect={() => select(item)}
              onMove={(delta) => movePin(item, delta)}
              onDragStart={() => setDragging(item.key)}
              onDragEnd={() => setDragging(null)}
              onDrop={() => { if (dragging && dragging !== item.key) dropPin(dragging, item.key); setDragging(null); }}
            />
          ))}
        </div>

        {showingPins && (
          <div className={`${styles.places} ${styles.placesBelow}`} role="group" aria-label={LABELS.places.title}>
            {places.map((place) => (
              <PlaceChip key={place.id} place={place} badge={badges.get(place.id) ?? 0} onOpen={openPlace} onKeyDown={handlePlaceKeyDown} />
            ))}
          </div>
        )}

        <div className={styles.footer}>{showingPins ? L.footerPinned : L.footerGoTo}</div>
      </div>
    </div>,
    document.body
  );
}

// One row: opens on click, pins or unpins with its button, right-click (desktop) or long-press
// (Android); a pinned row on the Quick Access tab can also be dragged or moved up and down.
function ItemRow({ item, active, reorderable, first, last, dragging, onHover, onSelect, onMove, onDragStart, onDragEnd, onDrop }: {
  item: QuickAccessItem; active: boolean; reorderable: boolean; first: boolean; last: boolean; dragging: boolean;
  onHover: () => void; onSelect: () => void; onMove: (delta: -1 | 1) => void;
  onDragStart: () => void; onDragEnd: () => void; onDrop: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { isAndroid } = usePlatform();
  const [sheetOpen, setSheetOpen] = useState(false);
  const type = isPinnable(item.type) ? item.type : null;
  const pinned = usePinnedItemsStore((s) => (type ? pinKey(type, item.entityId) in s.pins : false));

  const moves = (): { id: string; label: string; delta: -1 | 1 }[] => reorderable
    ? [...(first ? [] : [{ id: 'up', label: L.moveUp, delta: -1 as const }]), ...(last ? [] : [{ id: 'down', label: L.moveDown, delta: 1 as const }])]
    : [];

  useContextMenuScope(rowRef, () => ({
    kind: 'quick-access-item',
    data: { type: item.type, entityId: item.entityId },
    items: () => type ? [
      pinMenuItem(type as PinnableType, item.entityId),
      ...moves().map((m) => ({ id: m.id, label: m.label, run: () => onMove(m.delta) })),
    ] : [],
  }), !!type);
  useLongPress(rowRef, () => setSheetOpen(true), isAndroid && !!type);

  const sheetItems: ActionSheetItem[] = type ? [
    { label: pinned ? L.unpin : L.pin, icon: pinned ? <UnpinIcon /> : <PinIcon />, onSelect: () => togglePin(type, item.entityId) },
    ...moves().map((m) => ({ label: m.label, onSelect: () => onMove(m.delta) })),
  ] : [];

  return (
    <div
      ref={rowRef}
      className={`${styles.itemRow} ${active ? styles.itemActive : ''} ${dragging ? styles.itemDragging : ''}`}
      onMouseEnter={onHover}
      draggable={reorderable && !isAndroid}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.key); onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { if (reorderable) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
    >
      <button type="button" className={styles.item} onClick={onSelect}>
        <ItemIcon className={styles.itemIcon} icon={item.icon} />
        <span className={styles.itemText}>
          <span className={styles.itemTitle}>{item.title}</span>
          <span className={styles.itemSubtitle}>{item.subtitle}</span>
        </span>
      </button>
      {type && (
        <button
          type="button"
          className={`${styles.pinBtn} ${pinned ? styles.pinBtnOn : ''}`}
          onClick={() => togglePin(type, item.entityId)}
          title={pinned ? L.unpin : L.pin}
          aria-label={`${pinned ? L.unpin : L.pin}: ${item.title}`}
          aria-pressed={pinned}
        >{pinned ? <UnpinIcon /> : <PinIcon />}</button>
      )}
      {sheetOpen && <ActionSheet title={item.title} items={sheetItems} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

// A Places chip; right-click or long-press pins the place.
function PlaceChip({ place, badge, onOpen, onKeyDown }: {
  place: Place; badge: number; onOpen: (p: Place) => void; onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { isAndroid } = usePlatform();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pinned = usePinnedItemsStore((s) => pinKey('place', place.id) in s.pins);
  useContextMenuScope(ref, () => ({ kind: 'quick-access-item', data: { type: 'place', entityId: place.id }, items: () => [pinMenuItem('place', place.id)] }));
  useLongPress(ref, () => setSheetOpen(true), isAndroid);
  return (
    <>
      <button ref={ref} type="button" className={styles.place} onClick={() => onOpen(place)} onKeyDown={onKeyDown}>
        <place.Icon className={styles.placeIcon} />
        <span className={styles.placeLabel}>{place.label}</span>
        {badge > 0 && <span className={styles.placeBadge}>{badge}</span>}
      </button>
      {sheetOpen && (
        <ActionSheet
          title={place.label}
          items={[{ label: pinned ? L.unpin : L.pin, icon: pinned ? <UnpinIcon /> : <PinIcon />, onSelect: () => togglePin('place', place.id) }]}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
