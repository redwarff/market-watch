'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { FUTURES } from '@/lib/futures';
import { changeOf, formatAgo, formatCompact, formatPct, formatPrice, formatSignedMoney, sessionLabel, tone } from '@/lib/format';
import type { AlertKind, WatchRow } from '@/lib/types';
import { useStream, type StreamEvent } from './use-stream';

type Status = {
  finnhub: boolean;
  telegram: boolean;
  ws: string;
  wsDetail: string;
};

const KIND_LABEL: Record<AlertKind, string> = {
  limit: 'Limit',
  daily_move: 'Daily',
  sudden_move: 'Sudden',
};

export function WatchBoard() {
  const router = useRouter();
  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [dragSymbol, setDragSymbol] = useState<string | null>(null);
  const [overSymbol, setOverSymbol] = useState<string | null>(null);
  const dragSymbolRef = useRef<string | null>(null);

  async function load() {
    const [watch, nextStatus] = await Promise.all([
      api<{ rows: WatchRow[] }>('/api/watch'),
      api<Status>('/api/status'),
    ]);
    setRows(watch.rows);
    setStatus(nextStatus);
  }

  useEffect(() => {
    let stop = false;
    load().catch((err) => {
      if (!stop) setError(err instanceof Error ? err.message : 'Could not load the watch.');
    });
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 20_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  useStream((event: StreamEvent) => {
    if (event.type === 'price') {
      setRows((current) =>
        current?.map((row) => {
          if (row.symbol !== event.symbol) return row;
          return {
            ...row,
            price: event.price,
            prevClose: event.prevClose ?? row.prevClose,
            open: event.open ?? row.open,
            high: event.high ?? row.high,
            low: event.low ?? row.low,
            volume: event.volume ?? row.volume,
            ts: event.ts,
            extended: event.extended,
          };
        }) ?? current,
      );
    }
    if (event.type === 'hello' || event.type === 'status') {
      setStatus((current) =>
        current ? { ...current, ws: event.ws, wsDetail: event.detail } : current,
      );
    }
    if (event.type === 'alert') {
      const id = Date.now();
      setToasts((current) => [...current, { id, text: event.message }]);
      setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 8000);
      load().catch(() => undefined);
    }
  });

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter((row) => `${row.symbol} ${row.name}`.toLowerCase().includes(needle));
  }, [rows, query]);

  function move(symbol: string, direction: -1 | 1) {
    if (!rows) return;
    const index = rows.findIndex((row) => row.symbol === symbol);
    const target = rows[index + direction];
    if (!target) return;
    reorder(symbol, target.symbol);
  }

  function reorder(from: string, to: string) {
    if (!rows || from === to) return;
    const next = [...rows];
    const fromIndex = next.findIndex((row) => row.symbol === from);
    const toIndex = next.findIndex((row) => row.symbol === to);
    if (fromIndex < 0 || toIndex < 0) return;
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    setRows(next);
    api('/api/tickers/order', {
      method: 'PUT',
      body: JSON.stringify({ symbols: next.map((row) => row.symbol) }),
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not save the order.');
      load().catch(() => undefined);
    });
  }

  const live = status?.ws === 'open';
  const feedLabel = live
    ? 'Live'
    : status?.finnhub && status.wsDetail === 'Finnhub API key is not set.'
      ? 'Connecting'
      : status?.wsDetail || 'Connecting';

  return (
    <>
      <div className="page-head">
        <div>
          <div style={{ marginBottom: '0.25rem' }}>
            <span className={live ? 'pill live' : status?.finnhub === false ? 'pill bad' : 'pill'}>
              <i />
              {feedLabel}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Watch</h1>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
          Add ticker
        </button>
      </div>

      {status && !status.finnhub ? (
        <div className="banner">Live prices need a Finnhub key. Add FINNHUB_API_KEY and restart the server.</div>
      ) : null}
      {status && !status.telegram ? (
        <div className="banner">Telegram is not configured, so alerts stay in the app until a bot token and chat id are set.</div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="row-between" style={{ marginBottom: '0.7rem' }}>
        <input
          className="field"
          style={{ maxWidth: '16rem' }}
          placeholder="Filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter tickers"
        />
        <span className="muted">{shown.length} symbols</span>
      </div>

      {rows && rows.length === 0 ? (
        <div className="panel empty">
          <h2>No favorites yet</h2>
          <p>Add a US ticker to start the watch. Prices, news, and alerts show up here.</p>
          <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
            Add ticker
          </button>
        </div>
      ) : (
        <>
        <div className="panel table-scroll watch-table">
          <table className="data">
            <thead>
              <tr>
                <th className="grip-col" />
                <th>Symbol</th>
                <th>Name</th>
                <th className="right">Last</th>
                <th className="right">Today</th>
                <th>Day range</th>
                <th className="right">Volume</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const change = changeOf(row.price, row.prevClose);
                return (
                  <tr
                    key={row.id}
                    className={`clickable ${row.muted ? 'dim' : ''} ${overSymbol === row.symbol && dragSymbol ? 'drop-target' : ''}`}
                    onClick={() => router.push(`/ticker/${encodeURIComponent(row.symbol)}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') router.push(`/ticker/${encodeURIComponent(row.symbol)}`);
                    }}
                    onDragOver={(event) => {
                      const from = dragSymbolRef.current;
                      if (!from || from === row.symbol) return;
                      event.preventDefault();
                      if (overSymbol !== row.symbol) setOverSymbol(row.symbol);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = event.dataTransfer.getData('text/plain') || dragSymbolRef.current;
                      if (from) reorder(from, row.symbol);
                      dragSymbolRef.current = null;
                      setDragSymbol(null);
                      setOverSymbol(null);
                    }}
                    tabIndex={0}
                  >
                    <td className="grip-col">
                      <button
                        className="grip"
                        type="button"
                        draggable
                        aria-label={`Drag to reorder ${row.symbol}`}
                        onClick={(event) => event.stopPropagation()}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', row.symbol);
                          event.dataTransfer.effectAllowed = 'move';
                          dragSymbolRef.current = row.symbol;
                          setDragSymbol(row.symbol);
                        }}
                        onDragEnd={() => {
                          dragSymbolRef.current = null;
                          setDragSymbol(null);
                          setOverSymbol(null);
                        }}
                      >
                        ⋮⋮
                      </button>
                    </td>
                    <td>
                      <div className="num">{row.symbol}</div>
                      {row.dates.length > 0 ? (
                        <div className="symbol-dates">
                          {row.dates.map((date) => (
                            <span key={date.id} className={date.urgent ? 'tag impact-high' : 'tag'}>
                              {date.text}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="name">{row.name || row.symbol}</td>
                    <td className="right num">
                      {formatPrice(row.price)}
                      {row.extended ? (
                        <div className="ext">
                          {sessionLabel(row.extended.kind)} {formatPrice(row.extended.price)}
                          <span className={tone(row.extended.pct)}>{formatPct(row.extended.pct)}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className={`right num ${tone(change.pct)}`}>
                      {formatSignedMoney(change.abs)}
                      <div>{formatPct(change.pct)}</div>
                    </td>
                    <td className="num nowrap">
                      <DayBar low={row.low} high={row.high} price={row.price} />
                      {row.low != null && row.high != null ? `${formatPrice(row.low)}–${formatPrice(row.high)}` : '—'}
                    </td>
                    <td className="right num">{formatCompact(row.volume)}</td>
                    <td>
                      <div className="tags">
                        {row.muted ? <span className="tag">Muted</span> : null}
                        {row.armedAlerts > 0 ? <span className="tag">{row.armedAlerts} armed</span> : null}
                        {row.firedToday.map((kind) => (
                          <span className="tag" key={kind}>
                            {KIND_LABEL[kind]}
                          </span>
                        ))}
                        {row.ts ? <span className="tag">{formatAgo(row.ts)}</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows && shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No symbols match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="panel watch-cards">
          {shown.map((row) => (
            <QuoteCard
              key={row.id}
              row={row}
              canUp={rows != null && rows[0]?.symbol !== row.symbol}
              canDown={rows != null && rows[rows.length - 1]?.symbol !== row.symbol}
              onOpen={() => router.push(`/ticker/${encodeURIComponent(row.symbol)}`)}
              onMove={(direction) => move(row.symbol, direction)}
            />
          ))}
          {rows && shown.length === 0 ? <p className="muted quote-empty">No symbols match.</p> : null}
        </div>
        </>
      )}

      {adding ? (
        <AddDialog
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load().catch((err) => setError(err instanceof Error ? err.message : 'Could not refresh.'));
          }}
        />
      ) : null}

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className="toast" key={toast.id}>
            {toast.text}
          </div>
        ))}
      </div>
    </>
  );
}

function QuoteCard({
  row,
  canUp,
  canDown,
  onOpen,
  onMove,
}: {
  row: WatchRow;
  canUp: boolean;
  canDown: boolean;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const change = changeOf(row.price, row.prevClose);
  return (
    <article
      className={`quote ${row.muted ? 'dim' : ''}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
      }}
      tabIndex={0}
    >
      <div className="nudge">
        <button
          type="button"
          aria-label={`Move ${row.symbol} up`}
          disabled={!canUp}
          onClick={(event) => {
            event.stopPropagation();
            onMove(-1);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${row.symbol} down`}
          disabled={!canDown}
          onClick={(event) => {
            event.stopPropagation();
            onMove(1);
          }}
        >
          ↓
        </button>
      </div>
      <div className="quote-main">
        <div className="quote-id">
          <div className="num sym">{row.symbol}</div>
          <div className="name">{row.name || row.symbol}</div>
          {row.dates.length > 0 ? (
            <div className="symbol-dates">
              {row.dates.map((date) => (
                <span key={date.id} className={date.urgent ? 'tag impact-high' : 'tag'}>
                  {date.text}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="quote-px">
          <div className="num last">{formatPrice(row.price)}</div>
          <div className={`num chg ${tone(change.pct)}`}>
            {formatSignedMoney(change.abs)} {formatPct(change.pct)}
          </div>
        </div>
        {row.extended ? (
          <div className="ext quote-ext">
            {sessionLabel(row.extended.kind)} {formatPrice(row.extended.price)}
            <span className={tone(row.extended.pct)}>{formatPct(row.extended.pct)}</span>
          </div>
        ) : null}
        <div className="quote-meta num">
          <span>
            <DayBar low={row.low} high={row.high} price={row.price} />
            {row.low != null && row.high != null ? `${formatPrice(row.low)}–${formatPrice(row.high)}` : '—'}
          </span>
          <span>Vol {formatCompact(row.volume)}</span>
        </div>
        <div className="tags quote-tags">
          {row.muted ? <span className="tag">Muted</span> : null}
          {row.armedAlerts > 0 ? <span className="tag">{row.armedAlerts} armed</span> : null}
          {row.firedToday.map((kind) => (
            <span className="tag" key={kind}>
              {KIND_LABEL[kind]}
            </span>
          ))}
          {row.ts ? <span className="tag">{formatAgo(row.ts)}</span> : null}
        </div>
      </div>
    </article>
  );
}

function DayBar({ low, high, price }: { low: number | null; high: number | null; price: number | null }) {
  if (low == null || high == null || price == null || high <= low) return null;
  const pct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  return (
    <span className="bar" aria-hidden="true">
      <i style={{ left: `${pct}%` }} />
    </span>
  );
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ symbol: string; description: string; type: string }[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as { results?: typeof results; error?: string };
          if (!response.ok) throw new Error(body.error || 'Search failed.');
          setResults(body.results ?? []);
          setError('');
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Search failed.');
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  async function add(symbol: string, name: string) {
    setPending(symbol);
    setError('');
    try {
      await api('/api/tickers', { method: 'POST', body: JSON.stringify({ symbol, name }) });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that ticker.');
      setPending('');
    }
  }

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="row-between" style={{ marginBottom: '0.7rem' }}>
          <h2 id="add-title" style={{ margin: 0, fontSize: '1.05rem' }}>
            Add ticker
          </h2>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <input
          className="field"
          autoFocus
          placeholder="Symbol or company"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search symbols"
        />
        <div className="range" style={{ marginTop: '0.7rem' }}>
          {FUTURES.map((item) => (
            <button
              key={item.symbol}
              className="btn"
              type="button"
              disabled={pending === item.symbol}
              onClick={() => void add(item.symbol, item.name)}
            >
              {pending === item.symbol ? 'Adding…' : item.name}
            </button>
          ))}
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div style={{ marginTop: '0.6rem' }}>
          {results.map((result) => (
            <button
              className="hit"
              type="button"
              key={result.symbol}
              disabled={pending === result.symbol}
              onClick={() => void add(result.symbol, result.description)}
            >
              <span>
                <strong className="num">{result.symbol}</strong>
                <div className="muted">{result.description}</div>
              </span>
              <span className="muted">{pending === result.symbol ? 'Adding…' : result.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
