const ET = 'America/New_York';

export function etParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) bag[part.type] = part.value;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const minute = Number(bag.minute);
  return {
    weekday: bag.weekday,
    dayKey: `${bag.year}-${bag.month}-${bag.day}`,
    minutes: hour * 60 + minute,
  };
}

export function etDayKey(now = new Date()): string {
  return etParts(now).dayKey;
}

export function isWeekday(now = new Date()): boolean {
  const weekday = etParts(now).weekday;
  return weekday !== 'Sat' && weekday !== 'Sun';
}

/** Regular US cash session, 9:30–16:00 America/New_York, weekdays. The closing minute is excluded. */
export function isRegularSession(now = new Date()): boolean {
  if (!isWeekday(now)) return false;
  const minutes = etParts(now).minutes;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

/** A print from the cash session, including the 16:00 close. Premarket and after-hours are excluded. */
export function isRegularPrint(ts: number): boolean {
  const date = new Date(ts);
  if (!isWeekday(date)) return false;
  const minutes = etParts(date).minutes;
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

/** Premarket 4:00–9:30 or after hours 16:00–20:00 Eastern, weekdays. */
export function isExtendedSession(now = new Date()): boolean {
  if (!isWeekday(now)) return false;
  const minutes = etParts(now).minutes;
  return (minutes >= 4 * 60 && minutes < 9 * 60 + 30) || (minutes >= 16 * 60 && minutes < 20 * 60);
}

/** Pre-market through the after-hours window, when a 1-day chart is worth refreshing. */
export function isIntradayWindow(now = new Date()): boolean {
  if (!isWeekday(now)) return false;
  const minutes = etParts(now).minutes;
  return minutes >= 4 * 60 && minutes < 20 * 60;
}

export function isAfterClose(now = new Date()): boolean {
  if (!isWeekday(now)) return false;
  return etParts(now).minutes >= 16 * 60 + 15;
}

/** UTC timestamp of midnight at the start of the current New York calendar day. */
export function etDayStartMs(now = new Date()): number {
  const key = etDayKey(now);
  const sample = new Date(`${key}T15:00:00Z`);
  const hour = etParts(sample).minutes / 60;
  const offsetHours = hour - 15;
  const utcHour = -offsetHours;
  return Date.parse(`${key}T${String(utcHour).padStart(2, '0')}:00:00.000Z`);
}
