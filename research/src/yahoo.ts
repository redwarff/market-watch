import type { Bar } from './types.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** First SPY session. `range=max` on this endpoint returns monthly bars, so the span is explicit. */
const SPY_FIRST_TRADE = 728317800;

export type Download = {
  bars: Bar[];
  splits: { date: string; numerator: number; denominator: number }[];
  dividendCount: number;
};

export async function downloadSpyDaily(now = new Date()): Promise<Download> {
  const url = new URL('https://query1.finance.yahoo.com/v8/finance/chart/SPY');
  url.searchParams.set('period1', String(SPY_FIRST_TRADE));
  url.searchParams.set('period2', String(Math.floor(now.getTime() / 1000)));
  url.searchParams.set('interval', '1d');
  url.searchParams.set('events', 'div|split');
  url.searchParams.set('includeAdjustedClose', 'true');
  const response = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!response.ok) throw new Error(`Yahoo chart responded ${response.status}.`);
  const body = (await response.json()) as YahooChart;
  if (body.chart?.error?.description) throw new Error(body.chart.error.description);
  const result = body.chart?.result?.[0];
  if (!result?.timestamp || !result.indicators?.quote?.[0]) throw new Error('Yahoo chart returned no bars.');
  const quote = result.indicators.quote[0];
  const adjusted = result.indicators.adjclose?.[0]?.adjclose;
  if (!adjusted) throw new Error('Yahoo chart returned no adjusted close.');
  const today = nyDate(now);
  const sessionDone = nySessionComplete(now);
  const bars: Bar[] = [];
  for (let i = 0; i < result.timestamp.length; i += 1) {
    const date = nyDate(new Date(result.timestamp[i] * 1000));
    if (date > today) continue;
    if (date === today && !sessionDone) continue;
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const adjClose = adjusted[i];
    if (open == null || high == null || low == null || close == null || adjClose == null) continue;
    if (high < low || !(adjClose > 0)) continue;
    bars.push({
      date,
      open,
      high,
      low,
      close,
      adjClose,
      volume: quote.volume?.[i] ?? 0,
    });
  }
  const splits = Object.values(result.events?.splits ?? {}).map((split) => ({
    date: nyDate(new Date(split.date * 1000)),
    numerator: split.numerator,
    denominator: split.denominator,
  }));
  return {
    bars,
    splits,
    dividendCount: Object.keys(result.events?.dividends ?? {}).length,
  };
}

function nyDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function nySessionComplete(date: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour > 16 || (hour === 16 && minute >= 15);
}

type YahooChart = {
  chart?: {
    error?: { description?: string };
    result?: {
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
        adjclose?: { adjclose?: (number | null)[] }[];
      };
      events?: {
        splits?: Record<string, { date: number; numerator: number; denominator: number }>;
        dividends?: Record<string, unknown>;
      };
    }[];
  };
};
