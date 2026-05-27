import { create } from 'zustand';

interface PriceEntry {
  price:         number | null;
  prevPrice:     number | null;  // price from the immediately previous refresh
  previousClose: number | null;
  change:        number | null;
  changePercent: number | null;
  volume:        number | null;
  updatedAt:     number;
}

interface PriceState {
  prices:    Record<string, PriceEntry>;
  setPrices: (next: Record<string, Omit<PriceEntry, 'prevPrice'>>) => void;
}

export const usePriceStore = create<PriceState>()((set) => ({
  prices:    {},
  setPrices: (next) => set((state) => {
    const merged: Record<string, PriceEntry> = {};
    for (const [ticker, entry] of Object.entries(next)) {
      merged[ticker] = { ...entry, prevPrice: state.prices[ticker]?.price ?? null };
    }
    return { prices: merged };
  }),
}));
