import { admin } from './clients.ts';
import { AppError } from './http.ts';

export interface Caller {
  userId: string;
  companyId: string | null;
  appRole: 'employee' | 'hr' | null;
  isPlatform: boolean;
  aal: string;
}

function decodePayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(atob(b64)) as Record<string, unknown>;
}

/** Verifies the bearer token with Supabase Auth, then reads the custom claims from it. */
export async function requireCaller(req: Request): Promise<Caller> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new AppError('FORBIDDEN', 'no token');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new AppError('FORBIDDEN', 'bad token');
  const claims = decodePayload(token);
  if (claims.sub !== data.user.id) throw new AppError('FORBIDDEN', 'sub mismatch');
  const role = claims.app_role;
  return {
    userId: data.user.id,
    companyId: typeof claims.company_id === 'string' ? claims.company_id : null,
    appRole: role === 'employee' || role === 'hr' ? role : null,
    isPlatform: claims.is_platform === true,
    aal: typeof claims.aal === 'string' ? claims.aal : 'aal1',
  };
}

/** Caller must belong to a company and have one of the given roles. */
export async function requireCompanyRole(
  req: Request,
  roles: ReadonlyArray<'employee' | 'hr'>,
): Promise<Caller & { companyId: string; appRole: 'employee' | 'hr' }> {
  const caller = await requireCaller(req);
  if (!caller.companyId || !caller.appRole || !roles.includes(caller.appRole)) {
    throw new AppError('FORBIDDEN', 'role');
  }
  return caller as Caller & { companyId: string; appRole: 'employee' | 'hr' };
}
