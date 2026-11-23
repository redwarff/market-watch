export const SESSION_COOKIE = 'mw_session';

export type Ticker = {
  id: string;
  symbol: string;
  venue: string;
  name: string;
  notes: string;
  muted: boolean;
  dailyMovePct: number | null;
  suddenMovePct: number | null;
  currency: string;
  createdAt: number;
};

export type Quote = {
  price: number;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  ts: number;
};

/** Latest pre-market or after-hours print, separate from the regular-session price. */
export type ExtendedQuote = {
  kind: 'pre' | 'post' | 'night';
  price: number;
  change: number | null;
  pct: number | null;
  ts: number | null;
};

export type Snapshot = {
  tickerId: string;
  price: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  ts: number | null;
  source: string;
  extended: ExtendedQuote | null;
};

export type SearchHit = {
  symbol: string;
  description: string;
  type: string;
};

export type CompanyProfile = {
  name: string;
  industry: string;
  exchange: string;
  website: string;
  ipo: string;
  country: string;
  currency: string;
  logo: string;
  marketCapMillion: number | null;
};

export type StatementRow = {
  period: string;
  revenue: number | null;
  netIncome: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
};

export type CandleBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type NewsDraft = {
  externalId: string;
  source: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: number;
};

export type NewsItem = NewsDraft & { id: string };

export type SocialDraft = {
  network: 'reddit' | 'x';
  externalId: string;
  symbol: string;
  author: string;
  title: string;
  excerpt: string;
  url: string;
  score: number;
  createdAt: number;
};

export type SocialPost = Omit<SocialDraft, 'symbol'> & { id: string };

export type PriceAlert = {
  id: string;
  tickerId: string;
  direction: 'above' | 'below';
  price: number;
  armed: boolean;
  lastTriggeredAt: number | null;
  createdAt: number;
};

export type AlertKind = 'limit' | 'daily_move' | 'sudden_move';

export type AlertEvent = {
  id: string;
  tickerId: string;
  symbol: string;
  kind: AlertKind;
  direction: string;
  message: string;
  price: number;
  triggeredAt: number;
  deliveredAt: number | null;
};

export type Fundamentals = {
  tickerId: string;
  profile: CompanyProfile | null;
  metrics: Record<string, number>;
  statements: StatementRow[];
  description: string;
  profileUpdatedAt: number | null;
  metricsUpdatedAt: number | null;
  statementsUpdatedAt: number | null;
  intradayUpdatedAt: number | null;
  dailyUpdatedAt: number | null;
  newsUpdatedAt: number | null;
};

export type CacheRow = {
  key: string;
  updatedAt: number | null;
  ok: boolean;
  detail: string;
};

export type WatchRow = {
  id: string;
  symbol: string;
  name: string;
  muted: boolean;
  currency: string;
  price: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  ts: number | null;
  extended: ExtendedQuote | null;
  dates: WatchDate[];
  armedAlerts: number;
  firedToday: AlertKind[];
};

export type Marker = { label: string; value: string };

export type TickerDetail = {
  id: string;
  symbol: string;
  venue: string;
  name: string;
  notes: string;
  muted: boolean;
  currency: string;
  dailyMovePct: number | null;
  suddenMovePct: number | null;
  quote: {
    price: number | null;
    prevClose: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    volume: number | null;
    ts: number | null;
    extended: ExtendedQuote | null;
  };
  profile: {
    description: string;
    industry: string;
    exchange: string;
    website: string;
    ipo: string;
    country: string;
    logo: string;
  };
  markers: Marker[];
  financials: StatementRow[];
  news: NewsItem[];
  posts: SocialPost[];
  alerts: PriceAlert[];
  events: AlertEvent[];
  dates: CompanyDateView[];
  updated: {
    profile: number | null;
    statements: number | null;
    intraday: number | null;
    news: number | null;
  };
  globals: {
    dailyMovePct: number;
    suddenMovePct: number;
    suddenWindowMinutes: number;
    suddenCooldownMinutes: number;
  };
};

export type PriceEvent = {
  type: 'price';
  symbol: string;
  price: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  ts: number | null;
  extended: ExtendedQuote | null;
};

export type CompanyDateKind = 'earnings' | 'ex_dividend' | 'dividend';

export type CompanyDate = {
  kind: CompanyDateKind;
  date: string;
  when: '' | 'before_open' | 'after_close';
  estimated: boolean;
  detail: string;
};

export type ReportNote = {
  happened: string;
  means: string;
  influenced: string;
};

export type CompanyDateView = CompanyDate & {
  id: string;
  title: string;
  timing: string;
  days: number;
  about: string;
  affects: string;
  report: ReportNote | null;
};

export type WatchDate = {
  id: string;
  text: string;
  urgent: boolean;
};

export type MacroImpact = 'high' | 'med' | 'low';

export type MacroRelease = {
  id: string;
  name: string;
  importance: MacroImpact;
  scheduledAt: number;
  period: string;
  previous: string | null;
  actual: string | null;
  unit: string;
  url: string;
};

export type MacroEvent = MacroRelease & {
  about: string;
  affects: string;
  report: ReportNote | null;
};

export type AppSettings = {
  dailyMovePct: number;
  suddenMovePct: number;
  suddenWindowMinutes: number;
  suddenCooldownMinutes: number;
  subreddits: string[];
};
