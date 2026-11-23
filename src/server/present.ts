import { repo } from '@/db';
import { buildMarkers } from '@/server/markers';
import { settingsFromMap } from '@/server/settings';
import { selectTickerDates, selectWatchDates } from '@/server/dates';
import { etDayKey, etDayStartMs } from '@/server/time';
import type { CandleBar, TickerDetail, WatchRow } from '@/lib/types';

export function listWatch(): WatchRow[] {
  const snapshots = new Map(repo.allSnapshots().map((snapshot) => [snapshot.tickerId, snapshot]));
  const armed = repo.armedCounts();
  const fired = repo.kindsSince(etDayStartMs());
  const today = etDayKey();
  const dates = repo.listCompanyDates();
  return repo.listTickers().map((ticker) => {
    const snapshot = snapshots.get(ticker.id);
    return {
      id: ticker.id,
      symbol: ticker.symbol,
      name: ticker.name,
      muted: ticker.muted,
      currency: ticker.currency,
      price: snapshot?.price ?? null,
      prevClose: snapshot?.prevClose ?? null,
      open: snapshot?.open ?? null,
      high: snapshot?.high ?? null,
      low: snapshot?.low ?? null,
      volume: snapshot?.volume ?? null,
      ts: snapshot?.ts ?? null,
      extended: snapshot?.extended ?? null,
      dates: selectWatchDates(
        dates.filter((date) => date.tickerId === ticker.id),
        today,
      ),
      armedAlerts: armed.get(ticker.id) ?? 0,
      firedToday: fired.get(ticker.id) ?? [],
    };
  });
}

export function getDetail(symbol: string): TickerDetail | null {
  const ticker = repo.getTicker(symbol);
  if (!ticker) return null;
  const snapshot = repo.getSnapshot(ticker.id);
  const fundamentals = repo.getFundamentals(ticker.id);
  const profile = fundamentals?.profile ?? null;
  const settings = settingsFromMap(repo.getSettingsMap());
  return {
    id: ticker.id,
    symbol: ticker.symbol,
    venue: ticker.venue,
    name: ticker.name,
    notes: ticker.notes,
    muted: ticker.muted,
    currency: ticker.currency || profile?.currency || 'USD',
    dailyMovePct: ticker.dailyMovePct,
    suddenMovePct: ticker.suddenMovePct,
    quote: {
      price: snapshot?.price ?? null,
      prevClose: snapshot?.prevClose ?? null,
      open: snapshot?.open ?? null,
      high: snapshot?.high ?? null,
      low: snapshot?.low ?? null,
      volume: snapshot?.volume ?? null,
      ts: snapshot?.ts ?? null,
      extended: snapshot?.extended ?? null,
    },
    profile: {
      description: fundamentals?.description || '',
      industry: profile?.industry || '',
      exchange: profile?.exchange || '',
      website: profile?.website || '',
      ipo: profile?.ipo || '',
      country: profile?.country || '',
      logo: profile?.logo || '',
    },
    markers: buildMarkers(profile, fundamentals?.metrics ?? {}),
    financials: fundamentals?.statements ?? [],
    news: repo.listNews(ticker.id, 30),
    posts: repo.listPosts(ticker.id, 30),
    alerts: repo.listAlerts(ticker.id),
    events: repo.recentEvents(ticker.id, 15),
    dates: selectTickerDates(repo.listCompanyDates(ticker.id), etDayKey()),
    updated: {
      profile: fundamentals?.profileUpdatedAt ?? null,
      statements: fundamentals?.statementsUpdatedAt ?? null,
      intraday: fundamentals?.intradayUpdatedAt ?? null,
      news: fundamentals?.newsUpdatedAt ?? null,
    },
    globals: {
      dailyMovePct: settings.dailyMovePct,
      suddenMovePct: settings.suddenMovePct,
      suddenWindowMinutes: settings.suddenWindowMinutes,
      suddenCooldownMinutes: settings.suddenCooldownMinutes,
    },
  };
}

const RANGES: Record<string, { interval: string; lookback: number }> = {
  '1d': { interval: '5m', lookback: 2 * 24 * 60 * 60 },
  '5d': { interval: '15m', lookback: 8 * 24 * 60 * 60 },
  '1m': { interval: '1d', lookback: 40 * 24 * 60 * 60 },
  '6m': { interval: '1d', lookback: 210 * 24 * 60 * 60 },
  '1y': { interval: '1d', lookback: 400 * 24 * 60 * 60 },
  '5y': { interval: '1d', lookback: 6 * 365 * 24 * 60 * 60 },
};

export function candlesFor(symbol: string, range: string): CandleBar[] | null {
  const ticker = repo.getTicker(symbol);
  const spec = RANGES[range];
  if (!ticker || !spec) return null;
  const since = Math.floor(Date.now() / 1000) - spec.lookback;
  return repo.candles(ticker.id, spec.interval, since);
}
