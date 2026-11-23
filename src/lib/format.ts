export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const digits = Math.abs(value) >= 1 ? 2 : 4;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSignedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatPrice(Math.abs(value))}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [unit, label] of units) {
    if (abs >= unit) return `${sign}${(abs / unit).toFixed(2)}${label}`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatMoneyCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${formatCompact(value)}`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function tone(value: number | null | undefined): '' | 'up' | 'down' {
  if (value == null || !Number.isFinite(value) || value === 0) return '';
  return value > 0 ? 'up' : 'down';
}

export function changeOf(price: number | null, prevClose: number | null): { abs: number | null; pct: number | null } {
  if (price == null || prevClose == null || prevClose === 0) return { abs: null, pct: null };
  const abs = price - prevClose;
  return { abs, pct: (abs / prevClose) * 100 };
}

export function formatAgo(ts: number | null | undefined): string {
  if (!ts) return '—';
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function sessionLabel(kind: 'pre' | 'post' | 'night'): string {
  if (kind === 'pre') return 'Pre-market';
  if (kind === 'night') return 'Overnight';
  return 'After hours';
}

export function formatDay(ts: number): string {
  const date = new Date(ts);
  const label = date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  return date.toDateString() === new Date().toDateString() ? `Today · ${label}` : label;
}

export function formatEtClock(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(ts));
}

export function formatClock(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
