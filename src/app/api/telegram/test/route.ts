import { readSession } from '@/server/auth';
import { jsonError } from '@/server/http';
import { TelegramNotifier } from '@/providers/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const telegram = new TelegramNotifier();
  if (!telegram.configured) {
    return jsonError('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, then restart.', 400);
  }
  try {
    await telegram.send('Market watch is connected.');
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Telegram rejected the message.', 502);
  }
}
