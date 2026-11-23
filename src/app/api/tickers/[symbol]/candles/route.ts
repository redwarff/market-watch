import { readSession } from '@/server/auth';
import { jsonError } from '@/server/http';
import { candlesFor } from '@/server/present';
import { cleanSymbol, isSymbol } from '@/server/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ symbol: string }> };

export async function GET(request: Request, context: Context) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const symbol = cleanSymbol(decodeURIComponent((await context.params).symbol));
  if (!isSymbol(symbol)) return jsonError('Unknown symbol.', 404);
  const range = new URL(request.url).searchParams.get('range') || '1d';
  const bars = candlesFor(symbol, range);
  if (!bars) return jsonError('That ticker is not on the watch.', 404);
  return Response.json({ bars });
}
