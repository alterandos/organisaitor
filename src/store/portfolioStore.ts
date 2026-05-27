import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { todayIso } from '@/utils/date';
import type {
  WatchlistItem, WatchlistItemId,
  PortfolioTag, PortfolioTagId,
  InvestmentPurpose, InvestmentPurposeId,
  WatchlistColumn, WatchlistColumnId,
  CreateWatchlistItemInput,
} from '@/types/portfolio';

const SEED_PURPOSES: InvestmentPurpose[] = [
  { id: 'ip-dividend'    as InvestmentPurposeId, name: 'Dividend',         color: '#10b981' },
  { id: 'ip-growth'      as InvestmentPurposeId, name: 'Growth',           color: '#5b6ee1' },
  { id: 'ip-speculative' as InvestmentPurposeId, name: 'Speculative',      color: '#f97316' },
  { id: 'ip-stable'      as InvestmentPurposeId, name: 'Stable/Defensive', color: '#64748b' },
  { id: 'ip-ethical'     as InvestmentPurposeId, name: 'Ethical/ESG',      color: '#84cc16' },
  { id: 'ip-income'      as InvestmentPurposeId, name: 'Income',           color: '#f59e0b' },
  { id: 'ip-value'       as InvestmentPurposeId, name: 'Value',            color: '#8b5cf6' },
  { id: 'ip-hedge'       as InvestmentPurposeId, name: 'Hedge',            color: '#ec4899' },
];

const DEFAULT_COLUMNS: WatchlistColumn[] = [
  { id: 'ticker',             label: 'Ticker',      visible: true,  order: 0  },
  { id: 'name',               label: 'Name',        visible: true,  order: 1  },
  { id: 'price',              label: 'Price',       visible: true,  order: 2  },
  { id: 'status',             label: 'Portfolio',   visible: true,  order: 3  },
  { id: 'assetClass',         label: 'Asset Class', visible: true,  order: 4  },
  { id: 'sector',             label: 'Sector',      visible: true,  order: 5  },
  { id: 'marketCap',          label: 'Mkt Cap',     visible: true,  order: 6  },
  { id: 'exchange',            label: 'Exchange',    visible: false, order: 7  },
  { id: 'investmentPurposes', label: 'Purpose',     visible: false, order: 8  },
  { id: 'tags',               label: 'Tags',        visible: false, order: 9  },
  { id: 'links',              label: 'Links',       visible: false, order: 10 },
  { id: 'notes',              label: 'Notes',       visible: false, order: 11 },
  { id: 'dateAdded',          label: 'Date Added',  visible: true,  order: 12 },
];

const toRecord = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map((x) => [x.id, x]));

interface PortfolioState {
  watchlistItems:     Record<WatchlistItemId,     WatchlistItem>;
  portfolioTags:      Record<PortfolioTagId,       PortfolioTag>;
  investmentPurposes: Record<InvestmentPurposeId,  InvestmentPurpose>;
  columnConfig:       WatchlistColumn[];

  addWatchlistItem:        (input: CreateWatchlistItemInput) => void;
  updateWatchlistItem:     (id: WatchlistItemId, patch: Partial<Omit<WatchlistItem, 'id' | 'createdAt'>>) => void;
  deleteWatchlistItem:     (id: WatchlistItemId) => void;

  addPortfolioTag:         (tag: Omit<PortfolioTag, 'id'>) => PortfolioTagId;
  updatePortfolioTag:      (id: PortfolioTagId,  patch: Partial<Omit<PortfolioTag,      'id'>>) => void;
  deletePortfolioTag:      (id: PortfolioTagId) => void;

  addInvestmentPurpose:    (p: Omit<InvestmentPurpose, 'id'>) => InvestmentPurposeId;
  updateInvestmentPurpose: (id: InvestmentPurposeId, patch: Partial<Omit<InvestmentPurpose, 'id'>>) => void;
  deleteInvestmentPurpose: (id: InvestmentPurposeId) => void;

