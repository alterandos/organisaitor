export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') ?? '';
  if (!symbol.trim()) return Response.json(null);

  const res = await fetch(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } },
  );
  if (!res.ok) return Response.json(null);
  const data = await res.json();
  const sector = data?.quoteSummary?.result?.[0]?.assetProfile?.sector ?? null;
  return Response.json(sector);
}
