import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysUntil, dividendsFromYahoo, earningsFromFinnhub, selectTickerDates, selectWatchDates } from './dates';

const today = '2026-11-22';

test('day distance ignores the clock', () => {
  assert.equal(daysUntil('2026-12-02', today), 10);
  assert.equal(daysUntil('2026-11-17', today), -5);
  assert.equal(daysUntil(today, today), 0);
});

test('earnings keep the session and mark a blank hour as estimated', () => {
  const dates = earningsFromFinnhub([
    { date: '2026-11-17', hour: 'amc', epsActual: 2.68, epsEstimate: 2.5252, revenueActual: 115844000000 },
    { date: '2027-02-23', hour: 'amc', epsEstimate: 2.9375, revenueEstimate: 133310409753 },
    { date: '2027-05-18', hour: '', epsEstimate: 3.3784 },
    { date: 'bad' },
  ]);
  assert.equal(dates.length, 3);
  assert.equal(dates[0].when, 'after_close');
  assert.equal(dates[0].estimated, false);
  assert.match(dates[0].detail, /EPS 2\.68 vs 2\.53 est\./);
  assert.equal(dates[2].estimated, true);
});

test('yahoo dividend days use the formatted date', () => {
  const dates = dividendsFromYahoo({
    exDividendDate: { fmt: '2026-12-02', raw: 1796169600 },
    dividendDate: { fmt: '2026-12-23' },
  });
  assert.deepEqual(dates.map((date) => [date.kind, date.date]), [
    ['ex_dividend', '2026-12-02'],
    ['dividend', '2026-12-23'],
  ]);
});

test('the watch shows dates inside three weeks and a fresh earnings print', () => {
  const rows = withIds([
    ...earningsFromFinnhub([
      { date: '2026-11-21', hour: 'amc', epsActual: 1, epsEstimate: 0.9 },
      { date: '2026-12-02', hour: 'bmo', epsEstimate: 1.2 },
      { date: '2027-02-23', hour: 'amc', epsEstimate: 2 },
    ]),
    ...dividendsFromYahoo({ exDividendDate: { fmt: '2026-12-02' }, dividendDate: { fmt: '2026-12-23' } }),
  ]);
  const badges = selectWatchDates(rows, today);
  assert.deepEqual(badges.map((badge) => badge.text), ['Earnings reported', 'Earnings Dec 2', 'Ex-div Dec 2'].slice(0, 2));
  assert.equal(badges[0].urgent, true);
  assert.equal(badges[1].urgent, false);
});

test('the ticker keeps the last print and the next two earnings', () => {
  const rows = withIds([
    ...earningsFromFinnhub([
      { date: '2026-08-01', hour: 'amc', epsActual: 1, epsEstimate: 1 },
      { date: '2026-11-17', hour: 'amc', epsActual: 2.68, epsEstimate: 2.53 },
      { date: '2027-02-23', hour: 'amc', epsEstimate: 2.94 },
      { date: '2027-05-18', hour: '', epsEstimate: 3.3 },
      { date: '2027-08-18', hour: '', epsEstimate: 3.5 },
    ]),
    ...dividendsFromYahoo({ exDividendDate: { fmt: '2026-12-02' }, dividendDate: { fmt: '2026-12-23' } }),
  ]);
  const shown = selectTickerDates(rows, today);
  assert.deepEqual(shown.map((date) => `${date.kind}:${date.date}`), [
    'earnings:2026-11-17',
    'ex_dividend:2026-12-02',
    'dividend:2026-12-23',
    'earnings:2027-02-23',
    'earnings:2027-05-18',
  ]);
  assert.match(shown[0].timing, /After the close/);
  assert.match(shown[0].timing, /Reported/);
  assert.match(shown[4].timing, /estimated/i);
  assert.ok(shown[0].report);
  assert.equal(shown[3].report, null);
  assert.match(shown[3].about, /quarterly report/);
  assert.match(shown[1].about, /ex-dividend|does not receive/i);
});

function withIds<T extends { kind: string; date: string }>(dates: T[]): (T & { id: string })[] {
  return dates.map((date) => ({ ...date, id: `${date.kind}:${date.date}` }));
}
