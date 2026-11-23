import { formatCompact } from '@/lib/format';
import type { CompanyDate, CompanyDateKind, CompanyDateView, WatchDate } from '@/lib/types';
import { describeCompanyDate } from '@/server/reports';

const NEAR_DAYS = 21;
const REPORTED_DAYS = 2;

type EarningsRaw = {
  date?: string;
  hour?: string;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
};

type YahooDay = { raw?: number; fmt?: string };

export function daysUntil(date: string, today: string): number {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 9999;
  return Math.round((end - start) / 86_400_000);
}

export function earningsFromFinnhub(rows: EarningsRaw[]): CompanyDate[] {
  const dates: CompanyDate[] = [];
  for (const row of rows) {
    if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const hour = (row.hour || '').toLowerCase();
    dates.push({
      kind: 'earnings',
      date: row.date,
      when: hour === 'bmo' ? 'before_open' : hour === 'amc' ? 'after_close' : '',
      estimated: hour === '',
      detail: earningsDetail(row),
    });
  }
  return dedupe(dates);
}

export function dividendsFromYahoo(events: {
  exDividendDate?: YahooDay;
  dividendDate?: YahooDay;
} | null): CompanyDate[] {
  const dates: CompanyDate[] = [];
  const ex = dayOf(events?.exDividendDate);
  const pay = dayOf(events?.dividendDate);
  if (ex) dates.push({ kind: 'ex_dividend', date: ex, when: '', estimated: false, detail: '' });
  if (pay) dates.push({ kind: 'dividend', date: pay, when: '', estimated: false, detail: '' });
  return dates;
}

/** Upcoming dates worth keeping on the ticker, plus a recent earnings print. */
export function selectTickerDates(dates: (CompanyDate & { id: string })[], today: string): CompanyDateView[] {
  const earnings = dates.filter((date) => date.kind === 'earnings').sort((a, b) => a.date.localeCompare(b.date));
  const recent = [...earnings].reverse().find((date) => daysUntil(date.date, today) < 0 && daysUntil(date.date, today) >= -90);
  const upcomingEarnings = earnings.filter((date) => daysUntil(date.date, today) >= 0).slice(0, 2);
  const others = dates.filter((date) => date.kind !== 'earnings' && daysUntil(date.date, today) >= -7);
  const chosen = [...(recent ? [recent] : []), ...upcomingEarnings, ...others];
  return chosen
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
    .map((date) => decorate(date, today));
}

/** Dates close enough to call out on the watch list. */
export function selectWatchDates(dates: (CompanyDate & { id: string })[], today: string): WatchDate[] {
  return dates
    .map((date) => ({ date, days: daysUntil(date.date, today) }))
    .filter(({ date, days }) => {
      if (days >= 0 && days <= NEAR_DAYS) return true;
      return date.kind === 'earnings' && days < 0 && days >= -REPORTED_DAYS && date.detail.includes('vs');
    })
    .sort((a, b) => a.days - b.days || a.date.kind.localeCompare(b.date.kind))
    .slice(0, 2)
    .map(({ date, days }) => ({
      id: date.id,
      text: watchText(date, days),
      urgent: days <= 3,
    }));
}

function decorate(date: CompanyDate & { id: string }, today: string): CompanyDateView {
  const days = daysUntil(date.date, today);
  const note = describeCompanyDate(date, days);
  return {
    ...date,
    title: titleOf(date.kind),
    timing: timingOf(date, days),
    days,
    about: note.about,
    affects: note.affects,
    report: note.report,
  };
}

function watchText(date: CompanyDate, days: number): string {
  const name = date.kind === 'earnings' ? 'Earnings' : date.kind === 'ex_dividend' ? 'Ex-div' : 'Dividend';
  if (days < 0) return `${name} reported`;
  if (days === 0 && date.kind === 'earnings' && date.when === 'after_close') return 'Earnings after close';
  if (days === 0 && date.kind === 'earnings' && date.when === 'before_open') return 'Earnings before open';
  if (days === 0) return `${name} today`;
  if (days === 1) return `${name} tomorrow`;
  return `${name} ${shortDate(date.date)}`;
}

function titleOf(kind: CompanyDateKind): string {
  if (kind === 'earnings') return 'Earnings';
  if (kind === 'ex_dividend') return 'Ex-dividend';
  return 'Dividend pay';
}

function timingOf(date: CompanyDate, days: number): string {
  const parts: string[] = [];
  if (date.when === 'before_open') parts.push('Before the open');
  if (date.when === 'after_close') parts.push('After the close');
  if (date.estimated) parts.push('Date is estimated');
  if (days < 0) parts.push('Reported');
  return parts.join(' · ');
}

function earningsDetail(row: EarningsRaw): string {
  const parts: string[] = [];
  const actual = numberOrNull(row.epsActual);
  const estimate = numberOrNull(row.epsEstimate);
  if (actual != null && estimate != null) parts.push(`EPS ${figure(actual)} vs ${figure(estimate)} est.`);
  else if (estimate != null) parts.push(`EPS est. ${figure(estimate)}`);
  else if (actual != null) parts.push(`EPS ${figure(actual)}`);
  const revenueActual = numberOrNull(row.revenueActual);
  const revenueEstimate = numberOrNull(row.revenueEstimate);
  if (revenueActual != null && revenueEstimate != null) {
    parts.push(`Rev ${formatCompact(revenueActual)} vs ${formatCompact(revenueEstimate)} est.`);
  } else if (revenueActual != null) parts.push(`Rev ${formatCompact(revenueActual)}`);
  else if (revenueEstimate != null) parts.push(`Rev est. ${formatCompact(revenueEstimate)}`);
  return parts.join(' · ');
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function figure(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function shortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function dayOf(value: YahooDay | undefined): string | null {
  if (value?.fmt && /^\d{4}-\d{2}-\d{2}$/.test(value.fmt)) return value.fmt;
  if (typeof value?.raw === 'number' && value.raw > 0) return new Date(value.raw * 1000).toISOString().slice(0, 10);
  return null;
}

function dedupe(dates: CompanyDate[]): CompanyDate[] {
  const seen = new Set<string>();
  return dates.filter((date) => {
    const key = `${date.kind}:${date.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
