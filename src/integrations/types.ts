import type { AssetClass } from '@/types/portfolio';

export interface TickerMatch {
  ticker:     string;
  name:       string;
  exchange:   string;
  assetClass: AssetClass | null;
}

export interface TickerQuote {
  ticker:         string;
  name:           string;
  price:          number | null;
  previousClose:  number | null;
  change:         number | null;
  changePercent:  number | null;
  volume:         number | null;
  marketCapValue: number | null;
  assetClass:     AssetClass | null;
  sector:         string | null;
  exchange:       string;
}
