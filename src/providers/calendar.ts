import type { MacroImpact, MacroRelease } from '@/lib/types';

const SOURCE = 'https://xoomar.com/api/markets/calendar';
const CREDIT = 'Data: XOOMAR';

export type CalendarFetch = {
  releases: MacroRelease[];
  attribution: string;
  etag: string | null;
  notModified: boolean;
};

type RawEvent = {
  eventName?: string;
  importance?: string;
  scheduledAt?: string;
  periodLabel?: string | null;
  previous?: string | null;
  actual?: string | null;
  unit?: string | null;
  canonicalUrl?: string;
};

function impactOf(value: string | undefined): MacroImpact | null {
  if (value === 'high' || value === 'med' || value === 'low') return value;
  return null;
}

function textOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseCalendar(body: unknown): { releases: MacroRelease[]; attribution: string } {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const rows = Array.isArray(record.data) ? (record.data as RawEvent[]) : [];
  const attribution = attributionOf(record);
  const releases: MacroRelease[] = [];
  for (const row of rows) {
    const name = (row.eventName || '').trim();
    const importance = impactOf(row.importance);
    const scheduledAt = Date.parse(row.scheduledAt || '');
    if (!name || !importance || !Number.isFinite(scheduledAt)) continue;
    releases.push({
      id: `${scheduledAt}:${name}`,
      name,
      importance,
      scheduledAt,
      period: (row.periodLabel || '').trim(),
      previous: textOrNull(row.previous),
      actual: textOrNull(row.actual),
      unit: (row.unit || '').trim(),
      url: (row.canonicalUrl || '').trim(),
    });
  }
  releases.sort((a, b) => a.scheduledAt - b.scheduledAt || a.name.localeCompare(b.name));
  return { releases, attribution };
}

function attributionOf(record: Record<string, unknown>): string {
  const meta = record.meta && typeof record.meta === 'object' ? (record.meta as Record<string, unknown>) : {};
  const line = typeof meta.sourceAttribution === 'string' ? meta.sourceAttribution.trim() : '';
  return line ? `${CREDIT}. ${line}` : CREDIT;
}

export async function fetchMacroCalendar(etag: string | null): Promise<CalendarFetch> {
  const now = new Date();
  const from = utcDay(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const to = utcDay(now.getTime() + 35 * 24 * 60 * 60 * 1000);
  const url = new URL(SOURCE);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'market-watch',
  };
  if (etag) headers['if-none-match'] = etag;
  const response = await fetch(url, { headers, cache: 'no-store' });
  if (response.status === 304) {
    return { releases: [], attribution: '', etag, notModified: true };
  }
  if (response.status === 429) throw new Error('Calendar rate limit. The last saved schedule stays on screen.');
  if (!response.ok) throw new Error(`Calendar request failed (${response.status}).`);
  const parsed = parseCalendar(await response.json());
  if (parsed.releases.length === 0) throw new Error('Calendar response had no releases.');
  return {
    releases: parsed.releases,
    attribution: parsed.attribution,
    etag: response.headers.get('etag'),
    notModified: false,
  };
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
