'use client';

import { useQuery } from '@tanstack/react-query';
import { FLAG_DEFAULTS, resolveFlag, type FlagKey, type FlagRow } from '@app/shared';
import { useSession } from './session';

/** Flags visible to the signed-in user: global values and their own company's values (RLS). */
export function useFlags() {
  const { client, profile, status } = useSession();
  return useQuery({
    queryKey: ['flags', profile?.company_id ?? 'none'],
    enabled: status === 'signed_in',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await client.from('feature_flags').select('key, company_id, enabled');
      if (error) throw new Error('load failed');
      return (data ?? []) as FlagRow[];
    },
  });
}

/** One flag for the current company: company value wins, then global, then the built-in default. */
export function useFlag(key: FlagKey): boolean {
  const { profile } = useSession();
  const flags = useFlags();
  if (!flags.data) return FLAG_DEFAULTS[key];
  return resolveFlag(flags.data, key, profile?.company_id ?? null);
}
