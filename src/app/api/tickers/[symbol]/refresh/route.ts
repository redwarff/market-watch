import { repo } from '@/db';
import { bus } from '@/server/bus';
import { readSession } from '@/server/auth';
import { jsonError } from '@/server/http';
import { cleanSymbol, isSymbol } from '@/server/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ symbol: string }> };

export async function POST(_request: Request, context: Context) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const symbol = cleanSymbol(decodeURIComponent((await context.params).symbol));
  if (!isSymbol(symbol) || !repo.getTicker(symbol)) return jsonError('That ticker is not on the watch.', 404);
  bus.emit('ticker:refresh', symbol);
  return Response.json({ ok: true });
}
