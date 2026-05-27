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
    ticker:     q.symbol,
    name:       q.longname || q.shortname || '',
    exchange:   q.exchDisp || '',
    assetClass: toAssetClass(q.quoteType),
  };
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  if (!q.trim()) return Response.json([]);

  const res = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
  );
  if (!res.ok) return Response.json([]);

  const data = await res.json();
  // v1/finance/search returns { quotes: [...] } at the top level
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotes: any[] = data?.quotes ?? [];
  return Response.json(quotes.filter((q) => q.isYahooFinance !== false).map(mapQuote));
}
