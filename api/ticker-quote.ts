export const config = { runtime: 'edge' };

function toAssetClass(quoteType: string | undefined): string | null {
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
function mapQuote(q: any) {
  return {
    ticker:         q.symbol,
    name:           q.longName || q.shortName || '',
    price:          q.regularMarketPrice         ?? null,
    previousClose:  q.regularMarketPreviousClose ?? null,
    change:         q.regularMarketChange        ?? null,
    changePercent:  q.regularMarketChangePercent ?? null,
    volume:         q.regularMarketVolume        ?? null,
    marketCapValue: q.marketCap                  ?? null,
    assetClass:     toAssetClass(q.quoteType),
    sector:         q.sector                     ?? null,
    exchange:       q.fullExchangeName           || '',
  };
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get('symbols') ?? '';
  if (!symbols.trim()) return Response.json([]);

  const res = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
  );
  if (!res.ok) return Response.json([]);

  const data = await res.json();
  return Response.json((data?.quoteResponse?.result ?? []).map(mapQuote));
}
