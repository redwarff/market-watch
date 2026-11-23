import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, type EvalInput } from './alerts';

const WINDOW = 15 * 60 * 1000;
const COOLDOWN = 60 * 60 * 1000;

function base(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    price: 100,
    previousPrice: 100,
    prevClose: 100,
    now: 1_700_000_000_000,
    muted: false,
    dailyReady: true,
    dailyThreshold: 3,
    suddenThreshold: 3,
    windowMs: WINDOW,
    cooldownMs: COOLDOWN,
    ticks: [],
    alerts: [],
    dailyFiredUp: false,
    dailyFiredDown: false,
    lastSuddenUp: null,
    lastSuddenDown: null,
    sessionOpen: true,
    ...overrides,
  };
}

test('an above limit fires only when price crosses it', () => {
  const alerts = [{ id: 'a', direction: 'above' as const, price: 100, armed: true }];
  const fired = evaluate(base({ previousPrice: 99, price: 101, alerts }));
  assert.equal(fired.length, 1);
  assert.equal(fired[0]?.type, 'limit');
  const stillAbove = evaluate(base({ previousPrice: 101, price: 102, alerts }));
  assert.equal(stillAbove.length, 0);
});

test('a below limit fires on a downward cross', () => {
  const alerts = [{ id: 'b', direction: 'below' as const, price: 100, armed: true }];
  const fired = evaluate(base({ previousPrice: 101, price: 99, alerts }));
  assert.equal(fired[0]?.type, 'limit');
  if (fired[0]?.type === 'limit') assert.equal(fired[0].direction, 'below');
});

test('a disarmed limit stays quiet', () => {
  const alerts = [{ id: 'a', direction: 'above' as const, price: 100, armed: false }];
  assert.equal(evaluate(base({ previousPrice: 99, price: 100, prevClose: 100, alerts })).length, 0);
});

test('muted tickers produce no alerts', () => {
  assert.equal(evaluate(base({ muted: true, price: 120, previousPrice: 90 })).length, 0);
});

test('a non-positive price is ignored', () => {
  assert.equal(evaluate(base({ price: 0, previousPrice: 10 })).length, 0);
});

test('daily move fires once per direction against the previous close', () => {
  const up = evaluate(base({ price: 103.1 }));
  assert.equal(up.length, 1);
  assert.equal(up[0]?.type, 'daily_move');
  if (up[0]?.type === 'daily_move') {
    assert.equal(up[0].direction, 'up');
    assert.ok(up[0].pct > 3);
  }
  assert.equal(evaluate(base({ price: 104, dailyFiredUp: true })).length, 0);
  const down = evaluate(base({ price: 96.9 }));
  assert.equal(down[0]?.type, 'daily_move');
  if (down[0]?.type === 'daily_move') assert.equal(down[0].direction, 'down');
});

test('daily move waits for a fresh previous close', () => {
  assert.equal(evaluate(base({ price: 110, dailyReady: false })).length, 0);
});

test('a tighter threshold is honored', () => {
  assert.equal(evaluate(base({ price: 103.1, dailyThreshold: 5 })).length, 0);
});

test('sudden move compares with a sample about one window ago', () => {
  const now = 1_700_000_000_000;
  const up = evaluate(
    base({
      now,
      price: 104,
      prevClose: 104,
      ticks: [{ ts: now - WINDOW, price: 100 }],
    }),
  );
  assert.equal(up[0]?.type, 'sudden_move');
  if (up[0]?.type === 'sudden_move') assert.equal(up[0].fromPrice, 100);
});

test('sudden move waits until the window has a nearby sample', () => {
  const now = 1_700_000_000_000;
  const tooOld = evaluate(
    base({
      now,
      price: 110,
      prevClose: 110,
      ticks: [{ ts: now - 30 * 60 * 1000, price: 100 }],
    }),
  );
  assert.equal(tooOld.length, 0);
  const tooRecent = evaluate(
    base({
      now,
      price: 110,
      prevClose: 110,
      ticks: [{ ts: now - 60 * 1000, price: 100 }],
    }),
  );
  assert.equal(tooRecent.length, 0);
});

test('sudden move respects the quiet period per direction', () => {
  const now = 1_700_000_000_000;
  const ticks = [{ ts: now - WINDOW, price: 100 }];
  const cooled = evaluate(
    base({ now, price: 104, prevClose: 104, ticks, lastSuddenUp: now - 5 * 60 * 1000 }),
  );
  assert.equal(cooled.length, 0);
  const down = evaluate(
    base({
      now,
      price: 96,
      prevClose: 96,
      ticks: [{ ts: now - WINDOW, price: 100 }],
      lastSuddenUp: now - 5 * 60 * 1000,
    }),
  );
  assert.equal(down[0]?.type, 'sudden_move');
  if (down[0]?.type === 'sudden_move') assert.equal(down[0].direction, 'down');
  const again = evaluate(
    base({ now, price: 104, prevClose: 104, ticks, lastSuddenUp: now - COOLDOWN - 1000 }),
  );
  assert.equal(again[0]?.type, 'sudden_move');
});

test('a closed session does not turn a premarket gap into a sudden move', () => {
  const now = 1_700_000_000_000;
  const fired = evaluate(
    base({
      sessionOpen: false,
      now,
      price: 125.53,
      prevClose: 145.98,
      previousPrice: 136,
      ticks: [{ ts: now - WINDOW, price: 136 }],
    }),
  );
  assert.equal(fired.length, 0);
});
