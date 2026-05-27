import type { TickerMatch, TickerQuote } from './types';
import type { AssetClass } from '@/types/portfolio';

// In dev, Vite proxies /yf/* → https://query1.finance.yahoo.com/* (Node.js, no CORS).
// In production, Vercel edge functions at /api/* handle the same proxy.
const USE_PROXY = import.meta.env.DEV;

const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };

function yfToAssetClass(quoteType: string | undefined): AssetClass | null {
  switch (quoteType?.toUpperCase()) {
    case 'EQUITY':         return 'equity';
    case 'ETF':            return 'etf';
    case 'MUTUALFUND':     return 'fund';
    case 'CRYPTOCURRENCY': return 'crypto';
    case 'FUTURE':         return 'commodity';
    default:               return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapYFSearch(item: any): TickerMatch {
  return {
    ticker:     item.symbol,
    name:       item.longname || item.shortname || '',
    exchange:   item.exchDisp || '',
    assetClass: yfToAssetClass(item.quoteType),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapYFQuote(q: any): TickerQuote {
  return {
    ticker:         q.symbol,
    name:           q.longName || q.shortName || '',
    price:          q.regularMarketPrice         ?? null,
    previousClose:  q.regularMarketPreviousClose ?? null,
    change:         q.regularMarketChange        ?? null,
    changePercent:  q.regularMarketChangePercent ?? null,
    volume:         q.regularMarketVolume        ?? null,
    marketCapValue: q.marketCap                  ?? null,
    assetClass:     yfToAssetClass(q.quoteType),
    sector:         q.sector                     ?? null,
    exchange:       q.fullExchangeName           || '',
  };
}

export async function searchTickers(q: string): Promise<TickerMatch[]> {
  try {
    if (USE_PROXY) {
      const url = `/yf/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0`;
      const res = await fetch(url, { headers: YF_HEADERS });
      if (!res.ok) return [];
      const data = await res.json();
      const quotes = data?.quotes ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return quotes.filter((item: any) => item.isYahooFinance !== false).map(mapYFSearch);
    }
    const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error('[ticker] searchTickers error:', err);
    return [];
  }
}

export async function getBatchQuotes(symbols: string[]): Promise<TickerQuote[]> {
  if (symbols.length === 0) return [];
  const deduped = [...new Set(symbols)];
  const joined  = deduped.join(',');
  try {
    if (USE_PROXY) {
      const res = await fetch(
        `/yf/v7/finance/quote?symbols=${encodeURIComponent(joined)}`,
        { headers: YF_HEADERS },
      );
      if (!res.ok) { console.warn('[ticker] getBatchQuotes status:', res.status); return []; }
      const data = await res.json();
      return (data?.quoteResponse?.result ?? []).map(mapYFQuote);
    }
    const res = await fetch(`/api/ticker-quote?symbols=${encodeURIComponent(joined)}`);
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error('[ticker] getBatchQuotes error:', err);
    return [];
  }
}

// Fetch sector from quoteSummary (assetProfile module). Only available for equities.
export async function fetchSector(symbol: string): Promise<string | null> {
  try {
    const path = USE_PROXY
      ? `/yf/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile`
      : `/api/ticker-sector?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(path, { headers: YF_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.quoteSummary?.result?.[0]?.assetProfile?.sector ?? null;
  } catch {
    return null;
  }
}

// Fetch full OHLCV history for charting.
export async function getChartHistory(
  symbol: string,
  range: '1d' | '5d' | '1mo' | '6mo' | '1y' | '2y' | '5y' = '1y',
  interval: '1d' | '1wk' | '1mo' = '1d',
): Promise<{ time: string; open: number; high: number; low: number; close: number }[]> {
  const path = USE_PROXY
    ? `/yf/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
    : `/api/ticker-chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;
  try {
    const res = await fetch(path, { headers: YF_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const ohlcv = result?.indicators?.quote?.[0] ?? {};

    return timestamps
      .map((ts: number, i: number) => ({
        time:  new Date(ts * 1000).toISOString().slice(0, 10),
        open:  ohlcv.open?.[i]  ?? 0,
        high:  ohlcv.high?.[i]  ?? 0,
        low:   ohlcv.low?.[i]   ?? 0,
        close: ohlcv.close?.[i] ?? 0,
      }))
      .filter((b) => b.open && b.high && b.low && b.close);
  } catch (err) {
    console.error('[ticker] getChartHistory error for', symbol, err);
    return [];
  }
}
