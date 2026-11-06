/** Structured log line. Pass ids and codes only; never names, emails, coordinates or file paths. */
export function log(level: 'info' | 'error', fields: Record<string, unknown>): void {
  const line = JSON.stringify({ level, at: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}
