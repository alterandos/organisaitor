import { useEffect, useRef, useCallback } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { usePriceStore } from '@/store/priceStore';
import { getBatchQuotes } from './tickerService';

const REFRESH_INTERVAL_MS = 60_000;

export function usePriceRefresh() {
  const watchlistItems = usePortfolioStore((s) => s.watchlistItems);
  const setPrices      = usePriceStore((s) => s.setPrices);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const tickers = Object.values(watchlistItems)
      .map((item) => item.ticker)
      .filter((t): t is string => !!t);

    if (tickers.length === 0) return;

    const quotes = await getBatchQuotes(tickers);
    const now = Date.now();
    const next: Record<string, { price: number | null; previousClose: number | null; change: number | null; changePercent: number | null; volume: number | null; updatedAt: number }> = {};
    for (const q of quotes) {
      next[q.ticker] = { price: q.price, previousClose: q.previousClose, change: q.change, changePercent: q.changePercent, volume: q.volume, updatedAt: now };
    }
    setPrices(next);
  }, [watchlistItems, setPrices]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let windowFocused = true;

    const shouldRefresh = () => !document.hidden && windowFocused;
    const tryRefresh    = () => { if (shouldRefresh()) refresh(); };

    const startInterval = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(tryRefresh, REFRESH_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    };

    const onVisibilityChange = () => {
      if (document.hidden) stopInterval(); else { tryRefresh(); startInterval(); }
    };
    const onFocus = () => { windowFocused = true;  tryRefresh(); startInterval(); };
    const onBlur  = () => { windowFocused = false; stopInterval(); };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur',  onBlur);

    tryRefresh();
    startInterval();

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur',  onBlur);
    };
  }, [refresh]);
}
