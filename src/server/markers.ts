import { formatCompact, formatMoneyCompact, formatNumber, formatPercent, formatPrice } from '@/lib/format';
import type { CompanyProfile, Marker } from '@/lib/types';

function metric(metrics: Record<string, number>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Finnhub's basic financials already express margins, ROE, and dividend yield
 * as percentages (46.68 means 46.68%, 0.40 means a 0.40% yield).
 * Market cap and 10-day average volume are in millions.
 */
export function buildMarkers(profile: CompanyProfile | null, metrics: Record<string, number>): Marker[] {
  const markers: Marker[] = [];
  const push = (label: string, value: string | null) => {
    if (value && value !== '—') markers.push({ label, value });
  };
  const cap = profile?.marketCapMillion ?? metric(metrics, 'marketCapitalization');
  push('Market cap', cap == null ? null : formatMoneyCompact(cap * 1_000_000));
  push('P/E', formatMaybe(metric(metrics, 'peTTM', 'peBasicExclExtraTTM'), (n) => formatNumber(n)));
  push('EPS', formatMaybe(metric(metrics, 'epsTTM', 'epsBasicExclExtraItemsTTM'), formatPrice));
  push('Dividend yield', formatMaybe(metric(metrics, 'dividendYieldIndicatedAnnual', 'currentDividendYieldTTM'), (n) => formatPercent(n)));
  push('Beta', formatMaybe(metric(metrics, 'beta'), (n) => formatNumber(n)));
  push('52-week high', formatMaybe(metric(metrics, '52WeekHigh'), formatPrice));
  push('52-week low', formatMaybe(metric(metrics, '52WeekLow'), formatPrice));
  const volume = metric(metrics, '10DayAverageTradingVolume');
  push('Avg volume (10D)', volume == null ? null : formatCompact(volume * 1_000_000));
  push('Gross margin', formatMaybe(metric(metrics, 'grossMarginTTM'), (n) => formatPercent(n)));
  push('Operating margin', formatMaybe(metric(metrics, 'operatingMarginTTM'), (n) => formatPercent(n)));
  push('Net margin', formatMaybe(metric(metrics, 'netProfitMarginTTM'), (n) => formatPercent(n)));
  push('ROE', formatMaybe(metric(metrics, 'roeTTM'), (n) => formatPercent(n)));
  push('Current ratio', formatMaybe(metric(metrics, 'currentRatioQuarterly', 'currentRatioAnnual'), (n) => formatNumber(n)));
  push('Revenue growth', formatMaybe(metric(metrics, 'revenueGrowthTTMYoy'), (n) => formatPercent(n)));
  const debt = metric(metrics, 'totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual');
  push('Debt/equity', debt == null ? null : formatNumber(debt));
  return markers;
}

function formatMaybe(value: number | null, format: (value: number) => string): string | null {
  if (value == null) return null;
  return format(value);
}
