import { repo } from '@/db';
import type { MacroEvent } from '@/lib/types';
import { fetchMacroCalendar } from '@/providers/calendar';
import { explainRelease } from '@/server/macro';
import { summarizeRelease } from '@/server/reports';

const FRESH_MS = 6 * 60 * 60 * 1000;
const ETAG_KEY = 'calendarEtag';
const CREDIT_KEY = 'calendarCredit';

export type CalendarView = {
  events: MacroEvent[];
  updatedAt: number | null;
  attribution: string;
  error: string | null;
};

const globalRefresh = globalThis as unknown as { macroRefresh?: Promise<boolean> };

/** Refresh the stored US release schedule when the copy is older than six hours. */
export function ensureCalendar(): Promise<boolean> {
  if (!globalRefresh.macroRefresh) {
    globalRefresh.macroRefresh = refresh().finally(() => {
      globalRefresh.macroRefresh = undefined;
    });
  }
  return globalRefresh.macroRefresh;
}

async function refresh(): Promise<boolean> {
  const cached = repo.listCaches().find((row) => row.key === 'macro.calendar');
  const fresh = cached?.ok && cached.updatedAt != null && Date.now() - cached.updatedAt < FRESH_MS && repo.listMacroEvents().length > 0;
  if (fresh) return true;
  try {
    const result = await fetchMacroCalendar(repo.getSetting(ETAG_KEY));
    const now = Date.now();
    if (!result.notModified) {
      repo.replaceMacroEvents(result.releases);
      repo.setSettings({
        [ETAG_KEY]: result.etag || '',
        [CREDIT_KEY]: result.attribution,
      });
      repo.setCache('macro.calendar', {
        ok: true,
        detail: `${result.releases.length} releases`,
        updatedAt: now,
      });
    } else {
      repo.setCache('macro.calendar', {
        ok: true,
        detail: cached?.detail || 'Unchanged',
        updatedAt: now,
      });
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calendar request failed.';
    repo.setCache('macro.calendar', { ok: false, detail: message, updatedAt: Date.now() });
    console.error('[calendar]', message);
    return false;
  }
}

export async function calendarView(): Promise<CalendarView> {
  await ensureCalendar();
  const cached = repo.listCaches().find((row) => row.key === 'macro.calendar');
  return {
    events: repo.listMacroEvents().map((event) => ({
      ...event,
      ...explainRelease(event.name),
      report: summarizeRelease(event),
    })),
    updatedAt: cached?.updatedAt ?? null,
    attribution: repo.getSetting(CREDIT_KEY) || 'Data: XOOMAR',
    error: cached && !cached.ok ? cached.detail : null,
  };
}
