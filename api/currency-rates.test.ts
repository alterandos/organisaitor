import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './currency-rates';

// The rates function: Frankfurter's answer passed on with EUR added and anything odd dropped,
// cached at the edge; an error when the source can't be reached.

afterEach(() => { vi.unstubAllGlobals(); });

describe('api/currency-rates', () => {
  it('passes the day\'s rates on, euro included, cached for six hours', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ amount: 1, base: 'EUR', date: '2026-10-30', rates: { USD: 1.08, AUD: 1.65, bad: 2, GBP: -1 } }))));
    const res = await handler();
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=21600');
    expect(await res.json()).toEqual({ date: '2026-10-30', base: 'EUR', rates: { EUR: 1, USD: 1.08, AUD: 1.65 } });
  });

  it('says so when the source is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect((await handler()).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect((await handler()).status).toBe(502);
  });
});
