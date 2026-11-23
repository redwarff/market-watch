import { repo } from '@/db';
import { FinnhubClient } from '@/providers/finnhub';
import { bus } from '@/server/bus';
import { readSession } from '@/server/auth';
import { jsonError, readJson, zodMessage } from '@/server/http';
import { listWatch } from '@/server/present';
import { addTickerSchema, cleanSymbol, isSymbol } from '@/server/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const parsed = addTickerSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const symbol = cleanSymbol(parsed.data.symbol);
  if (!isSymbol(symbol)) return jsonError('Enter a US ticker symbol.', 400);
  if (repo.getTicker(symbol)) return jsonError('That ticker is already on the watch.', 409);
  const finnhub = new FinnhubClient();
  if (!finnhub.configured) {
    return jsonError('Add FINNHUB_API_KEY to the server environment and restart.', 400);
  }
  let quote;
  try {
    quote = await finnhub.quote(symbol);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Quote failed.', 502);
  }
  if (!quote) return jsonError('No US quote for that symbol.', 404);
  const ticker = {
    id: crypto.randomUUID(),
    symbol,
    venue: 'US' as const,
    name: (parsed.data.name || symbol).trim() || symbol,
    notes: '',
    muted: false,
    dailyMovePct: null,
    suddenMovePct: null,
    currency: 'USD',
    createdAt: Date.now(),
  };
  try {
    repo.insertTicker(ticker);
  } catch (error) {
    if (String(error).includes('UNIQUE')) return jsonError('That ticker is already on the watch.', 409);
    throw error;
  }
  repo.upsertSnapshot({
    tickerId: ticker.id,
    price: quote.price,
    prevClose: quote.prevClose,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    volume: null,
    ts: quote.ts,
    source: 'finnhub-quote',
    extended: null,
  });
  bus.emit('ticker:added', symbol);
  const row = listWatch().find((item) => item.symbol === symbol);
  return Response.json({ row }, { status: 201 });
}
