import type { SearchHit } from '@/lib/types';

/** Front-month COMEX contracts. Yahoo rolls the symbol, so the row stays gold or silver. */
export const FUTURES: { symbol: string; name: string; aliases: string[] }[] = [
  { symbol: 'GC=F', name: 'Gold futures', aliases: ['gold', 'gc', 'xau'] },
  { symbol: 'SI=F', name: 'Silver futures', aliases: ['silver', 'si', 'xag'] },
];

const FRESH_MS = 20 * 60 * 1000;

export function isFuture(symbol: string): boolean {
  return FUTURES.some((item) => item.symbol === symbol);
}

/** A futures print is live when the quote itself is only a few minutes old. */
export function futureSessionOpen(ts: number, now = Date.now()): boolean {
  return now - ts >= 0 && now - ts < FRESH_MS;
}

export function matchFutures(query: string): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return FUTURES.filter(
    (item) =>
      item.symbol.toLowerCase().includes(needle) ||
      item.name.toLowerCase().includes(needle) ||
      item.aliases.some((alias) => alias.startsWith(needle) || needle.startsWith(alias)),
  ).map((item) => ({ symbol: item.symbol, description: item.name, type: 'Future' }));
}
