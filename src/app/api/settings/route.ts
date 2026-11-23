import { repo } from '@/db';
import { readSession } from '@/server/auth';
import { jsonError, readJson, zodMessage } from '@/server/http';
import { settingsSchema } from '@/server/schemas';
import { parseSubreddits, settingsFromMap, settingsToMap } from '@/server/settings';
import { notifySettings } from '@/server/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const settings = settingsFromMap(repo.getSettingsMap());
  return Response.json({ ...settings, subreddits: settings.subreddits.join(', ') });
}

export async function PUT(request: Request) {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  const parsed = settingsSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const subreddits = parseSubreddits(parsed.data.subreddits);
  if (subreddits.length === 0) return jsonError('Enter at least one subreddit name.', 400);
  const settings = {
    dailyMovePct: parsed.data.dailyMovePct,
    suddenMovePct: parsed.data.suddenMovePct,
    suddenWindowMinutes: parsed.data.suddenWindowMinutes,
    suddenCooldownMinutes: parsed.data.suddenCooldownMinutes,
    subreddits,
  };
  repo.setSettings(settingsToMap(settings));
  notifySettings();
  return Response.json({ ...settings, subreddits: subreddits.join(', ') });
}
