export const config = { runtime: 'edge' };

// Today's exchange rates for the Currency converter (src/services/currencyRates.ts): the European
// Central Bank's reference rates through Frankfurter (free, no key, ~30 currencies, updated each
// working day). No account data, so no Bearer token: guests convert too, as with ticker-*. The
// answer is cached at the edge for six hours, so the app's requests rarely reach Frankfurter.

const SOURCE = 'https://api.frankfurter.dev/v1/latest?base=EUR';

export default async function handler(): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(SOURCE, { headers: { Accept: 'application/json' } });
  } catch (e) {
    console.error('[currency-rates] fetch failed', e);
    return Response.json({ error: 'Rates are unavailable right now.' }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: 'Rates are unavailable right now.' }, { status: 502 });
  const data = await res.json() as { date?: unknown; rates?: Record<string, unknown> };
  const rates: Record<string, number> = { EUR: 1 };
  for (const [code, v] of Object.entries(data.rates ?? {})) if (/^[A-Z]{3}$/.test(code) && typeof v === 'number' && v > 0) rates[code] = v;
  if (typeof data.date !== 'string' || Object.keys(rates).length < 2) return Response.json({ error: 'Rates are unavailable right now.' }, { status: 502 });
  return Response.json({ date: data.date, base: 'EUR', rates }, { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } });
}
