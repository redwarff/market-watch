import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/constants';
import { readSession, sessionCookieOptions } from '@/server/auth';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';

export async function POST() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return Response.json({ ok: true });
}
