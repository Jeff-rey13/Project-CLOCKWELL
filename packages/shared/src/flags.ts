import { z } from 'zod';

/** Every feature flag the app knows about. Add here first; the console only offers these keys. */
export const FLAGS = {
  offline_clock_in: 'Clock in and out while offline; sent when back online (task 3.5)',
  clockout_push: 'Push reminders to clock out (task 3.4); email is used when off',
} as const;

export type FlagKey = keyof typeof FLAGS;
export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];

/** Built-in default when neither a global nor a company value is set. */
export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  offline_clock_in: true,
  clockout_push: false,
};

export interface FlagRow {
  key: string;
  company_id: string | null;
  enabled: boolean;
}

/** The company's own value wins, then the global value, then the built-in default. */
export function resolveFlag(rows: readonly FlagRow[], key: FlagKey, companyId: string | null): boolean {
  const own = companyId ? rows.find((r) => r.key === key && r.company_id === companyId) : undefined;
  if (own) return own.enabled;
  const global = rows.find((r) => r.key === key && r.company_id === null);
  if (global) return global.enabled;
  return FLAG_DEFAULTS[key];
}

export const setFlagSchema = z.object({
  action: z.literal('set_flag'),
  key: z.enum(FLAG_KEYS as [FlagKey, ...FlagKey[]]),
  /** null sets the global value. */
  company_id: z.string().uuid().nullable(),
  /** null removes a company override (the company follows the global value again). */
  enabled: z.boolean().nullable(),
});

export const setFlagForTrackSchema = z.object({
  action: z.literal('set_flag_for_track'),
  key: z.enum(FLAG_KEYS as [FlagKey, ...FlagKey[]]),
  track: z.enum(['pilot', 'stable']),
  enabled: z.boolean(),
});
