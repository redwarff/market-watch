import type { CandleBar, CompanyDate, ExtendedQuote, Quote, StatementRow } from '@/lib/types';
import { dividendsFromYahoo } from '@/server/dates';
import { Pacer } from '@/server/pacer';
import type { HistorySource } from './types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const pacer = new Pacer(1200);

const CHARTS = {
  '5m': { interval: '5m', range: '1d' },
  '15m': { interval: '15m', range: '5d' },
  '1d': { interval: '1d', range: '5y' },
} as const;

function yahooSymbol(symbol: string): string {
  return symbol.replace('.', '-');
}

function yahooPath(symbol: string): string {
  return encodeURIComponent(yahooSymbol(symbol)).replace(/%3D/gi, '=');
}

function rawNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'raw' in value) {
    const number = Number((value as { raw?: number }).raw);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function seconds(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number > 1e12 ? number : number * 1000;
}

type SessionRow = {
  marketState?: string;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  preMarketTime?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
  postMarketTime?: number;
  overnightMarketPrice?: number;
  overnightMarketChange?: number;
  overnightMarketChangePercent?: number;
  overnightMarketTime?: number;
};

/** Latest off-hours print. A regular session returns null so the close stays the headline price. */
export function extendedFromYahooQuote(row: SessionRow | null | undefined): ExtendedQuote | null {
  if (!row || (row.marketState || '') === 'REGULAR') return null;
  const prints = [
    sessionPrint('night', row.overnightMarketPrice, row.overnightMarketChange, row.overnightMarketChangePercent, row.overnightMarketTime),
    sessionPrint('pre', row.preMarketPrice, row.preMarketChange, row.preMarketChangePercent, row.preMarketTime),
    sessionPrint('post', row.postMarketPrice, row.postMarketChange, row.postMarketChangePercent, row.postMarketTime),
  ].filter((print): print is ExtendedQuote => print != null);
  prints.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  return prints[0] ?? null;
}

function sessionPrint(
  kind: ExtendedQuote['kind'],
  price: unknown,
  change: unknown,
  pct: unknown,
  time: unknown,
): ExtendedQuote | null {
  const value = finite(price);
  if (value == null || value <= 0) return null;
  return { kind, price: value, change: finite(change), pct: finite(pct), ts: seconds(time) };
}

function periodOf(row: { endDate?: { fmt?: string; raw?: number } }): string {
  if (typeof row.endDate?.fmt === 'string') return row.endDate.fmt;
  if (typeof row.endDate?.raw === 'number') return new Date(row.endDate.raw * 1000).toISOString().slice(0, 10);
  return '';
}

export class YahooHistory implements HistorySource {
  private cookie = '';
  private crumb = '';
  private crumbAt = 0;

  async candles(symbol: string, kind: '5m' | '15m' | '1d'): Promise<{ bars: CandleBar[]; volume: number | null }> {
    const chart = CHARTS[kind];
    return pacer.run(() => this.chart(symbol, chart.interval, chart.range));
  }

  async statements(symbol: string): Promise<{ description: string; rows: StatementRow[] }> {
    return pacer.run(() => this.summary(symbol));
  }

  companyDates(symbol: string): Promise<CompanyDate[]> {
    return pacer.run(() => this.companyCalendar(symbol));
  }

  /** Front-month futures quote. The chart metadata is the last, the prior settle, and the session range. */
  futureQuote(symbol: string): Promise<(Quote & { volume: number | null }) | null> {
    return pacer.run(() => this.frontQuote(symbol));
  }

  /** Regular session stays on Finnhub. This is only the pre-market or after-hours print. */
  extendedQuote(symbol: string): Promise<ExtendedQuote | null> {
    return pacer.run(() => this.sessionQuote(symbol));
  }

  private async frontQuote(symbol: string): Promise<(Quote & { volume: number | null }) | null> {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooPath(symbol)}`);
    url.searchParams.set('interval', '1d');
    url.searchParams.set('range', '1d');
    const response = await this.fetchYahoo(url);
    const body = (await response.json()) as {
      chart?: {
        error?: { description?: string };
        result?: {
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            previousClose?: number;
            regularMarketDayHigh?: number;
            regularMarketDayLow?: number;
            regularMarketVolume?: number;
            regularMarketTime?: number;
          };
        }[];
      };
    };
    if (body.chart?.error) throw new Error(body.chart.error.description || 'Yahoo futures quote failed.');
    const meta = body.chart?.result?.[0]?.meta;
    const price = finite(meta?.regularMarketPrice);
    const ts = seconds(meta?.regularMarketTime);
    if (price == null || price <= 0 || ts == null) return null;
    const previous = finite(meta?.chartPreviousClose) ?? finite(meta?.previousClose);
    return {
      price,
      prevClose: previous != null && previous > 0 ? previous : null,
      open: null,
      high: finite(meta?.regularMarketDayHigh),
      low: finite(meta?.regularMarketDayLow),
      ts,
      volume: finite(meta?.regularMarketVolume),
    };
  }

  private async chart(symbol: string, interval: string, range: string): Promise<{ bars: CandleBar[]; volume: number | null }> {
    await this.session();
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooPath(symbol)}`);
    url.searchParams.set('interval', interval);
    url.searchParams.set('range', range);
    url.searchParams.set('includePrePost', 'false');
    url.searchParams.set('crumb', this.crumb);
    const response = await this.fetchYahoo(url);
    const body = (await response.json()) as {
      chart?: {
        error?: { description?: string };
        result?: {
          timestamp?: number[];
          meta?: { regularMarketVolume?: number };
          indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
        }[];
      };
    };
    if (body.chart?.error) throw new Error(body.chart.error.description || 'Yahoo chart failed.');
    const result = body.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!quote) return { bars: [], volume: null };
    const bars: CandleBar[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      if (open == null || high == null || low == null || close == null) continue;
      if (high < low) continue;
      bars.push({
        time: timestamps[i],
        open,
        high,
        low,
        close,
        volume: quote.volume?.[i] ?? 0,
      });
    }
    const volume = result?.meta?.regularMarketVolume;
    return { bars, volume: typeof volume === 'number' ? volume : null };
  }

  private async companyCalendar(symbol: string): Promise<CompanyDate[]> {
    await this.session();
    const url = new URL(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooPath(symbol)}`,
    );
    url.searchParams.set('modules', 'calendarEvents');
    url.searchParams.set('crumb', this.crumb);
    const response = await this.fetchYahoo(url);
    const body = (await response.json()) as {
      quoteSummary?: {
        error?: { description?: string };
        result?: { calendarEvents?: { exDividendDate?: { raw?: number; fmt?: string }; dividendDate?: { raw?: number; fmt?: string } } }[];
      };
    };
    if (body.quoteSummary?.error) throw new Error(body.quoteSummary.error.description || 'Yahoo calendar failed.');
    return dividendsFromYahoo(body.quoteSummary?.result?.[0]?.calendarEvents ?? null);
  }

  private async sessionQuote(symbol: string): Promise<ExtendedQuote | null> {
    await this.session();
    const url = new URL('https://query1.finance.yahoo.com/v7/finance/quote');
    url.searchParams.set('symbols', yahooSymbol(symbol));
    url.searchParams.set('crumb', this.crumb);
    const response = await this.fetchYahoo(url);
    const body = (await response.json()) as {
      quoteResponse?: {
        error?: { description?: string };
        result?: {
          marketState?: string;
          preMarketPrice?: number;
          preMarketChange?: number;
          preMarketChangePercent?: number;
          preMarketTime?: number;
          postMarketPrice?: number;
          postMarketChange?: number;
          postMarketChangePercent?: number;
          postMarketTime?: number;
        }[];
      };
    };
    if (body.quoteResponse?.error) throw new Error(body.quoteResponse.error.description || 'Yahoo quote failed.');
    return extendedFromYahooQuote(body.quoteResponse?.result?.[0]);
  }

  private async summary(symbol: string): Promise<{ description: string; rows: StatementRow[] }> {
    await this.session();
    const url = new URL(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooPath(symbol)}`,
    );
    url.searchParams.set('modules', 'assetProfile,incomeStatementHistory,balanceSheetHistory');
    url.searchParams.set('crumb', this.crumb);
    const response = await this.fetchYahoo(url);
    const body = (await response.json()) as {
      quoteSummary?: {
        error?: { description?: string };
        result?: {
          assetProfile?: { longBusinessSummary?: string };
          incomeStatementHistory?: {
            incomeStatementHistory?: { endDate?: { fmt?: string; raw?: number }; totalRevenue?: unknown; netIncome?: unknown }[];
          };
          balanceSheetHistory?: {
            balanceSheetStatements?: {
              endDate?: { fmt?: string; raw?: number };
              totalAssets?: unknown;
              totalLiab?: unknown;
              totalStockholderEquity?: unknown;
            }[];
          };
        }[];
      };
    };
    if (body.quoteSummary?.error) throw new Error(body.quoteSummary.error.description || 'Yahoo statements failed.');
    const result = body.quoteSummary?.result?.[0];
    const income = result?.incomeStatementHistory?.incomeStatementHistory ?? [];
    const balance = result?.balanceSheetHistory?.balanceSheetStatements ?? [];
    const byPeriod = new Map<string, StatementRow>();
    for (const row of income) {
      const period = periodOf(row);
      if (!period) continue;
      byPeriod.set(period, {
        period,
        revenue: rawNum(row.totalRevenue),
        netIncome: rawNum(row.netIncome),
        assets: null,
        liabilities: null,
        equity: null,
      });
    }
    for (const row of balance) {
      const period = periodOf(row);
      if (!period) continue;
      const current = byPeriod.get(period) ?? {
        period,
        revenue: null,
        netIncome: null,
        assets: null,
        liabilities: null,
        equity: null,
      };
      current.assets = rawNum(row.totalAssets);
      current.liabilities = rawNum(row.totalLiab);
      current.equity = rawNum(row.totalStockholderEquity);
      byPeriod.set(period, current);
    }
    const rows = [...byPeriod.values()].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 4);
    return {
      description: result?.assetProfile?.longBusinessSummary || '',
      rows,
    };
  }

  private async fetchYahoo(url: URL): Promise<Response> {
    const response = await fetch(url, {
      headers: { 'user-agent': UA, cookie: this.cookie, accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) this.crumbAt = 0;
    if (response.status === 429) {
      this.crumbAt = 0;
      throw new Error('Yahoo rate limited. Cached charts stay on screen.');
    }
    if (!response.ok) throw new Error(`Yahoo ${response.status}.`);
    return response;
  }

  private async session() {
    if (this.crumb && Date.now() - this.crumbAt < 30 * 60 * 1000) return;
    const first = await fetch('https://fc.yahoo.com', {
      headers: { 'user-agent': UA },
      redirect: 'manual',
      cache: 'no-store',
    });
    const cookies =
      typeof first.headers.getSetCookie === 'function'
        ? first.headers.getSetCookie()
        : [first.headers.get('set-cookie') || ''];
    this.cookie = cookies
      .map((cookie) => cookie.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');
    const crumbResponse = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'user-agent': UA, cookie: this.cookie, accept: 'text/plain' },
      cache: 'no-store',
    });
    const crumb = (await crumbResponse.text()).trim();
    if (!crumbResponse.ok || !crumb || crumb.startsWith('{') || crumb.includes('<')) {
      throw new Error('Yahoo session could not be opened.');
    }
    this.crumb = crumb;
    this.crumbAt = Date.now();
  }
}
