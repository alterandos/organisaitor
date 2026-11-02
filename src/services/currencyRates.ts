import { useEffect } from 'react';
import { useCurrencyStore, type CurrencyRates } from '@/store/currencyStore';
import { apiFetch } from '@/utils/apiFetch';
import { log } from '@/utils/log';

// The Currency converter's rates (config/units.ts), from api/currency-rates.ts: fetched when a
// currency is first shown and again once they're over 12 hours old, and kept on the device
// (`currency-rates`, a cache: not user data, so not in PERSISTED_STORAGE_KEYS or backups) so they
// work offline, said to be old when a refresh fails.

const CACHE_KEY = 'currency-rates';
const MAX_AGE_MS = 12 * 3600_000;
let inFlight: Promise<void> | null = null;

function cached(): CurrencyRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const r = raw ? JSON.parse(raw) as CurrencyRates : null;
    return r && typeof r.date === 'string' && r.rates && typeof r.fetchedAt === 'number' ? r : null;
  } catch { return null; }   // a broken copy is just fetched again
}

export function ensureCurrencyRates(now = Date.now()): Promise<void> {
  const store = useCurrencyStore.getState();
  if (!store.rates) { const c = cached(); if (c) store.set({ rates: c }); }
  const have = useCurrencyStore.getState().rates;
  if (have && now - have.fetchedAt < MAX_AGE_MS) return Promise.resolve();
  if (inFlight) return inFlight;
  useCurrencyStore.getState().set({ loading: true });
  inFlight = (async () => {
    try {
      const res = await apiFetch('/api/currency-rates');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json() as { date: string; rates: Record<string, number> };
      const next: CurrencyRates = { date: body.date, rates: body.rates, fetchedAt: now };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* a full device keeps them in memory only */ }
      useCurrencyStore.getState().set({ rates: next, failed: false });
    } catch (e) {
      log.warn('currency', 'rates refresh failed', e);
      useCurrencyStore.getState().set({ failed: true });
    } finally {
      useCurrencyStore.getState().set({ loading: false });
      inFlight = null;
    }
  })();
  return inFlight;
}

// For a component showing currency: the rates, loaded (or refreshed) while it's shown.
export function useCurrencyRates(active: boolean) {
  const rates = useCurrencyStore((s) => s.rates);
  const loading = useCurrencyStore((s) => s.loading);
  const failed = useCurrencyStore((s) => s.failed);
  useEffect(() => { if (active) void ensureCurrencyRates(); }, [active]);
  return { rates, loading, failed };
}
