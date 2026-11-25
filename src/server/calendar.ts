import { repo } from '@/db';
import type { MacroEvent } from '@/lib/types';
import { fetchMacroCalendar } from '@/providers/calendar';
import { explainRelease, releaseTopic } from '@/server/macro';
import { summarizeRelease } from '@/server/reports';

const FRESH_MS = 6 * 60 * 60 * 1000;
const ETAG_KEY = 'calendarEtag';
const CREDIT_KEY = 'calendarCredit';

export type CalendarView = {
  events: MacroEvent[];
  updatedAt: number | null;
  attribution: string;
  error: string | null;
  changed: boolean;
};

const globalRefresh = globalThis as unknown as { macroRefresh?: Promise<boolean> };

function track(job: Promise<boolean>): Promise<boolean> {
  const current = job.finally(() => {
    if (globalRefresh.macroRefresh === current) globalRefresh.macroRefresh = undefined;
  });
  globalRefresh.macroRefresh = current;
  return current;
}

/** Refresh the stored US release schedule when the copy is older than six hours. */
export function ensureCalendar(): Promise<boolean> {
  if (globalRefresh.macroRefresh) return globalRefresh.macroRefresh;
  return track(refresh(false));
}

/** Pull the feed now. An unchanged reply leaves the six-hour timer alone, so an early check does not hide the print. */
export function refreshCalendarNow(): Promise<boolean> {
  const pending = globalRefresh.macroRefresh ?? Promise.resolve(true);
  return track(pending.then(() => refresh(true)));
}

async function refresh(force: boolean): Promise<boolean> {
  const cached = repo.listCaches().find((row) => row.key === 'macro.calendar');
  const fresh = cached?.ok && cached.updatedAt != null && Date.now() - cached.updatedAt < FRESH_MS && repo.listMacroEvents().length > 0;
  if (!force && fresh) return true;
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
      return true;
    }
    if (!force) {
      repo.setCache('macro.calendar', {
        ok: true,
        detail: cached?.detail || 'Unchanged',
        updatedAt: now,
      });
    }
    return true;
  } catch (error) {
    const message = calendarError(error);
    repo.setCache('macro.calendar', { ok: false, detail: message, updatedAt: Date.now() });
    console.error('[calendar]', message);
    return false;
  }
}

function calendarError(error: unknown): string {
  if (!(error instanceof Error)) return 'Calendar request failed.';
  const cause = error.cause instanceof Error ? error.cause.message : '';
  return cause ? `${error.message}: ${cause}` : error.message;
}

function present(changed: boolean): CalendarView {
  const cached = repo.listCaches().find((row) => row.key === 'macro.calendar');
  return {
    events: repo.listMacroEvents().map((event) => ({
      ...event,
      ...explainRelease(event.name),
      topic: releaseTopic(event.name),
      report: summarizeRelease(event),
    })),
    updatedAt: cached?.updatedAt ?? null,
    attribution: repo.getSetting(CREDIT_KEY) || 'Data: XOOMAR',
    error: cached && !cached.ok ? cached.detail : null,
    changed,
  };
}

export async function calendarView(): Promise<CalendarView> {
  await ensureCalendar();
  return present(false);
}

export async function calendarRefresh(): Promise<CalendarView> {
  const before = repo.listMacroEvents().map((event) => `${event.id}:${event.actual ?? ''}:${event.previous ?? ''}`);
  await refreshCalendarNow();
  const after = repo.listMacroEvents().map((event) => `${event.id}:${event.actual ?? ''}:${event.previous ?? ''}`);
  const changed = before.length !== after.length || before.some((row, index) => row !== after[index]);
  return present(changed);
}
