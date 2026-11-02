import { create } from 'zustand';

// Today's exchange rates (memory only; services/currencyRates.ts loads them, keeps a copy on the
// device and refreshes it). Units per euro by currency code, EUR 1.

export interface CurrencyRates { date: string; rates: Record<string, number>; fetchedAt: number }

interface CurrencyState {
  rates:   CurrencyRates | null;
  loading: boolean;
  failed:  boolean;            // the last refresh couldn't reach the rates (offline): what's shown may be old
  set:     (patch: Partial<Omit<CurrencyState, 'set'>>) => void;
}

export const useCurrencyStore = create<CurrencyState>()((set) => ({
  rates: null, loading: false, failed: false,
  set: (patch) => set(patch),
}));
