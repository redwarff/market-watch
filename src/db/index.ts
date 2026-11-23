import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AlertEvent,
  AlertKind,
  CacheRow,
  CandleBar,
  CompanyProfile,
  CompanyDate,
  CompanyDateKind,
  ExtendedQuote,
  Fundamentals,
  MacroImpact,
  MacroRelease,
  NewsDraft,
  NewsItem,
  PriceAlert,
  Snapshot,
  SocialDraft,
  SocialPost,
  StatementRow,
  Ticker,
} from '@/lib/types';

type Sql = string | number | null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tickers (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  venue TEXT NOT NULL DEFAULT 'US',
  name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  muted INTEGER NOT NULL DEFAULT 0,
  daily_move_pct REAL,
  sudden_move_pct REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  position INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  ticker_id TEXT PRIMARY KEY REFERENCES tickers(id) ON DELETE CASCADE,
  price REAL,
  prev_close REAL,
  open REAL,
  high REAL,
  low REAL,
  volume REAL,
  ts INTEGER,
  source TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS price_ticks (
  ticker_id TEXT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (ticker_id, ts)
);

CREATE TABLE IF NOT EXISTS candles (
  ticker_id TEXT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  interval TEXT NOT NULL,
  time INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (ticker_id, interval, time)
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY,
  ticker_id TEXT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  price REAL NOT NULL,
  armed INTEGER NOT NULL DEFAULT 1,
  last_triggered_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY,
  ticker_id TEXT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  kind TEXT NOT NULL,
  direction TEXT NOT NULL,
  message TEXT NOT NULL,
  price REAL NOT NULL,
  triggered_at INTEGER NOT NULL,
  delivered_at INTEGER,
  telegram_message_id TEXT
);

CREATE INDEX IF NOT EXISTS alert_events_ticker_time ON alert_events (ticker_id, triggered_at);
CREATE INDEX IF NOT EXISTS alert_events_delivery ON alert_events (delivered_at, triggered_at);

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  ticker_id TEXT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  published_at INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS news_ticker_external ON news_items (ticker_id, external_id);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  ticker_id TEXT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  network TEXT NOT NULL,
  external_id TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS social_ticker_external ON social_posts (ticker_id, external_id);

CREATE TABLE IF NOT EXISTS fundamentals (
  ticker_id TEXT PRIMARY KEY REFERENCES tickers(id) ON DELETE CASCADE,
  profile_json TEXT,
  metrics_json TEXT,
  statements_json TEXT,
  description TEXT NOT NULL DEFAULT '',
  profile_updated_at INTEGER,
  metrics_updated_at INTEGER,
  statements_updated_at INTEGER,
  intraday_updated_at INTEGER,
  daily_updated_at INTEGER,
  news_updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cache_status (
  key TEXT PRIMARY KEY,
  updated_at INTEGER,
  ok INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS macro_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  importance TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL,
  period TEXT NOT NULL DEFAULT '',
  previous TEXT,
  actual TEXT,
  unit TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS company_dates (
  id TEXT PRIMARY KEY,
  ticker_id TEXT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  date TEXT NOT NULL,
  when_label TEXT NOT NULL DEFAULT '',
  estimated INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT ''
);
`;

type TickerRow = {
  id: string;
  symbol: string;
  venue: string;
  name: string;
  notes: string;
  muted: number;
  daily_move_pct: number | null;
  sudden_move_pct: number | null;
  currency: string;
  position: number | null;
  created_at: number;
};

type SnapshotRow = {
  ticker_id: string;
  price: number | null;
  prev_close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  ts: number | null;
  source: string;
  ext_price: number | null;
  ext_change: number | null;
  ext_pct: number | null;
  ext_ts: number | null;
  ext_kind: string | null;
};

const globalDb = globalThis as unknown as { marketDb?: DatabaseSync };

function warnIfRailwayDiskIsEphemeral(file: string) {
  if (!process.env.RAILWAY_ENVIRONMENT) return;
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!mount) {
    console.error('[db] No Railway volume is mounted. The watchlist is wiped on every deploy. Mount a volume at /app/data.');
    return;
  }
  const directory = path.resolve(path.dirname(file));
  const root = path.resolve(mount);
  if (directory !== root && !directory.startsWith(root + path.sep)) {
    console.error(`[db] Database ${file} is outside the Railway volume at ${mount}.`);
  }
}

function openDatabase(): DatabaseSync {
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'market.db');
  warnIfRailwayDiskIsEphemeral(file);
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.prepare('PRAGMA journal_mode = WAL').get();
  db.exec(SCHEMA);
  ensureColumn(db, 'snapshots', 'ext_price', 'REAL');
  ensureColumn(db, 'snapshots', 'ext_change', 'REAL');
  ensureColumn(db, 'snapshots', 'ext_pct', 'REAL');
  ensureColumn(db, 'snapshots', 'ext_ts', 'INTEGER');
  ensureColumn(db, 'snapshots', 'ext_kind', 'TEXT');
  ensureColumn(db, 'tickers', 'position', 'INTEGER');
  backfillPositions(db);
  return db;
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function backfillPositions(db: DatabaseSync) {
  const missing = db
    .prepare('SELECT id FROM tickers WHERE position IS NULL ORDER BY created_at, symbol')
    .all() as { id: string }[];
  if (missing.length === 0) return;
  const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM tickers').get() as { maxPos: number };
  const update = db.prepare('UPDATE tickers SET position = ? WHERE id = ?');
  missing.forEach((row, index) => update.run(max.maxPos + 1 + index, row.id));
}

let positionsReady = false;

function ensurePositions() {
  if (positionsReady) return;
  const db = getDb();
  ensureColumn(db, 'tickers', 'position', 'INTEGER');
  backfillPositions(db);
  positionsReady = true;
}

export function getDb(): DatabaseSync {
  if (!globalDb.marketDb) globalDb.marketDb = openDatabase();
  return globalDb.marketDb;
}

function one<T>(sql: string, ...params: Sql[]): T | null {
  const row = getDb().prepare(sql).get(...params) as T | undefined;
  return row ?? null;
}

function many<T>(sql: string, ...params: Sql[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

function run(sql: string, ...params: Sql[]): { changes: number } {
  return getDb().prepare(sql).run(...params) as { changes: number };
}

function transaction(fn: () => void) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function mapTicker(row: TickerRow): Ticker {
  return {
    id: row.id,
    symbol: row.symbol,
    venue: row.venue,
    name: row.name,
    notes: row.notes,
    muted: row.muted === 1,
    dailyMovePct: row.daily_move_pct,
    suddenMovePct: row.sudden_move_pct,
    currency: row.currency,
    createdAt: row.created_at,
  };
}

function mapSnapshot(row: SnapshotRow): Snapshot {
  return {
    tickerId: row.ticker_id,
    price: row.price,
    prevClose: row.prev_close,
    open: row.open,
    high: row.high,
    low: row.low,
    volume: row.volume,
    ts: row.ts,
    source: row.source,
    extended: mapExtended(row),
  };
}

function mapExtended(row: SnapshotRow): ExtendedQuote | null {
  if ((row.ext_kind !== 'pre' && row.ext_kind !== 'post' && row.ext_kind !== 'night') || row.ext_price == null) return null;
  return {
    kind: row.ext_kind,
    price: row.ext_price,
    change: row.ext_change,
    pct: row.ext_pct,
    ts: row.ext_ts,
  };
}

let macroTableReady = false;

function ensureMacroTable() {
  if (macroTableReady) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS macro_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    importance TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    period TEXT NOT NULL DEFAULT '',
    previous TEXT,
    actual TEXT,
    unit TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT ''
  )`);
  macroTableReady = true;
}

let companyDatesReady = false;

function ensureCompanyDates() {
  if (companyDatesReady) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS company_dates (
    id TEXT PRIMARY KEY,
    ticker_id TEXT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    date TEXT NOT NULL,
    when_label TEXT NOT NULL DEFAULT '',
    estimated INTEGER NOT NULL DEFAULT 0,
    detail TEXT NOT NULL DEFAULT ''
  )`);
  companyDatesReady = true;
}

type CompanyDateRow = {
  id: string;
  ticker_id: string;
  kind: string;
  date: string;
  when_label: string;
  estimated: number;
  detail: string;
};

function mapCompanyDate(row: CompanyDateRow): CompanyDate & { id: string; tickerId: string } {
  return {
    id: row.id,
    tickerId: row.ticker_id,
    kind: asDateKind(row.kind),
    date: row.date,
    when: row.when_label === 'before_open' || row.when_label === 'after_close' ? row.when_label : '',
    estimated: row.estimated === 1,
    detail: row.detail,
  };
}

function asDateKind(value: string): CompanyDateKind {
  if (value === 'earnings' || value === 'ex_dividend' || value === 'dividend') return value;
  return 'earnings';
}

function asImpact(value: string): MacroImpact {
  if (value === 'high' || value === 'med' || value === 'low') return value;
  return 'low';
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const repo = {
  listTickers(): Ticker[] {
    ensurePositions();
    return many<TickerRow>('SELECT * FROM tickers ORDER BY position, symbol').map(mapTicker);
  },

  getTicker(symbol: string): Ticker | null {
    const row = one<TickerRow>('SELECT * FROM tickers WHERE symbol = ?', symbol);
    return row ? mapTicker(row) : null;
  },

  insertTicker(ticker: Ticker) {
    ensurePositions();
    const max = one<{ maxPos: number }>('SELECT COALESCE(MAX(position), -1) AS maxPos FROM tickers');
    run(
      `INSERT INTO tickers
        (id, symbol, venue, name, notes, muted, daily_move_pct, sudden_move_pct, currency, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ticker.id,
      ticker.symbol,
      ticker.venue,
      ticker.name,
      ticker.notes,
      ticker.muted ? 1 : 0,
      ticker.dailyMovePct,
      ticker.suddenMovePct,
      ticker.currency,
      (max?.maxPos ?? -1) + 1,
      ticker.createdAt,
    );
  },

  updateTicker(
    symbol: string,
    patch: Partial<Pick<Ticker, 'name' | 'notes' | 'muted' | 'dailyMovePct' | 'suddenMovePct' | 'currency'>>,
  ): boolean {
    const current = this.getTicker(symbol);
    if (!current) return false;
    const next = { ...current, ...patch };
    const result = run(
      `UPDATE tickers
       SET name = ?, notes = ?, muted = ?, daily_move_pct = ?, sudden_move_pct = ?, currency = ?
       WHERE symbol = ?`,
      next.name,
      next.notes,
      next.muted ? 1 : 0,
      next.dailyMovePct,
      next.suddenMovePct,
      next.currency,
      symbol,
    );
    return result.changes > 0;
  },

  deleteTicker(symbol: string): boolean {
    return run('DELETE FROM tickers WHERE symbol = ?', symbol).changes > 0;
  },

  reorderTickers(symbols: string[]) {
    ensurePositions();
    const existing = this.listTickers().map((ticker) => ticker.symbol);
    const known = new Set(existing);
    const wanted = symbols.filter((symbol) => known.has(symbol));
    const rest = existing.filter((symbol) => !wanted.includes(symbol));
    const order = [...wanted, ...rest];
    transaction(() => {
      order.forEach((symbol, index) => {
        run('UPDATE tickers SET position = ? WHERE symbol = ?', index, symbol);
      });
    });
  },

  upsertSnapshot(snapshot: Snapshot) {
    run(
      `INSERT INTO snapshots (ticker_id, price, prev_close, open, high, low, volume, ts, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker_id) DO UPDATE SET
         price = COALESCE(excluded.price, snapshots.price),
         prev_close = COALESCE(excluded.prev_close, snapshots.prev_close),
         open = COALESCE(excluded.open, snapshots.open),
         high = COALESCE(excluded.high, snapshots.high),
         low = COALESCE(excluded.low, snapshots.low),
         volume = COALESCE(excluded.volume, snapshots.volume),
         ts = COALESCE(excluded.ts, snapshots.ts),
         source = excluded.source`,
      snapshot.tickerId,
      snapshot.price,
      snapshot.prevClose,
      snapshot.open,
      snapshot.high,
      snapshot.low,
      snapshot.volume,
      snapshot.ts,
      snapshot.source,
    );
  },

  setExtended(tickerId: string, extended: ExtendedQuote | null) {
    run(
      `INSERT INTO snapshots (ticker_id, source, ext_price, ext_change, ext_pct, ext_ts, ext_kind)
       VALUES (?, '', ?, ?, ?, ?, ?)
       ON CONFLICT(ticker_id) DO UPDATE SET
         ext_price = excluded.ext_price,
         ext_change = excluded.ext_change,
         ext_pct = excluded.ext_pct,
         ext_ts = excluded.ext_ts,
         ext_kind = excluded.ext_kind`,
      tickerId,
      extended?.price ?? null,
      extended?.change ?? null,
      extended?.pct ?? null,
      extended?.ts ?? null,
      extended?.kind ?? null,
    );
  },

  getSetting(key: string): string | null {
    return one<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
  },

  replaceMacroEvents(events: MacroRelease[]) {
    ensureMacroTable();
    const statement = getDb().prepare(
      `INSERT INTO macro_events (id, name, importance, scheduled_at, period, previous, actual, unit, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    transaction(() => {
      run('DELETE FROM macro_events');
      for (const event of events) {
        statement.run(
          event.id,
          event.name,
          event.importance,
          event.scheduledAt,
          event.period,
          event.previous,
          event.actual,
          event.unit,
          event.url,
        );
      }
    });
  },

  listMacroEvents(): MacroRelease[] {
    ensureMacroTable();
    return many<{
      id: string;
      name: string;
      importance: string;
      scheduled_at: number;
      period: string;
      previous: string | null;
      actual: string | null;
      unit: string;
      url: string;
    }>('SELECT * FROM macro_events ORDER BY scheduled_at, name').map((row) => ({
      id: row.id,
      name: row.name,
      importance: asImpact(row.importance),
      scheduledAt: row.scheduled_at,
      period: row.period,
      previous: row.previous,
      actual: row.actual,
      unit: row.unit,
      url: row.url,
    }));
  },

  replaceCompanyDates(tickerId: string, dates: CompanyDate[]) {
    ensureCompanyDates();
    const statement = getDb().prepare(
      `INSERT INTO company_dates (id, ticker_id, kind, date, when_label, estimated, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    transaction(() => {
      run('DELETE FROM company_dates WHERE ticker_id = ?', tickerId);
      for (const date of dates) {
        statement.run(
          `${tickerId}:${date.kind}:${date.date}`,
          tickerId,
          date.kind,
          date.date,
          date.when,
          date.estimated ? 1 : 0,
          date.detail,
        );
      }
    });
  },

  listCompanyDates(tickerId?: string): (CompanyDate & { id: string; tickerId: string })[] {
    ensureCompanyDates();
    const rows = tickerId
      ? many<CompanyDateRow>('SELECT * FROM company_dates WHERE ticker_id = ? ORDER BY date, kind', tickerId)
      : many<CompanyDateRow>('SELECT * FROM company_dates ORDER BY date, kind');
    return rows.map(mapCompanyDate);
  },

  getSnapshot(tickerId: string): Snapshot | null {
    const row = one<SnapshotRow>('SELECT * FROM snapshots WHERE ticker_id = ?', tickerId);
    return row ? mapSnapshot(row) : null;
  },

  allSnapshots(): Snapshot[] {
    return many<SnapshotRow>('SELECT * FROM snapshots').map(mapSnapshot);
  },

  insertTick(tickerId: string, ts: number, price: number) {
    run('INSERT OR IGNORE INTO price_ticks (ticker_id, ts, price) VALUES (?, ?, ?)', tickerId, ts, price);
  },

  ticksSince(tickerId: string, since: number): { ts: number; price: number }[] {
    return many('SELECT ts, price FROM price_ticks WHERE ticker_id = ? AND ts >= ? ORDER BY ts', tickerId, since);
  },

  pruneTicks(before: number) {
    run('DELETE FROM price_ticks WHERE ts < ?', before);
  },

  replaceCandles(tickerId: string, interval: string, candles: CandleBar[]) {
    transaction(() => {
      run('DELETE FROM candles WHERE ticker_id = ? AND interval = ?', tickerId, interval);
      this.insertCandles(tickerId, interval, candles);
    });
  },

  upsertCandles(tickerId: string, interval: string, candles: CandleBar[]) {
    this.insertCandles(tickerId, interval, candles);
  },

  insertCandles(tickerId: string, interval: string, candles: CandleBar[]) {
    const statement = getDb().prepare(
      `INSERT INTO candles (ticker_id, interval, time, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker_id, interval, time) DO UPDATE SET
         open = excluded.open,
         high = excluded.high,
         low = excluded.low,
         close = excluded.close,
         volume = excluded.volume`,
    );
    for (const candle of candles) {
      statement.run(tickerId, interval, candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume);
    }
  },

  candles(tickerId: string, interval: string, since: number): CandleBar[] {
    return many(
      `SELECT time, open, high, low, close, volume
       FROM candles
       WHERE ticker_id = ? AND interval = ? AND time >= ?
       ORDER BY time`,
      tickerId,
      interval,
      since,
    );
  },

  listAlerts(tickerId: string): PriceAlert[] {
    const rows = many<{
      id: string;
      ticker_id: string;
      direction: 'above' | 'below';
      price: number;
      armed: number;
      last_triggered_at: number | null;
      created_at: number;
    }>('SELECT * FROM price_alerts WHERE ticker_id = ? ORDER BY price', tickerId);
    return rows.map((row) => ({
      id: row.id,
      tickerId: row.ticker_id,
      direction: row.direction,
      price: row.price,
      armed: row.armed === 1,
      lastTriggeredAt: row.last_triggered_at,
      createdAt: row.created_at,
    }));
  },

  createAlert(alert: PriceAlert) {
    run(
      `INSERT INTO price_alerts (id, ticker_id, direction, price, armed, last_triggered_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      alert.id,
      alert.tickerId,
      alert.direction,
      alert.price,
      alert.armed ? 1 : 0,
      alert.lastTriggeredAt,
      alert.createdAt,
    );
  },

  getAlert(id: string): PriceAlert | null {
    const row = one<{
      id: string;
      ticker_id: string;
      direction: 'above' | 'below';
      price: number;
      armed: number;
      last_triggered_at: number | null;
      created_at: number;
    }>('SELECT * FROM price_alerts WHERE id = ?', id);
    if (!row) return null;
    return {
      id: row.id,
      tickerId: row.ticker_id,
      direction: row.direction,
      price: row.price,
      armed: row.armed === 1,
      lastTriggeredAt: row.last_triggered_at,
      createdAt: row.created_at,
    };
  },

  disarmAlert(id: string, ts: number) {
    run('UPDATE price_alerts SET armed = 0, last_triggered_at = ? WHERE id = ?', ts, id);
  },

  armAlert(id: string) {
    run('UPDATE price_alerts SET armed = 1 WHERE id = ?', id);
  },

  deleteAlert(id: string): boolean {
    return run('DELETE FROM price_alerts WHERE id = ?', id).changes > 0;
  },

  armedCounts(): Map<string, number> {
    const rows = many<{ ticker_id: string; n: number }>(
      'SELECT ticker_id, COUNT(*) AS n FROM price_alerts WHERE armed = 1 GROUP BY ticker_id',
    );
    return new Map(rows.map((row) => [row.ticker_id, row.n]));
  },

  insertEvent(event: AlertEvent) {
    run(
      `INSERT INTO alert_events
        (id, ticker_id, symbol, kind, direction, message, price, triggered_at, delivered_at, telegram_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      event.id,
      event.tickerId,
      event.symbol,
      event.kind,
      event.direction,
      event.message,
      event.price,
      event.triggeredAt,
      event.deliveredAt,
    );
  },

  markDelivered(id: string, messageId: string | null, ts: number) {
    run('UPDATE alert_events SET delivered_at = ?, telegram_message_id = ? WHERE id = ?', ts, messageId, id);
  },

  undeliveredEvents(since: number): AlertEvent[] {
    return many<{
      id: string;
      ticker_id: string;
      symbol: string;
      kind: AlertKind;
      direction: string;
      message: string;
      price: number;
      triggered_at: number;
      delivered_at: number | null;
    }>(
      `SELECT id, ticker_id, symbol, kind, direction, message, price, triggered_at, delivered_at
       FROM alert_events
       WHERE delivered_at IS NULL AND triggered_at >= ?
       ORDER BY triggered_at`,
      since,
    ).map(mapEvent);
  },

  recentEvents(tickerId: string, limit: number): AlertEvent[] {
    return many<{
      id: string;
      ticker_id: string;
      symbol: string;
      kind: AlertKind;
      direction: string;
      message: string;
      price: number;
      triggered_at: number;
      delivered_at: number | null;
    }>(
      `SELECT id, ticker_id, symbol, kind, direction, message, price, triggered_at, delivered_at
       FROM alert_events WHERE ticker_id = ? ORDER BY triggered_at DESC LIMIT ?`,
      tickerId,
      limit,
    ).map(mapEvent);
  },

  kindsSince(since: number): Map<string, AlertKind[]> {
    const rows = many<{ ticker_id: string; kind: AlertKind }>(
      'SELECT ticker_id, kind FROM alert_events WHERE triggered_at >= ?',
      since,
    );
    const map = new Map<string, AlertKind[]>();
    for (const row of rows) {
      const list = map.get(row.ticker_id) ?? [];
      if (!list.includes(row.kind)) list.push(row.kind);
      map.set(row.ticker_id, list);
    }
    return map;
  },

  dailyFlags(tickerId: string, since: number): { up: boolean; down: boolean } {
    const rows = many<{ direction: string }>(
      `SELECT direction FROM alert_events
       WHERE ticker_id = ? AND kind = 'daily_move' AND triggered_at >= ?`,
      tickerId,
      since,
    );
    return {
      up: rows.some((row) => row.direction === 'up'),
      down: rows.some((row) => row.direction === 'down'),
    };
  },

  lastEventTime(tickerId: string, kind: AlertKind, direction: string): number | null {
    const row = one<{ triggered_at: number }>(
      `SELECT triggered_at FROM alert_events
       WHERE ticker_id = ? AND kind = ? AND direction = ?
       ORDER BY triggered_at DESC LIMIT 1`,
      tickerId,
      kind,
      direction,
    );
    return row?.triggered_at ?? null;
  },

  upsertNews(tickerId: string, items: NewsDraft[], fetchedAt: number) {
    const statement = getDb().prepare(
      `INSERT INTO news_items
        (id, ticker_id, source, title, url, summary, published_at, external_id, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker_id, external_id) DO UPDATE SET
         source = excluded.source,
         title = excluded.title,
         url = excluded.url,
         summary = excluded.summary,
         published_at = excluded.published_at,
         fetched_at = excluded.fetched_at`,
    );
    for (const item of items) {
      statement.run(
        crypto.randomUUID(),
        tickerId,
        item.source,
        item.title,
        item.url,
        item.summary,
        item.publishedAt,
        item.externalId,
        fetchedAt,
      );
    }
  },

  listNews(tickerId: string, limit: number): NewsItem[] {
    return many<{
      id: string;
      source: string;
      title: string;
      url: string;
      summary: string;
      published_at: number;
      external_id: string;
    }>(
      `SELECT id, source, title, url, summary, published_at, external_id
       FROM news_items WHERE ticker_id = ? ORDER BY published_at DESC LIMIT ?`,
      tickerId,
      limit,
    ).map((row) => ({
      id: row.id,
      externalId: row.external_id,
      source: row.source,
      title: row.title,
      url: row.url,
      summary: row.summary,
      publishedAt: row.published_at,
    }));
  },

  pruneNews(before: number) {
    run('DELETE FROM news_items WHERE published_at < ?', before);
  },

  upsertPosts(tickerId: string, items: SocialDraft[], fetchedAt: number) {
    const statement = getDb().prepare(
      `INSERT INTO social_posts
        (id, ticker_id, network, external_id, author, title, excerpt, url, score, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker_id, external_id) DO UPDATE SET
         author = excluded.author,
         title = excluded.title,
         excerpt = excluded.excerpt,
         url = excluded.url,
         score = excluded.score,
         created_at = excluded.created_at,
         fetched_at = excluded.fetched_at`,
    );
    for (const item of items) {
      statement.run(
        crypto.randomUUID(),
        tickerId,
        item.network,
        item.externalId,
        item.author,
        item.title,
        item.excerpt,
        item.url,
        item.score,
        item.createdAt,
        fetchedAt,
      );
    }
  },

  listPosts(tickerId: string, limit: number): SocialPost[] {
    return many<{
      id: string;
      network: 'reddit' | 'x';
      external_id: string;
      author: string;
      title: string;
      excerpt: string;
      url: string;
      score: number;
      created_at: number;
    }>(
      `SELECT id, network, external_id, author, title, excerpt, url, score, created_at
       FROM social_posts WHERE ticker_id = ? ORDER BY created_at DESC LIMIT ?`,
      tickerId,
      limit,
    ).map((row) => ({
      id: row.id,
      network: row.network,
      externalId: row.external_id,
      author: row.author,
      title: row.title,
      excerpt: row.excerpt,
      url: row.url,
      score: row.score,
      createdAt: row.created_at,
    }));
  },

  prunePosts(before: number) {
    run('DELETE FROM social_posts WHERE created_at < ?', before);
  },

  getFundamentals(tickerId: string): Fundamentals | null {
    const row = one<{
      ticker_id: string;
      profile_json: string | null;
      metrics_json: string | null;
      statements_json: string | null;
      description: string;
      profile_updated_at: number | null;
      metrics_updated_at: number | null;
      statements_updated_at: number | null;
      intraday_updated_at: number | null;
      daily_updated_at: number | null;
      news_updated_at: number | null;
    }>('SELECT * FROM fundamentals WHERE ticker_id = ?', tickerId);
    if (!row) return null;
    return {
      tickerId: row.ticker_id,
      profile: parseJson<CompanyProfile | null>(row.profile_json, null),
      metrics: parseJson<Record<string, number>>(row.metrics_json, {}),
      statements: parseJson<StatementRow[]>(row.statements_json, []),
      description: row.description,
      profileUpdatedAt: row.profile_updated_at,
      metricsUpdatedAt: row.metrics_updated_at,
      statementsUpdatedAt: row.statements_updated_at,
      intradayUpdatedAt: row.intraday_updated_at,
      dailyUpdatedAt: row.daily_updated_at,
      newsUpdatedAt: row.news_updated_at,
    };
  },

  saveFundamentals(tickerId: string, patch: Partial<Omit<Fundamentals, 'tickerId'>>) {
    const current = this.getFundamentals(tickerId);
    const next: Fundamentals = {
      tickerId,
      profile: patch.profile === undefined ? (current?.profile ?? null) : patch.profile,
      metrics: patch.metrics === undefined ? (current?.metrics ?? {}) : patch.metrics,
      statements: patch.statements === undefined ? (current?.statements ?? []) : patch.statements,
      description: patch.description === undefined ? (current?.description ?? '') : patch.description,
      profileUpdatedAt: patch.profileUpdatedAt === undefined ? (current?.profileUpdatedAt ?? null) : patch.profileUpdatedAt,
      metricsUpdatedAt: patch.metricsUpdatedAt === undefined ? (current?.metricsUpdatedAt ?? null) : patch.metricsUpdatedAt,
      statementsUpdatedAt:
        patch.statementsUpdatedAt === undefined ? (current?.statementsUpdatedAt ?? null) : patch.statementsUpdatedAt,
      intradayUpdatedAt:
        patch.intradayUpdatedAt === undefined ? (current?.intradayUpdatedAt ?? null) : patch.intradayUpdatedAt,
      dailyUpdatedAt: patch.dailyUpdatedAt === undefined ? (current?.dailyUpdatedAt ?? null) : patch.dailyUpdatedAt,
      newsUpdatedAt: patch.newsUpdatedAt === undefined ? (current?.newsUpdatedAt ?? null) : patch.newsUpdatedAt,
    };
    run(
      `INSERT INTO fundamentals (
         ticker_id, profile_json, metrics_json, statements_json, description,
         profile_updated_at, metrics_updated_at, statements_updated_at,
         intraday_updated_at, daily_updated_at, news_updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker_id) DO UPDATE SET
         profile_json = excluded.profile_json,
         metrics_json = excluded.metrics_json,
         statements_json = excluded.statements_json,
         description = excluded.description,
         profile_updated_at = excluded.profile_updated_at,
         metrics_updated_at = excluded.metrics_updated_at,
         statements_updated_at = excluded.statements_updated_at,
         intraday_updated_at = excluded.intraday_updated_at,
         daily_updated_at = excluded.daily_updated_at,
         news_updated_at = excluded.news_updated_at`,
      tickerId,
      next.profile ? JSON.stringify(next.profile) : null,
      JSON.stringify(next.metrics),
      JSON.stringify(next.statements),
      next.description,
      next.profileUpdatedAt,
      next.metricsUpdatedAt,
      next.statementsUpdatedAt,
      next.intradayUpdatedAt,
      next.dailyUpdatedAt,
      next.newsUpdatedAt,
    );
  },

  getSettingsMap(): Record<string, string> {
    const rows = many<{ key: string; value: string }>('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  },

  setSettings(values: Record<string, string>) {
    const statement = getDb().prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    transaction(() => {
      for (const [key, value] of Object.entries(values)) statement.run(key, value);
    });
  },

  setCache(key: string, row: { ok: boolean; detail: string; updatedAt: number }) {
    run(
      `INSERT INTO cache_status (key, updated_at, ok, detail) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, ok = excluded.ok, detail = excluded.detail`,
      key,
      row.updatedAt,
      row.ok ? 1 : 0,
      row.detail.slice(0, 400),
    );
  },

  listCaches(): CacheRow[] {
    return many<{ key: string; updated_at: number | null; ok: number; detail: string }>(
      'SELECT key, updated_at, ok, detail FROM cache_status ORDER BY key',
    ).map((row) => ({
      key: row.key,
      updatedAt: row.updated_at,
      ok: row.ok === 1,
      detail: row.detail,
    }));
  },
};

function mapEvent(row: {
  id: string;
  ticker_id: string;
  symbol: string;
  kind: AlertKind;
  direction: string;
  message: string;
  price: number;
  triggered_at: number;
  delivered_at: number | null;
}): AlertEvent {
  return {
    id: row.id,
    tickerId: row.ticker_id,
    symbol: row.symbol,
    kind: row.kind,
    direction: row.direction,
    message: row.message,
    price: row.price,
    triggeredAt: row.triggered_at,
    deliveredAt: row.delivered_at,
  };
}
