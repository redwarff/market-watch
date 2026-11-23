import { formatPct, formatPrice } from '@/lib/format';
import type { EvalAction } from '@/server/alerts';

export function appOrigin(): string {
  return (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
}

export function alertMessage(input: {
  symbol: string;
  action: EvalAction;
  prevClose: number | null;
  windowMinutes: number;
}): string {
  const price = formatPrice(input.action.price);
  let reason = '';
  if (input.action.type === 'limit') {
    const word = input.action.direction === 'above' ? 'crossed above' : 'crossed below';
    reason = `Limit ${word} ${formatPrice(input.action.level)}`;
  } else if (input.action.type === 'daily_move') {
    reason = `Daily move ${formatPct(input.action.pct)} versus previous close ${formatPrice(input.prevClose)}`;
  } else {
    reason = `Sudden move ${formatPct(input.action.pct)} over ${input.windowMinutes} minutes, from ${formatPrice(input.action.fromPrice)}`;
  }
  const url = `${appOrigin()}/ticker/${encodeURIComponent(input.symbol)}`;
  return `${input.symbol}  ${price}\n${reason}\n${url}`;
}
