import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCalendar } from '@/providers/calendar';
import { explainRelease, formatPrint } from './macro';

test('CPI, PPI, and payrolls each get their own note', () => {
  assert.match(explainRelease('CPI (Consumer Price Index)').about, /Consumer Price Index/);
  assert.match(explainRelease('PPI (Producer Price Index)').about, /producers receive/);
  assert.match(explainRelease('Nonfarm Payrolls (Employment Situation)').affects, /hourly earnings|wages|yields/i);
});

test('FOMC documents stay distinct', () => {
  const decision = explainRelease('FOMC Rate Decision');
  const minutes = explainRelease('FOMC Minutes');
  const dots = explainRelease('FOMC Summary of Economic Projections');
  assert.match(decision.about, /federal funds/);
  assert.match(minutes.about, /three weeks/);
  assert.match(dots.about, /dot plot/);
  assert.notEqual(decision.about, minutes.about);
  assert.notEqual(decision.about, dots.about);
});

test('local GDP is not described as the national release', () => {
  const local = explainRelease('GDP by County and Personal Income by County, 2025');
  const national = explainRelease('GDP (Second Estimate) and Corporate Profits, 3rd Quarter 2026');
  assert.match(local.affects, /almost never/);
  assert.match(national.about, /advance estimate/);
});

test('an unknown release still gets a plain note', () => {
  const guide = explainRelease('Some New Index');
  assert.match(guide.about, /scheduled US statistical release/);
  assert.match(guide.affects, /Treasury yields/);
});

test('calendar rows keep a stable id and drop blank releases', () => {
  const parsed = parseCalendar({
    meta: { sourceAttribution: 'Agencies.' },
    data: [
      {
        eventName: 'CPI (Consumer Price Index)',
        importance: 'high',
        scheduledAt: '2026-12-10T13:30:00.000Z',
        periodLabel: 'November 2026',
        previous: '0.2000',
        actual: null,
        unit: '% m/m',
        canonicalUrl: 'https://example.test/cpi',
      },
      { eventName: '', importance: 'high', scheduledAt: '2026-12-10T13:30:00.000Z' },
    ],
  });
  assert.equal(parsed.releases.length, 1);
  assert.equal(parsed.releases[0].id, `${Date.parse('2026-12-10T13:30:00.000Z')}:CPI (Consumer Price Index)`);
  assert.equal(parsed.releases[0].previous, '0.2000');
  assert.equal(parsed.releases[0].actual, null);
  assert.match(parsed.attribution, /Data: XOOMAR/);
  assert.match(parsed.attribution, /Agencies/);
});

test('prints drop extra zeros and keep the unit', () => {
  assert.equal(formatPrint('0.2000', '% m/m'), '0.2% m/m');
  assert.equal(formatPrint('203.0000', 'thousands, week ending Saturday'), '203 · thousands, week ending Saturday');
  assert.equal(formatPrint(null, '% m/m'), '—');
  assert.equal(formatPrint('3.6000', ''), '3.6');
});
