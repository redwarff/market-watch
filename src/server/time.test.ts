import assert from 'node:assert/strict';
import { test } from 'node:test';
import { etDayKey, etDayStartMs, isExtendedSession, isRegularPrint, isRegularSession } from './time';

test('New York calendar day follows Eastern Time, including winter offset', () => {
  assert.equal(etDayKey(new Date('2026-01-15T03:30:00Z')), '2026-01-14');
  assert.equal(etDayKey(new Date('2026-01-15T15:00:00Z')), '2026-01-15');
});

test('regular session is 9:30 to 16:00 Eastern on weekdays', () => {
  assert.equal(isRegularSession(new Date('2026-01-15T14:30:00Z')), true);
  assert.equal(isRegularSession(new Date('2026-01-15T14:29:00Z')), false);
  assert.equal(isRegularSession(new Date('2026-01-15T21:00:00Z')), false);
  assert.equal(isRegularSession(new Date('2026-01-17T15:00:00Z')), false);
});

test('extended session is premarket and after hours, not the regular day or the weekend', () => {
  assert.equal(isExtendedSession(new Date('2026-01-15T13:00:00Z')), true);
  assert.equal(isExtendedSession(new Date('2026-01-15T22:00:00Z')), true);
  assert.equal(isExtendedSession(new Date('2026-01-15T15:00:00Z')), false);
  assert.equal(isExtendedSession(new Date('2026-01-17T22:00:00Z')), false);
  assert.equal(isExtendedSession(new Date('2026-07-15T21:00:00Z')), true);
});

test('summer hours use Eastern Daylight Time', () => {
  assert.equal(isRegularSession(new Date('2026-07-15T13:30:00Z')), true);
  assert.equal(isRegularSession(new Date('2026-07-15T13:29:00Z')), false);
});

test('the closing print counts as the regular session, and premarket does not', () => {
  assert.equal(isRegularPrint(Date.parse('2026-11-20T21:00:00Z')), true);
  assert.equal(isRegularPrint(Date.parse('2026-11-20T19:30:00Z')), true);
  assert.equal(isRegularPrint(Date.parse('2026-11-23T09:57:00Z')), false);
  assert.equal(isRegularPrint(Date.parse('2026-11-20T21:01:00Z')), false);
  assert.equal(isRegularPrint(Date.parse('2026-11-21T15:00:00Z')), false);
});

test('day start is midnight in New York', () => {
  const start = etDayStartMs(new Date('2026-01-15T18:00:00Z'));
  assert.equal(etDayKey(new Date(start)), '2026-01-15');
  assert.equal(etDayKey(new Date(start - 1000)), '2026-01-14');
});
