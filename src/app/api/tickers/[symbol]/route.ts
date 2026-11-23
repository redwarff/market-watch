import { repo } from '@/db';
import { bus } from '@/server/bus';
import { readSession } from '@/server/auth';
import { jsonError, readJson, zodMessage } from '@/server/http';
import { getDetail } from '@/server/present';
import { cleanSymbol, isSymbol, tickerPatchSchema } from '@/server/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ symbol: string }> };

function symbolOf(raw: string): string | null {
  const symbol = cleanSymbol(decodeURIComponent(raw));
  return isSymbol(symbol) ? symbol : null;
}

export async function GET(_request: Request, context: Context) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const symbol = symbolOf((await context.params).symbol);
  if (!symbol) return jsonError('Unknown symbol.', 404);
  const detail = getDetail(symbol);
  if (!detail) return jsonError('That ticker is not on the watch.', 404);
  return Response.json(detail);
}

export async function PATCH(request: Request, context: Context) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const symbol = symbolOf((await context.params).symbol);
  if (!symbol) return jsonError('Unknown symbol.', 404);
  const parsed = tickerPatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const updated = repo.updateTicker(symbol, parsed.data);
  if (!updated) return jsonError('That ticker is not on the watch.', 404);
  bus.emit('ticker:updated', symbol);
  return Response.json(getDetail(symbol));
}

export async function DELETE(_request: Request, context: Context) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const symbol = symbolOf((await context.params).symbol);
  if (!symbol) return jsonError('Unknown symbol.', 404);
  const removed = repo.deleteTicker(symbol);
  if (!removed) return jsonError('That ticker is not on the watch.', 404);
  bus.emit('ticker:removed', symbol);
  return Response.json({ ok: true });
}
