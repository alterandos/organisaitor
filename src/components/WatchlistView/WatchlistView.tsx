import React, { useState, useEffect, useRef } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useUIStore } from '@/store/uiStore';
import { usePriceStore } from '@/store/priceStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePriceRefresh } from '@/integrations/usePriceRefresh';
import { formatDate } from '@/utils/date';
import { ASSET_CLASS_META, formatMarketCap } from '@/types/portfolio';
import type { WatchlistItem, WatchlistItemId, PortfolioTagId, WatchlistColumnId } from '@/types/portfolio';
import { TickerChart } from './TickerChart';
import styles from './WatchlistView.module.css';

function formatPrice(price: number): string {
  if (price >= 1) {
    return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return '$' + price.toFixed(4);
}

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return Math.round(v / 1e3) + 'K';
  return String(v);
}

type MarketCapTier = 'mega' | 'large' | 'mid' | 'small' | 'micro';
const CAP_TIERS: { id: MarketCapTier; label: string; sub: string }[] = [
  { id: 'mega',  label: 'Mega',  sub: '>$200B'        },
  { id: 'large', label: 'Large', sub: '$10B–$200B'    },
  { id: 'mid',   label: 'Mid',   sub: '$2B–$10B'      },
  { id: 'small', label: 'Small', sub: '$300M–$2B'     },
  { id: 'micro', label: 'Micro', sub: '<$300M'        },
];

function getCapTier(v: number | null): MarketCapTier | null {
  if (v == null) return null;
  if (v >= 200e9) return 'mega';
  if (v >= 10e9)  return 'large';
  if (v >= 2e9)   return 'mid';
  if (v >= 300e6) return 'small';
  return 'micro';
}

type SidebarSortBy = 'default' | 'alpha' | 'marketCap' | 'change';
const SIDEBAR_SORTS: { id: SidebarSortBy; label: string }[] = [
  { id: 'default',   label: 'Default'    },
  { id: 'alpha',     label: 'Alphabetic' },
  { id: 'marketCap', label: 'Market Cap' },
  { id: 'change',    label: '% Change'   },
];

type GroupBy = 'none' | 'tags' | 'size' | 'exchange' | 'sector';
const GROUP_BY_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'none',     label: 'None'     },
  { id: 'tags',     label: 'Tags'     },
  { id: 'size',     label: 'Size'     },
  { id: 'exchange', label: 'Exchange' },
  { id: 'sector',   label: 'Sector'   },
];

function applySidebarSort(
  items:  WatchlistItem[],
  sortBy: SidebarSortBy,
  prices: ReturnType<typeof usePriceStore.getState>['prices'],
): WatchlistItem[] {
  if (sortBy === 'default') return items;
  return [...items].sort((a, b) => {
    if (sortBy === 'alpha')
      return (a.ticker ?? a.name).localeCompare(b.ticker ?? b.name);
    if (sortBy === 'marketCap') {
      const am = a.marketCapValue ?? -Infinity;
      const bm = b.marketCapValue ?? -Infinity;
      return bm - am;
    }
    if (sortBy === 'change') {
      const ac = a.ticker ? (prices[a.ticker]?.changePercent ?? -Infinity) : -Infinity;
      const bc = b.ticker ? (prices[b.ticker]?.changePercent ?? -Infinity) : -Infinity;
      return bc - ac;
    }
    return 0;
  });
}

function groupItems(
  items:        WatchlistItem[],
  groupBy:      GroupBy,
  portfolioTags: Record<string, { name: string; color?: string | null }>,
): { key: string; label: string; items: WatchlistItem[] }[] {
  if (groupBy === 'none') return [{ key: '__all__', label: '', items }];

  if (groupBy === 'tags') {
    const tagGroups = new Map<string, { label: string; items: WatchlistItem[] }>();
    const untagged: WatchlistItem[] = [];
    for (const item of items) {
      if (item.tagIds.length === 0) { untagged.push(item); continue; }
      for (const tid of item.tagIds) {
        const tag = portfolioTags[tid];
        if (!tag) continue;
        if (!tagGroups.has(tid)) tagGroups.set(tid, { label: tag.name, items: [] });
        tagGroups.get(tid)!.items.push(item);
      }
    }
    const result = [...tagGroups.entries()].map(([key, g]) => ({ key, label: g.label, items: g.items }));
    if (untagged.length > 0) result.push({ key: '__untagged__', label: 'Untagged', items: untagged });
    return result;
  }

  const groups = new Map<string, WatchlistItem[]>();
  const unknown: WatchlistItem[] = [];
  for (const item of items) {
    let val: string | null = null;
    if (groupBy === 'size')     val = getCapTier(item.marketCapValue);
    else if (groupBy === 'exchange') val = item.exchange ?? null;
    else if (groupBy === 'sector')   val = item.sector ?? null;
    if (!val) { unknown.push(item); continue; }
    if (!groups.has(val)) groups.set(val, []);
    groups.get(val)!.push(item);
  }

  let result: { key: string; label: string; items: WatchlistItem[] }[];
  if (groupBy === 'size') {
    result = CAP_TIERS
      .filter((t) => groups.has(t.id))
      .map((t) => ({ key: t.id, label: `${t.label}  ${t.sub}`, items: groups.get(t.id)! }));
  } else {
    result = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, grpItems]) => ({ key, label: key, items: grpItems }));
  }
  if (unknown.length > 0) result.push({ key: '__unknown__', label: 'Unknown', items: unknown });
  return result;
}

