import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedCompany {
  company_id: string;
  name: string;
  logo_url: string | null;
  status: 'onboarding' | 'trial' | 'active' | 'suspended' | 'pending_deletion';
  supabase_url: string | null;
  supabase_publishable_key: string | null;
}

const SHARED_URL = process.env.NEXT_PUBLIC_SHARED_SUPABASE_URL ?? '';
const SHARED_KEY = process.env.NEXT_PUBLIC_SHARED_SUPABASE_PUBLISHABLE_KEY ?? '';
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';

let shared: SupabaseClient | null = null;
/** Client for the shared project, used only to resolve a company. */
export function sharedClient(): SupabaseClient {
  shared ??= createClient(SHARED_URL, SHARED_KEY, { auth: { persistSession: false } });
  return shared;
}

export async function resolveCompany(slug: string): Promise<ResolvedCompany | null> {
  const { data, error } = await sharedClient().rpc('resolve_company', { p_slug: slug });
  if (error) throw new Error('resolve failed');
  const rows = (data ?? []) as ResolvedCompany[];
  return rows[0] ?? null;
}

interface Target {
  url: string;
  key: string;
}

const clients = new Map<string, SupabaseClient>();

/** Supabase client for the company's own project (shared or dedicated). Session is kept per company. */
export function companyClient(slug: string, company: ResolvedCompany | null = null): SupabaseClient {
  const target: Target =
    company?.supabase_url && company.supabase_publishable_key
      ? { url: company.supabase_url, key: company.supabase_publishable_key }
      : { url: SHARED_URL, key: SHARED_KEY };
  const id = `${slug}|${target.url}`;
  let client = clients.get(id);
  if (!client) {
    client = createClient(target.url, target.key, {
      auth: { storageKey: `session-${slug}`, persistSession: true, autoRefreshToken: true },
    });
    clients.set(id, client);
  }
  return client;
}

/** Remembers which project a company lives on, so pages after login build the same client. */
const TARGET_KEY = 'company-target';
export function rememberCompany(slug: string, company: ResolvedCompany): void {
  try {
    window.sessionStorage.setItem(TARGET_KEY, JSON.stringify({ slug, company }));
  } catch {
    // ignore; falls back to the shared project
  }
}
export function rememberedCompany(): { slug: string; company: ResolvedCompany } | null {
  try {
    const raw = window.sessionStorage.getItem(TARGET_KEY);
    return raw ? (JSON.parse(raw) as { slug: string; company: ResolvedCompany }) : null;
  } catch {
    return null;
  }
}
