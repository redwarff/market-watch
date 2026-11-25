import { readSession } from '@/server/auth';
import { calendarRefresh, calendarView } from '@/server/calendar';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  return Response.json(await calendarView());
}

export async function POST() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  return Response.json(await calendarRefresh());
}
