import { bootWorker } from '@/server/boot';

export const runtime = 'nodejs';

bootWorker();

export function GET() {
  return Response.json({ ok: true });
}
