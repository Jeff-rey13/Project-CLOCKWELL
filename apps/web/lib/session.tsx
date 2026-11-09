'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentCompanySlug } from './company';
import { companyClient, rememberedCompany, resolveCompany } from './supabase';

export interface Profile {
  user_id: string;
  company_id: string;
  full_name: string;
  employee_code: string;
  department: string | null;
  app_role: 'employee' | 'hr';
  office_id: string | null;
  privacy_ack_at: string | null;
  username: string;
  status: 'invited' | 'active' | 'offboarded';
}

export interface SessionState {
  status: 'loading' | 'signed_out' | 'signed_in';
  client: SupabaseClient;
  slug: string;
  companyName: string;
  profile: Profile | null;
  /** Platform (vendor) role when the signed-in user is on the vendor team; they have no company profile. */
  platformRole: 'owner' | 'engineer' | 'support' | null;
  reloadProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

function initialTarget() {
  // The platform console keeps its own session, apart from any company.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/platform')) {
    return { slug: 'platform', company: null };
  }
  const remembered = typeof window !== 'undefined' ? rememberedCompany() : null;
  const slug = remembered?.slug ?? currentCompanySlug();
  return { slug, company: remembered?.company ?? null };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [{ slug, company }] = useState(initialTarget);
  const [client] = useState(() => companyClient(slug, company));
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [companyName, setCompanyName] = useState<string>(company?.name ?? slug);

  useEffect(() => {
    if (company || slug === 'platform') return;
    let active = true;
    resolveCompany(slug)
      .then((c) => {
        if (active && c) setCompanyName(c.name);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [company, slug]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [platformRole, setPlatformRole] = useState<SessionState['platformRole']>(null);

  const loadProfile = async (userId: string) => {
    const { data } = await client
      .from('profiles')
      .select('user_id, company_id, full_name, employee_code, department, app_role, office_id, privacy_ack_at, username, status')
      .eq('user_id', userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
    if (data) {
      setStatus('signed_in');
      return;
    }
    // No company profile: a vendor team member?
    const { data: role } = await client.rpc('my_platform_role');
    setPlatformRole((role as SessionState['platformRole']) ?? null);
    setStatus(role ? 'signed_in' : 'signed_out');
  };

  useEffect(() => {
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) void loadProfile(data.session.user.id);
      else setStatus('signed_out');
    });
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setProfile(null);
        setStatus('signed_out');
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // loadProfile only depends on `client`, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const value: SessionState = {
    status,
    client,
    slug,
    companyName: slug === 'platform' ? 'Platform' : companyName,
    profile,
    platformRole,
    reloadProfile: async () => {
      const { data } = await client.auth.getSession();
      if (data.session) await loadProfile(data.session.user.id);
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
