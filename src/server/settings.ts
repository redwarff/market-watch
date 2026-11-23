import type { AppSettings } from '@/lib/types';

export const SETTING_DEFAULTS: AppSettings = {
  dailyMovePct: 3,
  suddenMovePct: 3,
  suddenWindowMinutes: 15,
  suddenCooldownMinutes: 60,
  subreddits: ['wallstreetbets', 'stocks', 'investing'],
};

export function parseSubreddits(raw: string): string[] {
  const parts = raw
    .split(/[\s,]+/)
    .map((part) => part.trim().replace(/^r\//i, ''))
    .filter(Boolean);
  const clean = [...new Set(parts.filter((part) => /^[A-Za-z0-9_]{2,21}$/.test(part)))];
  return clean.slice(0, 10);
}

function numberOr(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function settingsFromMap(raw: Record<string, string>): AppSettings {
  const subreddits = parseSubreddits(raw.subreddits ?? SETTING_DEFAULTS.subreddits.join(','));
  return {
    dailyMovePct: clamp(numberOr(raw.dailyMovePct, SETTING_DEFAULTS.dailyMovePct), 0.1, 100),
    suddenMovePct: clamp(numberOr(raw.suddenMovePct, SETTING_DEFAULTS.suddenMovePct), 0.1, 100),
    suddenWindowMinutes: Math.round(
      clamp(numberOr(raw.suddenWindowMinutes, SETTING_DEFAULTS.suddenWindowMinutes), 5, 180),
    ),
    suddenCooldownMinutes: Math.round(
      clamp(numberOr(raw.suddenCooldownMinutes, SETTING_DEFAULTS.suddenCooldownMinutes), 5, 1440),
    ),
    subreddits: subreddits.length > 0 ? subreddits : [...SETTING_DEFAULTS.subreddits],
  };
}

export function settingsToMap(settings: AppSettings): Record<string, string> {
  return {
    dailyMovePct: String(settings.dailyMovePct),
    suddenMovePct: String(settings.suddenMovePct),
    suddenWindowMinutes: String(settings.suddenWindowMinutes),
    suddenCooldownMinutes: String(settings.suddenCooldownMinutes),
    subreddits: settings.subreddits.join(','),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