const SORTABLE_COLS = new Set<WatchlistColumnId>(['ticker', 'name', 'price', 'status', 'assetClass', 'sector', 'exchange', 'marketCap', 'dateAdded']);

function getSortValue(
  item:   WatchlistItem,
  col:    WatchlistColumnId,
  prices: ReturnType<typeof usePriceStore.getState>['prices'],
): string | number | null {
  switch (col) {
    case 'ticker':     return item.ticker ?? item.name;
    case 'name':       return item.name;
    case 'price':      return item.ticker ? (prices[item.ticker]?.price ?? null) : null;
    case 'status':     return item.status;
    case 'assetClass': return item.assetClass ?? null;
    case 'exchange':   return item.exchange ?? null;
    case 'sector':     return item.sector ?? null;
    case 'marketCap':  return item.marketCapValue ?? null;
    case 'dateAdded':  return item.dateAdded;
    default:           return null;
  }
}

function sortItems(
  items:  WatchlistItem[],
  col:    WatchlistColumnId,
  dir:    'asc' | 'desc',
  prices: ReturnType<typeof usePriceStore.getState>['prices'],
): WatchlistItem[] {
  return [...items].sort((a, b) => {
    const av = getSortValue(a, col, prices);
    const bv = getSortValue(b, col, prices);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return dir === 'desc' ? -cmp : cmp;
  });
}

function priceFlashClass(
  price:     number | null,
  prevPrice: number | null,
  block = false,
): string {
  if (price == null || prevPrice == null) return '';
  const suffix = block ? 'Block' : '';
  if (price > prevPrice) return styles[`priceUp${suffix}`];
  if (price < prevPrice) return styles[`priceDown${suffix}`];
  return styles[`priceSame${suffix}`];
}

