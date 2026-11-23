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
  if (!finnhub.configured) {
    return jsonError('Add FINNHUB_API_KEY to the server environment and restart.', 400);
  }
  try {
    const results = await finnhub.search(query);
    return Response.json({ results });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Search failed.', 502);
  }
}
