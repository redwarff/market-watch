import type { CandleBar, CompanyProfile, NewsDraft, Quote, SearchHit, SocialDraft, StatementRow } from '@/lib/types';

export interface QuoteFeed {
  readonly configured: boolean;
  quote(symbol: string): Promise<Quote | null>;
  search(query: string): Promise<SearchHit[]>;
  stream(onTrade: TradeHandler, onState: StateHandler): TradeStream;
}

export interface CompanySource {
  profile(symbol: string): Promise<CompanyProfile | null>;
  metrics(symbol: string): Promise<Record<string, number>>;
  news(symbol: string, from: string, to: string): Promise<NewsDraft[]>;
}

export interface HistorySource {
  candles(symbol: string, kind: '5m' | '15m' | '1d'): Promise<{ bars: CandleBar[]; volume: number | null }>;
  statements(symbol: string): Promise<{ description: string; rows: StatementRow[] }>;
}

export interface SocialProvider {
  readonly network: 'reddit' | 'x';
  readonly configured: boolean;
  fetchMentions(symbols: string[], subreddits: string[]): Promise<SocialDraft[]>;
}

export interface Notifier {
  readonly configured: boolean;
  send(text: string): Promise<string | null>;
}

export type TradeHandler = (trade: { symbol: string; price: number; ts: number }) => void;
export type StateHandler = (state: 'open' | 'closed', detail: string) => void;

export interface TradeStream {
  start(symbols: string[]): void;
  subscribe(symbol: string): void;
  unsubscribe(symbol: string): void;
  close(): void;
}