  setColumnConfig:         (columns: WatchlistColumn[]) => void;
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set) => ({
      watchlistItems:     {},
      portfolioTags:      {},
      investmentPurposes: toRecord(SEED_PURPOSES) as Record<InvestmentPurposeId, InvestmentPurpose>,
      columnConfig:       DEFAULT_COLUMNS,

      addWatchlistItem: (input) => {
        const now = new Date().toISOString();
        const id  = nanoid() as WatchlistItemId;
        const item: WatchlistItem = {
          id,
          ticker:               input.ticker ? input.ticker.toUpperCase().trim() : null,
          name:                 input.name.trim(),
          assetClass:           input.assetClass    ?? null,
          sector:               input.sector        ?? null,
          exchange:             input.exchange      ?? null,
          marketCapValue:       input.marketCapValue ?? null,
          status:               input.status        ?? 'watching',
          heldAt:               input.heldAt        ?? null,
          investmentPurposeIds: input.investmentPurposeIds ?? [],
          tagIds:               input.tagIds ?? [],
          links:                input.links  ?? [],
          notes:                input.notes  ?? null,
          dateAdded:            input.dateAdded ?? todayIso(),
          createdAt:            now,
          updatedAt:            now,
        };
        set((s) => ({ watchlistItems: { ...s.watchlistItems, [id]: item } }));
      },

      updateWatchlistItem: (id, patch) => set((s) => {
        const existing = s.watchlistItems[id];
        if (!existing) return s;
        return {
          watchlistItems: {
            ...s.watchlistItems,
            [id]: { ...existing, ...patch, updatedAt: new Date().toISOString() },
          },
        };
      }),

      deleteWatchlistItem: (id) => set((s) => {
        const next = { ...s.watchlistItems };
        delete next[id];
        return { watchlistItems: next };
      }),

      addPortfolioTag: (tag) => {
        const id = nanoid() as PortfolioTagId;
        set((s) => ({ portfolioTags: { ...s.portfolioTags, [id]: { ...tag, id } } }));
        return id;
      },

      updatePortfolioTag: (id, patch) => set((s) => {
        const existing = s.portfolioTags[id];
        if (!existing) return s;
        return { portfolioTags: { ...s.portfolioTags, [id]: { ...existing, ...patch } } };
      }),

      deletePortfolioTag: (id) => set((s) => {
        const next = { ...s.portfolioTags };
        delete next[id];
        const watchlistItems = Object.fromEntries(
          Object.entries(s.watchlistItems).map(([k, item]) => [
            k,
            { ...item, tagIds: item.tagIds.filter((t) => t !== id) },
          ])
        ) as Record<WatchlistItemId, WatchlistItem>;
        return { portfolioTags: next, watchlistItems };
      }),

      addInvestmentPurpose: (p) => {
        const id = nanoid() as InvestmentPurposeId;
        set((s) => ({ investmentPurposes: { ...s.investmentPurposes, [id]: { ...p, id } } }));
        return id;
      },

      updateInvestmentPurpose: (id, patch) => set((s) => {
        const existing = s.investmentPurposes[id];
        if (!existing) return s;
        return { investmentPurposes: { ...s.investmentPurposes, [id]: { ...existing, ...patch } } };
      }),

      deleteInvestmentPurpose: (id) => set((s) => {
        const next = { ...s.investmentPurposes };
        delete next[id];
        const watchlistItems = Object.fromEntries(
          Object.entries(s.watchlistItems).map(([k, item]) => [
            k,
            { ...item, investmentPurposeIds: item.investmentPurposeIds.filter((p) => p !== id) },
          ])
        ) as Record<WatchlistItemId, WatchlistItem>;
        return { investmentPurposes: next, watchlistItems };
      }),

      setColumnConfig: (columns) => set({ columnConfig: columns }),
    }),
    {
      name:    'todo-portfolio',
      version: 7,
      migrate: (persisted: unknown, fromVersion: number) => {
        const state = persisted as PortfolioState;
        let result = { ...state };

        if (fromVersion < 2 && result.watchlistItems) {
          const watchlistItems = Object.fromEntries(
            Object.entries(result.watchlistItems).map(([id, item]) => {
              const it = item as Record<string, unknown>;
              return [id, { ...it, marketCapValue: null, links: it.links ?? [] }];
            })
          ) as Record<WatchlistItemId, WatchlistItem>;
          result = { ...result, watchlistItems };
        }

        if (fromVersion < 3) {
          const watchlistItems = Object.fromEntries(
            Object.entries(result.watchlistItems ?? {}).map(([id, item]) => {
              const it = item as Record<string, unknown>;
              return [id, { ...it, sector: it.sector ?? null }];
            })
          ) as Record<WatchlistItemId, WatchlistItem>;
          const existingColumns: WatchlistColumn[] = result.columnConfig ?? DEFAULT_COLUMNS;
          const columnConfig = existingColumns.some((c) => c.id === 'sector')
            ? existingColumns
            : [...existingColumns, { id: 'sector' as WatchlistColumnId, label: 'Sector', visible: true, order: 4 }];
          result = { ...result, watchlistItems, columnConfig };
        }

        if (fromVersion < 4) {
          const columnConfig = (result.columnConfig ?? DEFAULT_COLUMNS).map((c) =>
            (c.id === 'tags' || c.id === 'investmentPurposes') ? { ...c, visible: false } : c
          );
          result = { ...result, columnConfig };
        }

        if (fromVersion < 5) {
          const watchlistItems = Object.fromEntries(
            Object.entries(result.watchlistItems ?? {}).map(([id, item]) => {
              const it = item as Record<string, unknown>;
              return [id, { ...it, status: it.status ?? 'watching', heldAt: it.heldAt ?? null }];
            })
          ) as Record<WatchlistItemId, WatchlistItem>;
          const existingCols: WatchlistColumn[] = result.columnConfig ?? DEFAULT_COLUMNS;
          const columnConfig = existingCols.some((c) => c.id === 'status')
            ? existingCols
            : [{ id: 'status' as WatchlistColumnId, label: 'Portfolio', visible: true, order: 3 },
               ...existingCols.filter((c) => c.order >= 3).map((c) => ({ ...c, order: c.order + 1 })),
               ...existingCols.filter((c) => c.order < 3)];
          result = { ...result, watchlistItems, columnConfig };
        }

        if (fromVersion < 6) {
          const watchlistItems = Object.fromEntries(
            Object.entries(result.watchlistItems ?? {}).map(([id, item]) => {
              const it = item as Record<string, unknown>;
              return [id, { ...it, exchange: it.exchange ?? null }];
            })
          ) as Record<WatchlistItemId, WatchlistItem>;
          const existingCols: WatchlistColumn[] = result.columnConfig ?? DEFAULT_COLUMNS;
          const columnConfig = existingCols.some((c) => c.id === 'exchange')
            ? existingCols
            : [...existingCols, { id: 'exchange' as WatchlistColumnId, label: 'Exchange', visible: false, order: 7 }];
          result = { ...result, watchlistItems, columnConfig };
        }

        if (fromVersion < 7) {
          const existingCols: WatchlistColumn[] = result.columnConfig ?? DEFAULT_COLUMNS;
          // Ensure every column in DEFAULT_COLUMNS is present (catches any migration gaps).
          const existingIds = new Set(existingCols.map((c) => c.id));
          const missing = DEFAULT_COLUMNS.filter((c) => !existingIds.has(c.id));
          const maxOrder = existingCols.reduce((m, c) => Math.max(m, c.order), -1);
          const columnConfig = missing.length > 0
            ? [...existingCols, ...missing.map((c, i) => ({ ...c, order: maxOrder + 1 + i }))]
            : existingCols;
          result = { ...result, columnConfig };
        }

        return result;
      },
    }
  )
);
