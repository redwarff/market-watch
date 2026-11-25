import assert from 'node:assert/strict';
import { test } from 'node:test';
import { futureSessionOpen, isFuture, matchFutures } from '@/lib/futures';
import { isSymbol } from '@/server/schemas';

test('gold and silver futures are symbols, and an unknown futures code is not', () => {
  assert.equal(isFuture('GC=F'), true);
  assert.equal(isFuture('SI=F'), true);
  assert.equal(isSymbol('GC=F'), true);
  assert.equal(isSymbol('SI=F'), true);
  assert.equal(isSymbol('CL=F'), false);
  assert.equal(isSymbol('NVDA'), true);
});

test('search finds gold and silver by name', () => {
  assert.deepEqual(
    matchFutures('gold').map((item) => item.symbol),
    ['GC=F'],
  );
  assert.deepEqual(
    matchFutures('silver').map((item) => item.symbol),
    ['SI=F'],
  );
  assert.equal(matchFutures('g').length, 0);
});

test('a futures print stays live for a few minutes', () => {
  const now = Date.parse('2026-11-25T15:00:00Z');
  assert.equal(futureSessionOpen(now - 5 * 60 * 1000, now), true);
  assert.equal(futureSessionOpen(now - 30 * 60 * 1000, now), false);
});
