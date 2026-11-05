export const DEFAULT_TIMEZONE = 'Asia/Singapore';

interface LocalParts {
  date: string; // yyyy-mm-dd
  secondsOfDay: number;
  isoWeekday: number; // 1 = Mon .. 7 = Sun
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Calendar date, time of day and weekday of an instant in a time zone. */
export function localParts(instant: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) parts[p.type] = p.value;
  const hour = Number(parts.hour);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    secondsOfDay: hour * 3600 + Number(parts.minute) * 60 + Number(parts.second),
    isoWeekday: WEEKDAYS[parts.weekday ?? ''] ?? 1,
  };
}

/** "09:00" or "09:00:00" to seconds after midnight. */
export function timeToSeconds(hhmm: string): number {
  const [h = '0', m = '0', s = '0'] = hhmm.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}
