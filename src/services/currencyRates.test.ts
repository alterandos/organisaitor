import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Currency converter's rates: from the device's copy while fresh, fetched when old, and kept
// (marked old) when a refresh fails.

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/utils/apiFetch', () => ({ apiFetch }));

import { ensureCurrencyRates } from './currencyRates';
import { useCurrencyStore } from '@/store/currencyStore';

const HOUR = 3600_000;
const T0 = Date.parse('2026-10-30T09:00:00Z');
const respond = (body: unknown, ok = true) => apiFetch.mockResolvedValueOnce({ ok, status: ok ? 200 : 502, json: async () => body });

beforeEach(() => {
  localStorage.clear();
  apiFetch.mockReset();
  useCurrencyStore.setState(useCurrencyStore.getInitialState(), true);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('currency rates', () => {
  it('fetches the first time and keeps a copy on the device', async () => {
    respond({ date: '2026-10-30', rates: { EUR: 1, USD: 1.08 } });
    await ensureCurrencyRates(T0);
    expect(useCurrencyStore.getState().rates).toMatchObject({ date: '2026-10-30', rates: { USD: 1.08 } });
    expect(JSON.parse(localStorage.getItem('currency-rates')!)).toMatchObject({ date: '2026-10-30', fetchedAt: T0 });
  });

  it('uses the device’s copy while it is under 12 hours old, and fetches again after', async () => {
    localStorage.setItem('currency-rates', JSON.stringify({ date: '2026-10-29', rates: { EUR: 1, USD: 1.07 }, fetchedAt: T0 - 2 * HOUR }));
    await ensureCurrencyRates(T0);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(useCurrencyStore.getState().rates?.date).toBe('2026-10-29');
    respond({ date: '2026-10-30', rates: { EUR: 1, USD: 1.08 } });
    await ensureCurrencyRates(T0 + 11 * HOUR);
    expect(useCurrencyStore.getState().rates?.date).toBe('2026-10-30');
  });

  it('offline: keeps the old rates and says they are old', async () => {
    localStorage.setItem('currency-rates', JSON.stringify({ date: '2026-10-20', rates: { EUR: 1, USD: 1.05 }, fetchedAt: T0 - 48 * HOUR }));
    apiFetch.mockRejectedValueOnce(new Error('offline'));
    await ensureCurrencyRates(T0);
    expect(useCurrencyStore.getState()).toMatchObject({ failed: true, loading: false, rates: { date: '2026-10-20' } });
  });
});
