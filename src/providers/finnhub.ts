import type { CompanyDate, CompanyProfile, NewsDraft, Quote, SearchHit } from '@/lib/types';
import { earningsFromFinnhub } from '@/server/dates';
import { Pacer } from '@/server/pacer';
import type { CompanySource, QuoteFeed, StateHandler, TradeHandler, TradeStream } from './types';

const pacer = new Pacer(1100);
const US_SUFFIX = /\.[A-Z]{2,}$/;

type QuoteRaw = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

function positive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseQuote(raw: QuoteRaw): Quote | null {
  const price = positive(raw.c);
  const ts = Number(raw.t);
  if (price == null || !Number.isFinite(ts) || ts <= 0) return null;
  return {
    price,
    prevClose: positive(raw.pc),
    open: positive(raw.o),
    high: positive(raw.h),
    low: positive(raw.l),
    ts: ts * 1000,
  };
}

export class FinnhubStream implements TradeStream {
  private ws: WebSocket | null = null;
  private symbols = new Set<string>();
  private stopped = false;
  private retryMs = 1000;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private key: string,
    private onTrade: TradeHandler,
    private onState: StateHandler,
  ) {}

  start(symbols: string[]) {
    for (const symbol of symbols) this.symbols.add(symbol);
    this.connect();
  }

  subscribe(symbol: string) {
    this.symbols.add(symbol);
    this.send({ type: 'subscribe', symbol });
  }

  unsubscribe(symbol: string) {
    this.symbols.delete(symbol);
    this.send({ type: 'unsubscribe', symbol });
  }

  close() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }

  private connect() {
    if (this.stopped) return;
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(this.key)}`);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.retryMs = 1000;
      this.onState('open', 'Connected');
      for (const symbol of this.symbols) this.send({ type: 'subscribe', symbol });
    });
    ws.addEventListener('message', (event) => {
      let message: { type?: string; data?: { s?: string; p?: number; t?: number }[] };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type !== 'trade' || !Array.isArray(message.data)) return;
      for (const trade of message.data) {
        const price = Number(trade.p);
        const ts = Number(trade.t);
        if (!trade.s || !Number.isFinite(price) || price <= 0) continue;
        this.onTrade({
          symbol: trade.s,
          price,
          ts: ts > 1e12 ? ts : ts * 1000,
        });
      }
    });
    ws.addEventListener('close', () => {
      this.onState('closed', 'Reconnecting');
      this.schedule();
    });
    ws.addEventListener('error', () => {
      this.onState('closed', 'Connection error');
    });
  }

  private schedule() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
  }

  private send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }
}

export class FinnhubClient implements QuoteFeed, CompanySource {
  /** Read on each call so a reloaded .env is picked up without rebuilding the client. */
  private get key(): string {
    return (process.env.FINNHUB_API_KEY || '').trim();
  }

  get configured(): boolean {
    return this.key.length > 0;
  }

  quote(symbol: string): Promise<Quote | null> {
    return pacer.run(async () => {
      const raw = await this.get<QuoteRaw>('/quote', { symbol });
      return parseQuote(raw);
    });
  }

  search(query: string): Promise<SearchHit[]> {
    return pacer.run(async () => {
      const raw = await this.get<{ result?: { symbol?: string; description?: string; type?: string }[] }>('/search', {
        q: query,
      });
      const allowed = new Set(['Common Stock', 'ETP', 'ADR', 'REIT', 'Closed-End Fund', '']);
      const hits = (raw.result ?? [])
        .map((item) => ({
          symbol: (item.symbol || '').toUpperCase(),
          description: item.description || '',
          type: item.type || '',
        }))
        .filter((item) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(item.symbol))
        .filter((item) => !US_SUFFIX.test(item.symbol))
        .filter((item) => allowed.has(item.type));
      hits.sort((a, b) => Number(a.symbol.includes('.')) - Number(b.symbol.includes('.')));
      return hits.slice(0, 8);
    });
  }

  stream(onTrade: TradeHandler, onState: StateHandler): TradeStream {
    if (!this.configured) throw new Error('Finnhub API key is not set.');
    return new FinnhubStream(this.key, onTrade, onState);
  }

  profile(symbol: string): Promise<CompanyProfile | null> {
    return pacer.run(async () => {
      const raw = await this.get<{
        name?: string;
        finnhubIndustry?: string;
        exchange?: string;
        weburl?: string;
        ipo?: string;
        country?: string;
        currency?: string;
        logo?: string;
        marketCapitalization?: number;
        ticker?: string;
      }>('/stock/profile2', { symbol });
      if (!raw.name && !raw.ticker) return null;
      return {
        name: raw.name || symbol,
        industry: raw.finnhubIndustry || '',
        exchange: raw.exchange || '',
        website: raw.weburl || '',
        ipo: raw.ipo || '',
        country: raw.country || '',
        currency: raw.currency || 'USD',
        logo: raw.logo || '',
        marketCapMillion: positive(raw.marketCapitalization),
      };
    });
  }

  metrics(symbol: string): Promise<Record<string, number>> {
    return pacer.run(async () => {
      const raw = await this.get<{ metric?: Record<string, unknown> }>('/stock/metric', { symbol, metric: 'all' });
      const metrics: Record<string, number> = {};
      for (const [key, value] of Object.entries(raw.metric ?? {})) {
        const number = Number(value);
        if (Number.isFinite(number)) metrics[key] = number;
      }
      return metrics;
    });
  }

  earnings(symbol: string, from: string, to: string): Promise<CompanyDate[]> {
    return pacer.run(async () => {
      const raw = await this.get<{
        earningsCalendar?: {
          date?: string;
          hour?: string;
          epsEstimate?: number | null;
          epsActual?: number | null;
          revenueEstimate?: number | null;
          revenueActual?: number | null;
        }[];
      }>('/calendar/earnings', { symbol, from, to });
      return earningsFromFinnhub(raw.earningsCalendar ?? []);
    });
  }

  news(symbol: string, from: string, to: string): Promise<NewsDraft[]> {
    return pacer.run(async () => {
      const raw = await this.get<
        { id?: number; source?: string; headline?: string; url?: string; summary?: string; datetime?: number }[]
      >('/company-news', { symbol, from, to });
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item) => item.headline && item.url && item.id != null)
        .slice(0, 40)
        .map((item) => ({
          externalId: `finnhub:${item.id}`,
          source: item.source || 'News',
          title: item.headline || '',
          url: item.url || '',
          summary: item.summary || '',
          publishedAt: Number(item.datetime || 0) * 1000,
        }));
    });
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.configured) throw new Error('Finnhub API key is not set.');
    const url = new URL(`https://finnhub.io/api/v1${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('token', this.key);
    const response = await fetch(url, { cache: 'no-store' });
    if (response.status === 429) throw new Error('Finnhub rate limit.');
    if (!response.ok) throw new Error(`Finnhub ${response.status} on ${path}.`);
    return (await response.json()) as T;
  }
}
