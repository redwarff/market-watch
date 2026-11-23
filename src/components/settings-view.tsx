'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatClock } from '@/lib/format';
import type { CacheRow } from '@/lib/types';

type SettingsForm = {
  dailyMovePct: number;
  suddenMovePct: number;
  suddenWindowMinutes: number;
  suddenCooldownMinutes: number;
  subreddits: string;
};

type Status = {
  finnhub: boolean;
  telegram: boolean;
  reddit: boolean;
  ws: string;
  wsDetail: string;
  caches: CacheRow[];
};

const LABELS: Record<string, string> = {
  'finnhub.ws': 'Live connection',
  'finnhub.quotes': 'Quotes',
  'yahoo.charts': 'Charts',
  'yahoo.session': 'Extended hours',
  'yahoo.statements': 'Financial statements',
  news: 'Headlines',
  'macro.calendar': 'Macro calendar',
  'company.dates': 'Company dates',
  reddit: 'Reddit',
  telegram: 'Telegram',
};

export function SettingsView() {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function load() {
    const [settings, nextStatus] = await Promise.all([api<SettingsForm>('/api/settings'), api<Status>('/api/status')]);
    setForm(settings);
    setStatus(nextStatus);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load settings.'));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const saved = await api<SettingsForm>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          dailyMovePct: Number(form.dailyMovePct),
          suddenMovePct: Number(form.suddenMovePct),
          suddenWindowMinutes: Number(form.suddenWindowMinutes),
          suddenCooldownMinutes: Number(form.suddenCooldownMinutes),
        }),
      });
      setForm(saved);
      setMessage('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setPending(false);
    }
  }

  async function testTelegram() {
    setError('');
    setMessage('');
    try {
      await api('/api/telegram/test', { method: 'POST' });
      setMessage('Test message sent.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telegram test failed.');
    }
  }

  if (!form) return error ? <p className="error">{error}</p> : <p className="muted">Loading settings…</p>;

  return (
    <>
      <div className="page-head">
        <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Settings</h1>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="up">{message}</p> : null}

      <form className="panel panel-pad" onSubmit={save}>
        <div className="form-grid">
          <label className="stack">
            <span className="kicker">Daily move %</span>
            <input
              className="field"
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={form.dailyMovePct}
              onChange={(event) => setForm({ ...form, dailyMovePct: Number(event.target.value) })}
            />
          </label>
          <label className="stack">
            <span className="kicker">Sudden move %</span>
            <input
              className="field"
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={form.suddenMovePct}
              onChange={(event) => setForm({ ...form, suddenMovePct: Number(event.target.value) })}
            />
          </label>
          <label className="stack">
            <span className="kicker">Sudden window, minutes</span>
            <input
              className="field"
              type="number"
              min={5}
              max={180}
              step={1}
              value={form.suddenWindowMinutes}
              onChange={(event) => setForm({ ...form, suddenWindowMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="stack">
            <span className="kicker">Quiet period, minutes</span>
            <input
              className="field"
              type="number"
              min={5}
              max={1440}
              step={1}
              value={form.suddenCooldownMinutes}
              onChange={(event) => setForm({ ...form, suddenCooldownMinutes: Number(event.target.value) })}
            />
          </label>
        </div>
        <label className="stack" style={{ marginTop: '0.8rem' }}>
          <span className="kicker">Subreddits</span>
          <input
            className="field"
            value={form.subreddits}
            onChange={(event) => setForm({ ...form, subreddits: event.target.value })}
          />
        </label>
        <p className="muted">Comma-separated names, without the r/. Used when pulling Reddit posts.</p>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>

      <section className="panel panel-pad" style={{ marginTop: '0.9rem' }}>
        <div className="row-between">
          <h2 className="kicker">Connections</h2>
          <button className="btn" type="button" onClick={() => void testTelegram()}>
            Test Telegram
          </button>
        </div>
        <p className="muted">
          Keys live in the server environment. Restart after changing them. Finnhub {status?.finnhub ? 'is set' : 'is missing'}.
          Telegram {status?.telegram ? 'is set' : 'is missing'}. Reddit {status?.reddit ? 'is set' : 'is missing'}.
        </p>
        <p>
          Live feed:{' '}
          {status?.finnhub && status.wsDetail === 'Finnhub API key is not set.'
            ? 'Connecting'
            : status?.wsDetail || 'Starting'}
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Source</th>
              <th>State</th>
              <th>Checked</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(LABELS).map((key) => {
              const row = status?.caches.find((cache) => cache.key === key);
              return (
                <tr key={key}>
                  <td>{LABELS[key]}</td>
                  <td className={row ? (row.ok ? 'up' : 'down') : 'muted'}>{row ? (row.ok ? 'Ok' : 'Check') : 'Waiting'}</td>
                  <td className="num">{row?.updatedAt ? formatClock(row.updatedAt) : '—'}</td>
                  <td className="muted">{row?.detail || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
