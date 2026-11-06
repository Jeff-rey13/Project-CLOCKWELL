import { toErrorCode, type ApiResult } from '@app/shared';
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { APP_VERSION } from './supabase';

/**
 * Calls an Edge Function on the company's own project. Always resolves to `{ ok, data }` or
 * `{ ok: false, code, message }`; never throws and never surfaces raw errors.
 */
export async function callFunction<T>(
  client: SupabaseClient,
  name: string,
  body: unknown,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { 'x-app-version': APP_VERSION };
    // Send the user's session token explicitly; without it the client may send the project key.
    const { data: auth } = await client.auth.getSession();
    if (auth.session) headers.Authorization = `Bearer ${auth.session.access_token}`;
    const { data, error } = await client.functions.invoke<ApiResult<T>>(name, {
      body: body as Record<string, unknown>,
      headers,
    });
    let result: ApiResult<T> | null = data ?? null;
    if (error instanceof FunctionsHttpError) {
      result = (await (error.context as Response).json()) as ApiResult<T>;
    } else if (error) {
      return { ok: false, code: 'SERVER_ERROR', message: 'Something went wrong on our side.' };
    }
    if (!result) return { ok: false, code: 'SERVER_ERROR', message: 'Something went wrong on our side.' };
    if (!result.ok) {
      if (result.code === 'UPDATE_REQUIRED') window.location.reload();
      return { ok: false, code: toErrorCode(result.code), message: result.message };
    }
    return result;
  } catch {
    return { ok: false, code: 'SERVER_ERROR', message: 'Something went wrong on our side.' };
  }
}
