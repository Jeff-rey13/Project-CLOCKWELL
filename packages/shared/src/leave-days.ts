/**
 * Working days for leave: calendar days in range (inclusive) minus Saturdays, Sundays
 * and company holidays, minus 0.5 if the last day is a half day (and is a working day).
 * Dates are `yyyy-mm-dd` strings.
 */
export function countLeaveDays(
  startDate: string,
  endDate: string,
  holidays: readonly string[],
  halfDayEnd: boolean,
): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  const holidaySet = new Set(holidays);
  let days = 0;
  let lastIsWorking = false;
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    const weekday = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    const working = weekday !== 0 && weekday !== 6 && !holidaySet.has(iso);
    if (working) days += 1;
    lastIsWorking = working;
  }
  if (halfDayEnd && lastIsWorking) days -= 0.5;
  return days;
}
