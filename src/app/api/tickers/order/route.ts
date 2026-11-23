import { repo } from '@/db';
import { readSession } from '@/server/auth';
import { jsonError, readJson, zodMessage } from '@/server/http';
import { cleanSymbol, isSymbol, orderSchema } from '@/server/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const parsed = orderSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const symbols = parsed.data.symbols.map(cleanSymbol).filter(isSymbol);
  if (symbols.length === 0) return jsonError('Enter the ticker order.', 400);
  repo.reorderTickers(symbols);
  return Response.json({ ok: true });
}
