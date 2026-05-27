// ── Branded ID types ──────────────────────────────────────────────────────────
export type WatchlistItemId     = string & { readonly _brand: 'WatchlistItemId'     };
export type PortfolioTagId      = string & { readonly _brand: 'PortfolioTagId'      };
export type InvestmentPurposeId = string & { readonly _brand: 'InvestmentPurposeId' };

// ── Enumerations ──────────────────────────────────────────────────────────────
export type WatchlistStatus = 'watching' | 'holding';

export type AssetClass =
  | 'equity'
  | 'etf'
  | 'fund'
  | 'crypto'
  | 'bond'
  | 'commodity'
  | 'reit'
  | 'other';

// Column IDs for the watchlist table.
export type WatchlistColumnId =
  | 'ticker'
  | 'name'
  | 'price'
  | 'status'
  | 'assetClass'
  | 'sector'
  | 'marketCap'
  | 'exchange'
  | 'investmentPurposes'
  | 'tags'
  | 'links'
  | 'notes'
  | 'dateAdded';

// ── Core entities ─────────────────────────────────────────────────────────────
export interface PortfolioTag {
  id:    PortfolioTagId;
  name:  string;
  color: string | null;
}

export interface InvestmentPurpose {
  id:    InvestmentPurposeId;
  name:  string;
  color: string | null;
}

export interface WatchlistItem {
  id:                   WatchlistItemId;
  ticker:               string | null;
  name:                 string;
  // API-sourced fields — not user-editable, set by ticker lookup
  assetClass:           AssetClass | null;
  sector:               string | null;          // e.g. "Technology", "Energy"
  exchange:             string | null;          // e.g. "NasdaqGS", "NYSE"
  marketCapValue:       number | null;          // raw number, e.g. 3_000_000_000_000
  // Portfolio status
  status: WatchlistStatus;  // 'watching' | 'holding'
  heldAt: string | null;    // broker / exchange; only meaningful when status === 'holding'
  // User-editable fields
  investmentPurposeIds: InvestmentPurposeId[];
  tagIds:               PortfolioTagId[];
  links:                string[];
  notes:                string | null;
  dateAdded:            string;                 // YYYY-MM-DD; editable, defaults to today
  createdAt:            string;
  updatedAt:            string;
}

// ── Column configuration ──────────────────────────────────────────────────────
export interface WatchlistColumn {
  id:      WatchlistColumnId;
  label:   string;
  visible: boolean;
  order:   number;
}

// ── Display metadata ──────────────────────────────────────────────────────────
export const ASSET_CLASS_META: Record<AssetClass, { label: string; color: string }> = {
  equity:    { label: 'Equity',    color: '#5b6ee1' },
  etf:       { label: 'ETF',       color: '#10b981' },
  fund:      { label: 'Fund',      color: '#8b5cf6' },
  crypto:    { label: 'Crypto',    color: '#f97316' },
  bond:      { label: 'Bond',      color: '#64748b' },
  commodity: { label: 'Commodity', color: '#f59e0b' },
  reit:      { label: 'REIT',      color: '#ec4899' },
  other:     { label: 'Other',     color: '#94a3b8' },
};

// ── Utilities ─────────────────────────────────────────────────────────────────
export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9)  return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6)  return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

// ── Input types ───────────────────────────────────────────────────────────────
export interface CreateWatchlistItemInput {
  ticker?:               string | null;
  name:                  string;
  assetClass?:           AssetClass | null;
  sector?:               string | null;
  exchange?:             string | null;
  marketCapValue?:       number | null;
  status?:               WatchlistStatus;
  heldAt?:               string | null;
  investmentPurposeIds?: InvestmentPurposeId[];
  tagIds?:               PortfolioTagId[];
  links?:                string[];
  notes?:                string | null;
  dateAdded?:            string;
}