export function WatchlistView() {
  const watchlistItems      = usePortfolioStore((s) => s.watchlistItems);
  const portfolioTags       = usePortfolioStore((s) => s.portfolioTags);
  const investmentPurposes  = usePortfolioStore((s) => s.investmentPurposes);
  const columnConfig        = usePortfolioStore((s) => s.columnConfig);
  const deleteWatchlistItem   = usePortfolioStore((s) => s.deleteWatchlistItem);
  const setColumnConfig       = usePortfolioStore((s) => s.setColumnConfig);
  const prices                = usePriceStore((s) => s.prices);
  const openEditWatchlistItem   = useUIStore((s) => s.openEditWatchlistItem);
  const setPortfolioChartOpen   = useUIStore((s) => s.setPortfolioChartOpen);
  const zoom                    = useSettingsStore((s) => s.chartTickerRowZoom);

  usePriceRefresh();

  const [activeTagIds,            setActiveTagIds]            = useState<PortfolioTagId[]>([]);
  const [activeExchanges,         setActiveExchanges]         = useState<string[]>([]);
  const [activeCapTiers,          setActiveCapTiers]          = useState<MarketCapTier[]>([]);
  const [activeBrokers,           setActiveBrokers]           = useState<string[]>([]);
  const [activeSectors,           setActiveSectors]           = useState<string[]>([]);
  const [holdingFilter,           setHoldingFilter]           = useState(false);
  const [filterOpen,              setFilterOpen]              = useState(false);
  const [filterPanelPos,          setFilterPanelPos]          = useState({ top: 0, right: 0 });
  const [selectedItemId,          setSelectedItemId]          = useState<WatchlistItemId | null>(null);
  const [sortCol,                 setSortCol]                 = useState<WatchlistColumnId | null>(null);
  const [sortDir,                 setSortDir]                 = useState<'asc' | 'desc'>('asc');
  const [colSelectorOpen,         setColSelectorOpen]         = useState(false);
  const [panelPos,                setPanelPos]                = useState({ top: 0, right: 0 });
  const [dragCol,                 setDragCol]                 = useState<WatchlistColumnId | null>(null);
  const [dragOver,                setDragOver]                = useState<WatchlistColumnId | null>(null);
  // Sidebar sort
  const [sidebarSortBy,           setSidebarSortBy]           = useState<SidebarSortBy>('default');
  const [sortPanelOpen,           setSortPanelOpen]           = useState(false);
  const [sortPanelPos,            setSortPanelPos]            = useState({ top: 0, right: 0 });
  // Sidebar group
  const [sidebarGroupBy,          setSidebarGroupBy]          = useState<GroupBy>('none');
  const [sidebarGroupPanelOpen,   setSidebarGroupPanelOpen]   = useState(false);
  const [sidebarGroupPanelPos,    setSidebarGroupPanelPos]    = useState({ top: 0, right: 0 });
  const [sidebarCollapsedGroups,  setSidebarCollapsedGroups]  = useState<Set<string>>(new Set());
  // Table group
  const [tableGroupBy,            setTableGroupBy]            = useState<GroupBy>('none');
  const [tableGroupPanelOpen,     setTableGroupPanelOpen]     = useState(false);
  const [tableGroupPanelPos,      setTableGroupPanelPos]      = useState({ top: 0, right: 0 });
  const [tableCollapsedGroups,    setTableCollapsedGroups]    = useState<Set<string>>(new Set());

  const colSelectorRef       = useRef<HTMLDivElement>(null);
  const colBtnRef            = useRef<HTMLButtonElement>(null);
  const filterBtnRef         = useRef<HTMLButtonElement>(null);
  const filterPanelRef       = useRef<HTMLDivElement>(null);
  const sortBtnRef           = useRef<HTMLButtonElement>(null);
  const sortPanelRef         = useRef<HTMLDivElement>(null);
  const sidebarGroupBtnRef   = useRef<HTMLButtonElement>(null);
  const sidebarGroupPanelRef = useRef<HTMLDivElement>(null);
  const tableGroupBtnRef     = useRef<HTMLButtonElement>(null);
  const tableGroupPanelRef   = useRef<HTMLDivElement>(null);
  const dragColRef           = useRef<WatchlistColumnId | null>(null);

  const selectItem = (id: WatchlistItemId | null) => {
    setSelectedItemId(id);
    setPortfolioChartOpen(id !== null);
  };

  useEffect(() => {
    if (!selectedItemId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') selectItem(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!colSelectorOpen) return;
    const handler = (e: MouseEvent) => {
      if (!colSelectorRef.current?.contains(e.target as Node) && !colBtnRef.current?.contains(e.target as Node))
        setColSelectorOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colSelectorOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (!filterPanelRef.current?.contains(e.target as Node) && !filterBtnRef.current?.contains(e.target as Node))
        setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  useEffect(() => {
    if (!sortPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!sortPanelRef.current?.contains(e.target as Node) && !sortBtnRef.current?.contains(e.target as Node))
        setSortPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortPanelOpen]);

  useEffect(() => {
    if (!sidebarGroupPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!sidebarGroupPanelRef.current?.contains(e.target as Node) && !sidebarGroupBtnRef.current?.contains(e.target as Node))
        setSidebarGroupPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sidebarGroupPanelOpen]);

  useEffect(() => {
    if (!tableGroupPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!tableGroupPanelRef.current?.contains(e.target as Node) && !tableGroupBtnRef.current?.contains(e.target as Node))
        setTableGroupPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tableGroupPanelOpen]);

  const openColSelector = () => {
    if (!colSelectorOpen && colBtnRef.current) {
      const r = colBtnRef.current.getBoundingClientRect();
      setPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setColSelectorOpen((v) => !v);
  };

  const openFilterPanel = () => {
    if (!filterOpen && filterBtnRef.current) {
      const r = filterBtnRef.current.getBoundingClientRect();
      setFilterPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setFilterOpen((v) => !v);
  };

  const openSortPanel = () => {
    if (!sortPanelOpen && sortBtnRef.current) {
      const r = sortBtnRef.current.getBoundingClientRect();
      setSortPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setSortPanelOpen((v) => !v);
  };

  const openSidebarGroupPanel = () => {
    if (!sidebarGroupPanelOpen && sidebarGroupBtnRef.current) {
      const r = sidebarGroupBtnRef.current.getBoundingClientRect();
      setSidebarGroupPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setSidebarGroupPanelOpen((v) => !v);
  };

  const openTableGroupPanel = () => {
    if (!tableGroupPanelOpen && tableGroupBtnRef.current) {
      const r = tableGroupBtnRef.current.getBoundingClientRect();
      setTableGroupPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setTableGroupPanelOpen((v) => !v);
  };

  const handleColToggle = (colId: WatchlistColumnId) => {
    setColumnConfig(columnConfig.map((c) => c.id === colId ? { ...c, visible: !c.visible } : c));
  };

  const reorderCols = (fromId: WatchlistColumnId, toId: WatchlistColumnId) => {
    const sorted = [...columnConfig].sort((a, b) => a.order - b.order);
    const fi = sorted.findIndex((c) => c.id === fromId);
    const ti = sorted.findIndex((c) => c.id === toId);
    const items = sorted.map((c) => ({ ...c }));
    const [moved] = items.splice(fi, 1);
    items.splice(ti, 0, moved);
    setColumnConfig(items.map((c, i) => ({ ...c, order: i })));
  };

  const handleDragStart = (e: React.DragEvent, colId: WatchlistColumnId) => {
    dragColRef.current = colId;
    setDragCol(colId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, colId: WatchlistColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (colId !== dragColRef.current) setDragOver(colId);
  };
  const handleDrop = (colId: WatchlistColumnId) => {
    const from = dragColRef.current;
    dragColRef.current = null;
    setDragCol(null);
    setDragOver(null);
    if (from && from !== colId) reorderCols(from, colId);
  };
  const handleDragEnd = () => { dragColRef.current = null; setDragCol(null); setDragOver(null); };

  const handleSort = (col: WatchlistColumnId) => {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const visibleColumns = [...columnConfig]
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order);

  const allItems = Object.values(watchlistItems);
  const filteredItems = activeTagIds.length === 0
    ? allItems
    : allItems.filter((item) => activeTagIds.some((tid) => item.tagIds.includes(tid)));
  const displayItems = sortCol ? sortItems(filteredItems, sortCol, sortDir, prices) : filteredItems;

  const tags = Object.values(portfolioTags);

  const toggleTag = (id: PortfolioTagId) =>
    setActiveTagIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const toggleExchange = (ex: string) =>
    setActiveExchanges((prev) => prev.includes(ex) ? prev.filter((e) => e !== ex) : [...prev, ex]);

  const toggleCapTier = (t: MarketCapTier) =>
    setActiveCapTiers((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const toggleBroker = (b: string) =>
    setActiveBrokers((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);

  const toggleSector = (s: string) =>
    setActiveSectors((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const toggleSidebarGroup = (key: string) =>
    setSidebarCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleTableGroup = (key: string) =>
    setTableCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const handleDelete = (id: WatchlistItemId, name: string) => {
    if (!window.confirm(`Remove "${name}" from your watchlist?`)) return;
    if (selectedItemId === id) selectItem(null);
    deleteWatchlistItem(id);
  };

  const renderCell = (colId: WatchlistColumnId, item: WatchlistItem) => {
    switch (colId) {
      case 'status':
        return (
          <td key="status" className={styles.td}>
            {item.status === 'holding'
              ? <span className={styles.holdingBadge}>
                  Holding{item.heldAt ? ` · ${item.heldAt}` : ''}
                </span>
              : <span className={styles.muted}>Watching</span>}
          </td>
        );
      case 'ticker':
        return (
          <td key="ticker" className={`${styles.td} ${styles.tdTicker}`}>
            {item.ticker
              ? <span className={styles.tickerBadge}>{item.ticker}</span>
              : <span className={styles.muted}>—</span>}
          </td>
        );
      case 'name':
        return <td key="name" className={`${styles.td} ${styles.tdName}`}>{item.name}</td>;
      case 'price': {
        const entry = item.ticker ? prices[item.ticker] : undefined;
        return (
          <td key="price" className={`${styles.td} ${styles.tdNum}`}>
            {entry?.price != null
              ? <span key={entry.updatedAt} className={`${styles.price} ${priceFlashClass(entry.price, entry.prevPrice)}`}>{formatPrice(entry.price)}</span>
              : <span className={styles.muted}>—</span>}
          </td>
        );
      }
      case 'assetClass':
        return (
          <td key="assetClass" className={styles.td}>
            {item.assetClass
              ? <span
                  className={styles.badge}
                  style={{ background: ASSET_CLASS_META[item.assetClass].color + '22', color: ASSET_CLASS_META[item.assetClass].color }}
                >
                  {ASSET_CLASS_META[item.assetClass].label}
                </span>
              : <span className={styles.muted}>—</span>}
          </td>
        );
      case 'sector':
        return (
          <td key="sector" className={`${styles.td} ${styles.tdSector}`}>
            {item.sector
              ? <span className={styles.sectorBadge}>{item.sector}</span>
              : <span className={styles.muted}>—</span>}
          </td>
        );
      case 'exchange':
        return (
          <td key="exchange" className={styles.td}>
            {item.exchange
              ? <span className={styles.sectorBadge}>{item.exchange}</span>
              : <span className={styles.muted}>—</span>}
          </td>
        );
      case 'marketCap':
        return (
          <td key="marketCap" className={`${styles.td} ${styles.tdNum}`}>
            {item.marketCapValue != null
              ? <span>{formatMarketCap(item.marketCapValue)}</span>
              : <span className={styles.muted}>—</span>}
          </td>
        );
      case 'investmentPurposes':
        return (
          <td key="investmentPurposes" className={styles.td}>
            <div className={styles.pillGroup}>
              {item.investmentPurposeIds.length === 0
                ? <span className={styles.muted}>—</span>
                : item.investmentPurposeIds.map((pid) => {
                    const p = investmentPurposes[pid];
                    if (!p) return null;
                    return (
                      <span key={pid} className={styles.pill}
                        style={p.color ? { background: p.color + '22', color: p.color } : undefined}>
                        {p.name}
                      </span>
                    );
                  })}
            </div>
          </td>
        );
      case 'tags':
        return (
          <td key="tags" className={styles.td}>
            <div className={styles.pillGroup}>
              {item.tagIds.length === 0
                ? <span className={styles.muted}>—</span>
                : item.tagIds.map((tid) => {
                    const tag = portfolioTags[tid];
                    if (!tag) return null;
                    return (
                      <span key={tid} className={styles.pill}
                        style={tag.color ? { background: tag.color + '22', color: tag.color } : undefined}>
                        {tag.name}
                      </span>
                    );
                  })}
            </div>
          </td>
        );
      case 'links':
        return (
          <td key="links" className={styles.td}>
            {item.links.length === 0
              ? <span className={styles.muted}>—</span>
              : <div className={styles.pillGroup}>
                  {item.links.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className={styles.linkCell}>
                      {new URL(url).hostname.replace(/^www\./, '')}
                    </a>
                  ))}
                </div>}
          </td>
        );
      case 'notes':
        return (
          <td key="notes" className={`${styles.td} ${styles.tdNotes}`}>
            {item.notes
              ? <span className={styles.notesCell} title={item.notes}>{item.notes}</span>
              : <span className={styles.muted}>—</span>}
          </td>
        );
      case 'dateAdded':
        return <td key="dateAdded" className={styles.td}>{formatDate(item.dateAdded)}</td>;
      default:
        return null;
    }
  };

  // ── Split view (chart open) ─────────────────────────────────────────────────
  if (selectedItemId && watchlistItems[selectedItemId]) {
    const selectedItem = watchlistItems[selectedItemId];
    const priceEntry   = selectedItem.ticker ? prices[selectedItem.ticker] : undefined;

    const exchanges    = [...new Set(allItems.map((i) => i.exchange).filter((e): e is string => !!e))].sort();
    const sectors      = [...new Set(allItems.map((i) => i.sector).filter((s): s is string => !!s))].sort();
    const holdingItems = allItems.filter((i) => i.status === 'holding');
    const brokers      = [...new Set(holdingItems.map((i) => i.heldAt).filter((b): b is string => !!b))].sort();

    let sidebarItems = holdingFilter ? holdingItems : allItems;
    if (activeTagIds.length > 0)
      sidebarItems = sidebarItems.filter((i) => activeTagIds.some((tid) => i.tagIds.includes(tid)));
    if (activeExchanges.length > 0)
      sidebarItems = sidebarItems.filter((i) => i.exchange && activeExchanges.includes(i.exchange));
    if (activeCapTiers.length > 0)
      sidebarItems = sidebarItems.filter((i) => { const t = getCapTier(i.marketCapValue); return t != null && activeCapTiers.includes(t); });
    if (activeSectors.length > 0)
      sidebarItems = sidebarItems.filter((i) => i.sector && activeSectors.includes(i.sector));
    if (activeBrokers.length > 0)
      sidebarItems = sidebarItems.filter((i) => i.heldAt && activeBrokers.includes(i.heldAt));

    const activeFilterCount = activeTagIds.length + activeExchanges.length + activeCapTiers.length + activeSectors.length + activeBrokers.length;

    const sortedSidebarItems  = applySidebarSort(sidebarItems, sidebarSortBy, prices);
    const groupedSidebarItems = groupItems(sortedSidebarItems, sidebarGroupBy, portfolioTags);

    return (
      <>
        <div className={styles.splitView} style={{ '--ticker-zoom': zoom } as React.CSSProperties}>
          <TickerChart
            item={selectedItem}
            price={priceEntry?.price ?? null}
            change={priceEntry?.change ?? null}
            changePercent={priceEntry?.changePercent ?? null}
            onClose={() => selectItem(null)}
          />

          <div className={styles.rightSidebar}>
            {/* ── Sidebar toolbar ── */}
            <div className={styles.sidebarHeader}>
              <button
                ref={filterBtnRef}
                className={`${styles.sidebarIconBtn} ${(filterOpen || activeFilterCount > 0) ? styles.sidebarIconBtnActive : ''}`}
                onClick={openFilterPanel}
                title="Filter tickers"
              >
                <span>⚟</span>
                {activeFilterCount > 0 && (
                  <span className={styles.filterBadge}>{activeFilterCount}</span>
                )}
              </button>
              <button
                ref={sortBtnRef}
                className={`${styles.sidebarIconBtn} ${(sortPanelOpen || sidebarSortBy !== 'default') ? styles.sidebarIconBtnActive : ''}`}
                onClick={openSortPanel}
                title="Sort tickers"
              >↕</button>
              <button
                ref={sidebarGroupBtnRef}
                className={`${styles.sidebarIconBtn} ${(sidebarGroupPanelOpen || sidebarGroupBy !== 'none') ? styles.sidebarIconBtnActive : ''}`}
                onClick={openSidebarGroupPanel}
                title="Group tickers"
              >≡</button>
              <button
                className={`${styles.holdingToggleBtn} ${holdingFilter ? styles.holdingToggleBtnActive : ''}`}
                onClick={() => { setHoldingFilter((v) => !v); if (holdingFilter) setActiveBrokers([]); }}
                title={holdingFilter ? 'Showing holdings only — click to show all' : 'Show holdings only'}
              >
                Holding
              </button>
            </div>

            {/* ── Tickers list (75% of body) ── */}
            <div className={styles.tickersList}>
              {groupedSidebarItems.map(({ key, label, items: groupItems_ }) => (
                <React.Fragment key={key}>
                  {sidebarGroupBy !== 'none' && (
                    <div className={styles.groupHeader} onClick={() => toggleSidebarGroup(key)}>
                      <span className={styles.groupToggle}>
                        {sidebarCollapsedGroups.has(key) ? '▶' : '▼'}
                      </span>
                      <span className={styles.groupLabel}>{label}</span>
                      <span className={styles.groupCount}>{groupItems_.length}</span>
                    </div>
                  )}
                  {!sidebarCollapsedGroups.has(key) && groupItems_.map((item) => {
                    const entry    = item.ticker ? prices[item.ticker] : undefined;
                    const isPos    = (entry?.changePercent ?? 0) >= 0;
                    const isSelected = item.id === selectedItemId;
                    return (
                      <div
                        key={item.id}
                        className={`${styles.compactRow} ${isSelected ? styles.compactRowSelected : ''}`}
                        onClick={() => selectItem(item.id as WatchlistItemId)}
                      >
                        <span className={styles.compactTicker}>{item.ticker ?? item.name.slice(0, 6)}</span>
                        <div key={entry?.updatedAt} className={`${styles.compactMid} ${priceFlashClass(entry?.price ?? null, entry?.prevPrice ?? null, true)}`}>
                          <span className={styles.compactPrice}>
                            {entry?.price != null ? formatPrice(entry.price) : '—'}
                          </span>
                          {entry?.changePercent != null && (
                            <span className={isPos ? styles.changePos : styles.changeNeg}>
                              {isPos ? '+' : ''}{entry.changePercent.toFixed(2)}%
                            </span>
                          )}
                        </div>
                        <span className={styles.compactVol}>
                          {entry?.volume != null ? formatVolume(entry.volume) : '—'}
                        </span>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>

            {/* ── Ticker info pane (25% of body) ── */}
            <div className={styles.tickerInfoPane}>
              <div className={styles.tickerInfoHeader}>Info</div>
              <div className={styles.tickerInfoBody}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Exchange</span>
                  <span className={styles.infoValue}>{selectedItem.exchange ?? '—'}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Market Cap</span>
                  <span className={styles.infoValue}>
                    {selectedItem.marketCapValue != null ? formatMarketCap(selectedItem.marketCapValue) : '—'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Status</span>
                  <span className={styles.infoValue}>
                    {selectedItem.status === 'holding'
                      ? <span className={styles.holdingBadge}>Holding{selectedItem.heldAt ? ` · ${selectedItem.heldAt}` : ''}</span>
                      : <span className={styles.muted}>Watching</span>}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filter panel ── */}
        {filterOpen && (
          <div
            ref={filterPanelRef}
            className={styles.filterPanel}
            style={{ top: filterPanelPos.top, right: filterPanelPos.right }}
          >
            {tags.length > 0 && (
              <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}>
                  <span className={styles.filterSectionTitle}>Tags</span>
                  {activeTagIds.length > 0 && (
                    <button className={styles.filterClearBtn} onClick={() => setActiveTagIds([])}>Clear</button>
                  )}
                </div>
                <div className={styles.filterChipGroup}>
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      className={`${styles.filterChip} ${activeTagIds.includes(tag.id) ? styles.filterChipActive : ''}`}
                      onClick={() => toggleTag(tag.id)}
                      style={
                        activeTagIds.includes(tag.id) && tag.color
                          ? { background: tag.color, borderColor: tag.color, color: '#fff' }
                          : tag.color ? { borderColor: tag.color + '88', color: tag.color } : undefined
                      }
                    >{tag.name}</button>
                  ))}
                </div>
              </div>
            )}

            {exchanges.length > 0 && (
              <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}>
                  <span className={styles.filterSectionTitle}>Exchange</span>
                  {activeExchanges.length > 0 && (
                    <button className={styles.filterClearBtn} onClick={() => setActiveExchanges([])}>Clear</button>
                  )}
                </div>
                <div className={styles.filterChipGroup}>
                  {exchanges.map((ex) => (
                    <button
                      key={ex}
                      className={`${styles.filterChip} ${activeExchanges.includes(ex) ? styles.filterChipActive : ''}`}
                      onClick={() => toggleExchange(ex)}
                    >{ex}</button>
                  ))}
                </div>
              </div>
            )}

            {sectors.length > 0 && (
              <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}>
                  <span className={styles.filterSectionTitle}>Sector</span>
                  {activeSectors.length > 0 && (
                    <button className={styles.filterClearBtn} onClick={() => setActiveSectors([])}>Clear</button>
                  )}
                </div>
                <div className={styles.filterChipGroup}>
                  {sectors.map((s) => (
                    <button
                      key={s}
                      className={`${styles.filterChip} ${activeSectors.includes(s) ? styles.filterChipActive : ''}`}
                      onClick={() => toggleSector(s)}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.filterSection}>
              <div className={styles.filterSectionHeader}>
                <span className={styles.filterSectionTitle}>Company Size</span>
                {activeCapTiers.length > 0 && (
                  <button className={styles.filterClearBtn} onClick={() => setActiveCapTiers([])}>Clear</button>
                )}
              </div>
              <div className={styles.filterTierGroup}>
                {CAP_TIERS.map((tier) => (
                  <button
                    key={tier.id}
                    className={`${styles.filterTierBtn} ${activeCapTiers.includes(tier.id) ? styles.filterTierBtnActive : ''}`}
                    onClick={() => toggleCapTier(tier.id)}
                  >
                    <span className={styles.filterTierLabel}>{tier.label}</span>
                    <span className={styles.filterTierSub}>{tier.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {holdingFilter && brokers.length > 0 && (
              <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}>
                  <span className={styles.filterSectionTitle}>Broker</span>
                  {activeBrokers.length > 0 && (
                    <button className={styles.filterClearBtn} onClick={() => setActiveBrokers([])}>Clear</button>
                  )}
                </div>
                <div className={styles.filterChipGroup}>
                  {brokers.map((b) => (
                    <button
                      key={b}
                      className={`${styles.filterChip} ${activeBrokers.includes(b) ? styles.filterChipActive : ''}`}
                      onClick={() => toggleBroker(b)}
                    >{b}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Sort panel ── */}
        {sortPanelOpen && (
          <div
            ref={sortPanelRef}
            className={styles.menuPanel}
            style={{ top: sortPanelPos.top, right: sortPanelPos.right }}
          >
            <div className={styles.menuPanelTitle}>Sort by</div>
            {SIDEBAR_SORTS.map((opt) => (
              <button
                key={opt.id}
                className={`${styles.menuOption} ${sidebarSortBy === opt.id ? styles.menuOptionActive : ''}`}
                onClick={() => { setSidebarSortBy(opt.id); setSortPanelOpen(false); }}
              >{opt.label}</button>
            ))}
          </div>
        )}

        {/* ── Sidebar group panel ── */}
        {sidebarGroupPanelOpen && (
          <div
            ref={sidebarGroupPanelRef}
            className={styles.menuPanel}
            style={{ top: sidebarGroupPanelPos.top, right: sidebarGroupPanelPos.right }}
          >
            <div className={styles.menuPanelTitle}>Group by</div>
            {GROUP_BY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`${styles.menuOption} ${sidebarGroupBy === opt.id ? styles.menuOptionActive : ''}`}
                onClick={() => { setSidebarGroupBy(opt.id); setSidebarCollapsedGroups(new Set()); setSidebarGroupPanelOpen(false); }}
              >{opt.label}</button>
            ))}
          </div>
        )}
      </>
    );
  }

  // ── Full table view ──────────────────────────────────────────────────────────
  const allColsSorted = [...columnConfig].sort((a, b) => a.order - b.order);

  const groupedTableItems = groupItems(displayItems, tableGroupBy, portfolioTags);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filterPills} role="group" aria-label="Filter by tag">
          {tags.length > 0 && activeTagIds.length > 0 && (
            <button className={styles.filterPill} onClick={() => setActiveTagIds([])}>All</button>
          )}
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`${styles.filterPill} ${activeTagIds.includes(tag.id) ? styles.filterPillActive : ''}`}
              onClick={() => toggleTag(tag.id)}
              style={
                activeTagIds.includes(tag.id) && tag.color
                  ? { background: tag.color, borderColor: tag.color, color: '#fff' }
                  : tag.color ? { borderColor: tag.color + '88', color: tag.color } : undefined
              }
            >{tag.name}</button>
          ))}
        </div>
        <button
          ref={tableGroupBtnRef}
          className={`${styles.toolbarIconBtn} ${(tableGroupPanelOpen || tableGroupBy !== 'none') ? styles.toolbarIconBtnActive : ''}`}
          onClick={openTableGroupPanel}
          title="Group by"
        >
          <span>≡</span>
          {tableGroupBy !== 'none' && (
            <span className={styles.toolbarBtnLabel}>
              {GROUP_BY_OPTIONS.find((o) => o.id === tableGroupBy)?.label}
            </span>
          )}
        </button>
      </div>

      <div className={styles.tableContainer}>
        {allItems.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>📈</span>
            <p className={styles.emptyTitle}>Your watchlist is empty</p>
            <p className={styles.emptyHint}>Press <kbd>Space</kbd> to add your first ticker</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No items match the selected tags</p>
            <button className={styles.clearBtn} onClick={() => setActiveTagIds([])}>Clear filter</button>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    draggable
                    className={`${styles.th} ${styles.thDraggable} ${SORTABLE_COLS.has(col.id) ? styles.thSortable : ''} ${sortCol === col.id ? styles.thSorted : ''} ${dragOver === col.id ? styles.thDragOver : ''} ${dragCol === col.id ? styles.thDragging : ''}`}
                    onClick={SORTABLE_COLS.has(col.id) ? () => handleSort(col.id) : undefined}
                    onDragStart={(e) => handleDragStart(e, col.id)}
                    onDragOver={(e) => handleDragOver(e, col.id)}
                    onDrop={() => handleDrop(col.id)}
                    onDragEnd={handleDragEnd}
                  >
                    {col.label}
                    {sortCol === col.id && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
                  </th>
                ))}
                <th className={`${styles.th} ${styles.thActions}`}>
                  <button
                    ref={colBtnRef}
                    className={`${styles.colIconBtn} ${colSelectorOpen ? styles.colIconBtnActive : ''}`}
                    onClick={openColSelector}
                    title="Show / hide columns"
                  ><span className={styles.colIconGlyph}>☰</span></button>
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedTableItems.map(({ key, label, items: grpItems }) => (
                <React.Fragment key={key}>
                  {tableGroupBy !== 'none' && (
                    <tr className={styles.tableGroupHeaderRow} onClick={() => toggleTableGroup(key)}>
                      <td colSpan={visibleColumns.length + 1} className={styles.tableGroupHeaderCell}>
                        <span className={styles.groupToggle}>
                          {tableCollapsedGroups.has(key) ? '▶' : '▼'}
                        </span>
                        <span className={styles.groupLabel}>{label}</span>
                        <span className={styles.groupCount}>{grpItems.length}</span>
                      </td>
                    </tr>
                  )}
                  {!tableCollapsedGroups.has(key) && grpItems.map((item) => (
                    <tr
                      key={item.id}
                      className={styles.tr}
                      onClick={() => selectItem(item.id as WatchlistItemId)}
                    >
                      {visibleColumns.map((col) => renderCell(col.id, item))}
                      <td className={`${styles.td} ${styles.tdActions}`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.rowActions}>
                          <button className={styles.actionBtn} onClick={() => openEditWatchlistItem(item.id)} title="Edit">✎</button>
                          <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDelete(item.id, item.name)} title="Remove">✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {colSelectorOpen && (
        <div
          ref={colSelectorRef}
          className={styles.colSelectorPanel}
          style={{ top: panelPos.top, right: panelPos.right }}
        >
          <div className={styles.colSelectorTitle}>Columns — drag to reorder</div>
          {allColsSorted.map((col) => (
            <div
              key={col.id}
              draggable
              className={`${styles.colSelectorRow} ${dragOver === col.id ? styles.colSelectorRowOver : ''} ${dragCol === col.id ? styles.colSelectorRowDragging : ''}`}
              onDragStart={(e) => handleDragStart(e, col.id)}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDrop={() => handleDrop(col.id)}
              onDragEnd={handleDragEnd}
            >
              <span className={styles.dragHandle}>⠿</span>
              <label className={styles.colSelectorLabel}>
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => handleColToggle(col.id)}
                  className={styles.colSelectorCheck}
                />
                {col.label}
              </label>
            </div>
          ))}
        </div>
      )}

      {tableGroupPanelOpen && (
        <div
          ref={tableGroupPanelRef}
          className={styles.menuPanel}
          style={{ top: tableGroupPanelPos.top, right: tableGroupPanelPos.right }}
        >
          <div className={styles.menuPanelTitle}>Group by</div>
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`${styles.menuOption} ${tableGroupBy === opt.id ? styles.menuOptionActive : ''}`}
              onClick={() => { setTableGroupBy(opt.id); setTableCollapsedGroups(new Set()); setTableGroupPanelOpen(false); }}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
