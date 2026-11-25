import { z } from 'zod';
import { isFuture } from '@/lib/futures';

export const loginSchema = z.object({
  password: z.string().min(1, 'Enter the password.').max(200),
});

export const settingsSchema = z.object({
  dailyMovePct: z.number({ message: 'Daily move must be a number.' }).min(0.1).max(100),
  suddenMovePct: z.number({ message: 'Sudden move must be a number.' }).min(0.1).max(100),
  suddenWindowMinutes: z.number().int().min(5).max(180),
  suddenCooldownMinutes: z.number().int().min(5).max(1440),
  subreddits: z.string().max(300),
});

export const addTickerSchema = z.object({
  symbol: z.string().min(1).max(15),
  name: z.string().max(160).optional(),
});

export const tickerPatchSchema = z.object({
  notes: z.string().max(2000).optional(),
  muted: z.boolean().optional(),
  dailyMovePct: z.number().min(0.1).max(100).nullable().optional(),
  suddenMovePct: z.number().min(0.1).max(100).nullable().optional(),
});

export const alertSchema = z.object({
  direction: z.enum(['above', 'below']),
  price: z.number().positive().max(1_000_000),
});

export const orderSchema = z.object({
  symbols: z.array(z.string().min(1).max(15)).min(1).max(100),
});

export function cleanSymbol(input: string): string {
  return input.trim().toUpperCase();
}

export function isSymbol(symbol: string): boolean {
  if (isFuture(symbol)) return true;
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
}
