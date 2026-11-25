import { matchFutures } from '@/lib/futures';
import { readSession } from '@/server/auth';
import { FinnhubClient } from '@/providers/finnhub';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 1) return Response.json({ results: [] });
  const finnhub = new FinnhubClient();
  const futures = matchFutures(query);
  if (!finnhub.configured) {
    if (futures.length > 0) return Response.json({ results: futures });
    return jsonError('Add FINNHUB_API_KEY to the server environment and restart.', 400);
  }
  try {
    const results = await finnhub.search(query);
    const seen = new Set(futures.map((item) => item.symbol));
    return Response.json({ results: [...futures, ...results.filter((item) => !seen.has(item.symbol))] });
  } catch (error) {
    if (futures.length > 0) return Response.json({ results: futures });
    return jsonError(error instanceof Error ? error.message : 'Search failed.', 502);
  }
}
