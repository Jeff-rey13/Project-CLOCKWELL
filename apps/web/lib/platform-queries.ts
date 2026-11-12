'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from './session';

export interface PlatformCompany {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'business' | 'enterprise';
  seat_limit: number;
  release_track: 'pilot' | 'stable';
  status: 'onboarding' | 'trial' | 'active' | 'suspended' | 'pending_deletion';
  hosting: 'shared' | 'dedicated';
  deletion_scheduled_at: string | null;
  deletion_requested_by: string | null;
  deletion_approved_by: string | null;
  modules: Record<string, boolean> | null;
  created_at: string;
  support_until: string | null;
}

/** All companies: company-level facts only, nothing about their people. */
export function usePlatformCompanies() {
  const { client, platformRole } = useSession();
  return useQuery({
    queryKey: ['platform-companies'],
    enabled: !!platformRole,
    queryFn: async () => {
      const { data, error } = await client.rpc('platform_companies');
      if (error) throw new Error('load failed');
      return (data ?? []) as PlatformCompany[];
    },
  });
}

/** Why a company needs a look, or null. */
export function attentionReason(c: PlatformCompany): string | null {
  if (c.status === 'pending_deletion') return 'Scheduled for deletion';
  if (c.deletion_requested_by && !c.deletion_approved_by) return 'Deletion waiting for a second approver';
  if (c.status === 'suspended') return 'Suspended';
  if (c.status === 'onboarding') return 'Still onboarding';
  return null;
}

export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost';
export const companyAddress = (slug: string) =>
  ROOT_DOMAIN === 'localhost' ? `localhost:3000/login/?company=${slug}` : `${slug}.${ROOT_DOMAIN}`;
