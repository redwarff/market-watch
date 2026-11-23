import { repo } from '@/db';
import type { CompanyDate, ExtendedQuote, PriceEvent, Ticker } from '@/lib/types';
import { evaluate, type EvalAction } from '@/server/alerts';
import { bus } from '@/server/bus';
import { alertMessage } from '@/server/messages';
import { settingsFromMap } from '@/server/settings';
import { etDayKey, etDayStartMs, isAfterClose, isIntradayWindow, isRegularPrint, isRegularSession } from '@/server/time';
import { sleep } from '@/server/pacer';
import { ensureCalendar } from '@/server/calendar';
import { FinnhubClient } from '@/providers/finnhub';
import { socialProviders } from '@/providers/social';
import { TelegramNotifier } from '@/providers/telegram';
import type { TradeStream } from '@/providers/types';
import { YahooHistory } from '@/providers/yahoo';
import type { AppSettings } from '@/lib/types';

type JobKind = 'full' | 'charts' | 'daily' | 'news' | 'statements' | 'profile' | 'session' | 'dates';

type Live = {
  id: string;
  symbol: string;
  muted: boolean;
  dailyMovePct: number | null;
  suddenMovePct: number | null;
  price: number | null;
  previousPrice: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  ts: number | null;
  extended: ExtendedQuote | null;
  quoteDay: string | null;
  ticks: { ts: number; price: number }[];
  lastMemSample: number;
  lastDbSample: number;
  firedDay: string;
  dailyFiredUp: boolean;
  dailyFiredDown: boolean;
  lastSuddenUp: number | null;
  lastSuddenDown: number | null;
  evalTimer: ReturnType<typeof setTimeout> | null;
  emitTimer: ReturnType<typeof setTimeout> | null;
  snapTimer: ReturnType<typeof setTimeout> | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

class Engine {
  private id = crypto.randomUUID();
  private finnhub = new FinnhubClient();
  private yahoo = new YahooHistory();
  private telegram = new TelegramNotifier();
  private social = socialProviders();
  private stream: TradeStream | null = null;
  private lives = new Map<string, Live>();
  private queue: { symbol: string; kind: JobKind }[] = [];
  private queued = new Set<string>();
  private sending = new Set<string>();
  private stopped = false;
  private settings: AppSettings = settingsFromMap({});
  private lastQuote = 0;
  private lastIntraday = 0;
  private lastNews = 0;
  private lastReddit = 0;
  private lastStatements = 0;
  private lastRetry = 0;
  private lastPrune = 0;
  private lastSession = 0;
  private lastCalendar = 0;
  private lastDateSweep = 0;
  private calendarWait = 0;
  private hadFeed = false;
  private dailyDone = '';
  private last15 = new Map<string, number>();
  private lastDates = new Map<string, number>();
  wsState: 'open' | 'closed' | 'idle' = 'idle';
  wsDetail = 'Starting';

  async start() {
    if (!this.claim()) {
      this.stopped = true;
      return;
    }
    repo.listTickers();
    this.settings = settingsFromMap(repo.getSettingsMap());
    bus.on('ticker:added', (symbol) => this.adopt(symbol));
    bus.on('ticker:updated', (symbol) => this.reload(symbol));
    bus.on('ticker:removed', (symbol) => this.drop(symbol));
    bus.on('ticker:refresh', (symbol) => this.enqueue(symbol, 'full'));
    for (const ticker of repo.listTickers()) {
      this.lives.set(ticker.symbol, this.createLive(ticker));
      this.enqueue(ticker.symbol, 'full');
    }
    if (!this.telegram.configured) {
      repo.setCache('telegram', {
        ok: false,
        detail: 'Bot token or chat id is not set.',
        updatedAt: Date.now(),
      });
    }
    const started = Date.now();
    this.lastIntraday = started;
    this.lastNews = started;
    this.lastStatements = started;
    this.lastSession = started;
    this.lastDateSweep = started;
    this.openStream();
    this.hadFeed = this.finnhub.configured;
    void this.jobLoop();
    void this.scheduleLoop();
    console.log(
      `[worker] watching ${this.lives.size} tickers; finnhub=${this.finnhub.configured}; telegram=${this.telegram.configured}; reddit=${this.social.some((item) => item.configured)}`,
    );
  }

  loadSettings() {
    this.settings = settingsFromMap(repo.getSettingsMap());
  }

  private async scheduleLoop() {
    while (!this.stopped) {
      if (!this.claim()) {
        this.shutdown();
        return;
      }
      try {
        await this.scheduled();
      } catch (error) {
        console.error('[worker]', errorMessage(error));
      }
      await sleep(15_000);
    }
  }

  private async scheduled() {
    this.loadSettings();
    this.syncFeed();
    const now = Date.now();
    if (now - this.lastQuote > 120_000) {
      this.lastQuote = now;
      await this.refreshQuotes();
    }
    if (isIntradayWindow() && now - this.lastIntraday > 10 * 60 * 1000) {
      this.lastIntraday = now;
      for (const symbol of this.lives.keys()) this.enqueue(symbol, 'charts');
    }
    const newsGap = isIntradayWindow() ? 20 * 60 * 1000 : 60 * 60 * 1000;
    if (now - this.lastNews > newsGap) {
      this.lastNews = now;
      for (const symbol of this.lives.keys()) this.enqueue(symbol, 'news');
    }
    if (now - this.lastReddit > 20 * 60 * 1000) {
      this.lastReddit = now;
      await this.refreshReddit();
    }
    if (now - this.lastStatements > 6 * 60 * 60 * 1000) {
      this.lastStatements = now;
      for (const symbol of this.lives.keys()) this.enqueue(symbol, 'statements');
    }
    const day = etDayKey();
    if (isAfterClose() && this.dailyDone !== day) {
      this.dailyDone = day;
      for (const symbol of this.lives.keys()) this.enqueue(symbol, 'daily');
    }
    if (now - this.lastRetry > 60_000) {
      this.lastRetry = now;
      await this.retryTelegram();
    }
    if (now - this.lastPrune > 6 * 60 * 60 * 1000) {
      this.lastPrune = now;
      repo.pruneTicks(now - DAY_MS);
      repo.prunePosts(now - 14 * DAY_MS);
      repo.pruneNews(now - 120 * DAY_MS);
    }
    if (now - this.lastCalendar > this.calendarWait) {
      const ok = await ensureCalendar();
      this.lastCalendar = now;
      this.calendarWait = ok ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000;
    }
    if (now - this.lastDateSweep > 12 * 60 * 60 * 1000) {
      this.lastDateSweep = now;
      for (const symbol of this.lives.keys()) this.enqueue(symbol, 'dates');
    }
    const sessionGap = isRegularSession() ? 15 * 60 * 1000 : 2 * 60 * 1000;
    if (now - this.lastSession > sessionGap) {
      this.lastSession = now;
      for (const symbol of this.lives.keys()) this.enqueue(symbol, 'session');
    }
  }

  private async jobLoop() {
    while (!this.stopped) {
      const job = this.queue.shift();
      if (!job) {
        await sleep(400);
        continue;
      }
      this.queued.delete(`${job.symbol}:${job.kind}`);
      try {
        await this.runJob(job.symbol, job.kind);
      } catch (error) {
        console.error(`[worker] ${job.symbol} ${job.kind}:`, errorMessage(error));
      }
    }
  }

  private enqueue(symbol: string, kind: JobKind) {
    const key = `${symbol}:${kind}`;
    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.queue.push({ symbol, kind });
  }

  private async runJob(symbol: string, kind: JobKind) {
    const ticker = repo.getTicker(symbol);
    if (!ticker) return;
    if (kind === 'full' || kind === 'dates') await this.jobDates(ticker, kind === 'full');
    if (kind === 'full' || kind === 'session') await this.jobSession(ticker);
    if (kind === 'full' || kind === 'profile') await this.jobProfile(ticker);
    if (kind === 'full' || kind === 'news') await this.jobNews(ticker);
    if (kind === 'full' || kind === 'charts') await this.jobCharts(ticker);
    if (kind === 'daily') await this.jobDaily(ticker, true);
    if (kind === 'full') await this.jobDaily(ticker, false);
    if (kind === 'full' || kind === 'statements') await this.jobStatements(ticker);
  }

  private async jobDates(ticker: Ticker, force: boolean) {
    const last = this.lastDates.get(ticker.symbol) ?? 0;
    if (!force && Date.now() - last < 12 * 60 * 60 * 1000) return;
    const previous = repo.listCompanyDates(ticker.id);
    let earnings: CompanyDate[] | null = null;
    let dividends: CompanyDate[] | null = null;
    if (this.finnhub.configured) {
      try {
        const from = isoDay(new Date(Date.now() - 100 * DAY_MS));
        const to = isoDay(new Date(Date.now() + 280 * DAY_MS));
        earnings = await this.finnhub.earnings(ticker.symbol, from, to);
      } catch (error) {
        console.error(`[finnhub] ${ticker.symbol} earnings:`, errorMessage(error));
      }
    }
    try {
      dividends = await this.yahoo.companyDates(ticker.symbol);
    } catch (error) {
      repo.setCache('company.dates', { ok: false, detail: errorMessage(error), updatedAt: Date.now() });
    }
    if (earnings == null && dividends == null) return;
    repo.replaceCompanyDates(ticker.id, [
      ...(earnings ?? previous.filter((date) => date.kind === 'earnings')),
      ...(dividends ?? previous.filter((date) => date.kind !== 'earnings')),
    ]);
    this.lastDates.set(ticker.symbol, Date.now());
    repo.setCache('company.dates', { ok: true, detail: `Updated ${ticker.symbol}`, updatedAt: Date.now() });
  }

  private async jobSession(ticker: Ticker) {
    try {
      const extended = await this.yahoo.extendedQuote(ticker.symbol);
      repo.setExtended(ticker.id, extended);
      const live = this.lives.get(ticker.symbol);
      if (live) {
        live.extended = extended;
        this.scheduleEmit(live);
      }
      repo.setCache('yahoo.session', {
        ok: true,
        detail: extended ? `${ticker.symbol} ${extended.kind}` : `${ticker.symbol} no extended print`,
        updatedAt: Date.now(),
      });
    } catch (error) {
      repo.setCache('yahoo.session', { ok: false, detail: errorMessage(error), updatedAt: Date.now() });
    }
  }

  private async jobProfile(ticker: Ticker) {
    if (!this.finnhub.configured) return;
    try {
      const profile = await this.finnhub.profile(ticker.symbol);
      const metrics = await this.finnhub.metrics(ticker.symbol);
      const now = Date.now();
      repo.saveFundamentals(ticker.id, {
        profile,
        metrics,
        profileUpdatedAt: now,
        metricsUpdatedAt: now,
      });
      if (profile?.name) {
        repo.updateTicker(ticker.symbol, {
          name: profile.name,
          currency: profile.currency || 'USD',
        });
        this.reload(ticker.symbol);
      }
    } catch (error) {
      console.error(`[finnhub] ${ticker.symbol} profile:`, errorMessage(error));
    }
  }

  private async jobNews(ticker: Ticker) {
    if (!this.finnhub.configured) {
      repo.setCache('news', { ok: false, detail: 'Finnhub API key is not set.', updatedAt: Date.now() });
      return;
    }
    try {
      const to = new Date();
      const from = new Date(Date.now() - 14 * DAY_MS);
      const items = await this.finnhub.news(ticker.symbol, isoDay(from), isoDay(to));
      const now = Date.now();
      repo.upsertNews(ticker.id, items, now);
      repo.saveFundamentals(ticker.id, { newsUpdatedAt: now });
      repo.setCache('news', { ok: true, detail: `${ticker.symbol}: ${items.length} headlines`, updatedAt: now });
    } catch (error) {
      repo.setCache('news', { ok: false, detail: errorMessage(error), updatedAt: Date.now() });
    }
  }

  private async jobCharts(ticker: Ticker) {
    try {
      const five = await this.yahoo.candles(ticker.symbol, '5m');
      if (five.bars.length > 0) repo.replaceCandles(ticker.id, '5m', five.bars);
      if (five.volume != null) this.noteVolume(ticker.symbol, five.volume);
      const last15 = this.last15.get(ticker.symbol) ?? 0;
      if (Date.now() - last15 > 30 * 60 * 1000) {
        const fifteen = await this.yahoo.candles(ticker.symbol, '15m');
        if (fifteen.bars.length > 0) repo.replaceCandles(ticker.id, '15m', fifteen.bars);
        this.last15.set(ticker.symbol, Date.now());
      }
      const now = Date.now();
      repo.saveFundamentals(ticker.id, { intradayUpdatedAt: now });
      repo.setCache('yahoo.charts', { ok: true, detail: `Updated ${ticker.symbol}`, updatedAt: now });
    } catch (error) {
      repo.setCache('yahoo.charts', { ok: false, detail: errorMessage(error), updatedAt: Date.now() });
    }
  }

  private async jobDaily(ticker: Ticker, force: boolean) {
    const current = repo.getFundamentals(ticker.id);
    if (!force && current?.dailyUpdatedAt && Date.now() - current.dailyUpdatedAt < 18 * 60 * 60 * 1000) return;
    try {
      const daily = await this.yahoo.candles(ticker.symbol, '1d');
      if (daily.bars.length > 0) repo.upsertCandles(ticker.id, '1d', daily.bars);
      if (daily.volume != null) this.noteVolume(ticker.symbol, daily.volume);
      const now = Date.now();
      repo.saveFundamentals(ticker.id, { dailyUpdatedAt: now });
      repo.setCache('yahoo.charts', { ok: true, detail: `Daily history ${ticker.symbol}`, updatedAt: now });
    } catch (error) {
      repo.setCache('yahoo.charts', { ok: false, detail: errorMessage(error), updatedAt: Date.now() });
    }
  }

  private async jobStatements(ticker: Ticker) {
    const current = repo.getFundamentals(ticker.id);
    if (current?.statementsUpdatedAt && Date.now() - current.statementsUpdatedAt < 7 * DAY_MS) return;
    try {
      const summary = await this.yahoo.statements(ticker.symbol);
      const now = Date.now();
      repo.saveFundamentals(ticker.id, {
        description: summary.description || current?.description || '',
        statements: summary.rows,
        statementsUpdatedAt: now,
      });
      repo.setCache('yahoo.statements', { ok: true, detail: `Updated ${ticker.symbol}`, updatedAt: now });
    } catch (error) {
      repo.setCache('yahoo.statements', { ok: false, detail: errorMessage(error), updatedAt: Date.now() });
    }
  }

  private async refreshQuotes() {
    if (!this.finnhub.configured) {
      repo.setCache('finnhub.quotes', { ok: false, detail: 'Finnhub API key is not set.', updatedAt: Date.now() });
      return;
    }
    let ok = 0;
    let failed = 0;
    for (const symbol of this.lives.keys()) {
      try {
        const quote = await this.finnhub.quote(symbol);
        if (!quote) continue;
        this.applyQuote(symbol, quote);
        ok += 1;
      } catch (error) {
        failed += 1;
        console.error(`[finnhub] ${symbol}:`, errorMessage(error));
      }
    }
    repo.setCache('finnhub.quotes', {
      ok: failed === 0,
      detail: failed ? `${ok} updated, ${failed} failed` : `${ok} quotes`,
      updatedAt: Date.now(),
    });
  }

  private async refreshReddit() {
    const reddit = this.social.find((provider) => provider.network === 'reddit');
    if (!reddit?.configured) {
      repo.setCache('reddit', { ok: false, detail: 'Reddit credentials are not set.', updatedAt: Date.now() });
      return;
    }
    try {
      const posts = await reddit.fetchMentions([...this.lives.keys()], this.settings.subreddits);
      const grouped = new Map<string, typeof posts>();
      for (const post of posts) {
        const list = grouped.get(post.symbol) ?? [];
        list.push(post);
        grouped.set(post.symbol, list);
      }
      const now = Date.now();
      for (const [symbol, items] of grouped) {
        const ticker = repo.getTicker(symbol);
        if (ticker) repo.upsertPosts(ticker.id, items, now);
      }
      repo.setCache('reddit', { ok: true, detail: `${posts.length} posts`, updatedAt: now });
    } catch (error) {
      repo.setCache('reddit', { ok: false, detail: errorMessage(error), updatedAt: Date.now() });
    }
  }

  private openStream() {
    if (this.stream) return;
    if (!this.finnhub.configured) {
      this.wsState = 'idle';
      this.wsDetail = 'Finnhub API key is not set.';
      repo.setCache('finnhub.ws', { ok: false, detail: this.wsDetail, updatedAt: Date.now() });
      bus.emit('status', { ws: 'idle', detail: this.wsDetail });
      return;
    }
    this.stream = this.finnhub.stream(
      (trade) => this.onTrade(trade),
      (state, detail) => {
        this.wsState = state;
        this.wsDetail = detail;
        repo.setCache('finnhub.ws', { ok: state === 'open', detail, updatedAt: Date.now() });
        bus.emit('status', { ws: state, detail });
      },
    );
    this.stream.start([...this.lives.keys()]);
  }

  private onTrade(trade: { symbol: string; price: number; ts: number }) {
    const live = this.lives.get(trade.symbol);
    if (!live || trade.price <= 0 || !isRegularPrint(trade.ts)) return;
    const day = etDayKey(new Date(trade.ts));
    if (live.quoteDay !== day) {
      live.quoteDay = null;
      live.open = trade.price;
      live.high = trade.price;
      live.low = trade.price;
    } else {
      live.high = live.high == null ? trade.price : Math.max(live.high, trade.price);
      live.low = live.low == null ? trade.price : Math.min(live.low, trade.price);
    }
    live.price = trade.price;
    live.ts = trade.ts;
    this.sample(live, trade.ts, trade.price);
    this.scheduleEval(live);
    this.scheduleEmit(live);
    this.schedulePersist(live);
  }

  private applyQuote(
    symbol: string,
    quote: { price: number; prevClose: number | null; open: number | null; high: number | null; low: number | null; ts: number },
  ) {
    const live = this.lives.get(symbol);
    if (!live || !isRegularPrint(quote.ts)) return;
    const quoteDay = etDayKey(new Date(quote.ts));
    const sameSession = live.ts != null && isRegularPrint(live.ts) && etDayKey(new Date(live.ts)) === quoteDay;
    live.quoteDay = quoteDay;
    live.prevClose = quote.prevClose ?? live.prevClose;
    if (!sameSession) {
      live.open = quote.open;
      live.high = quote.high;
      live.low = quote.low;
      live.price = quote.price;
      live.ts = quote.ts;
    } else {
      live.open = quote.open ?? live.open;
      if (quote.high != null) live.high = live.high == null ? quote.high : Math.max(live.high, quote.high);
      if (quote.low != null) live.low = live.low == null ? quote.low : Math.min(live.low, quote.low);
      if (live.ts == null || live.ts <= quote.ts) {
        live.price = quote.price;
        live.ts = quote.ts;
      }
    }
    if (live.price != null && live.ts != null) this.sample(live, live.ts, live.price);
    this.evaluateNow(live);
    this.scheduleEmit(live);
    this.persist(live);
  }

  private scheduleEval(live: Live) {
    if (live.evalTimer) return;
    live.evalTimer = setTimeout(() => {
      live.evalTimer = null;
      if (this.lives.has(live.symbol)) this.evaluateNow(live);
    }, 1000);
  }

  private evaluateNow(live: Live) {
    if (live.price == null) return;
    const day = etDayKey();
    if (live.firedDay !== day) {
      live.firedDay = day;
      const flags = repo.dailyFlags(live.id, etDayStartMs());
      live.dailyFiredUp = flags.up;
      live.dailyFiredDown = flags.down;
    }
    const actions = evaluate({
      price: live.price,
      previousPrice: live.previousPrice,
      prevClose: live.prevClose,
      now: Date.now(),
      muted: live.muted,
      sessionOpen: isRegularSession() && live.ts != null && isRegularPrint(live.ts),
      dailyReady: live.quoteDay === day,
      dailyThreshold: live.dailyMovePct ?? this.settings.dailyMovePct,
      suddenThreshold: live.suddenMovePct ?? this.settings.suddenMovePct,
      windowMs: this.settings.suddenWindowMinutes * 60 * 1000,
      cooldownMs: this.settings.suddenCooldownMinutes * 60 * 1000,
      ticks: live.ticks.filter((tick) => isRegularPrint(tick.ts)),
      alerts: repo.listAlerts(live.id).map((alert) => ({
        id: alert.id,
        direction: alert.direction,
        price: alert.price,
        armed: alert.armed,
      })),
      dailyFiredUp: live.dailyFiredUp,
      dailyFiredDown: live.dailyFiredDown,
      lastSuddenUp: live.lastSuddenUp,
      lastSuddenDown: live.lastSuddenDown,
    });
    live.previousPrice = live.price;
    for (const action of actions) this.fire(live, action);
  }

  private fire(live: Live, action: EvalAction) {
    const now = Date.now();
    if (action.type === 'limit') repo.disarmAlert(action.alertId, now);
    if (action.type === 'daily_move' && action.direction === 'up') live.dailyFiredUp = true;
    if (action.type === 'daily_move' && action.direction === 'down') live.dailyFiredDown = true;
    if (action.type === 'sudden_move' && action.direction === 'up') live.lastSuddenUp = now;
    if (action.type === 'sudden_move' && action.direction === 'down') live.lastSuddenDown = now;
    const message = alertMessage({
      symbol: live.symbol,
      action,
      prevClose: live.prevClose,
      windowMinutes: this.settings.suddenWindowMinutes,
    });
    const id = crypto.randomUUID();
    repo.insertEvent({
      id,
      tickerId: live.id,
      symbol: live.symbol,
      kind: action.type,
      direction: action.direction,
      message,
      price: action.price,
      triggeredAt: now,
      deliveredAt: null,
    });
    bus.emit('alert', { symbol: live.symbol, message, kind: action.type });
    console.log(`[alert] ${live.symbol} ${action.type}`);
    void this.deliver(id, message);
  }

  private async deliver(id: string, message: string) {
    if (!this.telegram.configured || this.sending.has(id)) return;
    this.sending.add(id);
    try {
      const messageId = await this.telegram.send(message);
      repo.markDelivered(id, messageId, Date.now());
      repo.setCache('telegram', { ok: true, detail: 'Last message sent.', updatedAt: Date.now() });
    } catch (error) {
      repo.setCache('telegram', { ok: false, detail: errorMessage(error), updatedAt: Date.now() });
      console.error('[telegram]', errorMessage(error));
    } finally {
      this.sending.delete(id);
    }
  }

  private async retryTelegram() {
    if (!this.telegram.configured) return;
    const pending = repo.undeliveredEvents(Date.now() - DAY_MS);
    for (const event of pending) await this.deliver(event.id, event.message);
  }

  private sample(live: Live, ts: number, price: number) {
    if (!isRegularPrint(ts)) return;
    if (ts - live.lastMemSample >= 5000) {
      live.ticks.push({ ts, price });
      live.lastMemSample = ts;
      const cutoff = ts - 2 * 60 * 60 * 1000;
      while (live.ticks.length > 0 && live.ticks[0].ts < cutoff) live.ticks.shift();
    }
    if (ts - live.lastDbSample >= 30_000) {
      repo.insertTick(live.id, ts, price);
      live.lastDbSample = ts;
    }
  }

  private scheduleEmit(live: Live) {
    if (live.emitTimer) return;
    live.emitTimer = setTimeout(() => {
      live.emitTimer = null;
      if (this.lives.has(live.symbol)) bus.emit('price', this.priceEvent(live));
    }, 300);
  }

  private schedulePersist(live: Live) {
    if (live.snapTimer) return;
    live.snapTimer = setTimeout(() => {
      live.snapTimer = null;
      if (this.lives.has(live.symbol)) this.persist(live);
    }, 2000);
  }

  private persist(live: Live) {
    if (!this.lives.has(live.symbol)) return;
    repo.upsertSnapshot({
      tickerId: live.id,
      price: live.price,
      prevClose: live.prevClose,
      open: live.open,
      high: live.high,
      low: live.low,
      volume: live.volume,
      ts: live.ts,
      source: 'live',
      extended: live.extended,
    });
  }

  private noteVolume(symbol: string, volume: number) {
    const live = this.lives.get(symbol);
    if (!live) return;
    live.volume = volume;
    this.persist(live);
  }

  private priceEvent(live: Live): PriceEvent {
    return {
      type: 'price',
      symbol: live.symbol,
      price: live.price,
      prevClose: live.prevClose,
      open: live.open,
      high: live.high,
      low: live.low,
      volume: live.volume,
      ts: live.ts,
      extended: live.extended,
    };
  }

  private createLive(ticker: Ticker): Live {
    const snapshot = repo.getSnapshot(ticker.id);
    const now = Date.now();
    const today = etDayKey();
    const flags = repo.dailyFlags(ticker.id, etDayStartMs());
    const quoteDay =
      snapshot?.ts && snapshot.prevClose != null && isRegularPrint(snapshot.ts) && etDayKey(new Date(snapshot.ts)) === today
        ? today
        : null;
    return {
      id: ticker.id,
      symbol: ticker.symbol,
      muted: ticker.muted,
      dailyMovePct: ticker.dailyMovePct,
      suddenMovePct: ticker.suddenMovePct,
      price: snapshot?.price ?? null,
      previousPrice: snapshot?.price ?? null,
      prevClose: snapshot?.prevClose ?? null,
      open: snapshot?.open ?? null,
      high: snapshot?.high ?? null,
      low: snapshot?.low ?? null,
      volume: snapshot?.volume ?? null,
      ts: snapshot?.ts ?? null,
      extended: snapshot?.extended ?? null,
      quoteDay,
      ticks: repo.ticksSince(ticker.id, now - 2 * 60 * 60 * 1000).filter((tick) => isRegularPrint(tick.ts)),
      lastMemSample: 0,
      lastDbSample: 0,
      firedDay: today,
      dailyFiredUp: flags.up,
      dailyFiredDown: flags.down,
      lastSuddenUp: repo.lastEventTime(ticker.id, 'sudden_move', 'up'),
      lastSuddenDown: repo.lastEventTime(ticker.id, 'sudden_move', 'down'),
      evalTimer: null,
      emitTimer: null,
      snapTimer: null,
    };
  }

  private adopt(symbol: string) {
    const ticker = repo.getTicker(symbol);
    if (!ticker) return;
    if (this.lives.has(symbol)) {
      this.reload(symbol);
      return;
    }
    this.lives.set(symbol, this.createLive(ticker));
    this.stream?.subscribe(symbol);
    this.enqueue(symbol, 'full');
  }

  private reload(symbol: string) {
    const ticker = repo.getTicker(symbol);
    const live = this.lives.get(symbol);
    if (!ticker || !live) return;
    live.muted = ticker.muted;
    live.dailyMovePct = ticker.dailyMovePct;
    live.suddenMovePct = ticker.suddenMovePct;
  }

  /** One engine owns the loops. A second copy, after an env reload, steps aside. */
  private claim(): boolean {
    const now = Date.now();
    const owner = repo.getSetting('workerId');
    const seen = Number(repo.getSetting('workerSeen') || 0);
    const pid = Number(repo.getSetting('workerPid') || 0);
    const otherProcess = pid > 0 && pid !== process.pid && pidAlive(pid);
    if (owner && owner !== this.id && now - seen < 45_000 && otherProcess) return false;
    repo.setSettings({ workerId: this.id, workerSeen: String(now), workerPid: String(process.pid) });
    return true;
  }

  private shutdown() {
    this.stopped = true;
    this.stream?.close();
    this.stream = null;
  }

  /** Open the live feed once the API key is available, including after .env reloads. */
  private syncFeed() {
    if (!this.finnhub.configured) {
      if (this.stream) {
        this.stream.close();
        this.stream = null;
      }
      if (this.wsDetail !== 'Finnhub API key is not set.') {
        this.wsState = 'idle';
        this.wsDetail = 'Finnhub API key is not set.';
        repo.setCache('finnhub.ws', { ok: false, detail: this.wsDetail, updatedAt: Date.now() });
        bus.emit('status', { ws: 'idle', detail: this.wsDetail });
      }
      this.hadFeed = false;
      return;
    }
    if (!this.stream) {
      this.openStream();
      if (!this.hadFeed) {
        for (const symbol of this.lives.keys()) this.enqueue(symbol, 'full');
      }
    }
    this.hadFeed = true;
  }

  private drop(symbol: string) {
    const live = this.lives.get(symbol);
    if (!live) return;
    if (live.evalTimer) clearTimeout(live.evalTimer);
    if (live.emitTimer) clearTimeout(live.emitTimer);
    if (live.snapTimer) clearTimeout(live.snapTimer);
    this.lives.delete(symbol);
    this.stream?.unsubscribe(symbol);
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

let current: Engine | null = null;

const globalEngine = globalThis as unknown as { marketEngine?: Engine };

export function startWorker() {
  if (globalEngine.marketEngine) {
    current = globalEngine.marketEngine;
    return;
  }
  const engine = new Engine();
  current = engine;
  globalEngine.marketEngine = engine;
  void engine.start().catch((error) => {
    console.error('[worker] failed to start', errorMessage(error));
  });
}

export function getWorkerStatus(): { ws: 'open' | 'closed' | 'idle'; detail: string } {
  const engine = globalEngine.marketEngine ?? current;
  return {
    ws: engine?.wsState ?? 'idle',
    detail: engine?.wsDetail ?? 'Starting',
  };
}

export function notifySettings() {
  (globalEngine.marketEngine ?? current)?.loadSettings();
}
