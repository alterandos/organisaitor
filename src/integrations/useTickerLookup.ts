import { useState, useRef, useCallback } from 'react';
import { searchTickers, getBatchQuotes, fetchSector } from './tickerService';
import type { TickerMatch } from './types';
import type { AssetClass } from '@/types/portfolio';
import { log } from '@/utils/log';

export type TickerLookupStatus = 'idle' | 'loading' | 'results' | 'error';

export interface TickerAutoFill {
  name:           string;
  price:          number | null;
  marketCapValue: number | null;
  assetClass:     AssetClass | null;
  sector:         string | null;
  exchange:       string | null;
}

export interface UseTickerLookupReturn {
  status:          TickerLookupStatus;
  candidates:      TickerMatch[];
  autoFill:        TickerAutoFill | null;
  onTickerBlur:    (ticker: string) => void;
  selectCandidate: (match: TickerMatch) => void;
  clearLookup:     () => void;
}

export function useTickerLookup(): UseTickerLookupReturn {
  const [status,     setStatus]     = useState<TickerLookupStatus>('idle');
  const [candidates, setCandidates] = useState<TickerMatch[]>([]);
  const [autoFill,   setAutoFill]   = useState<TickerAutoFill | null>(null);
  const requestIdRef = useRef(0);

  // Immediately fill name + assetClass from search data, then fetch quote for price/marketCap.
  const fillFromMatch = useCallback(async (match: TickerMatch, rid: number) => {
    // Fill name and assetClass right away from search result — no quote needed for these.
    setAutoFill({
      name:           match.name,
      price:          null,
      marketCapValue: null,
      assetClass:     match.assetClass,
      sector:         null,
      exchange:       match.exchange || null,
    });

    // Fetch price/marketCap from quote and sector from quoteSummary in parallel.
    const [quotes, sector] = await Promise.all([
      getBatchQuotes([match.ticker]),
      fetchSector(match.ticker),
    ]);
    if (rid !== requestIdRef.current) return;

    const q = quotes[0];
    if (q) {
      setAutoFill({
        name:           q.name || match.name,
        price:          q.price,
        marketCapValue: q.marketCapValue,
        assetClass:     q.assetClass ?? match.assetClass,
        sector,
        exchange:       match.exchange || q.exchange || null,
      });
    } else {
      log.warn('lookup', `quote returned nothing for ${match.ticker}; keeping the search-only fill`);
    }
    setStatus('idle');
  }, []);

  const onTickerBlur = useCallback(async (ticker: string) => {
    const t = ticker.trim();
    if (!t) return;

    const rid = ++requestIdRef.current;
    setStatus('loading');
    setCandidates([]);
    setAutoFill(null);

    try {
      const results = await searchTickers(t);
      if (rid !== requestIdRef.current) return;

      const prefix = t.toUpperCase();
      const exact = results.filter(
        (r) => r.ticker.toUpperCase() === prefix ||
               r.ticker.toUpperCase().startsWith(prefix + '.')
      );

      if (exact.length === 0) { setStatus('error'); return; }
      if (exact.length === 1) { await fillFromMatch(exact[0], rid); return; }

      setCandidates(exact);
      setStatus('results');
    } catch (err) {
      log.error('lookup', 'ticker search failed', err);
      if (rid === requestIdRef.current) setStatus('error');
    }
  }, [fillFromMatch]);

  const selectCandidate = useCallback(async (match: TickerMatch) => {
    const rid = ++requestIdRef.current;
    setStatus('loading');
    setCandidates([]);
    await fillFromMatch(match, rid);
  }, [fillFromMatch]);

  const clearLookup = useCallback(() => {
    ++requestIdRef.current;
    setStatus('idle');
    setCandidates([]);
    setAutoFill(null);
  }, []);

  return { status, candidates, autoFill, onTickerBlur, selectCandidate, clearLookup };
}
