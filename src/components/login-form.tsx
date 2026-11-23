'use client';

import { useState } from 'react';

export function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Sign-in failed.');
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setPending(false);
    }
  }

  return (
    <div className="login">
      <form className="panel panel-pad" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: '0.8rem' }}>
          Market
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Personal watchlist for US stocks.
        </p>
        <label className="stack">
          <span className="kicker">Password</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending} style={{ marginTop: '0.9rem' }}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
