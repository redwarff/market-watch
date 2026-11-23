import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/constants';
import { passwordConfigured, passwordOk, sessionCookieOptions, signSession } from '@/server/auth';
import { jsonError, readJson, zodMessage } from '@/server/http';
import { loginSchema } from '@/server/schemas';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!passwordConfigured()) {
    return jsonError('Set APP_PASSWORD in the server environment and restart.', 500);
  }
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  if (!passwordOk(parsed.data.password)) return jsonError('Wrong password.', 401);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(), sessionCookieOptions());
  return Response.json({ ok: true });
}
