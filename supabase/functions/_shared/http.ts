import { ZodError } from 'zod';
import { ERRORS, type ErrorCode } from './app.ts';
import { admin } from './clients.ts';
import { log } from './log.ts';
import { versionBelow } from './version.ts';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-app-version, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
};

/** Thrown by handlers to return a shared error code. The detail is logged, never sent. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly detail?: string,
  ) {
    super(code);
  }
}

function json(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json', 'x-request-id': requestId },
  });
}

export function fail(code: ErrorCode, requestId: string): Response {
  const status = ERRORS[code].httpStatus >= 400 ? ERRORS[code].httpStatus : 400;
  return json(status, { ok: false, code, message: ERRORS[code].message }, requestId);
}


let minVersion: { value: string; at: number } | null = null;
async function minAppVersion(): Promise<string> {
  if (minVersion && Date.now() - minVersion.at < 60_000) return minVersion.value;
  const { data } = await admin()
    .from('platform_settings')
    .select('value')
    .eq('key', 'min_app_version')
    .maybeSingle();
  const value = typeof data?.value === 'string' ? data.value : '0.0.0';
  minVersion = { value, at: Date.now() };
  return value;
}

export interface Ctx {
  req: Request;
  requestId: string;
  body: unknown;
}

/** Wraps a function: CORS, POST only, request id, app version check, JSON body, error mapping. */
export function handle(name: string, fn: (ctx: Ctx) => Promise<unknown>): void {
  Deno.serve(async (req) => {
    const requestId = crypto.randomUUID();
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    const started = Date.now();
    try {
      if (req.method !== 'POST') throw new AppError('VALIDATION_FAILED', 'method');
      const appVersion = req.headers.get('x-app-version');
      if (appVersion && versionBelow(appVersion, await minAppVersion())) {
        throw new AppError('UPDATE_REQUIRED');
      }
      let body: unknown = {};
      const text = await req.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new AppError('VALIDATION_FAILED', 'json');
        }
      }
      const data = await fn({ req, requestId, body });
      log('info', { fn: name, request_id: requestId, ok: true, ms: Date.now() - started });
      return json(200, { ok: true, data }, requestId);
    } catch (err) {
      if (err instanceof AppError) {
        log('info', { fn: name, request_id: requestId, ok: false, code: err.code, detail: err.detail, ms: Date.now() - started });
        return fail(err.code, requestId);
      }
      if (err instanceof ZodError) {
        log('info', { fn: name, request_id: requestId, ok: false, code: 'VALIDATION_FAILED', ms: Date.now() - started });
        return fail('VALIDATION_FAILED', requestId);
      }
      log('error', { fn: name, request_id: requestId, ok: false, code: 'SERVER_ERROR', error: String(err) });
      return fail('SERVER_ERROR', requestId);
    }
  });
}
