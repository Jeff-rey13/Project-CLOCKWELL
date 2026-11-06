import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

let adminClient: SupabaseClient | null = null;

/**
 * Service client. Bypasses RLS, so every caller of this must first check the caller's JWT
 * (see auth.ts) and filter by the caller's company.
 */
export function admin(): SupabaseClient {
  adminClient ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Anonymous client, used only to sign a user in with a password. */
export function anon(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
