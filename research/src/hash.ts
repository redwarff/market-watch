import { createHash } from 'node:crypto';
import type { Bar } from './types.ts';

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function canonicalParams(params: Record<string, string | number>): string {
  const keys = Object.keys(params).sort();
  return JSON.stringify(keys.map((key) => [key, params[key]]));
}

/** Stable hash of the bar file. Field order is fixed so a reload hashes the same way. */
export function barsHash(bars: Bar[]): string {
  const lines = bars.map((bar) =>
    [bar.date, bar.open, bar.high, bar.low, bar.close, bar.adjClose, bar.volume].join(','),
  );
  return sha256(lines.join('\n'));
}
