import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeCompanyDate, summarizeRelease } from './reports';

test('a published retail print is softer than the prior month', () => {
  const note = summarizeRelease({
    name: 'Retail Sales (Advance)',
    period: 'October 2026',
    previous: '0.8000',
    actual: '0.2000',
    unit: '% m/m',
  });
  assert.ok(note);
  assert.match(note.happened, /0\.2% m\/m/);
  assert.match(note.happened, /0\.8% m\/m/);
  assert.match(note.means, /softer/i);
  assert.match(note.influenced, /retailers/i);
  assert.doesNotMatch(note.means, /dot plot/);
});

test('claims use the count, and a higher print is the weaker labor reading', () => {
  const note = summarizeRelease({
    name: 'Initial Jobless Claims',
    period: 'Week ending 2026-11-14',
    previous: '202.0000',
    actual: '203.0000',
    unit: 'thousands, week ending Saturday',
  });
  assert.ok(note);
  assert.match(note.happened, /203,000/);
  assert.match(note.happened, /202,000/);
  assert.match(note.means, /weaker/);
});

test('an unchanged import-price print is not described as a surprise', () => {
  const note = summarizeRelease({
    name: 'Import and Export Prices',
    period: 'October 2026',
    previous: '1.1000',
    actual: '1.1000',
    unit: '% m/m, import prices',
  });
  assert.ok(note);
  assert.match(note.means, /matched the previous/);
});

test('an upcoming release keeps the general note', () => {
  assert.equal(
    summarizeRelease({
      name: 'CPI (Consumer Price Index)',
      period: 'November 2026',
      previous: '0.2',
      actual: null,
      unit: '% m/m',
    }),
    null,
  );
});

test('a hotter CPI print is not given the cooler reaction', () => {
  const hot = summarizeRelease({
    name: 'CPI (Consumer Price Index)',
    period: 'October 2026',
    previous: '0.2',
    actual: '0.4',
    unit: '% m/m',
  });
  const cool = summarizeRelease({
    name: 'CPI (Consumer Price Index)',
    period: 'October 2026',
    previous: '0.4',
    actual: '0.2',
    unit: '% m/m',
  });
  assert.ok(hot && cool);
  assert.match(hot.means, /hotter/);
  assert.match(hot.influenced, /lifts Treasury yields/);
  assert.match(cool.means, /cooler/);
  assert.match(cool.influenced, /pull Treasury yields/);
});

test('county GDP is not treated as the national release', () => {
  const note = summarizeRelease({
    name: 'GDP by County and Personal Income by County, 2025',
    period: '2025',
    previous: '1',
    actual: '1.2',
    unit: '%',
  });
  assert.ok(note);
  assert.match(note.influenced, /almost never/);
  assert.doesNotMatch(note.means, /advance estimate/);
});

test('a reported quarter summarizes the beat, and the next quarter stays general', () => {
  const reported = describeCompanyDate(
    {
      kind: 'earnings',
      date: '2026-11-17',
      when: 'after_close',
      estimated: false,
      detail: 'EPS 2.68 vs 2.53 est. · Rev 115.84B vs 113.20B est.',
    },
    -5,
  );
  assert.ok(reported.report);
  assert.match(reported.report.happened, /2\.68/);
  assert.match(reported.report.happened, /115\.84B/);
  assert.match(reported.report.means, /ahead of the estimates/);
  assert.match(reported.report.influenced, /after-hours/);

  const upcoming = describeCompanyDate(
    {
      kind: 'earnings',
      date: '2027-02-23',
      when: 'after_close',
      estimated: false,
      detail: 'EPS est. 2.94 · Rev est. 133.31B',
    },
    90,
  );
  assert.equal(upcoming.report, null);
  assert.match(upcoming.about, /quarterly report/);
  assert.match(upcoming.affects, /outlook/);
});

test('a miss is not described as a beat', () => {
  const note = describeCompanyDate(
    {
      kind: 'earnings',
      date: '2026-10-29',
      when: 'after_close',
      estimated: false,
      detail: 'EPS 1.89 vs 2 est. · Rev 180.00B vs 201.94B est.',
    },
    -20,
  );
  assert.ok(note.report);
  assert.match(note.report.means, /short of the estimates/);
  assert.match(note.report.influenced, /weigh on the shares/);
});

test('an ex-dividend date explains the date and does not invent a report', () => {
  const note = describeCompanyDate(
    { kind: 'ex_dividend', date: '2026-12-02', when: '', estimated: false, detail: '' },
    10,
  );
  assert.equal(note.report, null);
  assert.match(note.about, /does not receive the upcoming dividend/);
  assert.match(note.affects, /opens lower/);
});
