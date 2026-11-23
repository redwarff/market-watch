import { repo } from '@/db';
import { readSession } from '@/server/auth';
import { jsonError, readJson, zodMessage } from '@/server/http';
import { alertSchema, cleanSymbol, isSymbol } from '@/server/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ symbol: string }> };

export async function POST(request: Request, context: Context) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const symbol = cleanSymbol(decodeURIComponent((await context.params).symbol));
  if (!isSymbol(symbol)) return jsonError('Unknown symbol.', 404);
  const ticker = repo.getTicker(symbol);
  if (!ticker) return jsonError('That ticker is not on the watch.', 404);
  const parsed = alertSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const alert = {
    id: crypto.randomUUID(),
    tickerId: ticker.id,
    direction: parsed.data.direction,
    price: parsed.data.price,
    armed: true,
    lastTriggeredAt: null,
    createdAt: Date.now(),
  };
  repo.createAlert(alert);
  return Response.json(alert, { status: 201 });
}
