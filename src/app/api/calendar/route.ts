import { readSession } from '@/server/auth';
import { calendarView } from '@/server/calendar';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  return Response.json(await calendarView());
}
