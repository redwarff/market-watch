import { readSession } from '@/server/auth';
import { jsonError } from '@/server/http';
import { listWatch } from '@/server/present';
import { currentVix } from '@/server/vix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  return Response.json({ rows: listWatch(), vix: await currentVix() });
}
