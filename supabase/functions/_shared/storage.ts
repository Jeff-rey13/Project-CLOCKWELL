import type { SupabaseClient } from '@supabase/supabase-js';

/** True when the object exists in the bucket. */
export async function objectExists(db: SupabaseClient, bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const name = path.slice(slash + 1);
  const { data, error } = await db.storage.from(bucket).list(path.slice(0, slash), { search: name, limit: 1 });
  return !error && (data ?? []).some((o) => o.name === name);
}

/** Receipts for a claim live under {company_id}/{user_id}/{client_request_id}/. */
export function receiptPathAllowed(path: string, companyId: string, userId: string, requestId: string): boolean {
  return (
    path.startsWith(`${companyId}/${userId}/${requestId}/`) &&
    !path.includes('..') &&
    /\.(jpe?g|png|pdf)$/i.test(path)
  );
}
