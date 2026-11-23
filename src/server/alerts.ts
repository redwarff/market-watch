export type Tick = { ts: number; price: number };

export type LimitAlert = {
  id: string;
  direction: 'above' | 'below';
  price: number;
  armed: boolean;
};

export type EvalInput = {
  price: number;
  previousPrice: number | null;
  prevClose: number | null;
  now: number;
  muted: boolean;
  /** When false, the previous close is from an older session and must not fire a daily move. */
  dailyReady: boolean;
  dailyThreshold: number;
  suddenThreshold: number;
  windowMs: number;
  cooldownMs: number;
  ticks: Tick[];
  alerts: LimitAlert[];
  /** Cash session is open and this price is a regular-session print. */
  sessionOpen: boolean;
  dailyFiredUp: boolean;
  dailyFiredDown: boolean;
  lastSuddenUp: number | null;
  lastSuddenDown: number | null;
};

export type EvalAction =
  | { type: 'limit'; alertId: string; direction: 'above' | 'below'; level: number; price: number }
  | { type: 'daily_move'; direction: 'up' | 'down'; pct: number; price: number }
  | { type: 'sudden_move'; direction: 'up' | 'down'; pct: number; price: number; fromPrice: number };

const SUDDEN_SLACK_MS = 2 * 60 * 1000;

/**
 * Price limits fire on a cross, so arming a level the price is already past waits
 * for the next crossing. Daily and sudden moves fire from the current level.
 */
export function evaluate(input: EvalInput): EvalAction[] {
  const actions: EvalAction[] = [];
  if (input.muted) return actions;
  if (!Number.isFinite(input.price) || input.price <= 0) return actions;
  if (!input.sessionOpen) return actions;

  const previous = input.previousPrice;
  if (previous != null && Number.isFinite(previous)) {
    for (const alert of input.alerts) {
      if (!alert.armed || !Number.isFinite(alert.price)) continue;
      if (alert.direction === 'above' && previous < alert.price && input.price >= alert.price) {
        actions.push({
          type: 'limit',
          alertId: alert.id,
          direction: 'above',
          level: alert.price,
          price: input.price,
        });
      }
      if (alert.direction === 'below' && previous > alert.price && input.price <= alert.price) {
        actions.push({
          type: 'limit',
          alertId: alert.id,
          direction: 'below',
          level: alert.price,
          price: input.price,
        });
      }
    }
  }

  if (
    input.dailyReady &&
    input.prevClose != null &&
    input.prevClose > 0 &&
    input.dailyThreshold > 0
  ) {
    const pct = ((input.price - input.prevClose) / input.prevClose) * 100;
    if (pct >= input.dailyThreshold && !input.dailyFiredUp) {
      actions.push({ type: 'daily_move', direction: 'up', pct, price: input.price });
    } else if (pct <= -input.dailyThreshold && !input.dailyFiredDown) {
      actions.push({ type: 'daily_move', direction: 'down', pct, price: input.price });
    }
  }

  if (input.suddenThreshold > 0 && input.windowMs > 0) {
    const ticks = [...input.ticks].sort((a, b) => a.ts - b.ts);
    const cutoff = input.now - input.windowMs;
    let baseline: Tick | null = null;
    for (const tick of ticks) {
      if (tick.ts <= cutoff) baseline = tick;
      else break;
    }
    if (baseline && baseline.price > 0 && baseline.ts >= cutoff - SUDDEN_SLACK_MS) {
      const pct = ((input.price - baseline.price) / baseline.price) * 100;
      if (pct >= input.suddenThreshold) {
        if (input.lastSuddenUp == null || input.now - input.lastSuddenUp >= input.cooldownMs) {
          actions.push({
            type: 'sudden_move',
            direction: 'up',
            pct,
            price: input.price,
            fromPrice: baseline.price,
          });
        }
      } else if (pct <= -input.suddenThreshold) {
        if (input.lastSuddenDown == null || input.now - input.lastSuddenDown >= input.cooldownMs) {
          actions.push({
            type: 'sudden_move',
            direction: 'down',
            pct,
            price: input.price,
            fromPrice: baseline.price,
          });
        }
      }
    }
  }

  return actions;
}
