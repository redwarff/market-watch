'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  changeOf,
  formatAgo,
  formatClock,
  formatCompact,
  formatMoneyCompact,
  formatPct,
  formatPrice,
  formatSignedMoney,
  sessionLabel,
  tone,
} from '@/lib/format';
import type { CandleBar, PriceEvent, TickerDetail } from '@/lib/types';
import { ReportNoteView } from './report-note';
import { useStream } from './use-stream';

const PriceChart = dynamic(() => import('./price-chart').then((mod) => mod.PriceChart), { ssr: false });

const RANGES = ['1d', '5d', '1m', '6m', '1y', '5y'] as const;

const KIND: Record<string, string> = {
  limit: 'Limit',
  daily_move: 'Daily move',
  sudden_move: 'Sudden move',
};

export function TickerView({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<TickerDetail | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState<(typeof RANGES)[number]>('1d');
  const [bars, setBars] = useState<CandleBar[]>([]);
  const [chartNote, setChartNote] = useState('');
  const [notes, setNotes] = useState('');
  const [muted, setMuted] = useState(false);
  const [daily, setDaily] = useState('');
  const [sudden, setSudden] = useState('');
  const [level, setLevel] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function load(replaceForm = true) {
    const next = await api<TickerDetail>(`/api/tickers/${encodeURIComponent(symbol)}`);
    setDetail(next);
    if (replaceForm) {
      setNotes(next.notes);
      setMuted(next.muted);
      setDaily(next.dailyMovePct == null ? '' : String(next.dailyMovePct));
      setSudden(next.suddenMovePct == null ? '' : String(next.suddenMovePct));
    }
  }

  useEffect(() => {
    let stop = false;
    load().catch((err) => {
      if (!stop) setError(err instanceof Error ? err.message : 'Could not load this ticker.');
    });
    const timer = setInterval(() => {
      load(false).catch(() => undefined);
    }, 60_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
    // symbol is the only identity this page should reload for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    let stop = false;
    api<{ bars: CandleBar[] }>(`/api/tickers/${encodeURIComponent(symbol)}/candles?range=${range}`)
      .then((body) => {
        if (stop) return;
        setBars(body.bars);
        setChartNote(body.bars.length === 0 ? 'Chart data appears after the first history refresh.' : '');
      })
      .catch((err) => {
        if (!stop) setChartNote(err instanceof Error ? err.message : 'Chart unavailable.');
      });
    return () => {
      stop = true;
    };
  }, [symbol, range, detail?.updated.intraday]);

  useStream((event) => {
    if (event.type !== 'price' || event.symbol !== symbol) return;
    const price = event as PriceEvent;
    setDetail((current) =>
      current
        ? {
            ...current,
            quote: {
              price: price.price,
              prevClose: price.prevClose ?? current.quote.prevClose,
              open: price.open ?? current.quote.open,
              high: price.high ?? current.quote.high,
              low: price.low ?? current.quote.low,
              volume: price.volume ?? current.quote.volume,
              ts: price.ts,
              extended: price.extended,
            },
          }
        : current,
    );
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/api/tickers/${encodeURIComponent(symbol)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes,
          muted,
          dailyMovePct: daily.trim() === '' ? null : Number(daily),
          suddenMovePct: sudden.trim() === '' ? null : Number(sudden),
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function addAlert(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`/api/tickers/${encodeURIComponent(symbol)}/alerts`, {
        method: 'POST',
        body: JSON.stringify({ direction, price: Number(level) }),
      });
      setLevel('');
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that limit.');
    }
  }

  async function arm(id: string) {
    await api(`/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ armed: true }) });
    await load(false);
  }

  async function removeAlert(id: string) {
    await api(`/api/alerts/${id}`, { method: 'DELETE' });
    await load(false);
  }

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      await api(`/api/tickers/${encodeURIComponent(symbol)}/refresh`, { method: 'POST' });
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await load(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function removeTicker() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await api(`/api/tickers/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    router.push('/');
  }

  if (!detail) {
    return error ? <p className="error">{error}</p> : <p className="muted">Loading {symbol}…</p>;
  }

  const change = changeOf(detail.quote.price, detail.quote.prevClose);
  const balance = {
    assets: detail.financials.some((row) => row.assets != null),
    liabilities: detail.financials.some((row) => row.liabilities != null),
    equity: detail.financials.some((row) => row.equity != null),
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="muted">
            Watch
          </Link>
          <div className="row-between" style={{ alignItems: 'flex-end', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
                {detail.profile.logo ? <img className="logo" src={detail.profile.logo} alt="" /> : null}
                <div>
                  <h1 style={{ margin: 0 }}>
                    <span className="num">{detail.symbol}</span>
                    <span className="muted" style={{ fontWeight: 400, marginLeft: '0.6rem', fontSize: '1rem' }}>
                      {detail.name}
                    </span>
                  </h1>
                  <div className="subhead">
                    <span>{detail.profile.exchange || detail.venue}</span>
                    {detail.profile.industry ? <span>{detail.profile.industry}</span> : null}
                    {detail.quote.ts ? <span>as of {formatClock(detail.quote.ts)}</span> : null}
                    {detail.muted ? <span>Alerts muted</span> : null}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`price-xl num ${tone(change.pct)}`}>{formatPrice(detail.quote.price)}</div>
              <div className={`num ${tone(change.pct)}`}>
                {formatSignedMoney(change.abs)} {formatPct(change.pct)}
              </div>
              {detail.quote.extended ? (
                <div className="ext">
                  {sessionLabel(detail.quote.extended.kind)} {formatPrice(detail.quote.extended.price)}{' '}
                  <span className={tone(detail.quote.extended.pct)}>
                    {formatSignedMoney(detail.quote.extended.change)} {formatPct(detail.quote.extended.pct)}
                  </span>
                  {detail.quote.extended.ts ? <span> · {formatClock(detail.quote.extended.ts)}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel panel-pad">
        <div className="row-between" style={{ marginBottom: '0.6rem' }}>
          <div className="range">
            {RANGES.map((item) => (
              <button
                key={item}
                className="btn"
                type="button"
                aria-pressed={range === item}
                onClick={() => setRange(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
            <button className="btn" type="button" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
        {bars.length > 0 ? <PriceChart bars={bars} range={range} /> : <p className="muted">{chartNote || 'Loading chart…'}</p>}
        {detail.updated.intraday ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Intraday history {formatAgo(detail.updated.intraday)}
          </p>
        ) : null}
      </section>

      <div className="split">
        <div className="stack-gap">
          <section className="panel panel-pad">
            <h2 className="kicker">Company</h2>
            <div className="subhead">
              {detail.profile.country ? <span>{detail.profile.country}</span> : null}
              {detail.profile.ipo ? <span>IPO {detail.profile.ipo}</span> : null}
              {detail.profile.website ? (
                <a href={detail.profile.website} target="_blank" rel="noreferrer">
                  {detail.profile.website.replace(/^https?:\/\//, '')}
                </a>
              ) : null}
            </div>
            {detail.profile.description ? <p className="clamp">{detail.profile.description}</p> : <p className="muted">A longer description shows up with the financial statements.</p>}
          </section>

          <section className="panel panel-pad">
            <h2 className="kicker">Markers</h2>
            {detail.markers.length === 0 ? (
              <p className="muted">Ratios appear after the first company refresh.</p>
            ) : (
              <dl className="markers">
                {detail.markers.map((marker) => (
                  <div key={marker.label}>
                    <dt>{marker.label}</dt>
                    <dd className="num">{marker.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="panel panel-pad table-scroll">
            <h2 className="kicker">Financials</h2>
            {detail.financials.length === 0 ? (
              <p className="muted">Annual statements appear after the Yahoo refresh. The page keeps the last saved copy.</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="right">Revenue</th>
                    <th className="right">Net income</th>
                    {balance.assets ? <th className="right">Assets</th> : null}
                    {balance.liabilities ? <th className="right">Liabilities</th> : null}
                    {balance.equity ? <th className="right">Equity</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {detail.financials.map((row) => (
                    <tr key={row.period}>
                      <td className="num">{row.period}</td>
                      <td className="right num">{formatMoneyCompact(row.revenue)}</td>
                      <td className="right num">{formatMoneyCompact(row.netIncome)}</td>
                      {balance.assets ? <td className="right num">{formatMoneyCompact(row.assets)}</td> : null}
                      {balance.liabilities ? <td className="right num">{formatMoneyCompact(row.liabilities)}</td> : null}
                      {balance.equity ? <td className="right num">{formatMoneyCompact(row.equity)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {detail.updated.statements ? (
              <p className="muted">Statements {formatAgo(detail.updated.statements)}</p>
            ) : null}
          </section>

          <section className="panel panel-pad">
            <h2 className="kicker">Headlines</h2>
            {detail.news.length === 0 ? (
              <p className="muted">No headlines stored yet.</p>
            ) : (
              <div className="news">
                {detail.news.map((item) => (
                  <article key={item.id}>
                    <div className="muted">
                      {item.source} · {formatAgo(item.publishedAt)}
                    </div>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                    {item.summary ? <p className="clamp">{item.summary}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel panel-pad">
            <h2 className="kicker">Reddit</h2>
            {detail.posts.length === 0 ? (
              <p className="muted">No Reddit posts stored yet. Posts are kept for 14 days.</p>
            ) : (
              <div className="news">
                {detail.posts.map((post) => (
                  <article key={post.id}>
                    <div className="muted">
                      u/{post.author} · {formatCompact(post.score)} · {formatAgo(post.createdAt)}
                    </div>
                    <a href={post.url} target="_blank" rel="noreferrer">
                      {post.title}
                    </a>
                    {post.excerpt ? <p className="clamp">{post.excerpt}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="stack-gap">
          <section className="panel panel-pad">
            <h2 className="kicker">Dates</h2>
            {detail.dates.length === 0 ? (
              <p className="muted">Earnings, the ex-dividend date, and the dividend pay date show up after a refresh.</p>
            ) : (
              <div className="date-list">
                {detail.dates.map((date) => (
                  <div key={date.id}>
                    <div className="row-between">
                      <strong>{date.title}</strong>
                      <span className="num">{showDay(date.date)}</span>
                    </div>
                    {date.timing ? <div className="muted">{date.timing}</div> : null}
                    {date.detail ? <div>{date.detail}</div> : null}
                    <div className="date-note">
                      {date.report ? (
                        <ReportNoteView note={date.report} />
                      ) : (
                        <>
                          <p>{date.about}</p>
                          <p>{date.affects}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <form className="panel panel-pad" onSubmit={save}>
            <h2 className="kicker">Ticker</h2>
            <label className="check">
              <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
              Mute alerts
            </label>
            <label className="stack">
              <span className="kicker">Daily move % · global {detail.globals.dailyMovePct}</span>
              <input className="field" inputMode="decimal" value={daily} placeholder="Use global" onChange={(event) => setDaily(event.target.value)} />
            </label>
            <label className="stack" style={{ marginTop: '0.6rem' }}>
              <span className="kicker">Sudden move % · global {detail.globals.suddenMovePct}</span>
              <input className="field" inputMode="decimal" value={sudden} placeholder="Use global" onChange={(event) => setSudden(event.target.value)} />
            </label>
            <p className="muted">
              Sudden window {detail.globals.suddenWindowMinutes} min, quiet period {detail.globals.suddenCooldownMinutes} min.
              Those stay global.
            </p>
            <label className="stack">
              <span className="kicker">Note</span>
              <textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="row-between" style={{ marginTop: '0.8rem' }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-danger" type="button" onClick={() => void removeTicker()}>
                {confirming ? 'Confirm delete' : 'Delete'}
              </button>
            </div>
          </form>

          <section className="panel panel-pad">
            <h2 className="kicker">Price limits</h2>
            <p className="muted">A limit fires the next time price crosses it, then waits until you arm it again.</p>
            <form onSubmit={addAlert} className="form-grid">
              <select className="field" value={direction} onChange={(event) => setDirection(event.target.value as 'above' | 'below')}>
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
              <input className="field" inputMode="decimal" placeholder="Price" value={level} onChange={(event) => setLevel(event.target.value)} required />
              <button className="btn" type="submit">
                Add limit
              </button>
            </form>
            {detail.alerts.map((alert) => (
              <div className="alert-row" key={alert.id}>
                <div>
                  <div className="num">
                    {alert.direction === 'above' ? 'Above' : 'Below'} {formatPrice(alert.price)}
                  </div>
                  <div className="muted">{alert.armed ? 'Armed' : `Fired ${formatAgo(alert.lastTriggeredAt)}`}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {!alert.armed ? (
                    <button className="btn" type="button" onClick={() => void arm(alert.id)}>
                      Arm again
                    </button>
                  ) : null}
                  <button className="btn btn-ghost" type="button" onClick={() => void removeAlert(alert.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="panel panel-pad">
            <h2 className="kicker">Recent alerts</h2>
            {detail.events.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              detail.events.map((event) => (
                <article key={event.id} style={{ padding: '0.55rem 0', borderTop: '1px solid var(--line)' }}>
                  <div className="muted">
                    {KIND[event.kind] || event.kind} · {formatClock(event.triggeredAt)}
                    {event.deliveredAt ? '' : ' · not delivered'}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{event.message}</div>
                </article>
              ))
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function showDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
