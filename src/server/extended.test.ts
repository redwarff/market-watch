import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extendedFromYahooQuote } from '@/providers/yahoo';

const fridayPost = 1795222798;

test('before premarket, the last after-hours print stays on screen', () => {
  const quote = extendedFromYahooQuote({
    marketState: 'PREPRE',
    postMarketPrice: 130.01,
    postMarketChange: 4.48,
    postMarketChangePercent: 3.57,
    postMarketTime: fridayPost,
  });
  assert.ok(quote);
  assert.equal(quote.kind, 'post');
  assert.equal(quote.price, 130.01);
  assert.equal(quote.ts, fridayPost * 1000);
});

test('a regular session hides the off-hours line', () => {
  assert.equal(
    extendedFromYahooQuote({
      marketState: 'REGULAR',
      postMarketPrice: 130.01,
      postMarketTime: fridayPost,
    }),
    null,
  );
});

test('premarket replaces an older after-hours print', () => {
  const quote = extendedFromYahooQuote({
    marketState: 'PRE',
    preMarketPrice: 128.4,
    preMarketChange: 2.87,
    preMarketChangePercent: 2.29,
    preMarketTime: fridayPost + 8 * 60 * 60,
    postMarketPrice: 130.01,
    postMarketTime: fridayPost,
  });
  assert.ok(quote);
  assert.equal(quote.kind, 'pre');
  assert.equal(quote.price, 128.4);
});

test('a newer overnight print wins over after hours', () => {
  const quote = extendedFromYahooQuote({
    marketState: 'PREPRE',
    overnightMarketPrice: 132.5,
    overnightMarketChange: 6.97,
    overnightMarketChangePercent: 5.55,
    overnightMarketTime: fridayPost + 6 * 60 * 60,
    postMarketPrice: 130.01,
    postMarketTime: fridayPost,
  });
  assert.ok(quote);
  assert.equal(quote.kind, 'night');
  assert.equal(quote.price, 132.5);
});

test('a closed weekend keeps the after-hours print', () => {
  const quote = extendedFromYahooQuote({
    marketState: 'CLOSED',
    postMarketPrice: 130.01,
    postMarketTime: fridayPost,
  });
  assert.equal(quote?.kind, 'post');
  assert.equal(quote?.price, 130.01);
});
