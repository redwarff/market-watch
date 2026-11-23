import { repo } from '@/db';
import { readSession } from '@/server/auth';
import { jsonError } from '@/server/http';
import { getWorkerStatus } from '@/server/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const worker = getWorkerStatus();
  return Response.json({
    finnhub: Boolean(process.env.FINNHUB_API_KEY),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    reddit: Boolean(
      process.env.REDDIT_CLIENT_ID &&
        process.env.REDDIT_CLIENT_SECRET &&
        process.env.REDDIT_USERNAME &&
        process.env.REDDIT_PASSWORD,
    ),
    ws: worker.ws,
    wsDetail: worker.detail,
    caches: repo.listCaches(),
  });
}
