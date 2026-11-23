import { repo } from '@/db';
import { readSession } from '@/server/auth';
import { jsonError, readJson } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const { id } = await context.params;
  const alert = repo.getAlert(id);
  if (!alert) return jsonError('That limit is gone.', 404);
  const body = (await readJson(request)) as { armed?: boolean } | null;
  if (body?.armed) repo.armAlert(id);
  return Response.json(repo.getAlert(id));
}

export async function DELETE(_request: Request, context: Context) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const { id } = await context.params;
  if (!repo.deleteAlert(id)) return jsonError('That limit is gone.', 404);
  return Response.json({ ok: true });
}
