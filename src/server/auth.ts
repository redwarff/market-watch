import { createHash, timingSafeEqual } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/constants';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET || process.env.APP_PASSWORD || '';
  return new TextEncoder().encode(value);
}

export function passwordConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export function passwordOk(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? '';
  if (!expected || !input) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === '0') return false;
  if (process.env.COOKIE_SECURE === '1') return true;
  return (process.env.APP_ORIGIN || '').startsWith('https://');
}

export async function signSession(): Promise<string> {
  if (!passwordConfigured()) throw new Error('APP_PASSWORD is not set.');
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cookieSecure(),
    path: '/',
    maxAge: THIRTY_DAYS,
  };
}

export async function readSession(): Promise<boolean> {
  if (!passwordConfigured()) return false;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
