import { YahooHistory } from '@/providers/yahoo';

const SYMBOL = '^VIX';
const FRESH_MS = 60_000;

export type VixQuote = {
  price: number;
  prevClose: number | null;
  change: number | null;
  pct: number | null;
  ts: number;
};

let cached: { at: number; quote: VixQuote } | null = null;
let inflight: Promise<VixQuote | null> | null = null;

/** Last CBOE VIX print. Cached for a minute so the watch poll does not hit Yahoo every time. */
export function currentVix(): Promise<VixQuote | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.quote);
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  return inflight.then((quote) => quote ?? cached?.quote ?? null);
}

async function load(): Promise<VixQuote | null> {
  try {
    const quote = await new YahooHistory().indexQuote(SYMBOL);
    if (!quote) return null;
    const change = quote.prevClose != null && quote.prevClose !== 0 ? quote.price - quote.prevClose : null;
    const value: VixQuote = {
      price: quote.price,
      prevClose: quote.prevClose,
      change,
      pct: change != null && quote.prevClose ? (change / quote.prevClose) * 100 : null,
      ts: quote.ts,
    };
    cached = { at: Date.now(), quote: value };
    return value;
  } catch (error) {
    console.error('[vix]', error instanceof Error ? error.message : error);
    return null;
  }
}
